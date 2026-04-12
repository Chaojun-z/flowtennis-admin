const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /真实可约课以权益账户规则为准/, 'plan page should explain class progress vs entitlement truth boundary');
assert.match(html, /id="planCampusFilter"/, 'plan page should include campus filter');
assert.match(html, /id="planCoachFilter"/, 'plan page should include coach filter');
assert.match(html, /id="planTypeFilter"/, 'plan page should include course type filter');
assert.match(html, /id="planStageFilter"[\s\S]*刚开课[\s\S]*进行中[\s\S]*临近结课/, 'plan page should include lesson stage filter');
assert.match(html, /<th>学员<\/th><th>手机号<\/th><th>班次<\/th><th>课程<\/th><th>教练<\/th><th>最近上课<\/th><th>班次进度<\/th><th>权益摘要<\/th><th>状态<\/th><th style="text-align:right">操作<\/th>/, 'plan table should use operations-oriented columns');
assert.match(html, /function planLastLesson\(/, 'plan list should compute latest lesson');
assert.match(html, /function planEntitlementSummary\(/, 'plan list should compute entitlement summary');
assert.match(html, /const pct=tl>0\?Math\.round\(ul\/tl\*100\):0/, 'plan progress bar should use used lessons ratio');
assert.match(html, /function openPlanDetail\(/, 'plan page should provide a details action');
assert.match(html, /学习计划摘要[\s\S]*最近排课[\s\S]*权益摘要[\s\S]*最近反馈/, 'plan detail should follow the agreed information hierarchy');
assert.match(html, /function openPlanStudent\(/, 'plan page should provide student jump action');
assert.match(html, /function openPlanClass\(/, 'plan page should provide class jump action');
assert.match(html, /function openPlanSchedule\(/, 'plan page should provide schedule action');

console.log('plan page view tests passed');
