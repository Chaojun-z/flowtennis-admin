const axios = require('axios');
const dayjs = require('dayjs');
const fs = require('fs');
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
  coachPwa: '📱 教练手机端',
  coachMp: '🟢 教练小程序',
  matchMp: '🎾 约球小程序'
};
const CATEGORY_ORDER = [
  'stability',
  'finance',
  'packageSchedule',
  'membershipCourt',
  'leadStudent',
  'experience',
  'other'
];
const CATEGORY_NAMES = {
  stability: '稳定性与安全',
  finance: '财务与对账',
  packageSchedule: '课包与排课',
  membershipCourt: '会员与订场',
  leadStudent: '线索与学员',
  experience: '界面体验',
  other: '其他更新'
};
const BROADCAST_PLATFORM_ALIASES = {
  管理后台: 'adminWeb',
  后台: 'adminWeb',
  教练网页版: 'coachWeb',
  教练网页: 'coachWeb',
  教练手机端: 'coachPwa',
  教练PWA: 'coachPwa',
  教练小程序: 'coachMp',
  约球小程序: 'matchMp',
  约球: 'matchMp'
};

function targetDate(nowInput) {
  const raw = String(process.env.CHANGELOG_TARGET_DATE || '').trim();
  if (raw && !nowInput) return raw;
  const now = nowInput ? dayjs(nowInput) : dayjs();
  if (now.hour() < 12) return now.subtract(1, 'day').format('YYYY-MM-DD');
  return now.format('YYYY-MM-DD');
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

function hasEnglishPhrase(input) {
  return /[A-Za-z][A-Za-z0-9_-]*/.test(String(input || ''));
}

function fallbackChineseSummary(input) {
  const lower = cleanSubject(input).toLowerCase();
  let domain = '系统';
  if (/official account/.test(lower)) domain = '公众号';
  else if (/coach/.test(lower)) domain = '教练端';
  else if (/membership/.test(lower)) domain = '会员';
  else if (/package/.test(lower)) domain = '课包';
  else if (/schedule/.test(lower)) domain = '排课';
  else if (/student/.test(lower)) domain = '学员';
  else if (/finance/.test(lower)) domain = '财务';
  else if (/campus|mabao/.test(lower)) domain = '校区';
  else if (/court/.test(lower)) domain = '订场';
  else if (/match/.test(lower)) domain = '约球';

  if (/jitter/.test(lower)) return `${domain}页面抖动问题已修复`;
  if (/display/.test(lower)) return `${domain}展示问题已修复`;
  if (/loading/.test(lower)) return `${domain}数据加载已恢复`;
  if (/cache/.test(lower)) return `${domain}缓存问题已修复`;
  if (/phone/.test(lower)) return `${domain}手机号绑定能力已补齐`;
  if (/reminder/.test(lower)) return `${domain}提醒稳定性已增强`;
  if (/time window/.test(lower)) return `${domain}可用时段规则已优化`;
  if (/validity/.test(lower)) return `${domain}有效期规则已优化`;
  if (/usage rule/.test(lower)) return `${domain}使用规则已优化`;
  if (/import/.test(lower) && /finance/.test(lower)) return `${domain}导入后的财务统计已优化`;

  if (/^(fix|repair)/.test(lower)) return `${domain}问题已修复`;
  if (/^(add|support|allow|bind)/.test(lower)) return `${domain}功能已支持`;
  if (/^(restore)/.test(lower)) return `${domain}功能已恢复`;
  if (/^(harden)/.test(lower)) return `${domain}稳定性已增强`;
  if (/^(unify|refine|polish|prevent|speed up|wait)/.test(lower)) return `${domain}体验已优化`;
  return `${domain}功能优化`;
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
  if (/membership import finance increments/.test(lower)) return '修复会员导入后的财务增量统计';
  if (/package merge dropdown clipping/.test(lower)) return '修复课包合并下拉菜单被遮挡的问题';
  if (/coach pwa schedule jitter/.test(lower)) return '修复教练端排课页面抖动问题';
  if (/package order display/.test(lower)) return '修复课包订单展示问题';
  if (/student page live lesson cache/.test(lower)) return '修复学员页实时课程缓存问题';
  if (/hide merged packages from purchase pickers/.test(lower)) return '购买选择器不再显示已合并课包';
  if (/polish package merge ui/.test(lower)) return '优化课包合并界面';
  if (/prevent page refresh clearing datasets/.test(lower)) return '避免页面刷新时清空数据';
  if (/restore finance coach settlement rows/.test(lower)) return '恢复财务页教练结算明细';
  if (/show lesson package purchase details inline/.test(lower)) return '在页面内展示课包购买明细';
  if (/sold package usage rule edits/.test(lower)) return '支持已售课包使用规则修改';
  if (/sold package validity edits/.test(lower)) return '支持已售课包有效期修改';
  if (/bind official account coach phone/.test(lower)) return '支持公众号绑定教练手机号';
  if (/document finance import display/.test(lower)) return '记录财务导入展示保护逻辑';
  if (/parse official account reminder times/.test(lower) && /beijing/.test(lower)) return '支持公众号提醒按北京时间解析';
  if (/weekday weekend package time windows/.test(lower)) return '支持课包区分工作日和周末可用时段';
  if (/unify mabao/.test(lower) && /package signup dates/.test(lower)) return '统一玛宝校区和课包报名日期';
  if (/harden official account reminders/.test(lower)) return '增强公众号提醒稳定性';
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

  return hasEnglishPhrase(text) ? fallbackChineseSummary(input) : text;
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
  const items = extractProductBroadcastItems(`${prDetails?.body || ''}\n${commit.body || ''}`, commit);
  if (!items.length) return [];

  return items.map((item, index) => ({
    key: `${prDetails?.number ? `pr-${prDetails.number}` : commit.sha || normalizeKey(commit.subject)}-${index}`,
    summary: item.summary,
    platforms: item.platforms,
    sourceTitle: prDetails?.title || commit.subject,
    prNumber: prDetails?.number || commit.prNumber || null,
    files: commit.files || []
  }));
}

function extractProductBroadcastLines(input) {
  const lines = String(input || '').replace(/\r/g, '').replace(/\\n/g, '\n').split('\n');
  const result = [];
  let inBlock = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!inBlock) {
      if (/^产品播报\s*[:：]\s*$/.test(line)) inBlock = true;
      continue;
    }
    if (!line) {
      if (result.length) break;
      continue;
    }
    if (!/^[-*]\s+/.test(line)) break;
    result.push(line.replace(/^[-*]\s+/, '').trim());
  }
  return result;
}

function parseBroadcastLine(line, commit) {
  const text = normalizeText(line);
  if (!text) return null;
  const match = text.match(/^([^：:]{2,12})[：:]\s*(.+)$/);
  const platform = match ? BROADCAST_PLATFORM_ALIASES[match[1].trim()] : '';
  const summary = match && platform ? normalizeText(match[2]) : text;
  const platforms = platform ? [platform] : classifyPlatforms(commit);
  if (!summary || platforms.length === 0) return null;
  return { summary, platforms };
}

function extractProductBroadcastItems(input, commit) {
  return extractProductBroadcastLines(input)
    .map((line) => parseBroadcastLine(line, commit))
    .filter(Boolean);
}

function buildBusinessEntries(commits, options = {}) {
  const prDetailsByNumber = options.prDetailsByNumber || {};
  const deduped = new Map();

  for (const commit of commits) {
    const prDetails = commit.prNumber ? prDetailsByNumber[commit.prNumber] : null;
    const candidates = buildCandidate(commit, prDetails);
    if (!candidates.length) continue;

    for (const candidate of candidates) {
      if (deduped.has(candidate.key)) {
        const existing = deduped.get(candidate.key);
        existing.platforms = PLATFORM_ORDER.filter((key) => new Set([...existing.platforms, ...candidate.platforms]).has(key));
        continue;
      }
      deduped.set(candidate.key, candidate);
    }
  }

  return Array.from(deduped.values());
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

function classifyEntryCategory(summary) {
  const text = String(summary || '');
  if (/加载失败|部署|发布|函数数量|报错|错误|失败|稳定|安全|门禁|权限|登录|鉴权|XSS|CORS|限流|风险|兜底|读取链路|数据量增长/.test(text)) {
    return 'stability';
  }
  if (/财务|对账|账本|账目|流水|收入|已入账|未入账|口径|快照|基线|回溯|金额/.test(text)) {
    return 'finance';
  }
  if (/课包|排课|课程|消课|扣课|扣减|小班|体验课|购买/.test(text)) {
    return 'packageSchedule';
  }
  if (/会员|订场|场地|储值|充值|余额|消费|订场用户/.test(text)) {
    return 'membershipCourt';
  }
  if (/线索|学员|学生|客户/.test(text)) {
    return 'leadStudent';
  }
  if (/抽屉|列宽|备注|展示|入口|列表|详情|页面|筛选|按钮|输入框|界面|横向查看|对齐/.test(text)) {
    return 'experience';
  }
  return 'other';
}

function groupEntriesByPlatformAndCategory(entries) {
  const grouped = {};
  for (const platform of PLATFORM_ORDER) {
    grouped[platform] = {};
    for (const category of CATEGORY_ORDER) grouped[platform][category] = [];
  }

  for (const entry of entries) {
    const category = classifyEntryCategory(entry.summary);
    for (const platform of entry.platforms) {
      if (!grouped[platform]) continue;
      grouped[platform][category].push(entry.summary);
    }
  }

  for (const platform of PLATFORM_ORDER) {
    for (const category of CATEGORY_ORDER) {
      grouped[platform][category] = Array.from(new Set(grouped[platform][category]));
    }
  }

  return grouped;
}

function buildChangelogCard(payload) {
  const grouped = groupEntriesByPlatformAndCategory(payload.entries);
  const blocks = [];

  blocks.push({
    tag: 'markdown',
    content: `**📅 更新日期：${payload.date}**`
  });

  for (const platform of PLATFORM_ORDER) {
    const categoryBlocks = CATEGORY_ORDER
      .map((category) => {
        const lines = grouped[platform][category] || [];
        if (!lines.length) return '';
        return `【${CATEGORY_NAMES[category]}】\n${lines.map((line) => `• ${line}`).join('\n')}`;
      })
      .filter(Boolean);
    if (!categoryBlocks.length) continue;
    blocks.push({
      tag: 'markdown',
      content: `**${PLATFORM_NAMES[platform]}**\n\n${categoryBlocks.join('\n\n')}`
    });
  }

  blocks.push({ tag: 'hr' });
  blocks.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: '本摘要读取提交或合并请求中的“产品播报”内容，并按端和模块归类；如前一天漏发，会在下次自动补发。'
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
      const separatorIndex = fileLines.findIndex((line) => !line.trim());
      const bodyLines = separatorIndex >= 0 ? fileLines.slice(0, separatorIndex) : [];
      const rawFiles = separatorIndex >= 0 ? fileLines.slice(separatorIndex + 1) : fileLines;
      const fullBody = [body || '', ...bodyLines].join('\n').trim();
      const files = rawFiles.map((line) => line.trim()).filter(Boolean);
      return {
        sha: sha || '',
        subject: subject || '',
        body: fullBody,
        files,
        prNumber: parsePullRequestNumber(`${subject}\n${fullBody}`)
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

function readSentDates(statePath) {
  if (!statePath) return [];
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, statePath), 'utf8');
    const data = JSON.parse(raw);
    const dates = Array.isArray(data) ? data : data.sentDates;
    return Array.isArray(dates) ? dates.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function writeSentDates(statePath, dates) {
  if (!statePath) return;
  const target = path.resolve(__dirname, statePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify({ sentDates: Array.from(new Set(dates)).sort() }, null, 2) + '\n'
  );
}

function resolveReportDates(options = {}) {
  if (String(process.env.CHANGELOG_TARGET_DATE || '').trim() && !options.now) {
    return [targetDate()];
  }

  const now = options.now ? dayjs(options.now) : dayjs();
  const todayTarget = targetDate(options.now);
  const sent = new Set(options.sentDates || []);
  const dates = [todayTarget];

  if (now.hour() >= 12) {
    const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD');
    if (!sent.has(yesterday) && yesterday !== todayTarget) {
      dates.unshift(yesterday);
    }
  }

  return Array.from(new Set(dates));
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

  const statePath = String(process.env.CHANGELOG_SENT_STATE || '').trim();
  const sentDates = readSentDates(statePath);
  const dates = resolveReportDates({ sentDates });
  const entries = [];
  const datesWithEntries = [];

  for (const date of dates) {
    const commits = loadGitCommits(date);
    if (commits.length === 0) {
      console.log(`[Info] ${date} 没有检测到提交。`);
      continue;
    }

    const prDetailsByNumber = await fetchPullRequestDetails(commits);
    const dayEntries = buildBusinessEntries(commits, { prDetailsByNumber });
    if (dayEntries.length === 0) {
      console.log(`[Info] ${date} 没有有效产品更新。`);
      continue;
    }

    datesWithEntries.push(date);
    entries.push(...dayEntries);
  }

  if (entries.length === 0) {
    writeSentDates(statePath, [...sentDates, ...dates]);
    console.log(`[Info] ${dates.join('、')} 没有有效产品更新，静默退出。`);
    return;
  }

  const payload = buildChangelogCard({ date: datesWithEntries.join('、'), entries });
  await sendCard(payload);
  writeSentDates(statePath, [...sentDates, ...dates]);
  console.log(`✅ ${datesWithEntries.join('、')} 产品升级日志发送成功，共 ${entries.length} 项。`);
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
  classifyEntryCategory,
  cleanSubject,
  extractProductBroadcastItems,
  groupEntriesByPlatform,
  groupEntriesByPlatformAndCategory,
  isNoiseCommit,
  parseGitLog,
  readSentDates,
  resolveReportDates,
  targetDate,
  summarizeText
};
