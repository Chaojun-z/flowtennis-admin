const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');
const html = source;

assert.match(
  source,
  /mode==='week'\|\|mode==='month'/,
  'month view should use the weekday header like week view'
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

assert.match(
  source,
  /id="coachOpsQuickCreateBtn"/,
  'coach ops should expose a quick create button in the toolbar'
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
  /function financeConsumeRows\([\s\S]*aggregateHistoricalMonthlyLedgerRows\(dedupeEntitlementLedgerForDisplay\(entitlementLedger\)\)/,
  'finance consume report should reuse the unified entitlement ledger dedupe and monthly aggregation'
);

assert.doesNotMatch(
  source,
  /\.coach-ops-toolbar\{[^}]*background:#FCFAF7/s,
  'coach ops toolbar should not render as a filled white block background'
);

assert.match(
  source,
  /class="tms-btn tms-btn-primary" id="coachOpsQuickCreateBtn"/,
  'coach ops quick create should use the shared primary button style'
);

assert.match(
  html,
  /function coachOpsCourseTypeTagClass\(/,
  'coach ops should expose a shared course type color helper'
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

console.log('coach ops view tests passed');
