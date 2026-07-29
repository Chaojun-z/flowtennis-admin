const assert = require('assert');
const { createScheduleSaveValidation, isHistoricalScheduleRecord } = require('../server/schedule-save-validation');

function buildValidation(now){
  const calls = { courtConflictChecks: 0 };
  const validation = createScheduleSaveValidation({
    scanByIdPrefix: async () => [],
    put: async () => {},
    del: async () => {},
    get: async () => ({ id: 'schedule-conflict-index-ready' }),
    mkTable: async () => {},
    withRequiredStorageTimeout: async (promise) => promise,
    withTimeout: async (promise) => promise,
    timed: async (name, fn) => fn(),
    getCachedScan: async (table) => table === 'ft_schedule' ? [] : [{
      id: 'court-1',
      name: '订场用户A',
      campus: 'shunyi_mapo',
      history: [{
        type: '消费',
        category: '订场',
        date: '2026-04-30',
        startTime: '18:30',
        endTime: '20:30',
        venue: '3号场'
      }]
    }],
    isTableMissingError: () => false,
    validateScheduleConflicts: () => {},
    validateCourtBookingConflicts: () => { calls.courtConflictChecks += 1; throw new Error('should not check historical court booking conflicts'); },
    collectScheduleRiskWarnings: () => [],
    normalizeCampusValue: value => String(value || ''),
    T_SCHEDULE_CONFLICT_INDEX: 'ft_schedule_conflict_index',
    T_SCHEDULE: 'ft_schedule',
    T_COURTS: 'ft_courts'
  });
  return { validation, calls, now };
}

assert.strictEqual(
  isHistoricalScheduleRecord({ endTime: '2026-04-30 20:30' }, new Date('2026-07-29T00:00:00+08:00')),
  true,
  'past schedules should be treated as historical backfill records'
);

(async () => {
  const { validation, calls } = buildValidation(new Date('2026-07-29T00:00:00+08:00'));
  await validation.validateScheduleSave({
    id: 'historical-schedule',
    startTime: '2026-04-30 18:30',
    endTime: '2026-04-30 20:30',
    campus: 'shunyi_mapo',
    venue: '3号场',
    status: '已排课'
  });
  assert.strictEqual(calls.courtConflictChecks, 0, 'historical schedule backfill should not be blocked by imported court booking history');
  console.log('schedule save validation historical tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
