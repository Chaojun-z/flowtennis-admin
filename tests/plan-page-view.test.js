const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

assert.match(source, /真实可约课以课包余额规则为准/, 'plan page should explain class progress vs package balance truth boundary');
assert.match(source, /tms-audit-note">学习计划由「班次管理」自动生成/, 'plan page should render the top explanation as an audit note style');
assert.match(source, /id="page-classes"[\s\S]*tms-audit-note">班次用于组织固定上课关系和学习进度；是否还能继续约课，仍然以课包余额和可用规则为准。<\/div>/, 'class page should explain the difference between class progress and package balance');
assert.match(source, /planCampusFilterHost/, 'plan page should include campus filter host');
assert.match(source, /planCoachFilterHost/, 'plan page should include coach filter host');
assert.match(source, /planTypeFilterHost/, 'plan page should include course type filter host');
assert.match(source, /planStageFilterHost[\s\S]*刚开课[\s\S]*进行中[\s\S]*临近结课/, 'plan page should include lesson stage filter');
assert.match(source, /<table class="tms-table">[\s\S]*<th[^>]*>学员<\/th><th[^>]*>手机号<\/th><th[^>]*>班次<\/th><th[^>]*>课程<\/th><th[^>]*>教练<\/th><th[^>]*>最近上课<\/th><th[^>]*>班次进度<\/th><th[^>]*>课包余额<\/th><th[^>]*>状态<\/th><th[^>]*>操作<\/th>/, 'plan table should use package balance wording');
assert.match(source, /function planLastLesson\(/, 'plan list should compute latest lesson');
assert.match(source, /function planEntitlementSummary\(/, 'plan list should compute entitlement summary');
assert.match(source, /const pct=tl>0\?Math\.round\(ul\/tl\*100\):0/, 'plan progress bar should use used lessons ratio');
assert.match(source, /function openPlanDetail\(/, 'plan page should provide a details action');
assert.match(source, /学习计划摘要[\s\S]*最近排课[\s\S]*课包余额[\s\S]*最近反馈/, 'plan detail should follow the agreed information hierarchy');
assert.match(source, /function openPlanDetail[\s\S]*setCourtModalFrame\(/, 'plan detail should reuse the booking-style modal shell');
assert.match(source, /function openPlanStudent\(/, 'plan page should provide student jump action');
assert.match(source, /function openPlanClass\(/, 'plan page should provide class jump action');
assert.match(source, /function openPlanSchedule\(/, 'plan page should provide schedule action');

console.log('plan page view tests passed');
