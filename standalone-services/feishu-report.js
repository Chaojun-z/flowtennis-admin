const fs = require('fs');
const axios = require('axios');
const dayjs = require('dayjs');
const path = require('path');

// ==========================================
// 1. 配置信息
// ==========================================
const FEISHU_WEBHOOK_URL = String(process.env.FEISHU_WEBHOOK_URL || '').trim();
const DATA_PATH = path.join(__dirname, 'daily-report-data.json'); // 必须由主系统生成

function compactText(parts, separator = ' · ') {
  return parts.map((item) => String(item || '').trim()).filter(Boolean).join(separator);
}

function lessonStudentText(lesson) {
  const names = Array.isArray(lesson.studentNames) && lesson.studentNames.length
    ? lesson.studentNames
    : (Array.isArray(lesson.studentLabels) ? lesson.studentLabels : []);
  return names.map((item) => String(item || '').trim()).filter(Boolean).join('、');
}

function formatTomorrowLessonLine(lesson) {
  const start = dayjs(lesson.startTime).format('HH:mm');
  const end = dayjs(lesson.endTime).format('HH:mm');
  const locationText = compactText([lesson.campusName, lesson.venue]);
  const studentCourseText = compactText([lessonStudentText(lesson), lesson.courseType]);
  return `${start} - ${end}  · [${locationText}] · [${studentCourseText}] · ${lesson.studentCount}人`;
}

function lessonDurationMinutes(lesson) {
  const start = dayjs(lesson.startTime);
  const end = dayjs(lesson.endTime);
  const minutes = end.diff(start, 'minute');
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatHours(totalMinutes) {
  const hours = totalMinutes / 60;
  return `${Number.isInteger(hours) ? hours : Number(hours.toFixed(1))}小时`;
}

function formatTomorrowSchedule(rows) {
  const groups = new Map();
  rows.forEach((lesson) => {
    const coachName = String(lesson.coachName || '').trim() || '未分配';
    if (!groups.has(coachName)) groups.set(coachName, []);
    groups.get(coachName).push(lesson);
  });
  return [...groups.entries()].map(([coachName, lessons]) => {
    const totalMinutes = lessons.reduce((sum, lesson) => sum + lessonDurationMinutes(lesson), 0);
    const header = `${coachName}教练（共${lessons.length}节 · ${formatHours(totalMinutes)}）`;
    return [header, ...lessons.map(formatTomorrowLessonLine)].join('\n');
  }).join('\n\n');
}

// ==========================================
// 2. 数据处理逻辑（完全适配 Codex 真实 Schema）
// ==========================================
function generateReport(data) {
  const { today, tomorrow, todayStats, todayLessonDetails, tomorrowLessonDetails } = data;
  const NOW = dayjs(); // 采用真实运行时的系统时间

  // --- 今日统计处理 ---
  // 预计要上的课（排除了已取消的）
  const todayExpected = todayStats.totalLessons - todayStats.cancelledLessons; 
  const finishRate = todayExpected === 0 ? 0 : Math.round((todayStats.completedLessons / todayExpected) * 100);

  let todaySummaryStr = `已排课程：**${todayExpected}** 节\n实际完成：**${todayStats.completedLessons}** 节（${finishRate}%）\n取消课程：**${todayStats.cancelledLessons}** 节`;

  // 拼接取消课程明细
  const canceledDetails = todayLessonDetails.filter(l => l.status === '已取消');
  if (canceledDetails.length > 0) {
    const cancelText = canceledDetails.map(l => `[${l.coachName} ${dayjs(l.startTime).format('HH:mm')} ${l.courseType}]`).join('、');
    todaySummaryStr += ` → ${cancelText}`;
  }

  // 拼接迟到/未结课课程明细：状态仍为“已排课”，且当前时间已大于下课时间
  const lateDetails = todayLessonDetails.filter(l => l.status === '已排课' && dayjs(l.endTime).isBefore(NOW));
  if (lateDetails.length > 0) {
    const lateText = lateDetails.map(l => `[${l.coachName} ${dayjs(l.startTime).format('HH:mm')} ${l.courseType}]`).join('、');
    todaySummaryStr += `\n迟到课程：**${lateDetails.length}** 节 → ${lateText}`;
  }

  // --- 明日排课总览 ---
  // 过滤掉已取消的课程
  const tomorrowValidRows = tomorrowLessonDetails.filter(l => l.status !== '已取消');
  
  // 按时间早晚排序
  tomorrowValidRows.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

  let tomorrowScheduleStr = formatTomorrowSchedule(tomorrowValidRows);

  if (tomorrowValidRows.length === 0) {
    tomorrowScheduleStr = "明天暂无排课";
  }

  return {
    today,
    tomorrow,
    todaySummaryStr,
    tomorrowValidCount: tomorrowValidRows.length,
    tomorrowScheduleStr
  };
}

// ==========================================
// 3. 构建飞书卡片
// ==========================================
function buildFeishuCard(stats) {
  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: {
          content: "🎾 [网球兄弟]排课日报",
          tag: "plain_text"
        }
      },
      elements: [
        {
          tag: "markdown",
          content: `**📅 今日上课情况 (${stats.today})**\n━━━━━━━━━━━━━━━━━━\n${stats.todaySummaryStr}`
        },
        {
          tag: "markdown",
          content: `**📋 明日排课总览 (${stats.tomorrow})**\n━━━━━━━━━━━━━━━━━━\n共 **${stats.tomorrowValidCount}** 节课\n\n${stats.tomorrowScheduleStr}`
        },
        {
          tag: "hr"
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: "💡 本数据来源于主业务系统数据快照。"
            }
          ]
        }
      ]
    }
  };
}

// ==========================================
// 4. 执行入口
// ==========================================
async function run() {
  try {
    if (!FEISHU_WEBHOOK_URL) {
      throw new Error('缺少环境变量 FEISHU_WEBHOOK_URL');
    }

    if (!fs.existsSync(DATA_PATH)) {
      throw new Error(`找不到数据文件：${DATA_PATH}`);
    }

    const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
    const data = JSON.parse(rawData);

    const stats = generateReport(data);
    const feishuPayload = buildFeishuCard(stats);

    const response = await axios.post(FEISHU_WEBHOOK_URL, feishuPayload);

    if (response.data.code === 0) {
      console.log('✅ 日报发送成功！');
    } else {
      console.error('❌ 发送失败，接口返回：', response.data);
    }
  } catch (error) {
    console.error('❌ 执行异常：', error.message);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  buildFeishuCard,
  formatTomorrowSchedule,
  formatTomorrowLessonLine,
  generateReport
};
