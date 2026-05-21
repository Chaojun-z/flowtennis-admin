const assert = require('assert');
const path = require('path');

const changelog = require(path.join(__dirname, '..', 'standalone-services', 'feishu-changelog.js'));

const commits = [
  {
    sha: 'a1',
    subject: 'feat: add campus filter to membership orders (#201)',
    body: '',
    files: ['public/assets/scripts/pages/membership.js', 'tests/membership-view.test.js']
  },
  {
    sha: 'a2',
    subject: 'fix: add campus filter to membership orders (#201)',
    body: '',
    files: ['public/assets/scripts/pages/membership.js']
  },
  {
    sha: 'a3',
    subject: 'test: cover membership page filter',
    body: '',
    files: ['tests/membership-view.test.js']
  },
  {
    sha: 'a4',
    subject: 'Allow mini match login in preview',
    body: '',
    files: ['api/match/login.js', 'tests/match-login-preview-access.test.js']
  },
  {
    sha: 'a5',
    subject: 'docs: update release note template',
    body: '',
    files: ['docs/release-template.md']
  },
  {
    sha: 'a6',
    subject: 'fix: guard login when ft_users table is missing',
    body: '',
    files: ['api/index.js', 'public/assets/scripts/pages/workbench.js']
  },
  {
    sha: 'a7',
    subject: 'repair: backfill membership ledger',
    body: '',
    files: ['scripts/repair/fix-membership-ledger.js']
  }
];

const entries = changelog.buildBusinessEntries(commits, { prDetailsByNumber: {} });

assert.strictEqual(entries.length, 3, '应去重并过滤纯测试、文档、修数噪音');

assert.deepStrictEqual(
  entries.map((item) => [...item.platforms].sort()).sort((a, b) => a[0].localeCompare(b[0])),
  [['adminWeb'], ['coachPwa', 'coachWeb'], ['matchMp']],
  '应按 5 端规则归类'
);

assert.match(entries[0].summary + entries[1].summary + entries[2].summary, /校区筛选|筛选/, '应提炼老板能看懂的业务摘要');
assert.doesNotMatch(entries.map((item) => item.summary).join('\n'), /feat:|fix:|test:|docs:/, '摘要不应直接输出技术前缀');

const grouped = changelog.groupEntriesByPlatform(entries);
assert.strictEqual(grouped.adminWeb.length, 1, '管理后台应聚合到 adminWeb');
assert.strictEqual(grouped.coachWeb.length, 1, '教练网页应聚合到 coachWeb');
assert.strictEqual(grouped.coachPwa.length, 1, '教练 PWA 应聚合到 coachPwa');
assert.strictEqual(grouped.matchMp.length, 1, '约球小程序应聚合到 matchMp');

const silent = changelog.buildBusinessEntries(
  [
    {
      sha: 'b1',
      subject: 'test: add changelog coverage',
      body: '',
      files: ['tests/feishu-changelog-rules.test.js']
    }
  ],
  { prDetailsByNumber: {} }
);

assert.strictEqual(silent.length, 0, '只有技术噪音时应静默不发');

assert.strictEqual(
  changelog.summarizeText('add runtime files for feishu github actions'),
  '补齐飞书自动推送运行配置',
  'runtime 相关英文应转成中文人话'
);

assert.strictEqual(
  changelog.summarizeText('fix feishu automation schedule and timezone'),
  '修正飞书自动推送时间配置',
  'schedule 和 timezone 应转成普通用户看得懂的中文'
);

assert.strictEqual(
  changelog.summarizeText('support campuses bypass match admin auth fallback'),
  '优化校区访问与约球后台鉴权稳定性',
  'bypass 和 auth fallback 不应直接出现在最终摘要里'
);

assert.strictEqual(
  changelog.summarizeText('bypass init for anonymous campuses reads'),
  '优化未登录场景下的校区读取稳定性',
  'init 和 anonymous reads 应转成业务可读描述'
);

assert.doesNotMatch(
  [
    changelog.summarizeText('add runtime files for feishu github actions'),
    changelog.summarizeText('fix feishu automation schedule and timezone'),
    changelog.summarizeText('support campuses bypass match admin auth fallback'),
    changelog.summarizeText('bypass init for anonymous campuses reads')
  ].join('\n'),
  /runtime|fallback|bypass|auth|timezone|anonymous|init/i,
  '最终摘要不应直接带出技术底层英文术语'
);

const userFacingExamples = [
  ['add official account webhook flow', '新增公众号通知对接流程'],
  ['add package merge flow', '新增课包合并流程'],
  ['add private lesson import finance increments', '新增私教课导入后的财务增量统计'],
  ['fix package merge dropdown clipping', '修复课包合并下拉菜单被遮挡的问题'],
  ['fix student page live lesson cache', '修复学员页实时课程缓存问题'],
  ['Hide merged packages from purchase pickers', '购买选择器不再显示已合并课包'],
  ['Polish package merge UI', '优化课包合并界面'],
  ['prevent page refresh clearing datasets', '避免页面刷新时清空数据'],
  ['restore finance coach settlement rows', '恢复财务页教练结算明细'],
  ['Show lesson package purchase details inline', '在页面内展示课包购买明细'],
  ['speed up schedule and package first paint', '提升排课和课包页面首屏加载速度'],
  ['wait products package page', '等待产品与课包页面数据加载完成'],
  ['restore coach management data loading', '恢复教练管理数据加载']
];

for (const [source, expected] of userFacingExamples) {
  assert.strictEqual(changelog.summarizeText(source), expected, `${source} 应转成中文人话`);
}

assert.doesNotMatch(
  userFacingExamples.map(([source]) => changelog.summarizeText(source)).join('\n'),
  /official|account|webhook|flow|package|private|lesson|import|dropdown|clipping|cache|picker|polish|refresh|datasets|restore|settlement|inline|first paint|products|loading/i,
  '产品播报不应直接输出普通用户看不懂的英文提交词'
);

console.log('feishu changelog rules tests passed');
