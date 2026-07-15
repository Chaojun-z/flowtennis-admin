const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source } = require('./helpers/read-index-bundle');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const coachOpsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'state.js'), 'utf8');
const corePagesSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'page-data', 'core-pages.js'), 'utf8');
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
  /coachschedule:\['workbenchPage'\]/,
  'coach schedule calendar should block on the backend unified coach schedule view'
);

assert.match(
  source,
  /coachops:\['workbenchPage','operationsPage'\]/,
  'coach workload should block on backend unified coach schedule view before rendering rows'
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
  /if\(coachOpsMode==='week'\)return weekStart\(dtObj\(raw\)\|\|new Date\(\)\)/,
  'coach ops week view should normalize the selected date to Monday'
);

assert.match(
  source,
  /const start=weekStart\(now\),end=addDays\(start,7\);[\s\S]*if\(kind==='week'\)return \{start, end, label:`\$\{dateKey\(start\)\} 至 \$\{dateKey\(addDays\(end,-1\)\)\}`\};/,
  'coach ops week range should always cover Monday to Sunday'
);

assert.match(
  coachOpsSource,
  /if\(!el\.value\)\{el\.value=coachOpsInputValue\(new Date\(\),coachOpsMode\);el\.dataset\.coachOpsAutoDate='1';\}/,
  'coach schedule default date should be marked as automatic until the user selects a time'
);

assert.match(
  coachOpsSource,
  /const base=coachOpsModeDateForMode\(mode\);/,
  'switching to day view should use today instead of the week start'
);

assert.match(
  coachOpsSource,
  /function resetCoachScheduleToToday\(\)[\s\S]*coachOpsMode='day'[\s\S]*el\.value=coachOpsInputValue\(new Date\(\),'day'\)/,
  'opening coach schedule should default to today in day view'
);

assert.match(
  coachOpsSource,
  /function preserveCoachOpsScrollLeft\(/,
  'coach schedule should preserve the horizontal scroll position during a quiet refresh'
);

assert.match(
  coachOpsSource,
  /function restoreCoachOpsScrollLeft\(/,
  'coach schedule should restore the horizontal scroll position after rerendering'
);

assert.match(
  coachOpsSource,
  /const previousScrollLeft=preserveCoachOpsScrollLeft\(\);[\s\S]*restoreCoachOpsScrollLeft\(previousScrollLeft\);/,
  'coach schedule rerender should keep the user at the place they left'
);

assert.doesNotMatch(
  coachOpsSource,
  /if\(pg==='coachschedule'&&typeof resetCoachScheduleToToday==='function'\)resetCoachScheduleToToday\(\);/,
  'switching back to an already-open coach schedule page should not force today'
);

assert.match(
  coachOpsSource,
  /function scrollCoachOpsDayToNow\(\)[\s\S]*scroll\.scrollTop=Math\.max\(0,nowLineTop-180\)/,
  'coach schedule day view should auto-scroll vertically near the current time'
);

assert.match(
  coachOpsSource,
  /function coachOpsDayTimeLabelTop\(index,totalHours\)[\s\S]*Math\.min\(index\*COACH_OPS_DAY_HOUR_HEIGHT,totalHours\*COACH_OPS_DAY_HOUR_HEIGHT-16\)/,
  'coach schedule day time labels should clamp first and last labels inside the grid'
);

assert.match(
  coachOpsSource,
  /function coachOpsRowDisplayName\(row\)[\s\S]*row\?\.name\|\|row\?\.coach\|\|row\?\.coachName/,
  'coach schedule day headers should derive a visible coach name from every supported row field'
);

assert.match(
  coachOpsSource,
  /const nowHeadHtml=showNowLine\?`<div class="coach-ops-now-head" style="top:\$\{nowLineTop\}px"><i>\$\{String\(nowForGrid\.getHours\(\)\)\.padStart\(2,'0'\)\}:\$\{String\(nowForGrid\.getMinutes\(\)\)\.padStart\(2,'0'\)\}<\/i><b><\/b><\/div>`:'';/,
  'coach schedule current time label should render beside the vertical time axis'
);

assert.doesNotMatch(
  coachOpsSource,
  /<span class="coach-ops-now-head"/,
  'coach schedule current-time marker should not be a span that inherits hour-cell styles'
);

assert.doesNotMatch(
  coachOpsSource,
  /coach-ops-now-line[^`]*<i>/,
  'coach schedule body current time line should not repeat time labels in each coach row'
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

assert.match(
  source,
  /campusTabs'\)\.style\.display=[\s\S]*'coachops'/,
  'coach ops should show the shared top campus filter'
);

assert.match(
  source,
  /if\(currentPage==='coachschedule'\|\|currentPage==='coachops'\)renderCoachOps\(\);/,
  'campus filter changes should refresh coach schedule and workload pages'
);

assert.match(
  source,
  /currentPage==='coachops'[\s\S]*renderCoachOpsTopFilters\(\)/,
  'coach ops should reuse the court-style top campus dropdown'
);

assert.match(
  coachOpsSource,
  /function coachOpsCampusMatchesSchedule\([\s\S]*campus==='all'[\s\S]*sameCampusValue\(s\?\.campus,campus\)/,
  'coach ops campus filter should match schedules by normalized lesson campus'
);

assert.match(
  coachOpsSource,
  /\(coachOpsUnifiedView\?\.rows\|\|\[\]\)/,
  'coach ops rows should read backend unified coach rows'
);

assert.match(
  coachOpsSource,
  /function coachOpsHomeCampusCoachNames\([\s\S]*sameCampusValue\(c\.campus,campus\)/,
  'selected campus should always show active coaches whose normalized home campus matches the selected campus'
);

assert.match(
  coachOpsSource,
  /const summary=coachOpsSummaryForRange\(row,range\);/,
  'selected campus workload metrics should come from backend unified range summaries'
);

assert.match(
  coachOpsSource,
  /row\.rangeRows\.length\|\|coachOpsHomeCampusCoachNames\(\)\.includes\(coachOpsRowDisplayName\(row\)\)/,
  'selected campus coach list should keep home-campus coaches and unified rows with current-range lessons'
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
  coachOpsSource,
  /function coachOpsScheduleStudentTitle\([\s\S]*fromIds\.length>1\)return `\$\{fromIds\[0\]\} 等 \$\{fromIds\.length\} 人`/,
  'coach ops schedule cards should count actual studentIds instead of stale summary text'
);

assert.doesNotMatch(
  coachOpsSource,
  /fromNames=\[[\s\S]*scheduleListStudentSummary\(s\)[\s\S]*s\?\.studentName[\s\S]*const names=\[\.\.\.new Set\(\[\.\.\.fromIds,\.\.\.fromNames\]\)\]/,
  'coach ops schedule cards should not merge summary text into the participant count'
);

assert.match(
  source,
  /coach-ops-daycell-head[\s\S]*coach-ops-daycell-count/,
  'coach ops week and month cells should keep date left and lesson count right on one row'
);

assert.match(
  source,
  /const selectedWeekStart=weekStart\(selected\);[\s\S]*weekActive=coachOpsMode==='week'&&ds>=dateKey\(selectedWeekStart\)&&ds<dateKey\(addDays\(selectedWeekStart,7\)\)/,
  'coach ops week picker should highlight Monday to Sunday'
);

assert.match(
  source,
  /function openCoachOpsDaySchedules\([\s\S]*openStandardModal\(\{title:'当天排课'/,
  'coach ops populated cells should open a full daily schedule list'
);

assert.match(
  source,
  /coach-ops-course-card[\s\S]*onclick="event\.stopPropagation\(\);openScheduleDetail/,
  'clicking a schedule card should open schedule detail while blank cell space still creates a schedule'
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
assert.match(
  html,
  /function productTypeTagClass\([\s\S]*type-trial[\s\S]*type-small[\s\S]*type-partner[\s\S]*type-private/,
  'global course type tags should reuse the coach schedule type color classes'
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

assert.doesNotMatch(
  html,
  /今日上课[\s\S]*本周上课[\s\S]*本月上课[\s\S]*累计上课/,
  'coach ops split pages should remove the old top stats cards'
);

assert.doesNotMatch(
  coachOpsSource,
  /document\.getElementById\('coachOpsStats'\)\.innerHTML=\[[\s\S]*'未反馈'/,
  'coach ops top cards should not keep the unfinished feedback metric'
);

assert.match(
  html,
  /<th style="width:90px">已反馈<\/th>[\s\S]*<th style="width:90px">未反馈<\/th>[\s\S]*<th style="width:180px">校区分布<\/th>[\s\S]*<th style="width:140px">时间段<\/th>/,
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
  /#page-coachops \.tms-table-wrapper\{max-height:none;min-height:calc\(100vh - 220px\);flex:1;overflow-x:hidden;overflow-y:auto\}/,
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
  /#page-coachops \.coach-workload-wrap\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;word-break:normal;overflow-wrap:normal;line-height:1.35\}/,
  'coach workload long text columns should use the current compact truncation style'
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
  /#page-coachschedule \.coach-ops-shell\{height:65px;padding:12px 24px;box-sizing:border-box\}/,
  'coach schedule toolbar should keep the requested 65px height and 12px 24px padding'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-head\{height:38px;border-bottom:1px solid #E5E7EB\}/,
  'coach schedule header row should keep the requested 38px height and divider'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-hours\{[^}]*display:grid[^}]*grid-template-columns:repeat\(var\(--coach-ops-day-coach-count\),160px\)/,
  'coach schedule day view should render coaches as horizontal columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-hours \.coach-ops-day-coach-head\{[^}]*display:flex!important[^}]*justify-content:center[^}]*font-size:10px[^}]*font-weight:400/,
  'coach schedule day coach headers should visibly center coach names'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-hours \.coach-ops-day-coach-head \.coach-ops-drag-handle\{[^}]*width:10px!important[^}]*min-width:10px!important[^}]*max-width:10px!important/,
  'coach schedule day coach header drag handles should not occupy the full coach column'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-time-axis span\{[^}]*font-size:10px[^}]*font-weight:400/,
  'coach schedule day time axis labels should use 10px normal weight'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-corner\{[^}]*font-size:10px[^}]*font-weight:400/,
  'coach schedule day header corner should use 10px normal weight'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-week \.coach-ops-hours,#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours\{grid-template-columns:repeat\(7,160px\)\}/,
  'coach schedule week and month headers should keep 160px columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-head,#page-coachschedule \.coach-ops-row\{grid-template-columns:120px minmax\(1120px,1fr\);min-width:1240px\}/,
  'coach schedule coach column should keep the requested 120px width'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-card-dot\{width:3px;height:8px;border-radius:99px;align-self:center\}/,
  'coach schedule course type marker should keep the requested 3px by 8px size'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-name\{gap:8px;font-weight:400\}/,
  'coach schedule coach name should keep 8px drag-icon spacing and normal weight'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-arrow svg\{width:8px;height:8px\}/,
  'coach schedule date arrows should keep the requested 8px icon size'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-head\{background:#FCF7F3;border-bottom:1px solid #E3DDDC;box-shadow:none\}/,
  'coach schedule header should use the requested warm fill and 1px header divider'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner,#page-coachschedule \.coach-ops-hours,#page-coachschedule \.coach-ops-hours span,#page-coachschedule \.coach-ops-name\{background:#FCF7F3\}/,
  'coach schedule header and coach column should share the requested default fill'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner:hover,#page-coachschedule \.coach-ops-hours span:hover,#page-coachschedule \.coach-ops-name:hover,#page-coachschedule \.coach-ops-row:hover \.coach-ops-name\{background:#F6F1EB\}/,
  'coach schedule header and coach column should use the requested hover fill'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-name,#page-coachschedule \.coach-ops-corner\{border-right:\.5px solid #EDE9E8;box-shadow:\.5px 0 0 #EDE9E8\}/,
  'coach schedule sticky coach column divider should use the requested 0.5px line'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-hours span\{border-right:\.5px solid #EDE9E8\}/,
  'coach schedule header vertical lines should use the requested 0.5px divider'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-course-card,#page-coachschedule \.coach-ops-more-course\{display:flex;align-items:center;gap:8px\}/,
  'coach schedule week and month course markers should align vertically with content'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-time\{opacity:1\}/,
  'coach schedule day card dot should not be faded by the time row opacity'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-card-dot\{background:#4F81FF\}/,
  'coach schedule private day card dot should match the legend blue'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-name,#page-coachschedule \.coach-ops-corner\{box-sizing:border-box;width:120px;padding:0 12px\}/,
  'coach schedule coach column should keep padding inside the fixed 120px column'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-name\{gap:4px\}/,
  'coach schedule drag handle and coach name should use the tightened spacing'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-drag-handle\{width:8px;height:16px;opacity:\.22\}/,
  'coach schedule drag handle should use the smaller requested size'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-daycell\.has-course:hover\{background:#fff\}/,
  'coach schedule filled week and month cells should not use whole-cell hover'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-daycell:not\(\.has-course\):hover\{background:#F6F1EB\}/,
  'coach schedule empty week and month cells should keep whole-cell hover'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-course-card\{min-height:17px;margin-bottom:1px;padding:1px 4px;white-space:nowrap;flex-wrap:nowrap;overflow:hidden\}/,
  'coach schedule week and month course rows should be compact and single-line'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-course-name\{min-width:0;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/,
  'coach schedule long course names should truncate instead of wrapping'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner\{border-bottom:1px solid #E3DDDC\}/,
  'coach schedule header divider should also cover the left coach header cell'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-toolbar-right\{width:320px;height:28px;flex:0 0 320px;align-items:center;justify-content:center;gap:0\}/,
  'coach schedule course legend container should keep the requested 320px by 28px size'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-legend\{width:320px;height:28px;box-sizing:border-box;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:14px;font-size:10px;line-height:1\}/,
  'coach schedule course legend should vertically align dots and labels'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-daycell\{padding:0\}/,
  'coach schedule week and month cells should not shrink the inner content width with cell padding'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-daycell-list\{box-sizing:border-box;width:100%;padding:10px 0 8px;gap:0;line-height:1\.05\}/,
  'coach schedule week and month course list should occupy the full column width'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-course-card\{box-sizing:border-box;width:100%;min-height:16px;margin:0;padding:1px 8px 1px 10px\}/,
  'coach schedule week and month course rows should keep full-width hover without wrapping'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-empty\{position:static;margin:auto;color:#9CA3AF;font-size:10px;font-style:italic;line-height:1\}/,
  'coach schedule day empty text should be 10px italic and centered in the grid cell'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-head\{background:#F9FAFB;border-bottom:1px solid #E3DDDC\}/,
  'coach schedule header should use the requested #F9FAFB fill and #E3DDDC divider'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner,#page-coachschedule \.coach-ops-hours,#page-coachschedule \.coach-ops-hours span,#page-coachschedule \.coach-ops-name\{background:#F9FAFB\}/,
  'coach schedule time header and coach column should use #F9FAFB'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-daycell:not\(\.has-course\):hover\{background:#F9FAFB\}/,
  'coach schedule empty cell hover should use #F9FAFB'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-course-card:hover,#page-coachschedule \.coach-ops-more-course:hover\{background:#F3F4F6\}/,
  'coach schedule week and month course row hover should use #F3F4F6'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-shell\{border-bottom:1px solid #E3DDDC\}/,
  'coach schedule filter and grid divider should use 1px #E3DDDC'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-week \.coach-ops-hours,#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours,#page-coachschedule \.coach-ops-week,#page-coachschedule \.coach-ops-month\{display:grid;width:1120px;min-width:1120px;max-width:1120px;grid-template-columns:repeat\(7,160px\);gap:0;padding:0;border:0\}/,
  'coach schedule week and month header/content grids should share one exact 1120px layout'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-week \.coach-ops-hours span,#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours span,#page-coachschedule \.coach-ops-daycell\{width:160px;min-width:160px;max-width:160px;box-sizing:border-box\}/,
  'coach schedule week and month header/content cells should share exact 160px columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-empty\{position:absolute;left:0;top:0;bottom:0;width:120px;margin:0;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:10px;font-style:italic;line-height:1\}/,
  'coach schedule day empty text should sit centered in the first 7-8 time cell'
);

assert.match(
  coachOpsSource,
  /coach-ops-skeleton-row/,
  'coach schedule should render skeleton rows while schedule rows are unavailable'
);

assert.match(
  coachOpsSource,
  /const renderRows=rows;/,
  'coach schedule should not keep showing skeleton rows after a campus filter has no coach rows'
);

assert.match(
  coachOpsSource,
  /const emptyText=campus==='all'\?'当前日期暂无教练排课':'当前筛选无教练排课';[\s\S]*coach-ops-empty-state/,
  'coach schedule should show a clear empty state when the selected campus has no coach schedules'
);

assert.match(
  coachOpsSource,
  /gridCard\.classList\.toggle\('is-compact',rows\.length>0&&rows\.length<=3\)/,
  'coach schedule should compact the grid height when only up to three coaches are visible'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\{height:calc\(100vh \+ 88px\);overflow:visible\}/,
  'coach schedule grid should be 200px taller than the previous viewport height'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.is-compact\{height:auto\}/,
  'coach schedule grid should shrink to content for small campus-filtered coach lists'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-date-pop\{z-index:220\}/,
  'coach schedule date picker should stay above the sticky header'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner,#page-coachschedule \.coach-ops-hours span\{font-size:13px\}/,
  'coach schedule header labels should use the requested 13px font'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-toolbar-right\{width:290px;height:28px;flex:0 0 290px\}/,
  'coach schedule legend container should use the requested 290px width'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-drag-handle\{width:10px;height:20px\}/,
  'coach schedule drag handle should be slightly larger'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-block,#page-coachschedule \.coach-ops-block \*,#page-coachschedule \.coach-ops-course-card,#page-coachschedule \.coach-ops-course-card \*,#page-coachschedule \.coach-ops-more-course,#page-coachschedule \.coach-ops-more-course \*\{font-size:10px\}/,
  'coach schedule lesson information should use the requested 10px font'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-block\{min-width:112px;box-sizing:border-box\}/,
  'coach schedule short day cards should keep a readable minimum width'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-time,#page-coachschedule \.coach-ops-student,#page-coachschedule \.coach-ops-location\{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/,
  'coach schedule short day card text should not wrap into vertical text'
);

assert.match(
  html,
  /id="coachOpsTimeline" class="is-skeleton"[\s\S]*coach-ops-day-board[\s\S]*coach-ops-day-time-axis[\s\S]*coach-ops-day-coach-grid/,
  'coach schedule should show the day-view skeleton before the first script render'
);

assert.match(
  styles,
  /#page-coachschedule #coachOpsTimeline\.is-skeleton\{display:block;min-height:calc\(100vh - 215px\);background:#fff\}/,
  'coach schedule day-view skeleton should not use the old row flex layout'
);

assert.match(
  html,
  /<div class="coach-ops-grid-card[^"]*is-loading[^"]*mode-day[^"]*"[^>]*>/,
  'coach schedule should start in a full loading state before data renders'
);

assert.match(
  html,
  /<div class="coach-ops-corner">时间<\/div>/,
  'coach schedule loading header should show the day-view time axis label before data renders'
);

assert.match(
  coachOpsSource,
  /function coachOpsSkeletonRows\(count=8\)/,
  'coach schedule skeleton should render enough rows to fill the grid'
);

assert.match(
  coachOpsSource,
  /coach-ops-now-line/,
  'coach schedule day view should render a current-time line when viewing today'
);

assert.match(
  coachOpsSource,
  /ds===todayKey\?'is-today'/,
  'coach schedule week and month cells should mark today'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-shell\{background:#FFFCF9;position:relative;z-index:80;overflow:visible\}/,
  'coach schedule toolbar band should use #FFFCF9'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\{height:calc\(100vh - 112px\);overflow:hidden;background:#fff;border-radius:16px\}/,
  'coach schedule grid should keep scrolling inside the card instead of the whole page'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.is-compact\{height:auto;overflow:hidden\}/,
  'coach schedule compact campus view should shrink to the visible coaches'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-head\{position:sticky;top:0;z-index:60;background:#FCF7F3;border-bottom:1px solid #E3DDDC\}/,
  'coach schedule table header should stay fixed in the internal scroll area'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner,#page-coachschedule \.coach-ops-hours,#page-coachschedule \.coach-ops-hours span,#page-coachschedule \.coach-ops-name\{background:#FCF7F3\}/,
  'coach schedule header and coach column should use #FCF7F3'
);

assert.match(
  styles,
  /#page-coachschedule #coachOpsTimeline\.is-skeleton\{display:block;min-height:calc\(100vh - 215px\);background:#fff\}/,
  'coach schedule skeleton should fill the visible grid area'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-hours span\.is-today\{position:relative;background:#FFF4E6!important;color:#B45309;font-weight:600\}/,
  'coach schedule today header should be visually highlighted'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-hours span\.is-today::after\{display:none\}/,
  'coach schedule today header should not add an orange dot'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-daycell\.is-today,#page-coachschedule \.coach-ops-daycell\.is-today\.has-course\{background:#fff;box-shadow:none\}/,
  'coach schedule today state should not highlight the whole column'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-name\{border-bottom:1px solid #EDE9E8\}/,
  'coach schedule coach column row divider should stay visible'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-more-popover\.is-edge-right\{left:auto;right:8px;transform:none\}/,
  'coach schedule more popover should avoid clipping on the right edge'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.is-loading \.coach-ops-toolbar-main>\*,#page-coachschedule \.coach-ops-grid-card\.is-loading \.coach-ops-toolbar-right>\*\{visibility:hidden\}/,
  'coach schedule loading state should hide real toolbar controls'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-board \.coach-ops-now-line\{position:absolute;left:72px;right:0;bottom:auto;width:auto;height:0;border-top:1px solid rgba\(242,72,34,\.75\);border-left:0;z-index:30;pointer-events:none\}/,
  'coach schedule current-time body line should start after the time axis and stay above the day grid'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-hours span\{position:relative;z-index:2\}/,
  'coach schedule hour labels should stay above the current-time marker'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-board \.coach-ops-now-head i\{position:absolute;top:-8px;left:8px;transform:none;height:16px;padding:0 6px;border-radius:999px;background:rgba\(242,72,34,\.95\)/,
  'coach schedule current-time label should sit beside the horizontal red line'
);

assert.doesNotMatch(
  styles,
  /body\.admin-mobile #page-coachops \.stats-row\{grid-template-columns:repeat\(4,minmax\(120px,1fr\)\)/,
  'coach ops split pages should not keep mobile styles for removed stats cards'
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
  /\{key:'schedule'[\s\S]*filterHostIds:\['schCourseTypeFilterHost','schCoachFilterHost','schProposalFilterHost','schFeedbackFilterHost','schStatusFilterHost'\][\s\S]*columns:\[\{label:'日期'[\s\S]*\{label:'上课时间'[\s\S]*\{label:'时长'[\s\S]*\{label:'校区\/场地'[\s\S]*\{label:'教练'[\s\S]*\{label:'学员'[\s\S]*\{label:'课程类型'[\s\S]*\{label:'课前教案'[\s\S]*\{label:'课后反馈'[\s\S]*\{label:'重复\?'/,
  'schedule list should use the refreshed column set'
);
assert.match(html, /\{label:'课程类型',style:'width:100px'\}/, 'schedule course type column should use the compact 100px width');

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

assert.match(
  corePagesSource,
  /coaches:scoped\.coaches\|\|\[\]/,
  'workbench page-data should return the current coach list used by schedule coach pickers'
);

assert.match(
  stateSource,
  /if\(name==='workbenchPage'\)\{[\s\S]*setDatasetValue\('coaches',data\.coaches\|\|\[\]\)/,
  'loading the coach schedule workbench should hydrate the global coach list'
);

assert.match(
  coachOpsSource,
  /function coachOpsStartTimeFromLineClick\(e\)[\s\S]*const hourIndex=Math\.floor\(y\/cellHeight\)[\s\S]*const minute=hour>=endHour\?0:\(y%cellHeight>=cellHeight\/2\?30:0\)/,
  'coach schedule day clicks should map vertical hour cells into first-half and second-half start times'
);

assert.match(
  coachOpsSource,
  /openCoachOpsCreateSchedule\(coach,date,coachOpsStartTimeFromLineClick\(e\)\)/,
  'coach schedule line clicks should create from the fixed cell-based time helper'
);

assert.match(
  coachOpsSource,
  /scheduleCoachLocked:true/,
  'creating a schedule from a coach row should lock that coach as the user intent'
);

assert.match(
  coachOpsSource,
  /function syncCoachOpsUnifiedOrder\(order\)[\s\S]*coachOpsUnifiedView=\{[\s\S]*rows:\(coachOpsUnifiedView\?\.rows\|\|\[\]\)\.map/,
  'coach drag sorting should update the current unified coach schedule rows before rerendering'
);

assert.match(
  coachOpsSource,
  /saveCoachOpsStoredOrder\(order\);[\s\S]*syncCoachOpsUnifiedOrder\(order\);[\s\S]*renderCoachOps\(\);/,
  'coach drag sorting should rerender from the updated in-memory unified order'
);

console.log('coach ops view tests passed');
