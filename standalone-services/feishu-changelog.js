const axios = require('axios');
const dayjs = require('dayjs');
const { execFileSync } = require('child_process');
const path = require('path');

const FEISHU_CHANGELOG_WEBHOOK = String(process.env.FEISHU_CHANGELOG_WEBHOOK || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || '').trim();
const REPO_ROOT = path.join(__dirname, '..');
const PLATFORM_ORDER = ['adminWeb', 'coachWeb', 'coachPwa', 'coachMp', 'matchMp'];
const PLATFORM_NAMES = {
  adminWeb: '💻 管理后台',
  coachWeb: '🌐 教练网页版',
  coachPwa: '📱 教练 PWA',
  coachMp: '🟢 教练小程序',
  matchMp: '🎾 约球小程序'
};

function targetDate() {
  const raw = String(process.env.CHANGELOG_TARGET_DATE || '').trim();
  if (raw) return raw;
  return dayjs().subtract(1, 'day').format('YYYY-MM-DD');
}

function normalizeText(input) {
  return String(input || '')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSubject(input) {
  return normalizeText(input)
    .replace(/^merge pull request #\d+ from .+?:?\s*/i, '')
    .replace(/^(feat|fix|chore|docs|refactor|perf|style|test|build|ci|revert|debug|ops|release)\s*:\s*/i, '')
    .replace(/\(#\d+\)/g, '')
    .replace(/\bPR\s*#\d+\b/ig, '')
    .trim();
}

function toTitleCaseWords(input) {
  return String(input || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function summarizeText(input) {
  let text = cleanSubject(input);
  const lower = text.toLowerCase();

  if (!text) return '';
  if (/runtime files/.test(lower) && /feishu/.test(lower) && /github actions/.test(lower)) return '补齐飞书自动推送运行配置';
  if (/feishu/.test(lower) && /schedule/.test(lower) && /timezone/.test(lower)) return '修正飞书自动推送时间配置';
  if (/campuses/.test(lower) && /bypass/.test(lower) && /auth fallback/.test(lower)) return '优化校区访问与约球后台鉴权稳定性';
  if (/anonymous/.test(lower) && /campuses/.test(lower) && /reads/.test(lower)) return '优化未登录场景下的校区读取稳定性';
  if (/public health/.test(lower) && /campuses/.test(lower)) return '优化公开访问场景下的健康检查与校区读取稳定性';
  if (/scan timeout/.test(lower) && /campuses/.test(lower)) return '补强校区接口超时后的兜底稳定性';
  if (/hard fallback/.test(lower) && /campuses/.test(lower)) return '补强校区接口异常时的兜底稳定性';
  if (/allow mini match login in preview/.test(lower)) return '约球小程序预览环境支持登录';
  if (/guard login/.test(lower) && /missing/.test(lower)) return '登录链路补上兜底保护，减少无法进入系统的情况';
  if (/official account webhook flow/.test(lower)) return '新增公众号通知对接流程';
  if (/package merge flow/.test(lower) || /refine package merge flows/.test(lower)) return '新增课包合并流程';
  if (/private lesson import finance increments/.test(lower)) return '新增私教课导入后的财务增量统计';
  if (/package merge dropdown clipping/.test(lower)) return '修复课包合并下拉菜单被遮挡的问题';
  if (/student page live lesson cache/.test(lower)) return '修复学员页实时课程缓存问题';
  if (/hide merged packages from purchase pickers/.test(lower)) return '购买选择器不再显示已合并课包';
  if (/polish package merge ui/.test(lower)) return '优化课包合并界面';
  if (/prevent page refresh clearing datasets/.test(lower)) return '避免页面刷新时清空数据';
  if (/restore finance coach settlement rows/.test(lower)) return '恢复财务页教练结算明细';
  if (/show lesson package purchase details inline/.test(lower)) return '在页面内展示课包购买明细';
  if (/speed up schedule and package first paint/.test(lower)) return '提升排课和课包页面首屏加载速度';
  if (/wait products package (page|页面)/.test(lower)) return '等待产品与课包页面数据加载完成';
  if (/restore coach management data loading/.test(lower)) return '恢复教练管理数据加载';
  if (/campus/.test(lower) && /filter/.test(lower)) return '新增按校区筛选功能';
  if (/membership/.test(lower) && /aggregate/.test(lower)) return '会员页汇总数据展示已修复';
  if (/courts?/.test(lower) && /read model/.test(lower)) return '订场页面默认切换到更稳定的数据读取链路';
  if (/preview/.test(lower) && /login/.test(lower)) return '预览环境登录能力已修复';

  text = text
    .replace(/\bfeishu github actions\b/ig, '飞书自动推送')
    .replace(/\bgithub actions\b/ig, '自动推送')
    .replace(/\bruntime files?\b/ig, '运行配置')
    .replace(/\bruntime\b/ig, '运行配置')
    .replace(/\bschedule and timezone\b/ig, '时间配置')
    .replace(/\btimezone\b/ig, '时间配置')
    .replace(/\bautomation\b/ig, '自动推送')
    .replace(/\banonymous\b/ig, '未登录')
    .replace(/\breads?\b/ig, '读取')
    .replace(/\bauth fallback\b/ig, '鉴权稳定性')
    .replace(/\bfallback\b/ig, '兜底稳定性')
    .replace(/\bbypass\b/ig, '优化')
    .replace(/\binit\b/ig, '初始化')
    .replace(/\bft_users\b/ig, '账号表')
    .replace(/\bmini match\b/ig, '约球')
    .replace(/\bmatch\b/ig, '约球')
    .replace(/\bmembership\b/ig, '会员')
    .replace(/\bcampuses\b/ig, '校区')
    .replace(/\bcampus\b/ig, '校区')
    .replace(/\bfilter\b/ig, '筛选')
    .replace(/\blogin\b/ig, '登录')
    .replace(/\bpreview\b/ig, '预览环境')
    .replace(/\bworkbench\b/ig, '工作台')
    .replace(/\bcourts?\b/ig, '订场')
    .replace(/\bpage\b/ig, '页面')
    .replace(/\baggregate\b/ig, '汇总')
    .replace(/\bread model\b/ig, '读取链路')
    .replace(/\bdefault\b/ig, '默认')
    .replace(/\bmissing\b/ig, '缺失')
    .replace(/\bguard\b/ig, '保护')
    .replace(/\bfix\b/ig, '修复')
    .replace(/\badd\b/ig, '新增')
    .replace(/\ballow\b/ig, '支持')
    .replace(/\bswitch\b/ig, '切换')
    .replace(/\bpublic\b/ig, '公开')
    .replace(/\bhealth\b/ig, '健康检查')
    .replace(/\bscan timeout\b/ig, '接口超时')
    .replace(/\bhard\b/ig, '增强')
    .replace(/\bto\b/ig, '')
    .replace(/\bby\b/ig, '')
    .replace(/\bfor\b/ig, '')
    .replace(/\bon\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/[。！？]$/.test(text)) {
    text = text.replace(/^(修复|新增|支持|切换)\s+/u, '$1');
  }

  text = text
    .replace(/^新增运行配置$/u, '补齐运行配置')
    .replace(/^修复自动推送 时间配置$/u, '修正自动推送时间配置')
    .replace(/^优化 初始化 未登录 校区 读取$/u, '优化未登录场景下的校区读取稳定性')
    .replace(/^支持校区 优化 约球 admin 鉴权稳定性$/u, '优化校区访问与约球后台鉴权稳定性')
    .replace(/\badmin\b/ig, '后台')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function parsePullRequestNumber(text) {
  const normalized = normalizeText(text);
  const prMatches = normalized.match(/#(\d+)/);
  if (prMatches) return Number(prMatches[1]);
  return null;
}

function normalizeKey(text) {
  return cleanSubject(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .trim();
}

function isTestPath(file) {
  return /^tests?\//.test(file);
}

function isDocPath(file) {
  return /^docs\//.test(file) || /(^|\/)README/i.test(file);
}

function isOpsPath(file) {
  return /^scripts\/(repair|cleanup|finalize|archive|import)\//.test(file);
}

function isCiPath(file) {
  return /^\.github\//.test(file);
}

function isProductPath(file) {
  return !(
    isTestPath(file) ||
    isDocPath(file) ||
    isOpsPath(file) ||
    isCiPath(file) ||
    /^standalone-services\/changelogs\//.test(file)
  );
}

function isNoiseCommit(commit) {
  const title = `${commit.subject} ${commit.body}`.toLowerCase();
  const files = commit.files || [];
  const hasProductFile = files.some(isProductPath);
  if (!hasProductFile) return true;
  if (/^(test|docs|ci|chore|build|style):/.test(title)) return true;
  if (/(repair|cleanup|backfill|seed|fixture|mock|debug)/.test(title) && !/(login|page|workbench|match|membership|campus|filter|schedule|court)/.test(title)) {
    return true;
  }
  return false;
}

function commitTouchesMatch(commit) {
  const blob = `${commit.subject}\n${commit.body}\n${(commit.files || []).join('\n')}`.toLowerCase();
  return /match|mini-match|约球/.test(blob);
}

function commitTouchesCoachMiniProgram(commit) {
  return (commit.files || []).some((file) => file.startsWith('wechat-miniprogram/'));
}

function commitTouchesCoachWorkbench(commit) {
  const blob = `${commit.subject}\n${commit.body}\n${(commit.files || []).join('\n')}`.toLowerCase();
  return /workbench|coach|portal|schedule|feedback/.test(blob);
}

function commitTouchesAdmin(commit) {
  const blob = `${commit.subject}\n${commit.body}\n${(commit.files || []).join('\n')}`.toLowerCase();
  return /student|purchase|package|membership|finance|campus|court|admin|order/.test(blob);
}

function classifyPlatforms(commit) {
  const platforms = new Set();

  if (commitTouchesCoachMiniProgram(commit)) platforms.add('coachMp');
  if (commitTouchesMatch(commit)) platforms.add('matchMp');

  if (commitTouchesCoachWorkbench(commit)) {
    platforms.add('coachWeb');
    platforms.add('coachPwa');
  }

  if (commitTouchesAdmin(commit)) {
    platforms.add('adminWeb');
  }

  if (platforms.size === 0 && (commit.files || []).some((file) => file.startsWith('public/') || file.startsWith('api/'))) {
    platforms.add('adminWeb');
  }

  return PLATFORM_ORDER.filter((key) => platforms.has(key));
}

function buildCandidate(commit, prDetails) {
  const title = normalizeText(prDetails?.title || commit.subject);
  const body = normalizeText(prDetails?.body || commit.body);
  const summary = summarizeText(title || body);
  const platforms = classifyPlatforms(commit);

  if (!summary || platforms.length === 0) return null;

  return {
    key: prDetails?.number ? `pr-${prDetails.number}` : normalizeKey(title || commit.subject),
    summary,
    platforms,
    sourceTitle: title || commit.subject,
    prNumber: prDetails?.number || commit.prNumber || null,
    files: commit.files || []
  };
}

function buildBusinessEntries(commits, options = {}) {
  const prDetailsByNumber = options.prDetailsByNumber || {};
  const deduped = new Map();

  for (const commit of commits) {
    if (isNoiseCommit(commit)) continue;
    const prDetails = commit.prNumber ? prDetailsByNumber[commit.prNumber] : null;
    const candidate = buildCandidate(commit, prDetails);
    if (!candidate) continue;

    if (deduped.has(candidate.key)) {
      const existing = deduped.get(candidate.key);
      existing.platforms = PLATFORM_ORDER.filter((key) => new Set([...existing.platforms, ...candidate.platforms]).has(key));
      if (existing.summary.length > candidate.summary.length) {
        existing.summary = candidate.summary;
      }
      continue;
    }

    deduped.set(candidate.key, candidate);
  }

  return Array.from(deduped.values()).sort((a, b) => a.summary.localeCompare(b.summary, 'zh-CN'));
}

function groupEntriesByPlatform(entries) {
  const grouped = {
    adminWeb: [],
    coachWeb: [],
    coachPwa: [],
    coachMp: [],
    matchMp: []
  };

  for (const entry of entries) {
    for (const platform of entry.platforms) {
      grouped[platform].push(entry.summary);
    }
  }

  for (const key of Object.keys(grouped)) {
    grouped[key] = Array.from(new Set(grouped[key]));
  }

  return grouped;
}

function buildTopSummary(entries) {
  return entries.slice(0, 4).map((entry, index) => `${index + 1}. ${entry.summary}`);
}

function buildChangelogCard(payload) {
  const grouped = groupEntriesByPlatform(payload.entries);
  const blocks = [];
  const topSummary = buildTopSummary(payload.entries);

  blocks.push({
    tag: 'markdown',
    content: `**📅 更新日期：${payload.date}**\n**📦 有效更新：${payload.entries.length} 项**\n\n${topSummary.join('\n')}`
  });

  for (const platform of PLATFORM_ORDER) {
    if (!grouped[platform].length) continue;
    blocks.push({
      tag: 'markdown',
      content: `**${PLATFORM_NAMES[platform]}**\n${grouped[platform].map((line) => `• ${line}`).join('\n')}`
    });
  }

  blocks.push({ tag: 'hr' });
  blocks.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: '本摘要由 Git 提交与 PR 元信息自动生成；当天无有效产品更新时静默不发。'
      }
    ]
  });

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'green',
        title: {
          content: '🚀 [网球兄弟] 产品升级日志',
          tag: 'plain_text'
        }
      },
      elements: blocks
    }
  };
}

function parseGitLog(raw) {
  return raw
    .split('\n<<<FT_COMMIT_END>>>\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [meta, ...fileLines] = block.split('\n');
      const [sha, subject, body] = meta.split('\u001f');
      const files = fileLines.map((line) => line.trim()).filter(Boolean);
      return {
        sha: sha || '',
        subject: subject || '',
        body: body || '',
        files,
        prNumber: parsePullRequestNumber(`${subject}\n${body}`)
      };
    });
}

function loadGitCommits(date) {
  const since = `${date} 00:00:00 +0800`;
  const until = `${date} 23:59:59 +0800`;
  const raw = execFileSync(
    'git',
    [
      '-C',
      REPO_ROOT,
      'log',
      `--since=${since}`,
      `--until=${until}`,
      '--pretty=format:%H%x1f%s%x1f%b%n',
      '--name-only',
      '--no-renames',
      '--no-merges',
      '--',
      '.',
      ':(exclude)standalone-services/changelogs'
    ],
    { encoding: 'utf8' }
  ).replace(/\n(?=[0-9a-f]{40}\u001f)/g, '\n<<<FT_COMMIT_END>>>\n');

  return parseGitLog(raw);
}

async function fetchPullRequestDetail(number) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !number) return null;
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${number}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'flowtennis-changelog-bot'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return {
    number: data.number,
    title: data.title || '',
    body: data.body || ''
  };
}

async function fetchPullRequestDetails(commits) {
  const numbers = Array.from(new Set(commits.map((commit) => commit.prNumber).filter(Boolean)));
  const details = await Promise.all(numbers.map((number) => fetchPullRequestDetail(number)));
  const indexed = {};
  for (const item of details) {
    if (item?.number) indexed[item.number] = item;
  }
  return indexed;
}

async function sendCard(payload) {
  const response = await axios.post(FEISHU_CHANGELOG_WEBHOOK, payload);
  if (response.data.code !== 0) {
    throw new Error(`飞书返回异常：${JSON.stringify(response.data)}`);
  }
}

async function run() {
  if (!FEISHU_CHANGELOG_WEBHOOK) {
    throw new Error('缺少环境变量 FEISHU_CHANGELOG_WEBHOOK');
  }

  const date = targetDate();
  const commits = loadGitCommits(date);
  if (commits.length === 0) {
    console.log(`[Info] ${date} 没有检测到提交，静默退出。`);
    return;
  }

  const prDetailsByNumber = await fetchPullRequestDetails(commits);
  const entries = buildBusinessEntries(commits, { prDetailsByNumber });

  if (entries.length === 0) {
    console.log(`[Info] ${date} 没有有效产品更新，静默退出。`);
    return;
  }

  const payload = buildChangelogCard({ date, entries });
  await sendCard(payload);
  console.log(`✅ ${date} 产品升级日志发送成功，共 ${entries.length} 项。`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`❌ 更新日志发送失败：${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  buildBusinessEntries,
  buildChangelogCard,
  classifyPlatforms,
  cleanSubject,
  groupEntriesByPlatform,
  isNoiseCommit,
  summarizeText
};
