const assert = require('assert');
const path = require('path');

const changelog = require(path.join(__dirname, '..', 'standalone-services', 'feishu-changelog.js'));

const entries = changelog.buildBusinessEntries([
  {
    sha: 'a1',
    subject: 'Fix leads campus and dedupe display',
    body: '',
    files: ['public/assets/scripts/pages/leads.js']
  },
  {
    sha: 'a2',
    subject: 'Update product broadcast',
    body: [
      '产品播报:',
      '- 管理后台：线索列表新增校区筛选，运营可以按校区查看和分配客户线索',
      '- 教练手机端：排课日报按北京时间统计，避免下午课被误算到第二天'
    ].join('\n'),
    files: ['public/assets/scripts/pages/leads.js', 'standalone-services/feishu-report.js']
  },
  {
    sha: 'a3',
    subject: 'Update match flow',
    body: [
      '产品播报:',
      '- 约球小程序：报名页面展示候补名额，用户能看到自己是否进入候补队列'
    ].join('\n'),
    files: ['api/match/login.js']
  }
]);

assert.strictEqual(entries.length, 3, '只有写了产品播报的更新才进入产品升级日志');
assert.deepStrictEqual(
  entries.map((item) => item.summary),
  [
    '线索列表新增校区筛选，运营可以按校区查看和分配客户线索',
    '排课日报按北京时间统计，避免下午课被误算到第二天',
    '报名页面展示候补名额，用户能看到自己是否进入候补队列'
  ],
  '产品升级日志应直接使用产品播报文案'
);

const grouped = changelog.groupEntriesByPlatform(entries);
assert.deepStrictEqual(grouped.adminWeb, ['线索列表新增校区筛选，运营可以按校区查看和分配客户线索']);
assert.deepStrictEqual(grouped.coachPwa, ['排课日报按北京时间统计，避免下午课被误算到第二天']);
assert.deepStrictEqual(grouped.matchMp, ['报名页面展示候补名额，用户能看到自己是否进入候补队列']);

const card = changelog.buildChangelogCard({ date: '2026-05-24', entries });
const cardText = JSON.stringify(card);
assert.doesNotMatch(cardText, /有效更新|1\.|2\.|3\.|系统功能优化|系统体验已优化/, '卡片不应再展示有效更新模块和机器兜底文案');
assert.match(cardText, /更新日期：2026-05-24/, '卡片应保留更新日期');
assert.match(cardText, /管理后台/, '卡片应按端展示产品播报');
assert.match(cardText, /教练手机端/, '卡片应展示教练手机端播报');
assert.match(cardText, /约球小程序/, '卡片应展示约球小程序播报');

console.log('feishu changelog rules tests passed');
