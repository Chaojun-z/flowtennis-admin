const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /真实可约课以课包余额规则为准/, 'plan page should explain class progress vs package balance truth boundary');
assert.match(html, /tms-audit-note">学习计划由「班次管理」自动生成/, 'plan page should render the top explanation as an audit note style');
assert.match(html, /id="page-classes"[\s\S]*tms-audit-note">班次用于组织固定上课关系和学习进度；是否还能继续约课，仍然以课包余额和可用规则为准。<\/div>/, 'class page should explain the difference between class progress and package balance');
assert.match(html, /planCampusFilterHost/, 'plan page should include campus filter host');
assert.match(html, /planCoachFilterHost/, 'plan page should include coach filter host');
assert.match(html, /planTypeFilterHost/, 'plan page should include course type filter host');
assert.match(html, /planStageFilterHost[\s\S]*刚开课[\s\S]*进行中[\s\S]*临近结课/, 'plan page should include lesson stage filter');
assert.match(html, /<table class="tms-table">[\s\S]*<th[^>]*>学员<\/th><th[^>]*>手机号<\/th><th[^>]*>班次<\/th><th[^>]*>课程<\/th><th[^>]*>教练<\/th><th[^>]*>最近上课<\/th><th[^>]*>班次进度<\/th><th[^>]*>课包余额<\/th><th[^>]*>状态<\/th><th[^>]*>操作<\/th>/, 'plan table should use package balance wording');
assert.match(html, /function planLastLesson\(/, 'plan list should compute latest lesson');
assert.match(html, /function planEntitlementSummary\(/, 'plan list should compute entitlement summary');
assert.match(html, /const pct=tl>0\?Math\.round\(ul\/tl\*100\):0/, 'plan progress bar should use used lessons ratio');
assert.match(html, /function openPlanDetail\(/, 'plan page should provide a details action');
assert.match(html, /学习计划摘要[\s\S]*最近排课[\s\S]*课包余额[\s\S]*最近反馈/, 'plan detail should follow the agreed information hierarchy');
assert.match(html, /function openPlanDetail[\s\S]*setCourtModalFrame\(/, 'plan detail should reuse the booking-style modal shell');
assert.match(html, /function openPlanStudent\(/, 'plan page should provide student jump action');
assert.match(html, /function openPlanClass\(/, 'plan page should provide class jump action');
assert.match(html, /function openPlanSchedule\(/, 'plan page should provide schedule action');

console.log('plan page view tests passed');
