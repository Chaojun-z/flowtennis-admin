const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html: indexHtml, appSource: source } = require('./helpers/read-index-bundle');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const coachOpsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'state.js'), 'utf8');
const corePagesSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'page-data', 'core-pages.js'), 'utf8');
const html = source;
assert.match(
  coachOpsSource,
  /hourHost\.classList\.toggle\('week',mode==='week'\);/,
  'coach schedule month view should not inherit the week header class'
);

assert.doesNotMatch(
  coachOpsSource,
  /hourHost\.classList\.toggle\('week',mode==='week'\|\|mode==='month'\)/,
  'coach schedule month view must stay isolated from week view styling'
);

assert.match(
  indexHtml,
  /pages\.css\?v=20260727-coach-month-calendar-v2/,
  'coach schedule month calendar CSS version should force a fresh browser load'
);

assert.match(
  indexHtml,
  /coachops\.js\?v=20260727-coach-month-calendar-v2/,
  'coach schedule month calendar JS version should force a fresh browser load'
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
  /function coachOpsHorizontalScrollContainer\(\)[\s\S]*querySelector\('#page-coachschedule \.coach-ops-scroll'\)/,
  'coach schedule should use the calendar grid scroller for horizontal movement'
);

assert.match(
  coachOpsSource,
  /function preserveCoachOpsScrollLeft\(\)[\s\S]*const scroll=coachOpsHorizontalScrollContainer\(\);[\s\S]*return scroll\?scroll\.scrollLeft:null;/,
  'coach schedule should preserve horizontal scroll from the calendar grid, not the page'
);

assert.match(
  coachOpsSource,
  /function restoreCoachOpsScrollLeft\(value\)[\s\S]*const scroll=coachOpsHorizontalScrollContainer\(\);[\s\S]*if\(scroll\)scroll\.scrollLeft=value;/,
  'coach schedule should restore horizontal scroll back to the calendar grid'
);

assert.match(
  coachOpsSource,
  /function syncCoachOpsHeaderScroll\(\)[\s\S]*hours\.style\.transform=`translateX\(\$\{-left\}px\)`;/,
  'coach schedule should sync the detached header with the body horizontal scroll'
);

assert.match(
  coachOpsSource,
  /function bindCoachOpsHeaderScroll\(\)[\s\S]*scroll\.addEventListener\('scroll',syncCoachOpsHeaderScroll,\{passive:true\}\)/,
  'coach schedule should bind the body scroller to the detached header'
);

assert.match(
  coachOpsSource,
  /restoreCoachOpsScrollLeft\(previousScrollLeft\);[\s\S]*bindCoachOpsHeaderScroll\(\);/,
  'coach schedule should re-sync header position after every render'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\{height:auto;min-height:calc\(100vh - var\(--topH\) - 22px\);overflow:visible;background:transparent;border:0;border-radius:16px 16px 0 0\}/,
  'coach schedule desktop calendar should grow with its content instead of using a fixed-height frame'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-scroll\{position:relative;z-index:0;overflow-x:auto;overflow-y:visible;flex:0 0 auto;min-height:0;max-width:100%;background:#fff\}/,
  'coach schedule desktop calendar should own horizontal clipping below the sticky header without fixed vertical scrolling'
);

assert.match(
  source,
  /document\.body\.classList\.toggle\('is-coachschedule-page',pg==='coachschedule'\)/,
  'coach schedule page should mark the body so the page cannot create a global horizontal scrollbar'
);

assert.match(
  styles,
  /body\.is-coachschedule-page \.content\{overflow-x:hidden;padding-top:0;padding-bottom:0\}/,
  'coach schedule page should attach the sticky calendar header below the topbar and let the white canvas reach the bottom'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\{width:100%;max-width:100%;box-sizing:border-box;display:flex;flex-direction:column;position:relative;isolation:isolate\}/,
  'coach schedule white canvas should stay inside the page width while growing vertically'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-scroll\{width:100%;box-sizing:border-box;overscroll-behavior-x:contain;scrollbar-width:none;-ms-overflow-style:none\}/,
  'coach schedule should keep horizontal movement inside the calendar and hide the native bottom bar'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-scroll::-webkit-scrollbar\{display:none\}/,
  'coach schedule should hide the webkit horizontal scrollbar'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner\{z-index:115\}/,
  'coach schedule top-left corner should stay above the detached header scroll track'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-time-axis\{position:sticky;left:0;z-index:65;[^}]*border-right:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\);box-shadow:none\}/,
  'coach schedule day time axis should stay locked with the shared 0.5px line'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-time-axis\{position:sticky;left:0;z-index:65;[^}]*border-right:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\);box-shadow:none\}/,
  'coach schedule week time axis should stay locked with the shared 0.5px line'
);

assert.match(
  coachOpsSource,
  /function coachOpsPageScrollContainer\([\s\S]*querySelector\('\.content'\)/,
  'coach schedule should use the page content scroller for vertical movement'
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
  /function scrollCoachOpsDayToNow\(\)[\s\S]*const scroll=coachOpsPageScrollContainer\(\);[\s\S]*coachOpsScrollTopForElement\(scroll,board,nowLineTop-180\)/,
  'coach schedule day view should auto-scroll the page near the current time'
);

assert.match(
  coachOpsSource,
  /function scrollCoachOpsStickyHeaderHeight\(\)|function coachOpsStickyHeaderHeight\(\)/,
  'coach schedule should measure the real sticky header height before auto-scrolling'
);

assert.match(
  coachOpsSource,
  /function positionCoachOpsPicker\(\)[\s\S]*pop\.parentElement!==document\.body[\s\S]*document\.body\.appendChild\(pop\)[\s\S]*getBoundingClientRect\(\)[\s\S]*pop\.style\.left[\s\S]*pop\.style\.top/,
  'coach schedule date picker should be portaled to body and positioned from the trigger button'
);

assert.match(
  coachOpsSource,
  /function resetCoachOpsPageScrollTop\(\)[\s\S]*const scroll=coachOpsPageScrollContainer\(\);[\s\S]*scroll\.scrollTop=0/,
  'coach schedule should be able to reset inherited page scroll before showing month view'
);

assert.match(
  coachOpsSource,
  /function scrollCoachOpsWeekToNow\(\)[\s\S]*todayKey<dateKey\(range\.start\)\|\|todayKey>=dateKey\(range\.end\)[\s\S]*coachOpsScrollTopForElement\(scroll,todaySection,-coachOpsStickyHeaderHeight\(\)\)/,
  'coach schedule week view should auto-scroll today below the sticky header'
);

assert.match(
  coachOpsSource,
  /coachOpsAutoScrollWeekView=coachOpsMode==='week'/,
  'switching into week view should request the current-time auto-scroll'
);

assert.match(
  coachOpsSource,
  /coachOpsAutoScrollMonthView=coachOpsMode==='month'/,
  'switching into month view should request a clean top-aligned page position'
);

assert.match(
  coachOpsSource,
  /if\(mode==='month'&&coachOpsAutoScrollMonthView\)\{[\s\S]*requestAnimationFrame\(resetCoachOpsPageScrollTop\);[\s\S]*coachOpsAutoScrollMonthView=false;/,
  'coach schedule month view should not inherit week or day vertical scroll'
);

assert.match(
  coachOpsSource,
  /const COACH_OPS_DAY_HOUR_HEIGHT=56;/,
  'coach schedule day view should use a denser 56px hour height'
);

assert.match(
  coachOpsSource,
  /const COACH_OPS_DAY_COACH_WIDTH=128;/,
  'coach schedule day view should use a narrower 128px coach column'
);

assert.match(
  coachOpsSource,
  /const COACH_OPS_WEEK_HOUR_HEIGHT=40,COACH_OPS_TIME_BUFFER_MIN=30;/,
  'coach schedule day and week timelines should reserve a 30-minute blank row before 07:00 and after 22:00'
);

assert.match(
  coachOpsSource,
  /function coachOpsDayTimeLabelTop\(index,totalHours\)[\s\S]*COACH_OPS_TIME_BUFFER_MIN\/60\*COACH_OPS_DAY_HOUR_HEIGHT\+index\*COACH_OPS_DAY_HOUR_HEIGHT\/2/,
  'coach schedule day time labels should start after the blank top buffer'
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
  /<button type="button" class="coach-ops-daycell-count" onclick="openCoachOpsMorePopover\(this,'','\$\{ds\}',event\)">\$\{lessonCount\}节<\/button>/,
  'coach ops month lesson count should open the full daily schedule list'
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
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-hours\{[^}]*display:grid[^}]*grid-template-columns:repeat\(var\(--coach-ops-day-coach-count\),128px\)/,
  'coach schedule day view should render narrower coaches as horizontal columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-hours \.coach-ops-day-coach-head\{[^}]*display:flex!important[^}]*justify-content:center[^}]*font-size:10px[^}]*font-weight:400/,
  'coach schedule day coach headers should use 10px normal weight'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-hours \.coach-ops-day-coach-head,#page-coachschedule \.coach-ops-grid-card\.mode-week \.coach-ops-hours \.coach-ops-week-coach-head\{justify-content:flex-start!important;text-align:left\}/,
  'coach schedule day and week coach headers should be left aligned'
);

assert.match(
  coachOpsSource,
  /return `<span class="\$\{mode==='day'\?'coach-ops-day-coach-head':'coach-ops-week-coach-head'\}" \$\{dragAttrs\}><b>\$\{esc\(name\|\|'未命名教练'\)\}<\/b><\/span>`;/,
  'coach schedule day and week coach headers should keep drag behavior without rendering a drag icon'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-time-axis span\{[^}]*font-size:10px[^}]*font-weight:400/,
  'coach schedule day time axis labels should use 10px normal weight'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-time-axis span\{[^}]*transform:translateY\(-8px\)/,
  'coach schedule day time axis labels should be centered on their timeline ticks'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-corner\{[^}]*font-size:10px[^}]*font-weight:400/,
  'coach schedule day header corner should use 10px normal weight'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-coach-grid\{[^}]*grid-template-columns:repeat\(var\(--coach-ops-day-coach-count\),128px\)[^}]*transparent 28px/,
  'coach schedule day grid should use half-hour rows and narrower coach columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-day \.coach-ops-day-coach-col:hover\{background:transparent!important\}/,
  'coach schedule empty day columns should not show a full-column hover state'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-create-preview\{position:absolute;left:6px;right:6px;border:1px solid rgba\(76,125,224,\.52\)/,
  'coach schedule day creation should show a temporary selected time range'
);

assert.match(
  coachOpsSource,
  /const bufferH=COACH_OPS_TIME_BUFFER_MIN\/60\*COACH_OPS_WEEK_HOUR_HEIGHT,dayHeight=opsTotalMin\/60\*COACH_OPS_WEEK_HOUR_HEIGHT\+bufferH\*2;/,
  'coach schedule week view should use a compact vertical time scale'
);

assert.match(
  coachOpsSource,
  /function renderCoachOpsWeekTimeline\([\s\S]*weekDays=Array\.from\(\{length:7\}[\s\S]*coach-ops-week-day[\s\S]*coach-ops-week-time-axis[\s\S]*coach-ops-week-coach-grid/,
  'coach schedule week view should stack 7 days vertically with a time axis inside each day'
);

assert.match(
  coachOpsSource,
  /coach-ops-week-day-label-fixed[\s\S]*coach-ops-week-day-label-track/,
  'coach schedule week date labels should split the frozen left label from the horizontal track'
);

assert.match(
  coachOpsSource,
  /ds===todayKey\?nowLineHtml:''/,
  'coach schedule week view should render the current-time red line only in today section'
);

assert.match(
  coachOpsSource,
  /coach-ops-week-now-line/,
  'coach schedule week view should render a current-time red line'
);

assert.match(
  coachOpsSource,
  /coach-ops-week-block[\s\S]*coach-ops-student-name[\s\S]*coach-ops-duration-badge[\s\S]*coach-ops-location/,
  'coach schedule week cards should show student, duration and location instead of repeating the time'
);

assert.match(
  coachOpsSource,
  /hourHost\.innerHTML=mode==='day'\|\|mode==='week'[\s\S]*coach-ops-week-coach-head/,
  'coach schedule week header should use coach names on the horizontal axis'
);

assert.match(
  coachOpsSource,
  /mode==='day'\?'时间':mode==='week'\?'日期\/时间':'日期'/,
  'coach schedule month corner should label the left axis as date'
);

assert.match(
  coachOpsSource,
  /const COACH_OPS_MONTH_VISIBLE_COACHES=5;/,
  'coach schedule month view should show five coach summaries before more'
);

assert.match(
  coachOpsSource,
  /function renderCoachOpsMonthOverview\([\s\S]*summaries\.slice\(0,COACH_OPS_MONTH_VISIBLE_COACHES\)[\s\S]*\+\$\{hiddenCount\} 更多/,
  'coach schedule month view should summarize dates by coach and then show more'
);

assert.match(
  coachOpsSource,
  /function openCoachOpsMonthCreate\(ds,event\)[\s\S]*openCoachOpsCreateSchedule\('',ds,'09:00','10:00'\)/,
  'clicking blank space in a month date should create a schedule with the selected date and default time'
);

assert.doesNotMatch(
  coachOpsSource,
  /openCoachOpsMonthCoachDay|openCoachOpsMonthDay/,
  'month coach and date interactions should not jump to the day view'
);

assert.match(
  coachOpsSource,
  /class="coach-ops-month-coach-row" onclick="event\.stopPropagation\(\)"/,
  'clicking a month coach summary should not create or navigate'
);

assert.match(
  coachOpsSource,
  /function coachOpsMonthPopoverCourseHtml\(s,clickable\)[\s\S]*class="coach-ops-course-location">\$\{esc\(scheduleLocationText\(s\)\)\}/,
  'month popover course rows should include location information'
);

assert.match(
  coachOpsSource,
  /function openCoachOpsMorePopover\(el,coach,date,event\)[\s\S]*rows\.map\(s=>coachOpsMonthPopoverCourseHtml\(s,true\)\)/,
  'month more popover should reuse the shared course row with location and type color'
);

assert.match(
  coachOpsSource,
  /function coachOpsMonthCoachPreviewHtml\(item,date\)[\s\S]*rows\.map\(s=>coachOpsMonthPopoverCourseHtml\(s,false\)\)/,
  'month coach hover preview should reuse the shared course row style'
);

assert.match(
  coachOpsSource,
  /const titleName=\/教练\$\/\.test\(String\(item\.name\|\|''\)\)\?String\(item\.name\|\|''\):`\$\{String\(item\.name\|\|''\)\}教练`;/,
  'month coach hover preview title should clearly show the coach name'
);

assert.match(
  coachOpsSource,
  /function coachOpsMonthPreviewDateTitle\(date\)[\s\S]*return `\$\{String\(d\.getMonth\(\)\+1\)\.padStart\(2,'0'\)\}\/\$\{String\(d\.getDate\(\)\)\.padStart\(2,'0'\)\} \$\{weekday\}`;/,
  'month coach hover preview title should include MM/DD and weekday'
);

assert.match(
  coachOpsSource,
  /function coachOpsMonthCoachPreviewHtml\(item,date\)[\s\S]*\$\{esc\(coachOpsMonthPreviewDateTitle\(date\)\)\} · \$\{esc\(titleName\)\}/,
  'month coach hover preview title should render date weekday and coach name'
);

assert.match(
  coachOpsSource,
  /function coachOpsMonthDateText\(d,range,prev\)[\s\S]*monthChanged=!prev\|\|prev\.getMonth\(\)!==d\.getMonth\(\)\|\|prev\.getFullYear\(\)!==d\.getFullYear\(\)[\s\S]*return d\.getDate\(\)===1\|\|\(!sameMonth&&monthChanged\)\?`\$\{d\.getMonth\(\)\+1\}月\$\{d\.getDate\(\)\}日`:String\(d\.getDate\(\)\);/,
  'month date labels should show month text only for the first visible day of each month'
);

assert.match(
  coachOpsSource,
  /function coachOpsScheduleDateLabel\(\)[\s\S]*dateKey\(d\)===todayKey\?'今天':coachOpsWeekdayText\(d\)/,
  'coach schedule day title should show 今天 only for today and weekday for other dates'
);

assert.match(
  coachOpsSource,
  /\['day','日'\],[\s\S]*\['week','周'\],[\s\S]*\['month','月'\]/,
  'coach schedule view switch should use short 日 周 月 labels'
);

assert.match(
  coachOpsSource,
  /function openCoachOpsMorePopover\(el,coach,date,event\)[\s\S]*\(!coachKey\|\|coachName\(s\.coach\)===coachKey\)/,
  'month more popover should support all coaches for the selected date'
);

assert.match(
  coachOpsSource,
  /else if\(mode==='month'\)\{\s*host\.innerHTML=renderCoachOpsMonthOverview\(renderRows,range,todayKey\);/,
  'coach schedule month view should use the date overview renderer'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-week \.coach-ops-hours\{display:grid;grid-template-columns:repeat\(var\(--coach-ops-day-coach-count\),128px\)/,
  'coach schedule week header should render coaches as horizontal columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-experiment\{width:calc\(72px \+ var\(--coach-ops-week-grid-width\)\);min-width:calc\(72px \+ var\(--coach-ops-week-grid-width\)\);background:#fff\}/,
  'coach schedule week experiment should size from coach count instead of seven day columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-coach-grid\{[^}]*grid-template-columns:repeat\(var\(--coach-ops-day-coach-count\),128px\)[^}]*transparent 40px/,
  'coach schedule week day grids should use coach columns and 40px hour rows'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-now-line\{position:absolute;left:72px;right:0;bottom:auto;width:auto;height:0;border-top:1px solid rgba\(242,72,34,\.75\);z-index:30;pointer-events:none\}/,
  'coach schedule week current-time line should start after the time axis'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-time-axis span\{[^}]*transform:translateY\(-8px\)/,
  'coach schedule week time axis labels should be centered on their timeline ticks'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-now-head i\{position:absolute;top:-8px;left:8px;height:16px;padding:0;background:transparent;color:#F24822;font-size:10px;font-weight:400/,
  'coach schedule week current-time label should render as red text on the time axis'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-block \.coach-ops-student\{display:flex;align-items:center;gap:6px;padding-left:0/,
  'coach schedule week card student row should replace the old time row'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours span\{height:34px;border:0!important;color:#2F241E;font-size:10px;font-weight:400;line-height:1;text-align:left;padding-left:12px;display:flex;align-items:center;justify-content:flex-start\}/,
  'coach schedule month weekday labels should be 10px normal weight and left aligned'
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
  /#page-coachschedule \.coach-ops-toolbar-right\{display:flex;align-items:center;justify-content:flex-end;width:auto;height:40px;flex:0 0 auto;gap:12px\}/,
  'coach schedule view switch should sit on the right side of the toolbar'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-legend\{display:flex;width:auto;height:28px;box-sizing:border-box;padding:0;align-items:center;justify-content:flex-end;gap:8px;border:0;background:transparent;box-shadow:none;color:#2F241E;font-size:9px;font-weight:400;line-height:1;white-space:nowrap\}/,
  'coach schedule toolbar should show a lightweight 9px legend before the view switch'
);

assert.match(
  html,
  /<div class="coach-ops-legend" id="coachOpsLegend"><\/div>\s*<div id="coachOpsRangeHost"><\/div>/,
  'coach schedule legend should render to the left of the day week month switch'
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
  /#page-coachschedule \.coach-ops-more-popover\{width:max-content;min-width:220px;max-width:520px;/,
  'coach schedule month more popover should adapt to content width'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-course-location\{flex:0 0 auto;min-width:auto;white-space:nowrap;overflow:visible;text-overflow:clip;color:#6B7280\}/,
  'coach schedule month popover location should remain fully visible'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-shell\{height:56px;padding:12px 18px 8px;border:0;box-sizing:border-box\}/,
  'coach schedule toolbar should use a compact clean calendar header'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours\{display:grid;width:100%;min-width:0;max-width:none;grid-template-columns:repeat\(7,minmax\(0,1fr\)\);will-change:transform\}/,
  'coach schedule month header should use seven fluid weekday columns'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-head\{grid-template-columns:minmax\(0,1fr\);min-width:0;gap:0;background:#fff\}/,
  'coach schedule month header should be a detached full-width weekday layer without a blank left axis'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-corner\{display:none!important\}/,
  'coach schedule month corner should be hidden with no left axis'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-overview\{display:block;width:100%;min-width:0;max-width:none;padding:0 24px;box-sizing:border-box\}/,
  'coach schedule month overview should fill the available calendar width with side breathing room'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-overview-grid\{display:grid;width:100%;min-width:0;max-width:none;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)\}/,
  'coach schedule month overview should render seven fluid columns that fit one screen'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-overview-grid\.weeks-5,#page-coachschedule \.coach-ops-month-overview-grid\.weeks-6\{grid-auto-rows:minmax\(150px,auto\);border-left:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\);border-top:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\)\}/,
  'coach schedule month overview should render a calendar grid frame'
);

assert.match(
  coachOpsSource,
  /coach-ops-month-overview-grid weeks-\$\{Math\.ceil\(days\.length\/7\)\}/,
  'coach schedule month overview should mark the actual number of calendar weeks'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-overview \.coach-ops-daycell,#page-coachschedule \.coach-ops-month-overview \.coach-ops-daycell\.month-cell\{width:auto;min-width:0;max-width:none;height:auto;min-height:150px;border:0;border-right:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\);border-bottom:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\);background:#fff;box-shadow:none;overflow:visible;padding:0\}/,
  'coach schedule month date cells should keep calendar-style vertical and horizontal grid lines'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-coach-row:hover\{background:#F7F8FA\}/,
  'coach schedule month hover should apply only to coach summary rows'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-coach-row:hover \.coach-ops-month-preview\{display:block\}/,
  'coach schedule month coach row hover should show the daily preview'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-preview\{display:none;position:absolute;left:8px;top:20px;z-index:70;width:max-content;min-width:220px;max-width:520px;/,
  'coach schedule month coach preview should adapt to content width'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-month-overview \.coach-ops-daycell\.is-today \.coach-ops-daycell-head strong\{min-width:20px;padding:0 5px;border-radius:999px;background:var\(--coach-ops-theme\);color:#fff;font-size:13px;font-weight:500\}/,
  'coach schedule month today should render the date as a theme-color circle'
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
  /#page-coachschedule\.active\{display:flex;flex-direction:column;width:100%;max-width:100%;min-height:calc\(100vh - var\(--topH\) - 22px\);overflow:visible\}/,
  'coach schedule white canvas should extend to the bottom of the visible page area'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\{height:auto;min-height:calc\(100vh - var\(--topH\) - 22px\);overflow:visible;background:transparent;border:0;border-radius:16px 16px 0 0\}/,
  'coach schedule grid should be a bottomless white canvas instead of a fixed-height frame'
);

assert.match(
  styles,
  /\.coach-date-pop\{display:none;position:fixed;top:auto;left:auto;width:292px;[^}]*z-index:320/,
  'coach schedule date picker should render as a fixed floating layer outside the rounded sticky clipping'
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
  /#page-coachschedule \.coach-ops-day-board \.coach-ops-block\{[^}]*left:9px[^}]*border:1px solid #D4E2FF[^}]*padding:7px 8px 7px 10px/,
  'coach schedule day cards should keep a complete left edge and the original single-marker style'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-board \.coach-ops-block\.type-small,#page-coachschedule \.coach-ops-day-board \.coach-ops-block\.type-camp\{background:#F0FDF4;border-color:#D1FAE5;color:#047857\}/,
  'coach schedule small-group day cards should use the green legend color'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-time,#page-coachschedule \.coach-ops-student,#page-coachschedule \.coach-ops-location\{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/,
  'coach schedule short day card text should not wrap into vertical text'
);

assert.match(
  html,
  /id="coachOpsTimeline" class="is-skeleton"[\s\S]*coach-ops-day-loading-panel/,
  'coach schedule should show one large loading panel before the first script render'
);

assert.match(
  styles,
  /#page-coachschedule #coachOpsTimeline\.is-skeleton\{display:flex;min-height:calc\(100vh - 215px\);background:#fff;padding:24px;box-sizing:border-box\}/,
  'coach schedule day-view skeleton should use one large loading panel'
);

assert.match(
  html,
  /<div class="coach-ops-grid-card[^"]*is-loading[^"]*mode-day[^"]*"[^>]*>/,
  'coach schedule should start in a full loading state before data renders'
);

assert.match(
  html,
  /<div class="coach-ops-sticky-head">\s*<div class="coach-ops-sticky-surface">\s*<div class="coach-ops-sticky-bg"><\/div>[\s\S]*<div class="coach-ops-head"><div class="coach-ops-corner"><\/div><div class="coach-ops-hours" id="coachOpsHours"><\/div><\/div>\s*<\/div>\s*<\/div>\s*<div class="coach-ops-scroll">/,
  'coach schedule toolbar and header should share one sticky header with an inner rounded surface'
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
  /#page-coachschedule \.coach-ops-sticky-head\{position:sticky;top:0;z-index:260;background:var\(--shell-app-bg\);overflow:visible;isolation:isolate\}/,
  'coach schedule sticky header should paint the page background outside rounded corners'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-sticky-surface,#page-coachschedule \.coach-ops-sticky-bg,#page-coachschedule \.coach-ops-shell,#page-coachschedule \.coach-ops-scroll,#page-coachschedule \.coach-ops-head,#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-head,#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours,#page-coachschedule \.coach-ops-grid-card\.mode-month \.coach-ops-hours span\{background:#fff\}/,
  'coach schedule month header should use a clean white calendar background'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-date-btn\.is-today\{color:var\(--coach-ops-theme\)\}/,
  'coach schedule day title should use the theme color only for today'
);

assert.match(
  html,
  /setCoachOpsToday\(\)">今天<\/button>\s*<button class="coach-ops-nav coach-ops-arrow" id="coachOpsPrevBtn"[\s\S]*<button class="coach-ops-nav coach-ops-arrow is-next" id="coachOpsNextBtn"[\s\S]*<div class="coach-date-wrap">/,
  'coach schedule toolbar should place today, previous and next controls before the date title'
);

assert.match(
  coachOpsSource,
  /function coachOpsShiftTitle\(step\)\{const m=coachOpsMode;return m==='month'\?\(step<0\?'上个月':'下个月'\):m==='week'\?\(step<0\?'上周':'下周'\):\(step<0\?'前一天':'后一天'\);\}/,
  'coach schedule arrow hover titles should follow the current day week month mode'
);

assert.match(
  coachOpsSource,
  /const prev=document\.getElementById\('coachOpsPrevBtn'\),next=document\.getElementById\('coachOpsNextBtn'\),prevTip=coachOpsShiftTitle\(-1\),nextTip=coachOpsShiftTitle\(1\);/,
  'coach schedule should derive previous and next hover tooltip text from the active view mode'
);

assert.match(
  coachOpsSource,
  /if\(prev\)\{prev\.dataset\.tip=prevTip;prev\.setAttribute\('aria-label',prevTip\);\}\s*if\(next\)\{next\.dataset\.tip=nextTip;next\.setAttribute\('aria-label',nextTip\);\}/,
  'coach schedule should refresh custom arrow tooltips and accessible labels when the date label updates'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-mode-segment\{display:flex;align-items:center;justify-content:center;width:240px;height:34px;box-sizing:border-box;padding:3px;border:1px solid #DDE1E7;border-radius:8px;background:#fff;box-shadow:none\}/,
  'coach schedule day week month switch container should center the active block vertically'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-mode-btn\{display:flex;align-items:center;justify-content:center;flex:1 1 0;align-self:center;height:26px;min-width:0;padding:0;border:0;border-radius:6px;background:transparent;color:#2F241E;font-size:12px;font-weight:400;line-height:1;box-shadow:none\}/,
  'coach schedule day week month switch should be vertically centered with lighter smaller text'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-mode-btn\.active\{height:26px;background:rgba\(180,83,9,\.12\);color:var\(--coach-ops-theme\);font-weight:400;box-shadow:none\}/,
  'coach schedule selected day week month switch fill should be 26px high'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-arrow:hover\{background:#F7F8FA;border-color:transparent;box-shadow:none;transform:none\}/,
  'coach schedule arrow hover should use a plain fill without adding a border'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-arrow:hover::after\{content:attr\(data-tip\);/,
  'coach schedule arrow hover should show the custom tooltip text'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-date-btn::after\{content:"";display:inline-block;width:16px;height:16px;margin-left:4px;flex:0 0 16px;background:center\/16px 16px no-repeat url\("data:image\/svg\+xml,/,
  'coach schedule date dropdown icon should use the provided centered svg icon'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-shell\{background:transparent;position:relative;z-index:2;overflow:visible\}/,
  'coach schedule toolbar band should not paint square corners over the rounded sticky background'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\{height:auto;min-height:calc\(100vh - var\(--topH\) - 22px\);overflow:visible;background:transparent;border:0;border-radius:16px 16px 0 0\}/,
  'coach schedule grid should grow with the page instead of scrolling inside a fixed card'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-grid-card\.is-compact\{height:auto;min-height:calc\(100vh - var\(--topH\) - 22px\);overflow:visible\}/,
  'coach schedule compact campus view should shrink to the visible coaches'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-scroll\{position:relative;z-index:0;overflow-x:auto;overflow-y:visible;flex:0 0 auto;min-height:0;max-width:100%;background:#fff\}/,
  'coach schedule body should stay below the sticky header layer while preserving horizontal scrolling'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-head\{position:relative;z-index:1;width:100%;max-width:100%;height:var\(--coach-ops-head-h\);display:grid;grid-template-columns:var\(--coach-ops-axis-w\) minmax\(0,1fr\);overflow:hidden;background:#FCF7F3;border-bottom:1px solid #E3DDDC\}/,
  'coach schedule table header should be part of the shared sticky header container'
);

assert.doesNotMatch(
  styles,
  /#page-coachschedule \.coach-ops-head::before/,
  'coach schedule should not rely on a header pseudo-element mask'
);

assert.doesNotMatch(
  styles,
  /#page-coachschedule \.coach-ops-grid-card::before/,
  'coach schedule should not rely on a grid-card pseudo-element mask'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-shell\{border-radius:16px 16px 0 0\}/,
  'coach schedule toolbar band should preserve the rounded top corners without clipping the infinite canvas'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-day-label-fixed\{position:sticky;left:0;z-index:70;width:72px;height:30px;[^}]*background:#F9FAFB/,
  'coach schedule week date label should lock the left 72px area during horizontal scrolling'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-week-day-label-track\{width:var\(--coach-ops-week-grid-width\);height:30px;box-sizing:border-box;background:#F9FAFB;border-bottom:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\)\}/,
  'coach schedule week date label track should scroll with the coach columns using the shared 0.5px line'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-corner,#page-coachschedule \.coach-ops-hours,#page-coachschedule \.coach-ops-hours span,#page-coachschedule \.coach-ops-name\{background:#FCF7F3\}/,
  'coach schedule header and coach column should use #FCF7F3'
);

assert.match(
  styles,
  /#page-coachschedule #coachOpsTimeline\.is-skeleton\{display:flex;min-height:calc\(100vh - 215px\);background:#fff;padding:24px;box-sizing:border-box\}/,
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
  /#page-coachschedule \.coach-ops-day-board \.coach-ops-now-head i\{position:absolute;top:-8px;left:8px;transform:none;height:16px;padding:0;background:transparent;color:#F24822;font-size:10px;font-weight:400/,
  'coach schedule current-time label should render as red text on the time axis'
);

assert.match(
  styles,
  /#page-coachschedule \.coach-ops-day-board \.coach-ops-now-head b\{position:absolute;left:72px;top:-4px;transform:translateX\(-50%\);width:8px;height:8px;border-radius:50%;background:#F24822/,
  'coach schedule current-time red dot should be centered on the axis boundary and fully visible'
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
  /function coachOpsCreateSlotFromLineClick\(e,date,coach\)[\s\S]*const startTime=coachOpsStartTimeFromLineClick\(e\)[\s\S]*const endMin=Math\.min\(23\*60,startMin\+60\)/,
  'coach schedule line clicks should build a one-hour slot from any half-hour start'
);

assert.doesNotMatch(
  coachOpsSource,
  /startTime\.endsWith\(':00'\)\?120:60/,
  'coach schedule line clicks should not keep the old two-hour whole-hour default'
);

assert.match(
  coachOpsSource,
  /coachOpsPendingCreateSlot=slot;[\s\S]*renderCoachOps\(\);[\s\S]*openCoachOpsCreateSchedule\(coach,date,slot\.startTime,slot\.endTime\)/,
  'coach schedule line clicks should highlight the selected time range before opening the drawer'
);

assert.match(
  coachOpsSource,
  /function clearCoachOpsPendingCreateSlot\(\)[\s\S]*coachOpsPendingCreateSlot=null/,
  'coach schedule should expose a helper to clear the temporary selected time range'
);

assert.match(
  source,
  /function closeModal\(\)[\s\S]*clearCoachOpsPendingCreateSlot\(\)/,
  'closing the schedule drawer should clear the temporary selected time range'
);

assert.match(
  coachOpsSource,
  /scheduleCoachLocked:!!selectedCoach/,
  'creating a schedule should lock the coach only when a coach is selected'
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
