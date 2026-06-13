const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = source.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

const planShell = standardConfigBlock('plans');
const classShell = standardConfigBlock('classes');

assert.match(source, /真实可约课以课包余额规则为准/, 'plan page should explain class progress vs package balance truth boundary');
assert.match(planShell, /noteHtml:'学习计划由「班次管理」自动生成/, 'plan page should render the top explanation through the standard audit note');
assert.match(classShell, /noteHtml:'班次用于组织固定上课关系和学习进度；是否还能继续约课，仍然以课包余额和可用规则为准。'/, 'class page should explain the difference between class progress and package balance');
assert.match(source, /planCampusFilterHost/, 'plan page should include campus filter host');
assert.match(source, /planCoachFilterHost/, 'plan page should include coach filter host');
assert.match(source, /planTypeFilterHost/, 'plan page should include course type filter host');
assert.match(source, /planStageFilterHost[\s\S]*刚开课[\s\S]*进行中[\s\S]*临近结课/, 'plan page should include lesson stage filter');
assert.match(planShell, /bodyId:'planTbody'[\s\S]*label:'学员'[\s\S]*label:'手机号'[\s\S]*label:'班次'[\s\S]*label:'课程'[\s\S]*label:'教练'[\s\S]*label:'最近上课'[\s\S]*label:'班次进度'[\s\S]*label:'课包余额'[\s\S]*label:'状态'[\s\S]*label:'操作'/, 'plan table should use package balance wording');
assert.match(source, /function planLastLesson\(/, 'plan list should compute latest lesson');
assert.match(source, /function planEntitlementSummary\(/, 'plan list should compute entitlement summary');
assert.match(source, /const pct=tl>0\?Math\.round\(ul\/tl\*100\):0/, 'plan progress bar should use used lessons ratio');
assert.match(source, /function openPlanDetail\(/, 'plan page should provide a details action');
assert.match(source, /学习计划摘要[\s\S]*最近排课[\s\S]*课包余额[\s\S]*最近反馈/, 'plan detail should follow the agreed information hierarchy');
assert.match(source, /function openPlanDetail[\s\S]*openStandardModal\(/, 'plan detail should use the standard modal shell');
assert.match(source, /function openPlanStudent\(/, 'plan page should provide student jump action');
assert.match(source, /function openPlanClass\(/, 'plan page should provide class jump action');
assert.match(source, /function openPlanSchedule\(/, 'plan page should provide schedule action');

console.log('plan page view tests passed');
