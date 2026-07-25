const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sync = require('../server/feishu-schedule-sync-routes');

const values = [
  ['时间', null, null, '马坡室内', null, null, null, '晓哲教练', null, null, null],
  ['日期', '星期', '时段', '1号', '2号', '3号', '4号', '课程', '场馆', '场地号', '学员'],
  [46223, '一', ' 12:00–12:30 ', null, null, '晓哲', null, '成人私教【正式】', '马坡室内', '3号', 'wjing（11）'],
  [null, null, ' 12:30–13:00 ', null, null, null, null, null, null, null, null],
  [null, null, ' 13:00–13:30 ', null, null, null, null, null, null, null, null],
  [null, null, ' 13:30–14:00 ', null, null, null, null, '青少年私教【体验】', '马坡室内', '2号', '杜一诺']
];

const merges = [
  { start_row_index: 2, end_row_index: 4, start_column_index: 7, end_column_index: 7 },
  { start_row_index: 2, end_row_index: 4, start_column_index: 8, end_column_index: 8 },
  { start_row_index: 2, end_row_index: 4, start_column_index: 9, end_column_index: 9 },
  { start_row_index: 2, end_row_index: 4, start_column_index: 10, end_column_index: 10 }
];

const courses = sync.parseFeishuScheduleRows({ values, merges, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });

assert.strictEqual(courses.length, 2, 'merged 1.5h course should be one course, not three 30-minute courses');
assert.strictEqual(courses[0].startTime, '2026-07-20 12:00', 'excel date should be converted to the schedule date');
assert.strictEqual(courses[0].endTime, '2026-07-20 13:30', 'merged rows should extend end time to the last merged slot');
assert.strictEqual(courses[0].durationMinutes, 90, 'merged 3 slots should be 90 minutes');
assert.strictEqual(courses[0].lessonCount, 1.5, 'merged 90 minutes should be 1.5 lesson hours');
assert.deepStrictEqual(courses[0].studentNames, ['wjing'], 'student parser should remove bracket lesson index');
assert.strictEqual(courses[0].lessonIndex, 11, 'student parser should keep bracket lesson index as metadata');
assert.strictEqual(sync.normalizeNameKey('W.Jing'), sync.normalizeNameKey('wjing（11）'), 'student aliases should ignore case, dot, spaces and bracket text');
assert.strictEqual(sync.isFutureCourse({ startTime: '2026-07-20 12:00' }, '2026-07-20 12:01'), false, 'courses already started before baseline should be ignored');
assert.strictEqual(sync.isFutureCourse({ startTime: '2026-07-20 12:30' }, '2026-07-20 12:01'), true, 'future courses after baseline should be sync candidates');

const plan = sync.buildDryRunPlan({
  feishuCourses: courses.slice(0, 1),
  syncRows: [],
  schedules: [{
    id: 'sch-1',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: []
});

assert.strictEqual(plan.summary.bindExisting, 1, 'first baseline should bind exact existing future schedule instead of creating duplicate');
assert.strictEqual(plan.summary.create, 0, 'exact existing future schedule should not be recreated');

const coachAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'coach-alias-key',
    coachName: 'Siren',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: [{ id: 'user-siren', role: 'coach', coachId: 'coach-siren', coachName: 'Siren 教练' }],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(coachAliasPlan.summary.create, 1, 'coach role user alias should match Siren to Siren 教练');
assert.strictEqual(coachAliasPlan.actions[0].candidate.resolvedCoach.name, 'Siren 教练', 'resolved coach should use canonical coach name');

const coachScheduleFallbackPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'coach-schedule-fallback-key',
    coachName: '岳克舟教练',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{ id: 'sch-yue', coach: '岳克舟', startTime: '2026-07-19 12:00', endTime: '2026-07-19 13:00', status: '已排课' }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(coachScheduleFallbackPlan.summary.create, 1, 'existing schedule coach names should be allowed as a conservative fallback');
assert.strictEqual(coachScheduleFallbackPlan.actions[0].candidate.resolvedCoach.name, '岳克舟', 'schedule fallback should keep the existing system coach name');

const deletePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [{ id: 'sync-1', sourceKey: 'old-key', scheduleId: 'sch-old', status: 'active' }],
  schedules: [],
  students: [],
  coaches: [],
  users: []
});

assert.strictEqual(deletePlan.summary.pendingDelete, 1, 'delete detection should only create a pending delete action for bound sync rows');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'feishu-schedule-sync.yml'), 'utf8');
assert.match(workflow, /cron:\s*'0 0-16 \* \* \*'/, 'workflow should run hourly from Beijing 08:00 to 24:00');
assert.match(workflow, /\/api\/cron\/feishu-schedule-sync/, 'workflow should call the feishu schedule sync cron endpoint');
assert.match(workflow, /CRON_SECRET:\s*\$\{\{\s*secrets\.CRON_SECRET\s*\|\|\s*secrets\.FLOWTENNIS_ADMIN_TOKEN\s*\}\}/, 'workflow should reuse FLOWTENNIS_ADMIN_TOKEN when CRON_SECRET is not configured');

(async () => {
  const candidate = {
    sourceKey: 'trial-key',
    sheetId: 'GrbZdi',
    fingerprint: 'fp-trial',
    sheetTitle: '7.20-7.26',
    sourceCell: 'R6C8',
    date: '2026-07-20',
    startClock: '13:30',
    endClock: '14:30',
    startTime: '2026-07-20 13:30',
    endTime: '2026-07-20 14:30',
    lessonCount: 1,
    coachName: '晓哲',
    resolvedCoach: { id: 'coach-xz', name: '晓哲' },
    course: { ok: true, courseType: '体验课', experienceType: '青少年', isTrial: true, audience: '青少年' },
    studentNames: ['杜一诺'],
    resolvedStudents: [{ id: 'stu-trial', name: '杜一诺' }],
    scheduleStudents: [{ id: 'stu-trial', name: '杜一诺' }],
    campus: 'shunyi_mapo',
    locationType: 'own',
    venue: '2号场',
    venueText: '马坡室内',
    courtText: '2号'
  };

  let purchased = false;
  let createdBody = null;
  const writes = [];
  const appliedTrial = await sync.applySyncPlan({
    actions: [{ type: 'create_trial_schedule', sourceKey: candidate.sourceKey, candidate }]
  }, {
    put: async (table, id, row) => writes.push({ table, id, row }),
    uuidv4: () => 'uuid-fixed',
    createSchedule: async (body) => { createdBody = body; return { schedule: { id: 'sch-trial' } }; },
    purchasePackage: async () => { purchased = true; return {}; },
    convertLeadToStudent: async () => { throw new Error('should not convert existing student'); },
    packages: [],
    entitlements: [{ id: 'ent-trial', studentId: 'stu-trial', courseType: '体验课', experienceType: '青少年', remainingLessons: 1, status: 'active' }],
    leads: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(purchased, false, 'trial sync should reuse existing available trial entitlement before buying another package');
  assert.strictEqual(createdBody.payMethod, '', 'trial schedule should consume a package, not direct-pay through schedule');
  assert.strictEqual(createdBody.settlementType, 'package', 'trial schedule should follow package settlement');
  assert.strictEqual(appliedTrial[0].scheduleId, 'sch-trial', 'trial schedule creation should persist sync relation after schedule creation');
  assert.strictEqual(writes[0].table, 'ft_feishu_schedule_sync', 'created schedule should write sync relation');
  assert.strictEqual(writes[0].row.sheetId, 'GrbZdi', 'sync relation should record source sheet id for future deletion scope');
  assert.strictEqual(writes[0].row.startTime, '2026-07-20 13:30', 'sync relation should record source start time for baseline audits');

  let updateCalled = false;
  const appliedUpdate = await sync.applySyncPlan({
    actions: [{
      type: 'update_schedule',
      sourceKey: 'update-key',
      sync: { id: 'sync-update', sourceKey: 'update-key', scheduleId: 'sch-old', lastFingerprint: 'old', status: 'active' },
      schedule: { id: 'sch-old', courseType: '私教课', experienceType: '', studentIds: ['stu-trial'], startTime: candidate.startTime, endTime: candidate.endTime },
      candidate
    }]
  }, {
    put: async () => {},
    updateSchedule: async () => { updateCalled = true; },
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(updateCalled, false, 'high-risk course type change should not auto-update schedule');
  assert.strictEqual(appliedUpdate[0].type, 'notify_error', 'high-risk update should be converted into operator notification');

  const deleteWrites = [];
  const appliedDelete = await sync.applySyncPlan({
    actions: [{
      type: 'pending_delete',
      sourceKey: 'delete-key',
      sync: { id: 'sync-delete', sourceKey: 'delete-key', scheduleId: 'sch-delete', status: 'active' }
    }]
  }, {
    put: async (table, id, row) => deleteWrites.push({ table, id, row }),
    uuidv4: () => 'uuid-delete',
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(appliedDelete[0].type, 'pending_delete', 'delete sync should create a pending confirmation task');
  assert.match(appliedDelete[0].confirmUrl, /\/api\/feishu-schedule-sync\/confirm-delete\?taskId=/, 'pending delete should include a mobile confirmation link');
  assert.ok(deleteWrites.some(item => item.table === 'ft_feishu_schedule_tasks' && item.row.status === 'pending'), 'delete sync should not cancel immediately, only create pending task');
  assert.ok(deleteWrites.some(item => item.table === 'ft_feishu_schedule_sync' && item.row.status === 'pending_delete'), 'delete sync should mark relation as pending_delete');

  console.log('feishu schedule sync rules tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
