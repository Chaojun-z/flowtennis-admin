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
assert.strictEqual(sync.validDateKey('2026-07-01'), '2026-07-01', 'valid history date query should be accepted');
assert.strictEqual(sync.validDateKey('2026/07/01'), '', 'invalid history date query should be ignored');
assert.strictEqual(sync.courseInDateRange({ startTime: '2026-07-01 09:00' }, '2026-07-01', '2026-07-26'), true, 'history range should include the first day');
assert.strictEqual(sync.courseInDateRange({ startTime: '2026-07-26 18:00' }, '2026-07-01', '2026-07-26'), true, 'history range should include the last day');
assert.strictEqual(sync.courseInDateRange({ startTime: '2026-07-27 09:00' }, '2026-07-01', '2026-07-26'), false, 'history range should exclude dates after the end');

const interleavedValues = [
  ['时间', null, null, 'Siren', null, null, null, '杨教练', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '10:00-10:30', '成人私教【正式】', '马坡室内', '3号', '连女士（3）', '青少年团课', '马坡室内', '2号', '笑逐'],
  [null, null, '10:30-11:00', '成人私教【正式】', '马坡室内', '3号', '连女士（3）', '青少年团课', '马坡室内', '2号', '笑逐']
];
const interleavedCourses = sync.parseFeishuScheduleRows({ values: interleavedValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(interleavedCourses.length, 2, 'same coach block course should merge across rows even when other coach blocks are interleaved');
assert.strictEqual(interleavedCourses[0].endTime, '2026-07-20 11:00', 'interleaved private lesson should become one 60-minute course');
assert.strictEqual(interleavedCourses[1].course.courseType, '小班课', '青少年团课 should map to the system small class course type');
assert.strictEqual(interleavedCourses[1].lessonCount, 1, 'interleaved group lesson should also merge to one hour');

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
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
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
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(coachScheduleFallbackPlan.summary.create, 1, 'existing schedule coach names should be allowed as a conservative fallback');
assert.strictEqual(coachScheduleFallbackPlan.actions[0].candidate.resolvedCoach.name, '岳克舟', 'schedule fallback should keep the existing system coach name');

const primaryCoachPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'student-primary-coach-key',
    coachName: 'Siren',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(primaryCoachPlan.summary.create, 1, 'student primaryCoach should resolve sheet coach aliases when no coach directory exists');
assert.strictEqual(primaryCoachPlan.actions[0].candidate.resolvedCoach.name, 'Siren 教练', 'student primaryCoach should provide the canonical coach name');

const globalPrimaryCoachAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'global-primary-coach-key',
    coachName: 'Siren',
    studentNames: ['不存在的学员'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-known', name: '已知学员', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: []
});
assert.ok(!/无法唯一识别教练/.test(globalPrimaryCoachAliasPlan.actions[0].reason), 'global student primaryCoach aliases should prevent noisy coach errors');
assert.match(globalPrimaryCoachAliasPlan.actions[0].reason, /无法唯一识别正式课学员/, 'unresolved student should remain a real blocking error');

const fullCoachNamePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'full-coach-name-key',
    coachName: '刘润扬',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(fullCoachNamePlan.summary.create, 1, 'sheet coach names should be accepted when coach directory data is missing');
assert.strictEqual(fullCoachNamePlan.actions[0].candidate.resolvedCoach.name, '刘润扬', 'coach name fallback should keep the sheet coach name');

const uniqueContainsStudentPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'unique-contains-student-key',
    coachName: 'Siren',
    studentNames: ['李俊泽'],
    lessonIndex: 9,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-ljz', name: '李先生（李俊泽）', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-ljz', studentId: 'stu-ljz', courseType: '私教课', totalLessons: 10, usedLessons: 8, remainingLessons: 2, status: 'active' }]
});
assert.strictEqual(uniqueContainsStudentPlan.summary.create, 1, 'unique contains match should resolve 李俊泽 to 李先生（李俊泽）');
assert.strictEqual(uniqueContainsStudentPlan.actions[0].candidate.resolvedStudents[0].name, '李先生（李俊泽）', 'student contains match should keep the canonical system student name');

const lessonIndexMismatchPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'lesson-index-mismatch-key',
    coachName: 'Siren',
    studentNames: ['李俊泽'],
    lessonIndex: 9,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-ljz', name: '李先生（李俊泽）', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-ljz', studentId: 'stu-ljz', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(lessonIndexMismatchPlan.summary.notifyError, 1, 'lesson index mismatch should block automatic import');
assert.match(lessonIndexMismatchPlan.actions[0].reason, /括号课时编号和系统课包进度不一致/, 'lesson index mismatch should ask operations to confirm');

const deletePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [{ id: 'sync-1', sourceKey: 'old-key', scheduleId: 'sch-old', status: 'active' }],
  schedules: [],
  students: [],
  coaches: [],
  users: []
});

assert.strictEqual(deletePlan.summary.pendingDelete, 1, 'delete detection should only create a pending delete action for bound sync rows');

const safeHistoryPlan = sync.safeHistoryApplyPlan({
  actions: [
    { type: 'bind_existing', sourceKey: 'bind' },
    { type: 'create_schedule', sourceKey: 'create' },
    { type: 'create_trial_schedule', sourceKey: 'trial' },
    { type: 'notify_error', sourceKey: 'error' },
    { type: 'pending_delete', sourceKey: 'delete' },
    { type: 'update_schedule', sourceKey: 'update' }
  ]
});
assert.deepStrictEqual(safeHistoryPlan.summary, {
  total: 3,
  noop: 0,
  bindExisting: 1,
  create: 1,
  createTrial: 1,
  update: 0,
  pendingDelete: 0,
  notifyError: 0
}, 'history safe apply should only execute confirmed bind/create actions');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'feishu-schedule-sync.yml'), 'utf8');
assert.match(workflow, /cron:\s*'0 0,10 \* \* \*'/, 'workflow should run twice daily at Beijing 08:00 and 18:00');
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
  assert.strictEqual(createdBody.entitlementId, 'ent-trial', 'trial schedule should explicitly carry the matched entitlement id');
  assert.strictEqual(appliedTrial[0].scheduleId, 'sch-trial', 'trial schedule creation should persist sync relation after schedule creation');
  assert.strictEqual(writes[0].table, 'ft_feishu_schedule_sync', 'created schedule should write sync relation');
  assert.strictEqual(writes[0].row.sheetId, 'GrbZdi', 'sync relation should record source sheet id for future deletion scope');
  assert.strictEqual(writes[0].row.startTime, '2026-07-20 13:30', 'sync relation should record source start time for baseline audits');

  const newTrialCandidate = {
    ...candidate,
    sourceKey: 'new-trial-student-key',
    course: { ok: true, courseType: '体验课', experienceType: '成人', isTrial: true, audience: '成人' },
    studentNames: ['宜歆'],
    resolvedStudents: [],
    scheduleStudents: []
  };
  const createdLeadBodies = [];
  const convertedLeadIds = [];
  const purchasedBodies = [];
  const appliedNewTrial = await sync.applySyncPlan({
    actions: [{ type: 'create_trial_schedule', sourceKey: newTrialCandidate.sourceKey, candidate: newTrialCandidate }]
  }, {
    put: async () => {},
    uuidv4: () => 'uuid-fixed',
    createLead: async (body) => { createdLeadBodies.push(body); return { lead: { id: 'lead-new', ...body } }; },
    convertLeadToStudent: async (leadId) => { convertedLeadIds.push(leadId); return { student: { id: 'stu-new', name: '宜歆' } }; },
    purchasePackage: async (body) => { purchasedBodies.push(body); return { purchase: { id: 'pur-new', packageName: '体验课 · 1课时 · 全天' }, entitlement: { id: 'ent-new', packageName: '体验课 · 1课时 · 全天', purchaseId: 'pur-new' } }; },
    createSchedule: async (body) => {
      assert.strictEqual(body.entitlementId, 'ent-new', 'new trial schedule should explicitly consume the purchased entitlement');
      return { schedule: { id: 'sch-new-trial', ...body } };
    },
    packages: [{ id: 'pkg-trial-adult', name: '1v1 · 全天 · 1 课时', courseType: '体验课', experienceType: '私教体验课', price: 239, status: 'active' }],
    entitlements: [],
    leads: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.strictEqual(createdLeadBodies[0].displayName, '宜歆', 'new trial student should create a formal lead first');
  assert.strictEqual(createdLeadBodies[0].rawStatus, '已约体验', 'new trial lead should enter the normal lead lifecycle');
  assert.deepStrictEqual(convertedLeadIds, ['lead-new'], 'created trial lead should be converted to a student through the existing conversion route');
  assert.strictEqual(purchasedBodies[0].packageId, 'pkg-trial-adult', 'trial package lookup should accept active 239 adult trial packages without exact name matching');
  assert.strictEqual(purchasedBodies[0].payMethod, '大众点评券码', 'trial package purchase should use Dianping coupon write-off payment method');
  assert.strictEqual(appliedNewTrial[0].scheduleId, 'sch-new-trial', 'new trial student flow should still create the schedule');

  const ambiguousTrial = await sync.applySyncPlan({
    actions: [{ type: 'create_trial_schedule', sourceKey: 'multi-trial-key', candidate: { ...newTrialCandidate, studentNames: ['麦迪', '朋友'] } }]
  }, {
    createLead: async () => { throw new Error('should not create ambiguous multi-student lead'); },
    convertLeadToStudent: async () => ({}),
    purchasePackage: async () => ({}),
    createSchedule: async () => ({}),
    packages: [{ id: 'pkg-trial-adult', courseType: '体验课', price: 239, status: 'active' }],
    entitlements: [],
    leads: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.strictEqual(ambiguousTrial[0].type, 'error', 'multi-student trial text should remain manual confirmation instead of creating a wrong student');
  assert.match(ambiguousTrial[0].error, /多人或模糊学员/, 'ambiguous trial error should explain why it was not auto-created');

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
