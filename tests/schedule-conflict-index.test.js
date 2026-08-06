const assert = require('assert');
const {
  SCHEDULE_CONFLICT_INDEX_READY_ID,
  scheduleConflictIndexRowsForRecord,
  scheduleConflictIndexPrefixesForRecord,
  scheduleRowsFromConflictIndex,
  staleScheduleConflictIndexRows
} = require('../server/schedule-conflict-index');
const { validateScheduleConflicts } = require('../server/schedule');
const { buildBackfillPlan } = require('../scripts/backfill-schedule-conflict-index');

const existing = {
  id: 'sch-1',
  status: '已排课',
  startTime: '2026-07-19 17:00',
  endTime: '2026-07-19 18:00',
  coach: 'Siren 教练',
  studentIds: ['stu-1'],
  campus: 'shunyi_mapo',
  venue: '3 号场'
};

const rows = scheduleConflictIndexRowsForRecord(existing);
assert.equal(rows.length, 3, 'one schedule should index coach, student and venue conflicts');
assert.ok(rows.some(row => row.id === '2026-07-19|venue|shunyi_mapo%7C3%E5%8F%B7%E5%9C%BA|sch-1'), 'venue conflict key should include date, campus and normalized venue');

const candidate = {
  id: 'sch-2',
  status: '已排课',
  startTime: '2026-07-19 17:30',
  endTime: '2026-07-19 18:30',
  coach: 'Other',
  studentIds: ['stu-2'],
  campus: 'shunyi_mapo',
  venue: '3号场'
};
const prefixes = scheduleConflictIndexPrefixesForRecord(candidate);
assert.ok(prefixes.includes('2026-07-19|venue|shunyi_mapo%7C3%E5%8F%B7%E5%9C%BA|'), 'save should read only the selected date and venue prefix');
assert.throws(
  () => validateScheduleConflicts(candidate, scheduleRowsFromConflictIndex(rows), candidate.id),
  /场地「3号场」此时间已被占用/,
  'indexed venue rows should still block overlapping court usage'
);
assert.doesNotThrow(
  () => validateScheduleConflicts(
    {
      id: 'sch-today-visible-free',
      status: '已排课',
      startTime: '2026-08-06 07:00',
      endTime: '2026-08-06 08:30',
      coach: '杨教练',
      studentIds: ['stu-today'],
      campus: 'shunyi_mapo',
      venue: '2号场'
    },
    [{
      id: 'sch-prev-night-iso',
      status: '已排课',
      startTime: '2026-08-05T23:00:00.000Z',
      endTime: '2026-08-06T00:30:00.000Z',
      coach: '杨教练',
      studentIds: ['stu-prev'],
      campus: 'shunyi_mapo',
      venue: '2号场'
    }],
    'sch-today-visible-free'
  ),
  'previous business-date ISO schedule must not block a visibly empty selected day'
);
assert.throws(
  () => validateScheduleConflicts(
    {
      id: 'sch-same-day-candidate',
      status: '已排课',
      startTime: '2026-08-06 16:00',
      endTime: '2026-08-06 17:30',
      coach: '杨教练',
      studentIds: ['stu-new'],
      campus: 'shunyi_mapo',
      venue: '1号场'
    },
    [{
      id: 'sch-same-day-iso',
      status: '已排课',
      startTime: '2026-08-06T16:00:00.000Z',
      endTime: '2026-08-06T17:30:00.000Z',
      coach: '杨教练',
      studentIds: ['stu-old'],
      campus: 'shunyi_mapo',
      venue: '4号场'
    }],
    'sch-same-day-candidate'
  ),
  /教练「杨教练」此时间已有课程/,
  'same business-date ISO schedule should still block the same coach and time'
);

const moved = { ...existing, venue: '1号场' };
assert.deepStrictEqual(
  staleScheduleConflictIndexRows(existing, moved).map(row => row.id),
  ['2026-07-19|venue|shunyi_mapo%7C3%E5%8F%B7%E5%9C%BA|sch-1'],
  'moving a schedule should delete only stale conflict index rows'
);

const plan = buildBackfillPlan([existing], [{ id: 'stale-index-row' }, { id: SCHEDULE_CONFLICT_INDEX_READY_ID }]);
assert.equal(plan.expectedRows.length, 3, 'backfill should produce all active conflict rows');
assert.deepStrictEqual(plan.staleIds, ['stale-index-row'], 'backfill should identify stale conflict rows');

console.log('schedule conflict index tests passed');
