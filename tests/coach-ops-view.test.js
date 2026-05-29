const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source } = require('./helpers/read-index-bundle');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const coachOpsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');
const html = source;

assert.match(
  source,
  /mode==='week'\|\|mode==='month'/,
  'month view should use the weekday header like week view'
);

assert.match(
  source,
  /const COACH_OPS_ORDER_STORAGE_KEY='ft_coach_ops_order'/,
  'coach ops should persist a manual order for names that are not in the coach table'
);

assert.match(
  source,
  /function coachOpsStoredOrderIndex\(/,
  'coach ops should expose a stored-order lookup helper'
);

assert.doesNotMatch(
  source,
  /<div style="font-size:14px;font-weight:600;color:var\(--cream-pale\);margin:4px 0 10px">教练工作量<\/div>/,
  'workload tab should not render the duplicate workload title'
);

assert.match(
  source,
  /function dateMs\(v\)/,
  'coach ops day view needs dateMs so schedule blocks render instead of interrupting the table'
);

assert.match(
  source,
  /if\(coachOpsMode==='week'\)return dtObj\(raw\)\|\|new Date\(\)/,
  'coach ops week view should use a custom start date instead of an ISO week key'
);

assert.match(
  source,
  /if\(kind==='week'\)return \{start, end, label:`\$\{dateKey\(start\)\} 至 \$\{dateKey\(addDays\(end,-1\)\)\}`\};/,
  'coach ops week range should always cover the chosen 7-day span'
);

assert.match(
  source,
  /function openCoachOpsCreateSchedule/,
  'coach ops should expose a grid click entry for creating schedules'
);

assert.match(
  source,
  /function effectiveScheduleStatus/,
  'schedule views should use a shared effective status helper'
);

assert.match(
  source,
  /function scheduleLessonChargeStatus/,
  'schedule views should expose a lesson charge status helper'
);

assert.match(
  source,
  /id="sch_cancelReason"/,
  'schedule modal should capture cancellation reason'
);

assert.doesNotMatch(
  source,
  /id="sch_notifyStatus"/,
  'schedule modal should not expose notification status before notification exists'
);

assert.match(
  source,
  /id="sch_scheduleSource"/,
  'schedule modal should preserve schedule source'
);

assert.match(
  source,
  /私教课/,
  'schedule views should expose 私教课 as a fixed course type'
);

assert.match(
  source,
  /体验课/,
  'schedule views should expose 体验课 as a fixed course type'
);

assert.match(
  source,
  /训练营/,
  'schedule views should expose 训练营 as a fixed course type'
);

assert.match(
  source,
  /大师课/,
  'schedule views should expose 大师课 as a fixed course type'
);

assert.match(
  source,
  /小班课/,
  'schedule views should expose 小班课 from the shared course type source'
);

assert.doesNotMatch(
  source,
  /仅正式课/,
  'schedule filters should not keep the old formal-course option'
);

assert.doesNotMatch(
  source,
  /课程性质/,
  'schedule modal should no longer expose a separate course nature field'
);

assert.doesNotMatch(
  source,
  /id="coachOpsQuickCreateBtn"|去排课表排课/,
  'coach ops should remove the right-side schedule shortcut button'
);

assert.match(
  source,
  /id="coachOpsRangeHost"/,
  'coach ops should render the shared custom dropdown host for view switching'
);

assert.doesNotMatch(
  source,
  /<select class="coach-ops-select" id="coachOpsRange"/,
  'coach ops should not keep the native select for the view switcher'
);

assert.match(
  source,
  /coach-ops-legend/,
  'coach ops toolbar should render a course type legend'
);

assert.match(
  source,
  /function coachOpsScheduleItemText\([\s\S]*slice\(11,16\)[\s\S]*endTime[\s\S]*scheduleStudentSummary/,
  'coach ops week and month cells should show full lesson time ranges'
);

assert.match(
  source,
  /coach-ops-daycell-head[\s\S]*coach-ops-daycell-count/,
  'coach ops week and month cells should keep date left and lesson count right on one row'
);

assert.match(
  source,
  /weekActive=coachOpsMode==='week'&&ds>=selectedKey&&ds<dateKey\(addDays\(selected,7\)\)/,
  'coach ops week picker should highlight the selected 7-day window'
);

assert.match(
  source,
  /function openCoachOpsDaySchedules\([\s\S]*setCourtModalFrame\('当天排课'/,
  'coach ops populated cells should open a full daily schedule list'
);

assert.match(
  source,
  /coach-ops-daycell-list[\s\S]*onclick="event\.stopPropagation\(\);openCoachOpsDaySchedules/,
  'clicking course text should show all schedules while blank cell space still creates a schedule'
);

assert.doesNotMatch(
  source,
  /coachOpsTabRevenue/,
  'coach ops should no longer keep finance reports inside coach tabs'
);

assert.doesNotMatch(
  source,
  /coachOpsTabConsume/,
  'coach ops should no longer keep consume reports inside coach tabs'
);

assert.match(
  source,
  /function renderFinanceRevenueReport\(/,
  'finance center should expose the revenue report renderer'
);

assert.match(
  source,
  /function renderFinanceConsumeReport\(/,
  'finance center should expose the consume report renderer'
);

assert.match(
  source,
  /function financeRecognizedRows\([\s\S]*financeUnifiedRows\(\)/,
  'finance recognized report should reuse the unified finance snapshot'
);

assert.doesNotMatch(
  source,
  /\.coach-ops-toolbar\{[^}]*background:#FCFAF7/s,
  'coach ops toolbar should not render as a filled white block background'
);

assert.doesNotMatch(
  source,
  /class="tms-btn tms-btn-primary" id="coachOpsQuickCreateBtn"/,
  'coach ops should not keep the removed quick create button style'
);

assert.match(
  html,
  /function coachOpsCourseTypeTagClass\(/,
  'coach ops should expose a shared course type color helper'
);

assert.match(
  html,
  /coachOpsCourseTypeLegendHtml\(\)[\s\S]*PRODUCT_TYPES\.map/,
  'coach ops legend should render from the shared course type source'
);

assert.match(
  html,
  /normalized==='小班课'[\s\S]*type-small/,
  'coach ops should color small group lessons as their own course type'
);

assert.doesNotMatch(
  html,
  /coach-ops-legend-dot\.master\{background:#7B6DDF\}/,
  'coach ops master color should avoid the old purple tone'
);

assert.match(
  html,
  /校区.*场地/,
  'coach ops day cards should show campus and venue together'
);

assert.match(
  html,
  /今日上课[\s\S]*本周上课[\s\S]*本月上课[\s\S]*累计上课/,
  'coach ops top cards should show today, week, month, and cumulative lessons'
);

assert.doesNotMatch(
  coachOpsSource,
  /document\.getElementById\('coachOpsStats'\)\.innerHTML=\[[\s\S]*'未反馈'/,
  'coach ops top cards should not keep the unfinished feedback metric'
);

assert.match(
  html,
  /<th style="width:90px">已反馈<\/th>[\s\S]*<th style="width:90px">未反馈<\/th>[\s\S]*<th style="width:150px">校区分布<\/th>[\s\S]*<th style="width:120px">时间段<\/th>/,
  'coach workload table should add 已反馈 before 未反馈 and keep the time/campus columns'
);

assert.match(
  coachOpsSource,
  /function renderCoachOpsWorkloadHeader\(\)/,
  'coach workload header should be refreshed from the script to avoid stale column layouts'
);

assert.doesNotMatch(
  html,
  /<th style="width:120px">风险<\/th>/,
  'coach workload table should drop the risk column'
);

assert.doesNotMatch(
  coachOpsSource,
  /risks:coachRiskCount/,
  'coach workload row data should no longer keep the removed risk column'
);

assert.doesNotMatch(
  coachOpsSource,
  /<span class="badge [^"]*">\$\{r\.(?:feedback|pending)\}<\/span>/,
  'coach workload feedback counts should render as normal numbers instead of badges'
);

assert.match(
  html,
  /class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table">/,
  'coach workload should use the same table shell as the student and schedule lists'
);

assert.match(
  styles,
  /#page-coachops \.tms-table-wrapper\{max-height:calc\(100vh - 250px\);overflow-x:hidden;overflow-y:auto\}/,
  'coach workload table should not rely on horizontal scrolling'
);

assert.match(
  styles,
  /#page-coachops \.tms-table\{width:100%;min-width:0;table-layout:fixed\}/,
  'coach workload table should fit the container instead of forcing a scroll width'
);

assert.match(
  styles,
  /#page-coachops \.tms-text-primary,#page-coachops \.tms-cell-text,#page-coachops \.tms-text-remark\{font-size:12px;line-height:1.4\}/,
  'coach workload rows should use one compact font scale'
);

assert.match(
  styles,
  /#page-coachops \.coach-workload-lessons\{display:flex;align-items:center;gap:6px;color:#2F241E;font-size:12px;font-weight:600\}/,
  'coach workload lesson counts should use the same row font'
);

assert.match(
  styles,
  /#page-coachops \.coach-workload-rate\{font-size:11px;font-weight:600\}/,
  'coach trial conversion percentage should use the requested 11px font'
);

assert.match(
  styles,
  /#page-coachops \.coach-workload-wrap\{white-space:normal;overflow:visible;word-break:break-word;overflow-wrap:anywhere;line-height:1.35\}/,
  'coach workload long text columns should wrap instead of being cut off'
);

assert.match(
  styles,
  /#page-coachops \.coach-workload-course-types\{font-size:12px\}/,
  'coach workload course type distribution should keep the requested 12px font'
);

assert.match(
  styles,
  /#page-coachops \.coach-workload-campus,#page-coachops \.coach-workload-timeband\{font-size:12px;color:#2F241E\}/,
  'coach workload campus and time columns should show the full text in the shared font size'
);

assert.match(
  styles,
  /body\.admin-mobile #page-coachops \.stats-row\{grid-template-columns:repeat\(4,minmax\(120px,1fr\)\)/,
  'coach ops top four stats should stay in one row on mobile admin view'
);

assert.match(
  html,
  /id="sch_date"/,
  'schedule modal should expose a single class date field'
);

assert.match(
  html,
  /id="sch_startTime"/,
  'schedule modal should expose a start time field'
);

assert.match(
  html,
  /id="sch_endTime"/,
  'schedule modal should expose an end time field'
);

assert.doesNotMatch(
  html,
  /上课日期 \*[\s\S]*下课日期 \*/,
  'schedule modal should not keep separate start and end date sections'
);

assert.match(
  html,
  /日期<\/th>[\s\S]*上课时间<\/th>[\s\S]*时长<\/th>[\s\S]*校区\/场地<\/th>[\s\S]*教练<\/th>[\s\S]*学员<\/th>[\s\S]*课程类型<\/th>[\s\S]*反馈<\/th>/,
  'schedule list should use the refreshed column set'
);

assert.match(
  html,
  /function scheduleListStudentSummary\(/,
  'schedule list should expose the multi-student summary helper'
);

assert.match(
  html,
  /function scheduleFeedbackStatusText\(/,
  'schedule list should expose the feedback status text helper'
);

assert.match(
  html,
  /let scheduleLocalMutationAt=0/,
  'schedule refresh should track local schedule mutations'
);

assert.match(
  html,
  /setScheduleRowsFromRemote\(/,
  'remote page-data refreshes should pass schedule rows through a stale-data guard'
);

assert.match(
  html,
  /noteScheduleLocalMutation\(\)/,
  'schedule save should mark local schedule mutations before rendering coach ops'
);

console.log('coach ops view tests passed');
