const assert = require('assert');
const crypto = require('crypto');
const api = require('../api/index.js');
const poster = require('../server/feishu-coach-digest-poster.js');

const rules = api._test;
const legacyMapoCode = ['ma', 'bao'].join('');

assert.ok(rules, 'api._test should expose schedule rule helpers');
assert.ok(rules.effectiveScheduleStatus, 'api._test should expose effective schedule status helper');
assert.ok(rules.scheduleLessonChargeStatus, 'api._test should expose lesson charge status helper');
assert.ok(rules.buildWechatAccessTokenUrl, 'api._test should expose wechat access token helper');
assert.ok(rules.extractWechatAccessToken, 'api._test should expose wechat access token extractor');
assert.ok(rules.findWechatScheduleRecipient, 'api._test should expose schedule recipient finder');
assert.ok(rules.buildScheduleSubscribeMessage, 'api._test should expose schedule subscribe message builder');
assert.ok(rules.collectCourseReminderCandidates, 'api._test should expose course reminder candidate helper');
assert.ok(rules.buildCourseReminderSubscribeMessage, 'api._test should expose course reminder message helper');
assert.ok(rules.buildPreviousCourseFeedbackSummary, 'api._test should expose previous course feedback summary helper');
assert.ok(rules.collectCoachFeedbackReminderCandidates, 'api._test should expose coach feedback reminder candidate helper');
assert.ok(rules.buildOfficialAccountCoachFeedbackReminderMessage, 'api._test should expose coach feedback reminder message helper');
assert.ok(rules.sendOfficialAccountCoachFeedbackReminders, 'api._test should expose coach feedback reminder sender');
assert.ok(rules.buildStudentReminderBindToken, 'api._test should expose student reminder bind token helper');
assert.ok(rules.buildStudentReminderLinkUpdate, 'api._test should expose student reminder link update helper');
assert.ok(rules.buildStudentOfficialAccountBoundUpdate, 'api._test should expose student official account bind helper');
assert.ok(rules.buildStudentOfficialAccountUnboundUpdate, 'api._test should expose student official account unbind helper');
assert.ok(rules.findStudentReminderBindTarget, 'api._test should expose student reminder bind target resolver');
assert.ok(rules.normalizeStudentReminderMode, 'api._test should expose student reminder mode normalizer');
assert.ok(rules.collectStudentCourseReminderCandidates, 'api._test should expose student course reminder collector');
assert.ok(rules.studentReminderStageText, 'api._test should expose student reminder stage text helper');
assert.ok(rules.buildStudentCourseReminderMessage, 'api._test should expose student course reminder message helper');
assert.ok(rules.buildOfficialAccountBoundUser, 'api._test should expose official account bind helper');
assert.ok(rules.buildOfficialAccountUnboundUser, 'api._test should expose official account unbind helper');
assert.ok(rules.extractOfficialAccountSubscribeStatus, 'api._test should expose official account subscribe status extractor');
assert.ok(rules.findOfficialAccountScheduleRecipient, 'api._test should expose official account recipient finder');
assert.ok(rules.normalizeOfficialAccountQueryChoice, 'api._test should expose official account query choice helper');
assert.ok(rules.buildOfficialAccountScheduleQueryReply, 'api._test should expose official account schedule reply builder');
assert.ok(rules.collectCoachDailyDigestCandidates, 'api._test should expose coach daily digest collector');
assert.ok(rules.buildCoachDailyDigestMessage, 'api._test should expose coach daily digest message builder');
assert.ok(rules.buildFeishuCoachDailyDigestText, 'api._test should expose feishu coach digest text builder');
assert.ok(poster.buildCoachDailyDigestPosterSvg, 'poster module should expose coach digest poster svg builder');
assert.ok(poster.buildCoachDailyDigestPosterPng, 'poster module should expose coach digest poster png builder');
assert.ok(rules.findFeishuCoachDigestRecipient, 'api._test should expose feishu coach recipient finder');
assert.ok(rules.sendFeishuCoachDailyDigests, 'api._test should expose feishu coach digest sender');
assert.ok(rules.resolveOfficialAccountSendMode, 'api._test should expose official account send mode helper');
assert.ok(rules.buildWechatSignature, 'api._test should expose wechat signature helper');
assert.ok(rules.decryptWechatOfficialAccountMessage, 'api._test should expose official account decrypt helper');
assert.ok(rules.resolveOfficialAccountCallbackEcho, 'api._test should expose official account callback echo helper');
assert.ok(rules.assertCanWriteSchedule, 'api._test should expose schedule write permission guard');
assert.ok(rules.buildWorkbenchStats, 'api._test should expose standard workbench stats helper');
assert.ok(rules.resolveWorkbenchState, 'api._test should expose standard workbench state helper');
assert.ok(rules.decorateWorkbenchClasses, 'api._test should expose class contract normalization helper');
assert.ok(rules.decorateWorkbenchStudents, 'api._test should expose student contract normalization helper');
assert.ok(rules.decorateWorkbenchFeedbacks, 'api._test should expose feedback contract normalization helper');
assert.ok(rules.feedbackScopeForSchedule, 'api._test should expose feedback scope helper');
assert.ok(rules.buildFeedbackRecord, 'api._test should expose feedback record builder');

assert.strictEqual(
  rules.effectiveScheduleStatus(
    { status: '已排课', endTime: '2026-04-11 10:00' },
    new Date('2026-04-11 10:01:00')
  ),
  '已结束',
  'past active schedule should behave as ended for filtering'
);

assert.strictEqual(
  rules.effectiveScheduleStatus(
    { status: '已下课', endTime: '2026-04-11 10:00' },
    new Date('2026-04-11 10:01:00')
  ),
  '已结束',
  'legacy or user-facing 已下课 status should normalize to ended'
);

assert.strictEqual(
  rules.effectiveScheduleStatus(
    { status: '已取消', endTime: '2026-04-11 10:00' },
    new Date('2026-04-11 10:01:00')
  ),
  '已取消',
  'cancelled schedule should stay cancelled'
);

assert.strictEqual(
  rules.scheduleLessonChargeStatus(
    { id: 'sch-1', status: '已排课', entitlementId: 'ent-1', lessonCount: 1 },
    [{ scheduleId: 'sch-1', entitlementId: 'ent-1', lessonDelta: -1 }]
  ),
  '已扣课',
  'schedule with matching negative entitlement ledger should show charged'
);

assert.strictEqual(
  rules.scheduleLessonChargeStatus(
    { id: 'sch-1', status: '已排课', entitlementId: '', lessonCount: 1 },
    []
  ),
  '未扣课',
  'billable schedule without entitlement should show uncharged'
);

assert.strictEqual(
  rules.scheduleLessonChargeStatus(
    { id: 'sch-direct', status: '已排课', settlementType: 'direct', paidAmount: 99, lessonCount: 1 },
    []
  ),
  '直接收款',
  'direct paid schedule should not be treated as missing entitlement'
);

assert.deepStrictEqual(
  rules.resolveScheduleEntitlementDeltas(
    { id: 'sch-direct', status: '已排课', settlementType: 'direct', paidAmount: 99, lessonCount: 1, studentIds: ['stu-1'] },
    [{ id: 'ent-1', studentId: 'stu-1', status: 'active', courseType: '体验课', totalLessons: 1, remainingLessons: 1 }]
  ),
  [],
  'direct paid schedule should not consume entitlement balance'
);

assert.deepStrictEqual(
  rules.resolveScheduleEntitlementDeltas(
    { id: 'sch-special', status: '已排课', settlementType: 'package', courseType: '专项课', lessonCount: 1.5, studentIds: ['stu-1'] },
    [{ id: 'ent-special-1', studentId: 'stu-1', status: 'active', courseType: '专项课', totalLessons: 1, remainingLessons: 1 }]
  ),
  [{ studentId: 'stu-1', entitlementId: 'ent-special-1', delta: 1 }],
  'special course schedules should consume one count even when duration is longer than one hour'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementRequired({ id: 'sch-direct', status: '已排课', settlementType: 'direct', paidAmount: 99, lessonCount: 1, studentIds: ['stu-1'] }),
  'direct paid schedule should save without a package entitlement'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementRequired({
    id: 'sch-family',
    status: '已排课',
    settlementType: 'package',
    courseType: '小班课',
    smallClassType: 'family',
    lessonCount: 1,
    studentIds: ['parent-1'],
    actualStudentCount: 3
  }),
  'family small group lesson should allow one main customer when actual attendance count is at least 2'
);

assert.throws(
  () => rules.assertScheduleEntitlementRequired({
    id: 'sch-family-too-few',
    status: '已排课',
    settlementType: 'package',
    courseType: '小班课',
    smallClassType: 'family',
    lessonCount: 1,
    studentIds: ['parent-1'],
    actualStudentCount: 1
  }),
  /亲子课至少 2 人到场/,
  'family small group lesson should reject fewer than 2 actual attendees'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementRequired({
    id: 'sch-xiaozhu-single',
    status: '已排课',
    settlementType: 'package',
    courseType: '小班课',
    smallClassType: 'bootcamp',
    lessonCount: 1,
    studentIds: ['student-xiaozhu'],
    studentName: '笑逐',
    actualStudentCount: 1
  }),
  'confirmed Xiaozhu single-student small group lesson should be allowed'
);

assert.throws(
  () => rules.assertScheduleEntitlementRequired({
    id: 'sch-small-group-too-few',
    status: '已排课',
    settlementType: 'package',
    courseType: '小班课',
    smallClassType: 'bootcamp',
    lessonCount: 1,
    studentIds: ['student-other'],
    studentName: '普通学员',
    actualStudentCount: 1
  }),
  /小班课至少 2 人到场/,
  'ordinary one-student small group lessons should still require operations confirmation'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(
    { id: 'ent-family-3', studentId: 'parent-1', status: 'active', courseType: '小班课', smallClassType: 'family', maxStudents: 3, totalLessons: 6, remainingLessons: 6 },
    { id: 'sch-family-too-many', status: '已排课', courseType: '小班课', smallClassType: 'family', lessonCount: 1, studentIds: ['parent-1'], actualStudentCount: 4 }
  ),
  /课包适用人数不匹配/,
  'family small group lesson should compare actual attendance count against package max students'
);

assert.strictEqual(
  rules.scheduleLessonChargeStatus(
    { id: 'sch-1', status: '已取消', entitlementId: 'ent-1', lessonCount: 1 },
    [{ scheduleId: 'sch-1', entitlementId: 'ent-1', lessonDelta: 1 }]
  ),
  '不扣课',
  'cancelled schedule should show no charge'
);

assert.doesNotThrow(
  () => rules.assertCanWriteSchedule(
    { role: 'admin', name: '管理员' }
  ),
  'admin can write schedule'
);

assert.throws(
  () => rules.assertCanWriteSchedule(
    { role: 'editor', coachName: '朝珺', name: '朝珺' }
  ),
  /无权限/,
  'coach cannot write schedule'
);

assert.deepStrictEqual(
  rules.buildWorkbenchStats({
    monthFinishedLessonUnits: 12,
    weekFinishedLessonUnits: 5,
    todayFinishedLessonUnits: 2,
    monthFeedbackCount: 4,
    pendingFeedbackCount: 3,
    monthTrialLessonCount: 2,
    trialConversionRate: 50,
    overallTrialStudentCount: 8,
    overallTrialConvertedStudentCount: 3,
    overallTrialConversionRate: 37.5
  }),
  {
    monthFinishedLessonUnits: 12,
    weekFinishedLessonUnits: 5,
    todayFinishedLessonUnits: 2,
    monthFeedbackCount: 4,
    pendingFeedbackCount: 3,
    monthTrialLessonCount: 2,
    trialConversionRate: 50,
    overallTrialStudentCount: 8,
    overallTrialConvertedStudentCount: 3,
    overallTrialConversionRate: 37.5
  },
  'workbench stats helper should keep the standard backend contract'
);

assert.deepStrictEqual(
  rules.buildWorkbenchStats({
    now: new Date('2026-04-23 12:00:00'),
    schedule: [
      { id: 's1', startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已结束', lessonCount: 1 },
      { id: 's2', startTime: '2026-04-22 09:00', endTime: '2026-04-22 11:00', status: '已结束', lessonCount: 2 },
      { id: 's3', startTime: '2026-04-01 09:00', endTime: '2026-04-01 10:00', status: '已取消', lessonCount: 1 }
    ],
    feedbacks: [{ scheduleId: 's1' }]
  }),
  {
    monthFinishedLessonUnits: 3,
    weekFinishedLessonUnits: 3,
    todayFinishedLessonUnits: 0,
    monthFeedbackCount: 1,
    pendingFeedbackCount: 1,
    monthTrialLessonCount: 0,
    trialConversionRate: 0,
    overallTrialStudentCount: 0,
    overallTrialConvertedStudentCount: 0,
    overallTrialConversionRate: 0
  },
  'workbench stats helper should calculate month feedback count from ended schedules with feedback records'
);

assert.deepStrictEqual(
  rules.buildWorkbenchStats({
    now: new Date('2026-04-23 12:00:00'),
    schedule: [
      { id: 't1', coach: '朝珺', startTime: '2026-04-01 09:00', endTime: '2026-04-01 10:00', status: '已结束', courseType: '体验课', studentIds: ['stu-1'], studentName: '学员A' },
      { id: 't2', coach: '朝珺', startTime: '2026-04-08 09:00', endTime: '2026-04-08 10:00', status: '已结束', courseType: '体验课', studentIds: ['stu-1'], studentName: '学员A' },
      { id: 't3', coach: '朝珺', startTime: '2026-04-10 09:00', endTime: '2026-04-10 10:00', status: '已结束', courseType: '私教体验课', studentIds: ['stu-2'], studentName: '学员B' },
      { id: 't4', coach: '朝珺', startTime: '2026-04-15 09:00', endTime: '2026-04-15 10:00', status: '已结束', courseType: '私教课', studentIds: ['stu-3'], studentName: '学员C' }
    ],
    standardLifecycleMetrics: {
      metrics: {
        trialPathStudents: { value: 2 },
        trialPathDeals: { value: 1, rate: 50 }
      }
    },
    feedbacks: []
  }),
  {
    monthFinishedLessonUnits: 4,
    weekFinishedLessonUnits: 0,
    todayFinishedLessonUnits: 0,
    monthFeedbackCount: 0,
    pendingFeedbackCount: 4,
    monthTrialLessonCount: 2,
    trialConversionRate: 50,
    overallTrialStudentCount: 2,
    overallTrialConvertedStudentCount: 1,
    overallTrialConversionRate: 50
  },
  'workbench stats helper should read trial conversion from the unified lifecycle metrics'
);

{
  const decoratedStudents = rules.decorateWorkbenchStudents(
    [{ id: 'stu-class', name: '团课学员' }],
    [
      { id: 'sch-class-1', classId: 'class-1', startTime: '2026-04-10 19:00', endTime: '2026-04-10 21:00', status: '已结束', lessonCount: 2, studentIds: '["stu-class"]' }
    ],
    new Date('2026-04-23 12:00:00')
  );
  assert.strictEqual(
    decoratedStudents[0].lessonUnitsCompleted,
    2,
    'workbench student decoration should read stringified studentIds arrays from backend rows'
  );
}

{
  const scoped = rules.filterLoadAllForUser(
    {
      schedule: [
        { id: 's1', coachId: 'legacy-coach-id', coach: '朝珺', startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已结束', lessonCount: 1 },
        { id: 's2', coachId: 'other-coach-id', coach: '其他教练', startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已结束', lessonCount: 1 }
      ],
      feedbacks: [{ id: 'f1', scheduleId: 's1' }]
    },
    { role: 'editor', id: 'chaojun', coachId: 'chaojun', coachName: '朝珺', name: '朝珺' }
  );
  assert.deepStrictEqual(
    scoped.schedule.map(item => item.id),
    ['s1'],
    'coach-scoped mini program data should fall back to coach name when legacy schedule coachId differs'
  );
  assert.deepStrictEqual(
    scoped.feedbacks.map(item => item.id),
    ['f1'],
    'coach-scoped mini program feedbacks should follow the recovered schedule rows'
  );
}

{
  const scoped = rules.filterLoadAllForUser(
    {
      campuses: [{ id: 'shunyi_mapo', name: '马坡' }, { id: 'shilipu', name: '十里堡' }],
      students: [
        { id: 'stu-1', name: '马坡学员', campus: 'shunyi_mapo' },
        { id: 'stu-2', name: '十里堡学员', campus: 'shilipu' }
      ],
      coaches: [
        { id: 'coach-1', name: '马坡教练', campus: 'shunyi_mapo' },
        { id: 'coach-2', name: '十里堡教练', campus: 'shilipu' }
      ],
      classes: [
        { id: 'class-1', className: '马坡班', campus: 'shunyi_mapo', studentIds: ['stu-1'], coach: '马坡教练' },
        { id: 'class-2', className: '十里堡班', campus: 'shilipu', studentIds: ['stu-2'], coach: '十里堡教练' }
      ],
      schedule: [
        { id: 'sch-1', campus: 'shunyi_mapo', classId: 'class-1', studentIds: ['stu-1'], coach: '马坡教练', status: '已结束', lessonCount: 1 },
        { id: 'sch-2', campus: 'shilipu', classId: 'class-2', studentIds: ['stu-2'], coach: '十里堡教练', status: '已结束', lessonCount: 1 }
      ],
      courts: [
        { id: 'court-1', name: '马坡订场用户', campus: 'shunyi_mapo' },
        { id: 'court-2', name: '十里堡订场用户', campus: 'shilipu' }
      ],
      packages: [
        { id: 'pkg-all', name: '不限校区课包', campusIds: [] },
        { id: 'pkg-1', name: '马坡课包', campusIds: ['shunyi_mapo'] },
        { id: 'pkg-2', name: '十里堡课包', campusIds: ['shilipu'] }
      ],
      purchases: [
        { id: 'pur-1', studentId: 'stu-1', packageId: 'pkg-1' },
        { id: 'pur-2', studentId: 'stu-2', packageId: 'pkg-2' }
      ],
      entitlements: [
        { id: 'ent-1', studentId: 'stu-1', purchaseId: 'pur-1', packageId: 'pkg-1' },
        { id: 'ent-2', studentId: 'stu-2', purchaseId: 'pur-2', packageId: 'pkg-2' }
      ],
      membershipAccounts: [
        { id: 'mem-1', courtId: 'court-1' },
        { id: 'mem-2', courtId: 'court-2' }
      ],
      leads: [
        { id: 'lead-1', campus: 'shunyi_mapo' },
        { id: 'lead-2', campus: 'shilipu' }
      ]
    },
    { role: 'admin', id: 'mira', name: 'Mira', dataScope: 'campus', campusIds: ['shunyi_mapo'] }
  );
  assert.deepStrictEqual(scoped.campuses.map(row => row.id), ['shunyi_mapo'], 'campus-scoped admin should only see assigned campus rows');
  assert.deepStrictEqual(scoped.students.map(row => row.id), ['stu-1'], 'campus-scoped admin should only see matching students');
  assert.deepStrictEqual(scoped.coaches.map(row => row.id), ['coach-1'], 'campus-scoped admin should only see matching coaches');
  assert.deepStrictEqual(scoped.classes.map(row => row.id), ['class-1'], 'campus-scoped admin should only see matching classes');
  assert.deepStrictEqual(scoped.schedule.map(row => row.id), ['sch-1'], 'campus-scoped admin should only see matching schedule rows');
  assert.deepStrictEqual(scoped.courts.map(row => row.id), ['court-1'], 'campus-scoped admin should only see matching court users');
  assert.deepStrictEqual(scoped.packages.map(row => row.id), ['pkg-all', 'pkg-1'], 'campus-scoped admin should see matching packages and unrestricted packages');
  assert.deepStrictEqual(scoped.purchases.map(row => row.id), ['pur-1'], 'campus-scoped admin should only see matching purchases');
  assert.deepStrictEqual(scoped.entitlements.map(row => row.id), ['ent-1'], 'campus-scoped admin should only see matching entitlements');
  assert.deepStrictEqual(scoped.membershipAccounts.map(row => row.id), ['mem-1'], 'campus-scoped admin should only see matching membership accounts');
  assert.deepStrictEqual(scoped.leads.map(row => row.id), ['lead-1'], 'campus-scoped admin should only see matching leads');
}

assert.deepStrictEqual(
  rules.resolveWorkbenchState(
    {
      startTime: '2026-04-21 12:00',
      endTime: '2026-04-21 13:00',
      status: '已排课'
    },
    null,
    new Date('2026-04-21 12:15:00')
  ),
  {
    code: 'live',
    label: '进行中'
  },
  'active course should resolve to live'
);

assert.deepStrictEqual(
  rules.resolveWorkbenchState(
    {
      startTime: '2026-04-21 12:20',
      endTime: '2026-04-21 13:20',
      status: '已排课'
    },
    null,
    new Date('2026-04-21 12:00:00')
  ),
  {
    code: 'upcoming',
    label: '即将开始'
  },
  'near-future course should resolve to upcoming'
);

assert.deepStrictEqual(
  rules.resolveWorkbenchState(
    {
      startTime: '2026-04-21 12:00',
      endTime: '2026-04-21 13:00',
      campus: 'shunyi_mapo',
      status: '已排课'
    },
    {
      startTime: '2026-04-21 10:00',
      endTime: '2026-04-21 11:10',
      campus: legacyMapoCode,
      status: '已排课'
    },
    new Date('2026-04-21 10:00:00')
  ),
  {
    code: 'later',
    label: '今日后续'
  },
  'workbench state should not mark legacy and standard Shunyi Mapo values as travel'
);

assert.deepStrictEqual(
  rules.resolveWorkbenchState(
    {
      startTime: '2026-04-21 11:00',
      endTime: '2026-04-21 12:00',
      status: '已排课'
    },
    null,
    new Date('2026-04-21 12:30:00')
  ),
  {
    code: 'pending',
    label: '待反馈'
  },
  'finished course without feedback should resolve to pending'
);

assert.deepStrictEqual(
  rules.decorateWorkbenchClasses(
    [{
      id: 'class-1',
      className: 'A班',
      productName: '体验课',
      opsNote: '班次备注',
      scheduleDays: ['周一']
    }],
    [{
      id: 'schedule-1',
      classId: '',
      className: 'A班',
      startTime: '2026-04-21 10:00',
      endTime: '2026-04-21 11:00',
      status: '已排课'
    }]
  ),
  [{
    id: 'class-1',
    className: 'A班',
    productName: '体验课',
    opsNote: '班次备注',
    scheduleDays: ['周一'],
    courseContent: '体验课',
    scheduleTime: '每周一',
    campus: '',
    remark: '班次备注'
  }],
  'class normalization should output standard fields and avoid linking schedule time by class name guessing'
);

assert.deepStrictEqual(
  rules.decorateWorkbenchStudents([{
    id: 'stu-1',
    mobile: '13800000000',
    category: '青少年',
    primaryCampus: '马宝',
    primaryCoach: '朝珺',
    ownerCoach: '销售A',
    studentRemark: '学生备注',
    issueNote: '膝盖旧伤',
    sessionFocus: '盯正手',
    notes: '旧备注'
  }], [{
    id: 'sch-1',
    studentIds: ['stu-1'],
    status: '已排课',
    startTime: '2026-04-21 10:00',
    endTime: '2026-04-21 11:00',
    lessonCount: 1.5
  }], new Date('2026-04-21 12:00:00')),
  [{
    id: 'stu-1',
    mobile: '13800000000',
    category: '青少年',
    primaryCampus: '马宝',
    primaryCoach: '朝珺',
    ownerCoach: '销售A',
    phone: '13800000000',
    type: '青少年',
    campus: '马宝',
    studentRemark: '学生备注',
    issueNote: '膝盖旧伤',
    sessionFocus: '盯正手',
    notes: '旧备注',
    remark: '学生备注',
    historyIssue: '膝盖旧伤',
    focusNote: '盯正手',
    lessonUnitsCompleted: 1.5
  }],
  'student normalization should expose standard fields and completed lesson units'
);

assert.strictEqual(
  rules.decorateWorkbenchClasses([{ id: 'class-campus', campusName: '旗忠', productName: '私教课' }], [])[0].campus,
  '旗忠',
  'class normalization should expose the standard campus field'
);

assert.strictEqual(
  rules.mergeStoredAuthUser(null, { id: 'coach-user', name: '朝珺', role: 'editor' }).coachId,
  'coach-user',
  'editor login payload should include a stable coachId fallback'
);

assert.deepStrictEqual(
  rules.filterLoadAllForUser({
    schedule: [
      { id: 'mine', coachId: 'coach-1', coach: '同名教练', classId: 'class-1', studentIds: ['stu-1'] },
      { id: 'same-name-other-id', coachId: 'coach-2', coach: '同名教练', classId: 'class-2', studentIds: ['stu-2'] },
      { id: 'legacy-name', coach: '同名教练', classId: 'class-legacy', studentIds: ['stu-legacy'] }
    ],
    classes: [
      { id: 'class-1', coachId: 'coach-1', coach: '同名教练', studentIds: ['stu-1'] },
      { id: 'class-2', coachId: 'coach-2', coach: '同名教练', studentIds: ['stu-2'] },
      { id: 'class-legacy', coach: '同名教练', studentIds: ['stu-legacy'] }
    ],
    students: [
      { id: 'stu-1', primaryCoachId: 'coach-1', primaryCoach: '同名教练' },
      { id: 'stu-2', primaryCoachId: 'coach-2', primaryCoach: '同名教练' },
      { id: 'stu-legacy', primaryCoach: '同名教练' }
    ],
    feedbacks: [
      { id: 'fb-1', scheduleId: 'mine' },
      { id: 'fb-2', scheduleId: 'same-name-other-id' }
    ]
  }, { role: 'editor', coachId: 'coach-1', coachName: '同名教练', name: '同名教练' }).schedule.map(item => item.id),
  ['mine', 'legacy-name'],
  'coach scoped data should prefer coachId and only fall back to coachName for legacy rows without coachId'
);

assert.deepStrictEqual(
  rules.decorateWorkbenchFeedbacks([{
    id: 'fb-1',
    coachNote: '重心前压',
    practicedToday: '发球节奏'
  }]),
  [{
    id: 'fb-1',
    coachNote: '重心前压',
    practicedToday: '发球节奏',
    focusNote: '重心前压',
    summary: '发球节奏'
  }],
  'feedback normalization should expose a single standard focus and summary contract'
);

assert.strictEqual(
  rules.feedbackScopeForSchedule({ classId: 'class-1', studentIds: ['s1', 's2'], courseType: '班课' }),
  'class',
  'multi-student class feedback should use class scope'
);

assert.strictEqual(
  rules.feedbackScopeForSchedule({ studentIds: ['s1'], courseType: '私教课' }),
  'student',
  'private feedback should use student scope'
);

const classFeedbackRecord = rules.buildFeedbackRecord({
  scheduleId: 'sch-1',
  classId: 'class-1',
  studentIds: ['s1', 's2'],
  studentId: 's1',
  studentName: '多人班',
  courseType: '班课',
  practicedToday: '正手',
  nextTraining: '步伐'
}, { id: 'fb-1' }, { name: '朝珺' });
assert.strictEqual(classFeedbackRecord.feedbackScope, 'class', 'class feedback should use class scope');
assert.strictEqual(classFeedbackRecord.classId, 'class-1', 'class feedback should keep classId');
assert.strictEqual(classFeedbackRecord.studentId, '', 'class feedback should not bind to only the first student');
assert.deepStrictEqual(classFeedbackRecord.studentIds, ['s1', 's2'], 'class feedback should keep all studentIds');

assert.strictEqual(
  rules.buildWechatAccessTokenUrl('wx-app-id', 'secret-value'),
  'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=wx-app-id&secret=secret-value',
  'wechat access token helper should build the official token URL'
);

assert.strictEqual(
  rules.extractWechatAccessToken({ access_token: 'token-123' }),
  'token-123',
  'wechat access token extractor should return access_token'
);

assert.throws(
  () => rules.extractWechatAccessToken({ errcode: 40125, errmsg: 'invalid appsecret' }),
  /微信 access_token 获取失败/,
  'wechat access token extractor should reject wx API errors'
);

assert.deepStrictEqual(
  rules.findWechatScheduleRecipient(
    { coachId: 'coach-id-1', coach: '朝珺' },
    [
      { id: 'admin', role: 'admin', wechatOpenId: 'admin-openid' },
      { id: 'coach-user', role: 'editor', coachId: 'coach-id-1', coachName: '朝珺', wechatOpenId: 'coach-openid' }
    ]
  ),
  { id: 'coach-user', role: 'editor', coachId: 'coach-id-1', coachName: '朝珺', wechatOpenId: 'coach-openid' },
  'schedule notification should target the bound coach account'
);

assert.strictEqual(
  rules.findWechatScheduleRecipient({ coach: '朝珺' }, [{ id: 'coach-user', role: 'editor', coachName: '朝珺' }]),
  null,
  'schedule notification should skip coaches without openid'
);

assert.deepStrictEqual(
  rules.findWechatUserByOpenId(
    [
      { id: 'admin-user', role: 'admin', wechatOpenId: 'same-openid' },
      { id: 'coach-user', role: 'editor', coachName: '朝珺', wechatOpenId: 'same-openid' }
    ],
    'same-openid'
  ),
  { id: 'coach-user', role: 'editor', coachName: '朝珺', wechatOpenId: 'same-openid' },
  'mini program wechat login should prefer the bound coach account when the same openid was previously bound to admin'
);

assert.deepStrictEqual(
  rules.buildScheduleSubscribeMessage({
    templateId: 'tpl-1',
    openid: 'openid-1',
    schedule: {
      id: 'sch-1',
      courseType: '私教课',
      startTime: '2026-04-20 16:00',
      endTime: '2026-04-20 17:00',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentName: '小鹿',
      coach: '朝珺'
    }
  }),
  {
    touser: 'openid-1',
    template_id: 'tpl-1',
    page: 'pages/detail/detail?scheduleId=sch-1',
    data: {
      thing1: { value: '私教课' },
      time2: { value: '2026-04-20 16:00' },
      thing3: { value: '小鹿' },
      thing4: { value: '顺义马坡 1号场' }
    }
  },
  'schedule subscribe message should build the mini program template payload'
);

assert.deepStrictEqual(
  rules.buildScheduleNotificationUpdate(
    { id: 'sch-notify-1', notifyStatus: '未通知', notificationLogs: [] },
    { sent: true, userId: 'coach-user' },
    'schedule_created',
    '2026-04-20 10:00:00'
  ),
  {
    notifyStatus: '已通知教练',
    lastNotifyAt: '2026-04-20 10:00:00',
    lastNotifyError: '',
    notificationLogs: [{
      type: 'schedule_created',
      status: 'sent',
      channel: 'wechat_subscribe',
      targetUserId: 'coach-user',
      reason: '',
      error: '',
      createdAt: '2026-04-20 10:00:00'
    }]
  },
  'successful schedule notification should create an auditable notification log'
);

assert.deepStrictEqual(
  rules.buildScheduleNotificationUpdate(
    { id: 'sch-notify-2', notifyStatus: '未通知', notificationLogs: [] },
    { skipped: true, reason: 'missing_openid' },
    'schedule_created',
    '2026-04-20 10:05:00'
  ),
  {
    notifyStatus: '通知失败',
    lastNotifyAt: '2026-04-20 10:05:00',
    lastNotifyError: 'missing_openid',
    notificationLogs: [{
      type: 'schedule_created',
      status: 'failed',
      channel: 'wechat_subscribe',
      targetUserId: '',
      reason: 'missing_openid',
      error: '',
      createdAt: '2026-04-20 10:05:00'
    }]
  },
  'skipped schedule notification should still leave a failure reason for traceability'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountBoundUser(
    { id: 'coach_1', name: '朝珺', role: 'editor' },
    'oa-openid-1',
    '2026-05-15 09:00:00'
  ),
  {
    id: 'coach_1',
    name: '朝珺',
    role: 'editor',
    officialAccountOpenId: 'oa-openid-1',
    officialAccountBoundAt: '2026-05-15 09:00:00'
  },
  'official account bind helper should attach service account openid'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountUnboundUser({
    id: 'coach_1',
    name: '朝珺',
    officialAccountOpenId: 'oa-openid-1',
    officialAccountBoundAt: '2026-05-15 09:00:00'
  }),
  {
    id: 'coach_1',
    name: '朝珺',
    officialAccountOpenId: '',
    officialAccountBoundAt: ''
  },
  'official account unbind helper should clear service account fields'
);

assert.deepStrictEqual(
  rules.findOfficialAccountScheduleRecipient(
    { coachId: 'coach-chaojun', coach: '朝珺' },
    [
      { id: 'coach_1', role: 'editor', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-1' },
      { id: 'coach_2', role: 'editor', coachId: 'coach-other', coachName: '其他教练', officialAccountOpenId: 'oa-openid-2' }
    ]
  ),
  { id: 'coach_1', role: 'editor', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-1' },
  'official account recipient finder should match the bound coach'
);

const reminderRows = [
  { id: 'prev-cross', coach: '朝珺', startTime: '2026-04-20 09:30', endTime: '2026-04-20 10:30', campus: 'shunyi_mapo', venue: '1号场', status: '已排课' },
  { id: 'too-late', coach: '朝珺', startTime: '2026-04-20 11:20', endTime: '2026-04-20 12:20', campus: 'shunyi_mapo', status: '已排课' },
  { id: 'delayed-edge', coach: '朝珺', startTime: '2026-04-20 11:35', endTime: '2026-04-20 12:35', campus: 'shunyi_mapo', status: '已排课' },
  { id: 'due-cross', coach: '朝珺', startTime: '2026-04-20 12:00', endTime: '2026-04-20 13:00', campus: 'shunyi', venue: '2号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
  { id: 'too-soon', coach: '朝珺', startTime: '2026-04-20 10:20', endTime: '2026-04-20 11:20', campus: 'shunyi_mapo', status: '已排课' },
  { id: 'early-edge', coach: '朝珺', startTime: '2026-04-20 12:29', endTime: '2026-04-20 13:29', campus: 'shunyi_mapo', status: '已排课' },
  { id: 'too-early', coach: '朝珺', startTime: '2026-04-20 12:40', endTime: '2026-04-20 13:40', campus: 'shunyi_mapo', status: '已排课' },
  { id: 'sent', coach: '朝珺', startTime: '2026-04-20 12:05', endTime: '2026-04-20 13:05', campus: 'shunyi_mapo', status: '已排课', courseReminderSentAt: '2026-04-20 09:50:00' },
  { id: 'cancelled', coach: '朝珺', startTime: '2026-04-20 12:10', endTime: '2026-04-20 13:10', campus: 'shunyi_mapo', status: '已取消' }
];
const reminderCandidates = rules.collectCourseReminderCandidates(reminderRows, new Date('2026-04-20 10:00:00'));
assert.deepStrictEqual(
  reminderCandidates.map(x => [x.schedule.id, x.crossCampus]),
  [['delayed-edge', false], ['due-cross', true], ['early-edge', false]],
  'course reminder helper should use a 90-150 minute safety window and flag cross-campus travel'
);

assert.strictEqual(
  rules.collectCourseReminderCandidates([
    { id: 'prev-legacy-mapo', coach: '朝珺', startTime: '2026-04-20 09:30', endTime: '2026-04-20 10:30', campus: legacyMapoCode, status: '已排课' },
    { id: 'due-standard-mapo', coach: '朝珺', startTime: '2026-04-20 12:00', endTime: '2026-04-20 13:00', campus: 'shunyi_mapo', status: '已排课' }
  ], new Date('2026-04-20 10:00:00'))[0].crossCampus,
  false,
  'course reminder should not flag legacy and standard Shunyi Mapo values as cross-campus'
);

assert.deepStrictEqual(
  rules.buildCourseReminderSubscribeMessage({
    templateId: 'reminder-tpl',
    openid: 'openid-1',
    schedule: reminderRows.find(row => row.id === 'due-cross'),
    crossCampus: true
  }),
  {
    touser: 'openid-1',
    template_id: 'reminder-tpl',
    page: 'pages/detail/detail?scheduleId=due-cross',
    data: {
      time3: { value: '2026年4月20日 12:00' },
      thing4: { value: 'shunyi 2号场' },
      const7: { value: '私教课' },
      thing2: { value: '朝珺' },
      thing6: { value: '小鹿' }
    }
  },
  'course reminder message should use the selected class reminder template fields'
);

assert.ok(rules.buildOfficialAccountCourseReminderMessage, 'api._test should expose official account course reminder message helper');
assert.deepStrictEqual(
  rules.buildOfficialAccountCourseReminderMessage({
    templateId: 'official-reminder-tpl',
    openid: 'oa-openid-1',
    schedule: reminderRows.find(row => row.id === 'due-cross')
  }),
  {
    touser: 'oa-openid-1',
    template_id: 'official-reminder-tpl',
    miniprogram: {
      appid: 'wx7acb7603ee803923',
      pagepath: 'pages/detail/detail?scheduleId=due-cross'
    },
    data: {
      time3: { value: '2026年4月20日 12:00' },
      thing4: { value: 'shunyi 2号场' },
      const7: { value: '私教课' },
      thing2: { value: '朝珺' },
      thing6: { value: '小鹿' }
    }
  },
  'official account course reminder should jump to the coach mini program'
);

assert.strictEqual(
  rules.buildPreviousCourseFeedbackSummary({
    currentSchedule: { id: 'current', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-04-20 12:00', endTime: '2026-04-20 13:00', status: '已排课' },
    rows: [
      { id: 'older', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-04-10 10:00', endTime: '2026-04-10 11:00', status: '已排课' },
      { id: 'previous', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-04-18 10:00', endTime: '2026-04-18 11:00', status: '已排课' },
      { id: 'other-student', studentId: 'stu-2', studentIds: ['stu-2'], studentName: 'Misha', startTime: '2026-04-19 10:00', endTime: '2026-04-19 11:00', status: '已排课' }
    ],
    feedbacks: [
      { id: 'fb-older', scheduleId: 'older', knowledgePoint: '发球', nextTraining: '步伐' },
      { id: 'fb-previous', scheduleId: 'previous', knowledgePoint: '正手稳定', nextTraining: '练脚步' },
      { id: 'fb-other', scheduleId: 'other-student', knowledgePoint: '截击', nextTraining: '上网' }
    ]
  }),
  '上节：正手稳定，下节练脚步',
  'course reminder should summarize the latest previous feedback for the same student'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountCourseReminderMessage({
    templateId: 'official-reminder-tpl',
    openid: 'oa-openid-1',
    schedule: reminderRows.find(row => row.id === 'due-cross'),
    previousFeedbackSummary: '上节：正手稳定，下节练脚步'
  }),
  {
    touser: 'oa-openid-1',
    template_id: 'official-reminder-tpl',
    miniprogram: {
      appid: 'wx7acb7603ee803923',
      pagepath: 'pages/detail/detail?scheduleId=due-cross'
    },
    data: {
      time3: { value: '2026年4月20日 12:00' },
      thing4: { value: 'shunyi 2号场' },
      const7: { value: '私教课' },
      thing2: { value: '朝珺' },
      thing6: { value: '小鹿｜上节：正手稳定，下节练脚步' }
    }
  },
  'official account course reminder should append previous feedback to the student field and keep current detail jump'
);

const coachFeedbackReminderRows = [
  { id: 'fb-rem-1', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', classId: 'class-1', startTime: '2026-05-01 10:00', endTime: '2026-05-01 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-rem-2', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', classId: 'class-1', startTime: '2026-05-03 10:00', endTime: '2026-05-03 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-rem-3', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', classId: 'class-1', startTime: '2026-05-05 10:00', endTime: '2026-05-05 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-rem-4', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', classId: 'class-1', startTime: '2026-05-07 10:00', endTime: '2026-05-07 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-rem-5', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', classId: 'class-1', startTime: '2026-05-09 10:00', endTime: '2026-05-09 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-plan-1', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-2', studentIds: ['stu-2'], studentName: 'Misha', classId: 'class-2', startTime: '2026-05-02 16:00', endTime: '2026-05-02 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-plan-2', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-2', studentIds: ['stu-2'], studentName: 'Misha', classId: 'class-2', startTime: '2026-05-04 16:00', endTime: '2026-05-04 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-plan-3', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-2', studentIds: ['stu-2'], studentName: 'Misha', classId: 'class-2', startTime: '2026-05-06 16:00', endTime: '2026-05-06 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-plan-4', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-2', studentIds: ['stu-2'], studentName: 'Misha', classId: 'class-2', startTime: '2026-05-08 16:00', endTime: '2026-05-08 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
  { id: 'fb-sent-1', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-3', studentIds: ['stu-3'], studentName: '已提醒', entitlementId: 'ent-3', classId: 'class-3', startTime: '2026-05-10 09:00', endTime: '2026-05-10 10:00', campus: 'shunyi_mapo', venue: '3号场', courseType: '私教课', lessonCount: 1, status: '已排课', coachFeedbackReminderSentAt: '2026-05-10 10:20:00' }
];
const coachFeedbackReminderCandidates = rules.collectCoachFeedbackReminderCandidates({
  rows: coachFeedbackReminderRows,
  feedbacks: [{ id: 'fb-existing', scheduleId: 'fb-rem-4' }],
  entitlements: [
    { id: 'ent-1', studentId: 'stu-1', totalLessons: 10 },
    { id: 'ent-3', studentId: 'stu-3', totalLessons: 1 }
  ],
  plans: [
    { id: 'plan-2', classId: 'class-2', studentId: 'stu-2', totalLessons: 4 }
  ],
  now: new Date('2026-05-12 12:00:00')
});
assert.deepStrictEqual(
  coachFeedbackReminderCandidates.map(item => ({
    id: item.schedule.id,
    lessonNumber: item.triggerLessonNumber,
    lastLesson: item.isLastLesson,
    relationType: item.relationType
  })),
  [
    { id: 'fb-rem-1', lessonNumber: 1, lastLesson: false, relationType: 'entitlement' },
    { id: 'fb-plan-1', lessonNumber: 1, lastLesson: false, relationType: 'plan' },
    { id: 'fb-rem-3', lessonNumber: 3, lastLesson: false, relationType: 'entitlement' },
    { id: 'fb-plan-3', lessonNumber: 3, lastLesson: false, relationType: 'plan' },
    { id: 'fb-plan-4', lessonNumber: null, lastLesson: true, relationType: 'plan' },
    { id: 'fb-rem-5', lessonNumber: 5, lastLesson: false, relationType: 'entitlement' }
  ],
  'coach feedback reminder helper should按 1/3/5/8 循环并补上当前课包或课程关系的最后一节提醒'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountCoachFeedbackReminderMessage({
    templateId: 'official-feedback-tpl',
    openid: 'oa-openid-1',
    schedule: coachFeedbackReminderRows.find(row => row.id === 'fb-rem-5'),
    reminder: coachFeedbackReminderCandidates.find(item => item.schedule.id === 'fb-rem-5')
  }),
  {
    touser: 'oa-openid-1',
    template_id: 'official-feedback-tpl',
    miniprogram: {
      appid: 'wx7acb7603ee803923',
      pagepath: 'pages/schedule/schedule?scheduleId=fb-rem-5&action=feedback'
    },
    data: {
      time3: { value: '2026年5月9日 10:00' },
      thing4: { value: '顺义马坡 1号场' },
      const7: { value: '第5次课' },
      thing2: { value: '请完成课后评价' },
      thing6: { value: '小鹿' }
    }
  },
  'official account feedback reminder should tell the coach which lesson node now needs post-class feedback'
);

const digestCandidates = rules.collectCoachDailyDigestCandidates(
  [
    { id: 'dig-1', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 09:00', endTime: '2026-05-16 10:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
    { id: 'dig-2', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 14:00', endTime: '2026-05-16 15:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '双人课', studentName: 'Misha', status: '已排课' },
    { id: 'dig-3', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 18:00', endTime: '2026-05-16 19:00', campus: 'shunyi_mapo', venue: '3号场', courseType: '私教课', studentName: '已发', status: '已排课', coachDailyDigestSentDate: '2026-05-16' },
    { id: 'dig-4', coachId: 'coach-other', coach: '其他教练', startTime: '2026-05-16 10:00', endTime: '2026-05-16 11:00', campus: 'guowang', venue: '1号场', courseType: '私教课', studentName: '学员B', status: '已排课' },
    { id: 'dig-5', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-17 09:00', endTime: '2026-05-17 10:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', studentName: '后天', status: '已排课' },
    { id: 'dig-6', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 11:00', endTime: '2026-05-16 12:00', campus: 'shunyi_mapo', venue: '4号场', courseType: '私教课', studentName: '取消课', status: '已取消' }
  ],
  new Date('2026-05-15 21:00:00')
);

assert.match(
  rules.buildStudentReminderBindToken(),
  /^[a-f0-9]{48}$/,
  'student reminder bind token should be opaque and random-looking'
);

assert.deepStrictEqual(
  rules.buildStudentReminderLinkUpdate(
    { id: 'stu-1', name: '小鹿', officialAccountBindToken: 'old-token' },
    'new-token',
    '2026-05-27 09:00:00'
  ),
  {
    id: 'stu-1',
    name: '小鹿',
    officialAccountBindToken: 'new-token',
    officialAccountBindTokenCreatedAt: '2026-05-27 09:00:00',
    officialAccountReminderMode: 'all',
    officialAccountReminderCustomHours: 12
  },
  'student reminder link update should store one active binding token and default to 48+24 reminders'
);

assert.deepStrictEqual(
  rules.buildStudentOfficialAccountBoundUpdate(
    { id: 'stu-1', name: '小鹿', officialAccountBindToken: 'token-1', officialAccountReminderMode: 'only24h' },
    'oa-student-openid',
    '2026-05-27 10:00:00'
  ),
  {
    id: 'stu-1',
    name: '小鹿',
    officialAccountBindToken: '',
    officialAccountBindTokenCreatedAt: '',
    officialAccountReminderMode: 'only24h',
    officialAccountReminderCustomHours: 12,
    officialAccountOpenId: 'oa-student-openid',
    officialAccountBoundAt: '2026-05-27 10:00:00'
  },
  'student service account binding should attach openid and consume the one-time token'
);

assert.deepStrictEqual(
  rules.buildStudentOfficialAccountUnboundUpdate(
    { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-student-openid', officialAccountBoundAt: '2026-05-27 10:00:00', officialAccountReminderMode: 'all' }
  ),
  {
    id: 'stu-1',
    name: '小鹿',
    officialAccountOpenId: '',
    officialAccountBoundAt: '',
    officialAccountReminderMode: 'off',
    officialAccountReminderCustomHours: 12
  },
  'student service account unbind should clear openid and stop reminders'
);

assert.strictEqual(rules.normalizeStudentReminderMode('only24h'), 'only24h', 'student reminder mode should keep only24h');
assert.strictEqual(rules.normalizeStudentReminderMode('custom'), 'custom', 'student reminder mode should keep custom');
assert.strictEqual(rules.normalizeStudentReminderMode('off'), 'off', 'student reminder mode should keep off');
assert.strictEqual(rules.normalizeStudentReminderMode('unexpected'), 'all', 'student reminder mode should default to all');
assert.strictEqual(rules.extractOfficialAccountSubscribeStatus({ subscribe: 1 }), true, 'service account user info should mark subscribed users');
assert.strictEqual(rules.extractOfficialAccountSubscribeStatus({ subscribe: 0 }), false, 'service account user info should mark unsubscribed users');
assert.strictEqual(rules.studentReminderStageText('custom12h'), '课前12小时提醒', 'custom student reminder stages should render the configured hour');
assert.deepStrictEqual(
  rules.findStudentReminderBindTarget(
    [
      { id: 'stu-1', name: '小鹿', officialAccountBindToken: '', officialAccountOpenId: 'oa-stu-1' },
      { id: 'stu-2', name: 'Misha', officialAccountBindToken: 'fresh-token', officialAccountOpenId: '' }
    ],
    'used-token',
    'oa-stu-1'
  ),
  { student: { id: 'stu-1', name: '小鹿', officialAccountBindToken: '', officialAccountOpenId: 'oa-stu-1' }, alreadyBound: true },
  'used student bind links should still resolve when the current WeChat is already bound'
);

const studentReminderRows = [
  { id: 'stu-rem-48', startTime: '2026-05-29 10:00', endTime: '2026-05-29 11:30', campus: 'shunyi_mapo', venue: '室内3号场', courseType: '1v1 私教正式课', lessonCount: 1.5, status: '已排课', studentIds: ['stu-1'] },
  { id: 'stu-rem-24', startTime: '2026-05-28 10:00', endTime: '2026-05-28 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课', studentIds: ['stu-1','stu-2'] },
  { id: 'stu-rem-custom', startTime: '2026-05-27 22:00', endTime: '2026-05-27 23:00', campus: 'shunyi_mapo', venue: '5号场', status: '已排课', studentIds: ['stu-4'] },
  { id: 'stu-rem-off', startTime: '2026-05-28 10:00', endTime: '2026-05-28 11:00', campus: 'shunyi_mapo', venue: '2号场', status: '已排课', studentIds: ['stu-3'] },
  { id: 'stu-rem-sent', startTime: '2026-05-28 10:00', endTime: '2026-05-28 11:00', campus: 'shunyi_mapo', venue: '3号场', status: '已排课', studentIds: ['stu-1'], studentReminderLogs: [{ studentId: 'stu-1', stage: '24h', status: 'sent', createdAt: '2026-05-27 09:50:00' }] }
];
const studentReminderStudents = [
  { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-stu-1', officialAccountReminderMode: 'all' },
  { id: 'stu-2', name: 'Misha', officialAccountOpenId: 'oa-stu-2', officialAccountReminderMode: 'only24h' },
  { id: 'stu-3', name: '关闭提醒', officialAccountOpenId: 'oa-stu-3', officialAccountReminderMode: 'off' },
  { id: 'stu-4', name: '自定义提醒', officialAccountOpenId: 'oa-stu-4', officialAccountReminderMode: 'custom', officialAccountReminderCustomHours: 12 }
];
assert.deepStrictEqual(
  rules.collectStudentCourseReminderCandidates(studentReminderRows, studentReminderStudents, new Date('2026-05-27 10:00:00')).map(item => [item.schedule.id, item.student.id, item.stage]).sort(),
  [
    ['stu-rem-48', 'stu-1', '48h'],
    ['stu-rem-24', 'stu-1', '24h'],
    ['stu-rem-24', 'stu-2', '24h'],
    ['stu-rem-custom', 'stu-4', 'custom12h']
  ].sort(),
  'student reminder collector should emit 48h and 24h reminders per bound student without leaking other courses'
);

assert.deepStrictEqual(
  rules.buildStudentCourseReminderMessage({
    templateId: 'student-reminder-tpl',
    openid: 'oa-stu-1',
    schedule: studentReminderRows[0],
    student: studentReminderStudents[0],
    stage: '48h'
  }),
  {
    touser: 'oa-stu-1',
    template_id: 'student-reminder-tpl',
    url: 'https://www.flowtennis.cn/student-reminder-detail?scheduleId=stu-rem-48&studentId=stu-1',
    data: {
      time3: { value: '2026年5月29日 10:00' },
      thing4: { value: '顺义马坡 室内3号场' },
      const7: { value: '1v1 私教正式课' },
      thing2: { value: '课前48小时提醒' },
      thing6: { value: '小鹿 第1.5课时' }
    }
  },
  'student reminder message should use real schedule data and a student-only detail URL'
);

assert.deepStrictEqual(
  digestCandidates.map(item => [item.coachId, item.digestDate, item.lessonCount, item.scheduleIds.join(',')]),
  [
    ['coach-chaojun', '2026-05-16', 2, 'dig-1,dig-2'],
    ['coach-other', '2026-05-16', 1, 'dig-4']
  ],
  'coach daily digest collector should group tomorrow active unsent schedules by coach'
);

assert.deepStrictEqual(
  rules.buildCoachDailyDigestMessage({
    coachName: '朝珺',
    digestDate: '2026-05-16',
    schedules: digestCandidates[0].schedules
  }),
  {
    title: '朝珺教练次日课表',
    summary: '2026-05-16 共 2 节课',
    lines: [
      '09:00-10:00 私教课｜小鹿｜顺义马坡 1号场',
      '14:00-15:00 双人课｜Misha｜顺义马坡 2号场'
    ]
  },
  'coach daily digest message should build a concise next-day schedule summary'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountDigestTemplatePayload({
    templateId: 'digest-tpl',
    openid: 'oa-openid',
    message: {
      title: '明日排课汇总',
      coachName: '朝珺',
      digestDate: '2026-05-16',
      lessonCount: 2,
      lines: [
        '09:00-10:00 私教课｜小鹿｜顺义马坡 1号场',
        '14:00-15:00 双人课｜Misha｜顺义马坡 2号场'
      ]
    }
  }),
  {
    touser: 'oa-openid',
    template_id: 'digest-tpl',
    miniprogram: {
      appid: 'wx7acb7603ee803923',
      pagepath: 'pages/schedule/schedule'
    },
    data: {
      thing1: { value: '明日排课汇总' },
      phrase2: { value: '次日课表' },
      time4: { value: '2026-05-16' },
      thing7: { value: '09:00-10:00 私教课｜小鹿｜顺' },
      character_string11: { value: '2' }
    }
  },
  'official account digest payload should match the selected daily digest template fields'
);

assert.strictEqual(
  rules.buildOfficialAccountDigestTemplatePayload({
    templateId: 'digest-tpl',
    openid: 'oa-openid',
    message: {
      title: 'Siren 教练教练次日课表',
      coachName: 'Siren 教练',
      digestDate: '2026-06-03',
      lessonCount: 6,
      lines: ['12:00-13:00 私教课｜葡萄｜顺义马坡']
    }
  }).data.phrase2.value,
  '次日课表',
  'official account digest phrase field should not contain coach names'
);

assert.deepStrictEqual(
  rules.findFeishuCoachDigestRecipient(
    { coachId: 'coach-chaojun', coachName: '朝珺' },
    {
      users: [
        { id: 'u1', role: 'editor', coachId: 'coach-chaojun', coachName: '朝珺', phone: '13800138000' }
      ],
      coaches: []
    }
  ),
  { coachId: 'coach-chaojun', coachName: '朝珺', openId: '', mobile: '13800138000' },
  'feishu digest recipient should resolve coach mobile from bound backend user'
);

assert.deepStrictEqual(
  rules.buildFeishuCoachDailyDigestText({
    coachName: '朝珺',
    digestDate: '2026-05-16',
    summary: '2026-05-16 共 2 节课',
    lines: [
      '09:00-10:00 私教课｜小鹿｜顺义马坡 1号场',
      '14:00-15:00 双人课｜Misha｜顺义马坡 2号场'
    ]
  }),
  '【FlowTennis 明日排课提醒】\n朝珺教练，2026-05-16 共 2 节课\n1. 09:00-10:00 私教课｜小鹿｜顺义马坡 1号场\n2. 14:00-15:00 双人课｜Misha｜顺义马坡 2号场',
  'feishu digest text should be concise and suitable for private messages'
);

{
  const posterSvg=poster.buildCoachDailyDigestPosterSvg({
    coachId:'coach-chaojun',
    coachName:'朝珺',
    digestDate:'2026-05-20',
    lessonCount:2,
    schedules:[
      { id:'poster-1', startTime:'2026-05-20 09:00', endTime:'2026-05-20 10:00', campus:'shunyi_mapo', venue:'1号场', courseType:'私教课', studentName:'小鹿', studentIds:['stu-1'] },
      { id:'poster-2', startTime:'2026-05-20 14:00', endTime:'2026-05-20 15:30', campus:'shunyi_mapo', venue:'2号场', courseType:'体验课', studentName:'Misha', studentIds:['stu-2','stu-3'] }
    ]
  });
  assert.match(posterSvg, /COACH SCHEDULE/, 'feishu coach poster should keep the Gemini schedule label');
  assert.match(posterSvg, /朝珺/, 'feishu coach poster should render the coach name');
  assert.match(posterSvg, /5 \/ 20/, 'feishu coach poster should render the digest date');
  assert.match(posterSvg, /共计/, 'feishu coach poster should render the summary label');
  assert.match(posterSvg, /网球兄弟 · FLOWTENNIS/, 'feishu coach poster should render the brand footer');
  assert.match(posterSvg, /Misha/, 'feishu coach poster should render real lesson rows');
}

assert.strictEqual(
  rules.resolveOfficialAccountSendMode({
    appId: 'wx-appid',
    secret: '',
    templateId: '',
    forceMock: false
  }),
  'mock',
  'official account send mode should fall back to mock when credentials are missing'
);

assert.strictEqual(
  rules.resolveOfficialAccountSendMode({
    appId: 'wx-appid',
    secret: 'secret',
    templateId: 'tpl',
    forceMock: false
  }),
  'live',
  'official account send mode should use live mode when credentials are complete'
);

{
  const encodingAesKey='abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
  const appId='wx4c76dc29b1d48df3';
  const token='flowtennisoa2026';
  const timestamp='1715763600';
  const nonce='123456';
  const echo='flowtennis-echo-ok';
  const aesKey=Buffer.from(`${encodingAesKey}=`, 'base64');
  const iv=aesKey.subarray(0,16);
  const random16=Buffer.alloc(16, 1);
  const msgBuf=Buffer.from(echo);
  const lenBuf=Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length,0);
  const appIdBuf=Buffer.from(appId);
  let plain=Buffer.concat([random16,lenBuf,msgBuf,appIdBuf]);
  const pad=32-(plain.length%32||32);
  plain=Buffer.concat([plain,Buffer.alloc(pad,pad)]);
  const cipher=crypto.createCipheriv('aes-256-cbc',aesKey,iv);
  cipher.setAutoPadding(false);
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]).toString('base64');
  const signature=rules.buildWechatSignature(token,timestamp,nonce,encrypted);

  assert.deepStrictEqual(
    rules.decryptWechatOfficialAccountMessage(encrypted,encodingAesKey,appId),
    { message: echo, appId },
    'official account decrypt helper should decode the callback echo payload'
  );

  assert.strictEqual(
    rules.resolveOfficialAccountCallbackEcho({
      token,
      timestamp,
      nonce,
      signature,
      encryptedEcho: encrypted,
      encodingAesKey,
      appId
    }),
    echo,
    'official account callback helper should validate signature and return the plain echo'
  );
}

;(async () => {
  assert.strictEqual(
    rules.extractOfficialAccountBindingPhone('#绑定 13800138000'),
    '13800138000',
    'official account binding command should extract a valid coach phone number'
  );

  {
    const result=rules.findOfficialAccountUserByPhone([
      { id:'admin', name:'管理员', role:'admin', status:'active', phone:'13800138000' },
      { id:'coach_1', name:'朝珺', role:'editor', status:'active', phone:'13800138000', coachId:'coach-chaojun', coachName:'朝珺' }
    ],'13800138000');
    assert.strictEqual(result.user?.id,'coach_1','official account binding should prefer the coach account when an admin shares the same phone');
  }

  {
    const result=rules.findOfficialAccountUserByPhone([
      { id:'baiyangj', name:'白杨静', role:'admin', status:'active', phone:'13834673301' }
    ],'13834673301');
    assert.strictEqual(result.user?.id,'baiyangj','official account binding should allow active admin accounts');
  }

  {
    const result=rules.findOfficialAccountUserByPhone([
      { id:'admin', name:'管理员', role:'admin', status:'active', phone:'13800138000' },
      { id:'coach_1', name:'朝珺', role:'editor', status:'active', phone:'', coachId:'coach-chaojun', coachName:'朝珺' }
    ],'13800138000',[
      { id:'coach-chaojun', name:'朝珺', phone:'13800138000', status:'active' }
    ]);
    assert.strictEqual(result.user?.id,'coach_1','official account binding should find the coach account through the linked coach profile phone');
  }

  {
    const rows=[
      { id: 'f-dig-1', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 09:00', endTime: '2026-05-20 10:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
      { id: 'f-dig-2', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 14:00', endTime: '2026-05-20 15:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '双人课', studentName: 'Misha', status: '已排课' }
    ];
    const users=[
      { id: 'coach_1', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', phone: '13800138000' }
    ];
    const calls=[];
    const fetchImpl=async (url,options={})=>{
      calls.push({url:String(url),options});
      if(String(url).includes('/auth/v3/tenant_access_token/internal')){
        return {ok:true,json:async()=>({code:0,tenant_access_token:'tenant-token',expire:7200}),text:async()=>''};
      }
      if(String(url).includes('/contact/v3/users/batch_get_id')){
        return {ok:true,json:async()=>({code:0,data:{user_list:[{mobile:'13800138000',user_id:'ou_coach'}]}}),text:async()=>''};
      }
      if(String(url).includes('/im/v1/images')){
        return {ok:true,json:async()=>({code:0,data:{image_key:'img_coach_schedule'}}),text:async()=>''};
      }
      if(String(url).includes('/im/v1/messages')){
        return {ok:true,json:async()=>({code:0,data:{message_id:'om_1'}}),text:async()=>''};
      }
      throw new Error(`unexpected url ${url}`);
    };
    const writes=[];
    const result=await rules.sendFeishuCoachDailyDigests({
      now: new Date('2026-05-19 20:02:00'),
      rows,
      users,
      coaches: [],
      appId: 'cli_app',
      appSecret: 'secret',
      fetchImpl,
      buildPosterPng: async item => {
        assert.strictEqual(item.coachName, '朝珺', 'feishu coach daily digest should build poster from the coach group');
        return Buffer.from('png-bytes');
      },
      putSchedule: async (id,row) => writes.push([id,row])
    });

    assert.strictEqual(result.sent, 1, 'feishu coach daily digest should private-message once per coach');
    assert.match(calls[1].url, /user_id_type=open_id/, 'feishu mobile lookup should request open_id values');
    assert.deepStrictEqual(JSON.parse(calls[1].options.body), { mobiles: ['13800138000'], include_resigned: false }, 'feishu mobile lookup should use bound coach phones');
    assert.match(calls[2].url, /\/im\/v1\/images/, 'feishu coach daily digest should upload the poster image');
    assert.strictEqual(JSON.parse(calls[3].options.body).receive_id, 'ou_coach', 'feishu private image message should target resolved coach open_id');
    assert.strictEqual(JSON.parse(calls[3].options.body).msg_type, 'image', 'feishu coach daily digest should send an image message');
    assert.deepStrictEqual(JSON.parse(JSON.parse(calls[3].options.body).content), { image_key: 'img_coach_schedule' }, 'feishu image message should use uploaded image_key');
    assert.strictEqual(result.items[0].poster, true, 'feishu coach daily digest result should report poster delivery');
    assert.deepStrictEqual(
      writes.map(item => [item[0], item[1].feishuCoachDailyDigestSentDate]).sort(),
      [['f-dig-1', '2026-05-20'], ['f-dig-2', '2026-05-20']],
      'feishu coach daily digest should mark every schedule in the coach group'
    );
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const now=new Date('2026-05-19 20:02:00');
    const timestamp='1715763720';
    const nonce='123456';
    const query=new URLSearchParams({ timestamp, nonce, signature: rules.buildWechatSignature(token,timestamp,nonce) });
    const users={
      coach_1:{ id: 'coach_1', name: '朝珺', role: 'editor', status: 'active', phone: '13800138000', coachId: 'coach-chaojun', coachName: '朝珺' }
    };
    const result=await rules.processOfficialAccountCallbackRequest({
      query,
      rawBody:`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-openid-123]]></FromUserName><CreateTime>1715763720</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[#绑定 13800138000]]></Content></xml>`,
      loadUsers:async()=>Object.values(users),
      putUser:async(id,user)=>{users[id]=user;},
      now,
      token,
      appId,
      encodingAesKey:''
    });

    assert.strictEqual(result.encrypted, false, 'plain callback should stay in plain mode');
    assert.match(result.plainReply, /绑定成功/, 'binding reply should confirm success');
    assert.strictEqual(users.coach_1.officialAccountOpenId, 'oa-openid-123', 'binding callback should write the service account openid to the matching coach');
    assert.strictEqual(users.coach_1.officialAccountBoundAt, now.toISOString(), 'binding callback should record the bind time');
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const encodingAesKey='abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    const now=new Date('2026-05-19 20:02:00');
    const timestamp='1715763720';
    const nonce='123456';
    const plainIncoming='<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-openid-456]]></FromUserName><CreateTime>1715763720</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[#绑定 13800138001]]></Content></xml>';
    const encryptedIncoming=rules.encryptWechatOfficialAccountMessage(plainIncoming,encodingAesKey,appId);
    const query=new URLSearchParams({ timestamp, nonce, msg_signature: rules.buildWechatSignature(token,timestamp,nonce,encryptedIncoming) });
    const users={
      coach_1:{ id: 'coach_1', name: '朝珺', role: 'editor', status: 'active', phone: '13800138000', coachId: 'coach-chaojun', coachName: '朝珺' },
      coach_2:{ id: 'coach_2', name: '小杨', role: 'editor', status: 'active', phone: '13800138001', coachId: 'coach-xiaoyang', coachName: '小杨' }
    };
    const result=await rules.processOfficialAccountCallbackRequest({
      query,
      rawBody:`<xml><Encrypt><![CDATA[${encryptedIncoming}]]></Encrypt></xml>`,
      loadUsers:async()=>Object.values(users),
      putUser:async(id,user)=>{users[id]=user;},
      now,
      token,
      appId,
      encodingAesKey
    });
    const replyXml=rules.buildWechatOfficialAccountEncryptedReplyXml({
      plainXml:result.plainReply,
      token,
      timestamp,
      nonce,
      encodingAesKey,
      appId
    });
    const replyEncrypted=rules.parseWechatOfficialAccountXml(replyXml).Encrypt;

    assert.strictEqual(result.encrypted, true, 'encrypted callback should stay in encrypted mode');
    assert.strictEqual(users.coach_2.officialAccountOpenId, 'oa-openid-456', 'encrypted callback should bind the matching coach');
    assert.match(
      rules.decryptWechatOfficialAccountMessage(replyEncrypted,encodingAesKey,appId).message,
      /绑定成功/,
      'encrypted callback reply should still say the binding succeeded'
    );
  }

  {
    const rows=[
      { id: 'previous-1', coach: '朝珺', coachId: 'coach-chaojun', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-19 19:00', endTime: '2026-05-19 20:00', campus: 'shunyi_mapo', venue: '1号场', status: '已排课' },
      { id: 'due-1', coach: '朝珺', coachId: 'coach-chaojun', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-19 22:02', endTime: '2026-05-19 23:00', campus: 'shunyi_mapo', venue: '1号场', status: '已排课' }
    ];
    const users=[
      { id: 'coach_1', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-123' }
    ];
    const writes=[];
    const sent=[];
    const reminderNow=new Date('2026-05-19 20:02:00');
    const result=await rules.sendOfficialAccountCourseReminders({
      now: reminderNow,
      rows,
      users,
      feedbacks: [{ id: 'feedback-previous', scheduleId: 'previous-1', knowledgePoint: '正手稳定', nextTraining: '练脚步' }],
      appId: 'wx-appid',
      secret: 'secret',
      templateId: 'tpl',
      forceMock: false,
      sendTemplate: async message => sent.push(message),
      putSchedule: async (id,row) => writes.push([id,row])
    });

    assert.strictEqual(result.sent, 1, 'official account course reminder should send once');
    assert.strictEqual(sent.length, 1, 'official account course reminder should build one outgoing message');
    assert.deepStrictEqual(sent[0].miniprogram, { appid: 'wx-appid', pagepath: 'pages/detail/detail?scheduleId=due-1' }, 'official account course reminder should use mini program jump');
    assert.strictEqual(sent[0].data.thing6.value, '小鹿｜上节：正手稳定，下节练脚步', 'official account course reminder should append previous feedback to the student field');
    assert.strictEqual(writes[0][0], 'due-1', 'official account course reminder should write back to the same schedule');
    assert.strictEqual(writes[0][1].courseReminderSentAt, reminderNow.toISOString(), 'official account course reminder should mark the sent time');
  }

  {
    const rows=[
      { id: 'fb-send-1', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', startTime: '2026-05-01 10:00', endTime: '2026-05-01 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课', coachFeedbackReminderSentAt: '2026-05-01 11:20:00' },
      { id: 'fb-send-2', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', startTime: '2026-05-03 10:00', endTime: '2026-05-03 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' },
      { id: 'fb-send-3', coachId: 'coach-chaojun', coach: '朝珺', studentId: 'stu-1', studentIds: ['stu-1'], studentName: '小鹿', entitlementId: 'ent-1', startTime: '2026-05-05 10:00', endTime: '2026-05-05 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课' }
    ];
    const users=[
      { id: 'coach_1', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-123' }
    ];
    const feedbacks=[
      { id: 'feedback-1', scheduleId: 'fb-send-2' }
    ];
    const entitlements=[
      { id: 'ent-1', studentId: 'stu-1', totalLessons: 10 }
    ];
    const writes=[];
    const sent=[];
    const reminderNow=new Date('2026-05-05 12:00:00');
    const result=await rules.sendOfficialAccountCoachFeedbackReminders({
      now: reminderNow,
      rows,
      users,
      feedbacks,
      entitlements,
      plans: [],
      appId: 'wx-appid',
      secret: 'secret',
      templateId: 'official-feedback-tpl',
      forceMock: false,
      sendTemplate: async message => sent.push(message),
      putSchedule: async (id,row) => writes.push([id,row])
    });

    assert.strictEqual(result.sent, 1, 'official account feedback reminder should send once for the due lesson node');
    assert.strictEqual(sent.length, 1, 'official account feedback reminder should build one outgoing message');
    assert.strictEqual(sent[0].touser, 'oa-openid-123', 'official account feedback reminder should target the bound coach openid');
    assert.deepStrictEqual(
      sent[0].miniprogram,
      { appid: 'wx-appid', pagepath: 'pages/schedule/schedule?scheduleId=fb-send-3&action=feedback' },
      'official account feedback reminder should deep link to the native feedback entry'
    );
    assert.strictEqual(writes[0][0], 'fb-send-3', 'official account feedback reminder should write back to the same schedule');
    assert.strictEqual(writes[0][1].coachFeedbackReminderSentAt, reminderNow.toISOString(), 'official account feedback reminder should mark the sent time');
    assert.strictEqual(writes[0][1].coachFeedbackReminderLessonNumber, 3, 'official account feedback reminder should persist the matched lesson node');
    assert.strictEqual(writes[0][1].coachFeedbackReminderLastLesson, 'false', 'official account feedback reminder should record the non-final-lesson flag');
  }

  {
    const rows=[
      { id: 'student-due-delayed', startTime: '2026-05-28 12:30', endTime: '2026-05-28 13:30', campus: 'shunyi_mapo', venue: '1号场', status: '已排课', studentIds: ['stu-1'] }
    ];
    const students=[
      { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-stu-1', officialAccountReminderMode: 'all' }
    ];
    assert.deepStrictEqual(
      rules.collectStudentCourseReminderCandidates(rows, students, new Date('2026-05-27 13:20:00')).map(item=>[item.schedule.id,item.student.id,item.stage]),
      [['student-due-delayed','stu-1','24h']],
      'student reminders should tolerate delayed cron runs and still send pending 24h reminders'
    );
  }

  {
    const rows=[
      { id: 'student-due-24', startTime: '2026-05-28 10:00', endTime: '2026-05-28 11:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', lessonCount: 1, status: '已排课', studentIds: ['stu-1','stu-2'] }
    ];
    const students=[
      { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-stu-1', officialAccountReminderMode: 'all' },
      { id: 'stu-2', name: 'Misha', officialAccountOpenId: 'oa-stu-2', officialAccountReminderMode: 'only24h' }
    ];
    const writes=[];
    const sent=[];
    const reminderNow=new Date('2026-05-27 10:00:00');
    const result=await rules.sendOfficialAccountStudentCourseReminders({
      now: reminderNow,
      rows,
      students,
      appId: 'wx-appid',
      secret: 'secret',
      templateId: 'student-tpl',
      forceMock: false,
      sendTemplate: async message => sent.push(message),
      putSchedule: async (id,row) => writes.push([id,row])
    });

    assert.strictEqual(result.sent, 2, 'student official account reminders should send once per bound student');
    assert.deepStrictEqual(sent.map(message=>message.touser), ['oa-stu-1','oa-stu-2'], 'student reminders should target each student openid');
    assert.strictEqual(writes.length, 2, 'student reminders should write back after each sent student reminder');
    assert.deepStrictEqual(
      writes[1][1].studentReminderLogs.map(log=>[log.studentId,log.stage,log.status]),
      [['stu-1','24h','sent'],['stu-2','24h','sent']],
      'student reminder logs should keep per-student send records to prevent duplicates'
    );
    assert.strictEqual(writes[1][1].studentReminder24hSentAt, reminderNow.toISOString(), 'student reminder should mark the 24h send time on the schedule');
  }

  {
    const rows=[
      { id: 'dig-1', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 09:00', endTime: '2026-05-20 10:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
      { id: 'dig-2', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 14:00', endTime: '2026-05-20 15:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '双人课', studentName: 'Misha', status: '已排课' },
      { id: 'dig-3', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 18:00', endTime: '2026-05-20 19:00', campus: 'shunyi_mapo', venue: '3号场', courseType: '私教课', studentName: '已发', status: '已排课', coachDailyDigestSentDate: '2026-05-20' }
    ];
    const users=[
      { id: 'coach_1', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-123' }
    ];
    const writes=[];
    const sent=[];
    const digestNow=new Date('2026-05-19 20:02:00');
    const result=await rules.sendOfficialAccountDailyDigests({
      now: digestNow,
      rows,
      users,
      appId: 'wx-appid',
      secret: 'secret',
      templateId: 'tpl',
      forceMock: false,
      sendTemplate: async message => sent.push(message),
      putSchedule: async (id,row) => writes.push([id,row])
    });

    assert.strictEqual(result.sent, 1, 'official account daily digest should send once per coach');
    assert.strictEqual(sent.length, 1, 'official account daily digest should build one outgoing digest');
    assert.deepStrictEqual(
      writes.map(item => [item[0], item[1].coachDailyDigestSentDate]).sort(),
      [['dig-1', '2026-05-20'], ['dig-2', '2026-05-20']],
      'official account daily digest should mark every schedule in the coach group'
    );
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const timestamp='1715763720';
    const nonce='123456';
    const now=new Date(Date.UTC(2026,4,19,10,0,0));
    const users=[
      { id: 'coach_1', name: '朝珺', role: 'editor', status: 'active', phone: '13800138000', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-coach' }
    ];
    const students=[
      { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-openid-stu', officialAccountReminderMode: 'all' }
    ];
    const rows=[
      { id: 'sch-future', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-19 19:00', endTime: '2026-05-19 20:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', status: '已排课' },
      { id: 'sch-past', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-19 16:00', endTime: '2026-05-19 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '私教课', status: '已排课' }
    ];
    const result=await rules.processOfficialAccountCallbackRequest({
      query:new URLSearchParams({ timestamp, nonce, signature: rules.buildWechatSignature(token,timestamp,nonce) }),
      rawBody:`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-openid-coach]]></FromUserName><CreateTime>1715763720</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[查询排课]]></Content></xml>`,
      loadUsers:async()=>users,
      loadStudents:async()=>students,
      loadCoaches:async()=>[],
      loadRows:async()=>rows,
      loadQueryData:async()=>({users,students,coaches:[],rows}),
      loadQuerySession:async()=>null,
      putQuerySession:async()=>{ throw new Error('unexpected query session write'); },
      deleteQuerySession:async()=>{ throw new Error('unexpected query session delete'); },
      now,
      token,
      appId,
      encodingAesKey:''
    });

    assert.match(result.plainReply, /姓名：朝珺/, 'coach schedule reply should show the coach name');
    assert.match(result.plainReply, /身份：教练/, 'coach schedule reply should show the coach role');
    assert.match(result.plainReply, /未来共有 1 节/, 'coach schedule reply should only count future schedules');
    assert.match(result.plainReply, /5月19日 19:00-20:00/, 'coach schedule reply should use Beijing time');
    assert.match(result.plainReply, /学员：小鹿/, 'coach schedule reply should show student names');
    assert.doesNotMatch(result.plainReply, /你的未来排课/, 'coach schedule reply should not include the old heading');
    assert.doesNotMatch(result.plainReply, /16:00-17:00/, 'coach schedule reply should hide past schedules');
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const timestamp='1715763720';
    const nonce='123456';
    const now=new Date(Date.UTC(2026,4,19,10,0,0));
    const users=[
      { id: 'coach_1', name: '朝珺', role: 'editor', status: 'active', phone: '13800138000', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-dual' }
    ];
    const students=[
      { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-openid-dual', officialAccountReminderMode: 'all' }
    ];
    const rows=[
      { id: 'sch-future', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-20 09:00', endTime: '2026-05-20 10:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', status: '已排课' }
    ];
    let storedSession=null;
    let clearedSessionId='';
    const first=await rules.processOfficialAccountCallbackRequest({
      query:new URLSearchParams({ timestamp, nonce, signature: rules.buildWechatSignature(token,timestamp,nonce) }),
      rawBody:`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-openid-dual]]></FromUserName><CreateTime>1715763720</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[明天第一节课]]></Content></xml>`,
      loadUsers:async()=>users,
      loadStudents:async()=>students,
      loadCoaches:async()=>[],
      loadRows:async()=>rows,
      loadQueryData:async()=>({users,students,coaches:[],rows}),
      loadQuerySession:async()=>storedSession,
      putQuerySession:async row=>{ storedSession=row; },
      deleteQuerySession:async id=>{ clearedSessionId=id; storedSession=null; },
      now,
      token,
      appId,
      encodingAesKey:''
    });

    assert.match(first.plainReply, /请回复“教练”或“学员”继续查询。/, 'dual binding should ask the user to choose a role');
    assert.strictEqual(storedSession?.status, 'awaiting_role_choice', 'dual binding should persist a pending choice session');
    assert.strictEqual(storedSession?.query?.kind, 'tomorrow', 'dual binding should remember the original query range');
    assert.strictEqual(storedSession?.query?.mode, 'first', 'dual binding should remember first-class mode');

    const second=await rules.processOfficialAccountCallbackRequest({
      query:new URLSearchParams({ timestamp, nonce, signature: rules.buildWechatSignature(token,timestamp,nonce) }),
      rawBody:`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-openid-dual]]></FromUserName><CreateTime>1715763721</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[学员]]></Content></xml>`,
      loadUsers:async()=>users,
      loadStudents:async()=>students,
      loadCoaches:async()=>[],
      loadRows:async()=>rows,
      loadQueryData:async()=>({users,students,coaches:[],rows}),
      loadQuerySession:async()=>storedSession,
      putQuerySession:async row=>{ storedSession=row; },
      deleteQuerySession:async id=>{ clearedSessionId=id; storedSession=null; },
      now,
      token,
      appId,
      encodingAesKey:''
    });

    assert.match(second.plainReply, /姓名：小鹿/, 'selected student reply should show the student name');
    assert.match(second.plainReply, /身份：学员/, 'selected student reply should show the student role');
    assert.match(second.plainReply, /教练：朝珺/, 'selected student reply should show the coach name');
    assert.match(second.plainReply, /这是你明天最早的一节课：/, 'selected role should keep the original query wording');
    assert.strictEqual(clearedSessionId, 'oa-openid-dual', 'selecting a role should clear the pending query session');
    assert.strictEqual(storedSession, null, 'selecting a role should remove the pending query session');
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const timestamp='1715763720';
    const nonce='123456';
    const now=new Date(Date.UTC(2026,4,19,6,30,0)); // 北京时间 14:30
    const users=[
      { id: 'coach_1', name: '朝珺', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-query-coach' }
    ];
    const students=[
      { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-query-student' },
      { id: 'stu-2', name: 'Misha' }
    ];
    const rows=[
      { id: 'today-past', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-19 09:00', endTime: '2026-05-19 10:00', campus: 'shunyi_mapo', venue: '1号场', courseType: '私教课', status: '已排课' },
      { id: 'today-future', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-2'], studentName: 'Misha', startTime: '2026-05-19 16:00', endTime: '2026-05-19 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '双人课', status: '已排课' },
      { id: 'tomorrow-first', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-20 08:00', endTime: '2026-05-20 09:00', campus: 'guowang', venue: '1号场', courseType: '私教课', status: '已排课' },
      { id: 'tomorrow-second', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-2'], studentName: 'Misha', startTime: '2026-05-20 10:00', endTime: '2026-05-20 11:00', campus: 'shunyi_mapo', venue: '3号场', courseType: '私教课', status: '已排课' },
      { id: 'last-week', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-12 18:00', endTime: '2026-05-12 19:00', campus: 'shunyi_mapo', venue: '4号场', courseType: '私教课', status: '已排课' }
    ];
    const ask=content=>rules.processOfficialAccountCallbackRequest({
      query:new URLSearchParams({ timestamp, nonce, signature: rules.buildWechatSignature(token,timestamp,nonce) }),
      rawBody:`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-query-coach]]></FromUserName><CreateTime>1715763720</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${content}]]></Content></xml>`,
      loadUsers:async()=>users,
      loadStudents:async()=>students,
      loadCoaches:async()=>[],
      loadQueryData:async()=>({users,students,coaches:[],rows}),
      loadQuerySession:async()=>null,
      putQuerySession:async()=>{ throw new Error('unexpected query session write'); },
      deleteQuerySession:async()=>{ throw new Error('unexpected query session delete'); },
      now,
      token,
      appId,
      encodingAesKey:''
    });

    const remaining=await ask('查询今天我有几节课？');
    assert.match(remaining.plainReply, /这是你今天剩下还没上的课：/, 'today count wording should return remaining classes');
    assert.match(remaining.plainReply, /共有 1 节/, 'today remaining should only count future classes today');
    assert.match(remaining.plainReply, /16:00-17:00/, 'today remaining should include later class');
    assert.doesNotMatch(remaining.plainReply, /09:00-10:00/, 'today remaining should hide already finished class');

    const firstTomorrow=await ask('明天第一节是几点');
    assert.match(firstTomorrow.plainReply, /这是你明天最早的一节课：/, 'tomorrow first wording should return the first class');
    assert.match(firstTomorrow.plainReply, /共有 1 节/, 'first-class query should only show one class');
    assert.match(firstTomorrow.plainReply, /5月20日 08:00-09:00/, 'first-class query should show the earliest class');
    assert.doesNotMatch(firstTomorrow.plainReply, /10:00-11:00/, 'first-class query should not show later classes');

    const campus=await ask('麻烦查一下，明天 马坡 排课');
    assert.match(campus.plainReply, /这是你在顺义马坡明天的排课：/, 'campus alias with punctuation and spaces should be recognized');
    assert.match(campus.plainReply, /10:00-11:00/, 'campus query should include matching campus rows');
    assert.doesNotMatch(campus.plainReply, /08:00-09:00/, 'campus query should exclude other campus rows');

    const past=await ask('查询过去七天排课');
    assert.match(past.plainReply, /这是你过去七天的排课：/, 'past query should use past wording');
    assert.match(past.plainReply, /5月12日 18:00-19:00/, 'past query should include previous classes');
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const timestamp='1715763720';
    const nonce='123456';
    const now=new Date(Date.UTC(2026,4,19,6,30,0));
    const users=[
      { id: 'coach_1', name: '朝珺', role: 'editor', coachId: 'coach-chaojun', coachName: '朝珺' }
    ];
    const students=[
      { id: 'stu-1', name: '小鹿', officialAccountOpenId: 'oa-query-student' }
    ];
    const rows=[
      { id: 'student-next', coachId: 'coach-chaojun', coach: '朝珺', studentIds: ['stu-1'], studentName: '小鹿', startTime: '2026-05-19 16:00', endTime: '2026-05-19 17:00', campus: 'shunyi_mapo', venue: '2号场', courseType: '私教课', status: '已排课' }
    ];
    const result=await rules.processOfficialAccountCallbackRequest({
      query:new URLSearchParams({ timestamp, nonce, signature: rules.buildWechatSignature(token,timestamp,nonce) }),
      rawBody:`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[oa-query-student]]></FromUserName><CreateTime>1715763720</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[我下节课在哪？]]></Content></xml>`,
      loadUsers:async()=>users,
      loadStudents:async()=>students,
      loadCoaches:async()=>[],
      loadQueryData:async()=>({users,students,coaches:[],rows}),
      loadQuerySession:async()=>null,
      putQuerySession:async()=>{ throw new Error('unexpected query session write'); },
      deleteQuerySession:async()=>{ throw new Error('unexpected query session delete'); },
      now,
      token,
      appId,
      encodingAesKey:''
    });

    assert.match(result.plainReply, /这是你的下一节课：/, 'student side should support next-class wording');
    assert.match(result.plainReply, /姓名：小鹿/, 'student side should show student name');
    assert.match(result.plainReply, /身份：学员/, 'student side should show student role');
    assert.match(result.plainReply, /教练：朝珺/, 'student side should show coach name');
    assert.match(result.plainReply, /场地：顺义马坡 2号场/, 'student side next-class query should show location');
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

assert.deepStrictEqual(
  rules.scheduleLessonDelta({ classId: 'class-a', lessonCount: 1, status: '已排课' }),
  { classId: 'class-a', delta: 1 },
  'active schedule should consume lessons'
);

assert.deepStrictEqual(
  rules.scheduleLessonDelta({ classId: 'class-a', lessonCount: 1.5, status: '已排课' }),
  { classId: 'class-a', delta: 1.5 },
  'active schedule should preserve fractional lesson counts'
);

assert.strictEqual(
  rules.scheduleLessonDelta({ classId: 'class-a', lessonCount: 1, status: '已取消' }),
  null,
  'cancelled schedule should not consume lessons'
);

assert.strictEqual(
  rules.scheduleLessonDelta({ classId: 'class-a', lessonCount: 1, status: '已排课', coachLateFree: true }),
  null,
  'coach-late free schedule should not consume class lessons'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas({ id: 'sch-late', status: '已排课', coachLateFree: true, entitlementId: 'ent-1', lessonCount: 1 }),
  [],
  'coach-late free schedule should not consume package lessons'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas({ id: 'sch-half', status: '已排课', coachLateFree: false, entitlementId: 'ent-1', lessonCount: 0.5 }),
  [{ entitlementId: 'ent-1', delta: 0.5 }],
  'active schedule should preserve fractional package deductions'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas({ id: 'sch-small-two-hours', status: '已排课', courseType: '小班课', entitlementId: 'ent-small-1', lessonCount: 2 }),
  [{ entitlementId: 'ent-small-1', delta: 1 }],
  'small group package schedules should consume one package count regardless of lesson hours'
);

assert.deepStrictEqual(
  rules.resolveScheduleEntitlementDeltas({
    id: 'sch-small-auto',
    status: '已排课',
    courseType: '小班课',
    lessonCount: 3,
    studentIds: ['stu-small-1', 'stu-small-2']
  }, [
    { id: 'ent-small-auto-1', studentId: 'stu-small-1', status: 'active', courseType: '小班课', totalLessons: 6, remainingLessons: 1 },
    { id: 'ent-small-auto-2', studentId: 'stu-small-2', status: 'active', courseType: '小班课', totalLessons: 6, remainingLessons: 1 }
  ]),
  [
    { studentId: 'stu-small-1', entitlementId: 'ent-small-auto-1', delta: 1 },
    { studentId: 'stu-small-2', entitlementId: 'ent-small-auto-2', delta: 1 }
  ],
  'small group package recommendation should allow one remaining count for multi-hour schedules'
);

assert.deepStrictEqual(
  rules.resolveScheduleEntitlementDeltas({
    id: 'sch-small-mixed-single-dropin',
    status: '已排课',
    courseType: '小班课',
    smallClassType: 'dropin',
    lessonCount: 2,
    studentIds: ['stu-dropin-1', 'stu-dropin-2', 'stu-dropin-3', 'stu-single-1'],
    expectedStudentIds: ['stu-dropin-1', 'stu-dropin-2', 'stu-dropin-3', 'stu-single-1']
  }, [
    { id: 'ent-dropin-1', studentId: 'stu-dropin-1', status: 'active', courseType: '小班课', smallClassType: 'dropin', totalLessons: 6, remainingLessons: 3 },
    { id: 'ent-dropin-2', studentId: 'stu-dropin-2', status: 'active', courseType: '小班课', smallClassType: 'dropin', totalLessons: 6, remainingLessons: 3 },
    { id: 'ent-dropin-3', studentId: 'stu-dropin-3', status: 'active', courseType: '小班课', smallClassType: 'dropin', totalLessons: 6, remainingLessons: 3 },
    { id: 'ent-single-1', studentId: 'stu-single-1', status: 'active', courseType: '小班课', smallClassType: 'single', totalLessons: 1, remainingLessons: 1 }
  ]),
  [
    { studentId: 'stu-dropin-1', entitlementId: 'ent-dropin-1', delta: 1 },
    { studentId: 'stu-dropin-2', entitlementId: 'ent-dropin-2', delta: 1 },
    { studentId: 'stu-dropin-3', entitlementId: 'ent-dropin-3', delta: 1 },
    { studentId: 'stu-single-1', entitlementId: 'ent-single-1', delta: 1 }
  ],
  'small group drop-in schedule should allow each student to consume their own single or drop-in package'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(
    { id: 'ent-bootcamp-mismatch', studentId: 'stu-1', status: 'active', courseType: '小班课', smallClassType: 'single', totalLessons: 1, remainingLessons: 1 },
    { id: 'sch-bootcamp-mismatch', status: '已排课', courseType: '小班课', smallClassType: 'bootcamp', studentIds: ['stu-1'], lessonCount: 1 }
  ),
  /小班课类型不匹配/,
  'small group bootcamp schedules should not mix with single or drop-in packages'
);

assert.throws(
  () => rules.resolveScheduleEntitlementDeltas({
    id: 'sch-small-missing-package',
    status: '已排课',
    courseType: '小班课',
    smallClassType: 'dropin',
    lessonCount: 2,
    studentIds: ['stu-has-package', 'stu-missing-package'],
    expectedStudentIds: ['stu-has-package', 'stu-missing-package']
  }, [
    { id: 'ent-has-package', studentId: 'stu-has-package', status: 'active', courseType: '小班课', smallClassType: 'dropin', totalLessons: 6, remainingLessons: 3 }
  ]),
  /有学员没有可用课包/,
  'package-settled small group schedules should not silently save when an attendee has no matching package'
);

assert.strictEqual(
  rules.smallGroupLessonCountForStudentCount(2),
  1,
  'small group two-person lesson should consume one lesson unit'
);

assert.strictEqual(
  rules.smallGroupLessonCountForStudentCount(3),
  1.5,
  'small group three-person lesson should consume one and a half lesson units'
);

assert.strictEqual(
  rules.smallGroupLessonCountForStudentCount(4),
  2,
  'small group four-person lesson should consume two lesson units'
);

assert.throws(
  () => rules.assertSmallGroupScheduleRules({
    courseType: '小班课',
    smallClassType: 'bootcamp',
    studentIds: ['stu-1'],
    expectedStudentIds: ['stu-1', 'stu-2', 'stu-3', 'stu-4'],
    status: '已排课'
  }),
  /小班课至少 2 人到场才能开课/,
  'small group bootcamp should reject opening class with only one attendee'
);

assert.doesNotThrow(
  () => rules.assertSmallGroupScheduleRules({
    courseType: '小班课',
    smallClassType: 'bootcamp',
    studentIds: ['stu-1', 'stu-2'],
    expectedStudentIds: ['stu-1', 'stu-2', 'stu-3'],
    status: '已排课'
  }),
  'small group bootcamp should allow two or more attendees'
);

assert.deepStrictEqual(
  rules.resolveScheduleEntitlementDeltas({
    id: 'sch-small-1',
    status: '已排课',
    courseType: '小班课',
    smallClassType: 'bootcamp',
    lessonCount: 1,
    studentIds: ['stu-1', 'stu-2', 'stu-3'],
    expectedStudentIds: ['stu-1', 'stu-2', 'stu-3', 'stu-4'],
    absentStudentIds: ['stu-4']
  }, [
    { id: 'ent-1', studentId: 'stu-1', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 },
    { id: 'ent-2', studentId: 'stu-2', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 },
    { id: 'ent-3', studentId: 'stu-3', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 },
    { id: 'ent-4', studentId: 'stu-4', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 }
  ]),
  [
    { studentId: 'stu-1', entitlementId: 'ent-1', delta: 1 },
    { studentId: 'stu-2', entitlementId: 'ent-2', delta: 1 },
    { studentId: 'stu-3', entitlementId: 'ent-3', delta: 1 }
  ],
  'first small group bootcamp absence should be free and not consume that student package'
);

assert.deepStrictEqual(
  rules.resolveScheduleEntitlementDeltas({
    id: 'sch-small-2',
    status: '已排课',
    courseType: '小班课',
    smallClassType: 'bootcamp',
    lessonCount: 1,
    studentIds: ['stu-1', 'stu-2', 'stu-3'],
    expectedStudentIds: ['stu-1', 'stu-2', 'stu-3', 'stu-4'],
    absentStudentIds: ['stu-4']
  }, [
    { id: 'ent-1', studentId: 'stu-1', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 },
    { id: 'ent-2', studentId: 'stu-2', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 },
    { id: 'ent-3', studentId: 'stu-3', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 0 },
    { id: 'ent-4', studentId: 'stu-4', status: 'active', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 6, remainingLessons: 6, freeAbsenceLimit: 1, freeAbsenceUsed: 1 }
  ]),
  [
    { studentId: 'stu-1', entitlementId: 'ent-1', delta: 1 },
    { studentId: 'stu-2', entitlementId: 'ent-2', delta: 1 },
    { studentId: 'stu-3', entitlementId: 'ent-3', delta: 1 },
    { studentId: 'stu-4', entitlementId: 'ent-4', delta: 1, absenceCharged: true }
  ],
  'second small group bootcamp absence should consume one package lesson'
);

const fractionalEntitlement = rules.applyEntitlementLessonDelta({ totalLessons: 10, usedLessons: 3.5 }, -1.5);
assert.strictEqual(fractionalEntitlement.totalLessons, 10, 'fractional entitlement total lessons should stay unchanged');
assert.strictEqual(fractionalEntitlement.usedLessons, 5, 'entitlement deltas should preserve fractional used lessons');
assert.strictEqual(fractionalEntitlement.remainingLessons, 5, 'fractional entitlement remaining lessons should stay accurate');
assert.strictEqual(fractionalEntitlement.status, 'active', 'fractional entitlement updates should keep active status when balance remains');

assert.deepStrictEqual(
  rules.normalizeCoachLateInfo({
    coachLateFree: true,
    lateMinutes: '12',
    lateReason: '堵车',
    coachLateFieldFeeAmount: '220',
    coachLateHandledAt: '2026-04-18 12:00:00',
    coachLateHandledBy: '管理员'
  }),
  {
    coachLateFree: true,
    lateMinutes: 12,
    lateReason: '堵车',
    coachLateFieldFeeAmount: 220,
    coachLateHandledAt: '2026-04-18 12:00:00',
    coachLateHandledBy: '管理员'
  },
  'coach late info should normalize settlement fields'
);

assert.deepStrictEqual(
  rules.buildCoachLateSettlementRows([
    { id: 'sch-late', coach: '朝珺', studentName: '张三', startTime: '2026-04-18 16:00', endTime: '2026-04-18 17:00', campus: 'shunyi_mapo', venue: '1号场', coachLateFree: true, lateMinutes: 8, coachLateFieldFeeAmount: 220 },
    { id: 'sch-ok', coach: '朝珺', startTime: '2026-04-18 18:00', endTime: '2026-04-18 19:00', campus: 'shunyi_mapo', venue: '2号场', coachLateFree: false }
  ], '2026-04'),
  [{
    scheduleId: 'sch-late',
    month: '2026-04',
    coach: '朝珺',
    date: '2026-04-18',
    time: '16:00-17:00',
    campus: 'shunyi_mapo',
    venue: '1号场',
    studentName: '张三',
    lateMinutes: 8,
    fieldFeeAmount: 220
  }],
  'coach late settlement should include monthly fee details'
);

assert.strictEqual(
  rules.scheduleNotifyLocation({ campus: 'shunyi_mapo', venue: '1号场' }),
  '顺义马坡 1号场',
  'schedule notification should display campus name instead of internal code'
);

assert.strictEqual(
  rules.buildCoachDailyDigestMessage({
    coachName: 'Siren',
    digestDate: '2026-05-16',
    schedules: [{ startTime: '2026-05-16 14:00', endTime: '2026-05-16 15:00', courseType: '私教课', studentName: 'LKY', campus: 'shunyi_mapo', venue: '1号场' }]
  }).lines[0],
  '14:00-15:00 私教课｜LKY｜顺义马坡 1号场',
  'daily digest should display campus name instead of internal code'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementRequired({ classId: 'class-a', studentIds: ['stu-1'], status: '已排课', lessonCount: 1 }),
  'billable schedule may be saved without binding a package balance record'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementRequired({ classId: 'class-a', entitlementIds: ['ent-1', 'ent-2'], studentIds: ['stu-1', 'stu-2'], expectedStudentIds: ['stu-1', 'stu-2', 'stu-3'], absentStudentIds: ['stu-3'], status: '已排课', lessonCount: 1 }),
  'multi-student class schedule should support checked participants and absent students'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementRequired({ classId: 'class-a', entitlementId: 'ent-1', studentIds: ['stu-1'], status: '已排课', lessonCount: 1 }),
  'single-student billable schedule with entitlement should pass'
);

assert.deepStrictEqual(
  rules.scheduleParticipantSummary({ studentIds: ['stu-1', 'stu-2'], expectedStudentIds: ['stu-1', 'stu-2', 'stu-3'] }),
  { expectedCount: 3, actualCount: 2, absentCount: 1 },
  'schedule participant summary should count actual and absent students'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '2号场',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  /教练.*已有课程/,
  'same coach overlapping time should be rejected'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    []
  ),
  /请选择下课时间/,
  'active schedule should require end time so conflicts can be checked'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '李教练',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  /场地.*已被占用/,
  'same venue overlapping time should be rejected'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new-campus-alias',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '李教练',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old-campus-alias',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: legacyMapoCode,
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  /场地.*已被占用/,
  'same venue conflict should treat legacy and standard Shunyi Mapo values as the same campus'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '李教练',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: 'shunyi_mapo',
      venue: '马坡1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  /场地.*已被占用/,
  'legacy venue names should be normalized before conflict checks'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new-external',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '李教练',
      campus: '__external__',
      venue: '奥森网球中心 · A1',
      locationType: 'external',
      externalVenueName: '奥森网球中心',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old-external',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: '__external__',
      venue: '奥森网球中心 · A1',
      locationType: 'external',
      externalVenueName: '奥森网球中心',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  /场地.*已被占用/,
  'external venues should still participate in venue conflict checks'
);

assert.doesNotThrow(
  () => rules.validateCourtBookingConflicts(
    {
      id: 'companion-new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '陪打教练',
      campus: 'shunyi_mapo',
      venue: '1号场',
      scheduleSource: '订场陪打',
      status: '已排课'
    },
    [{
      id: 'court-1',
      name: '小鹿',
      campus: 'shunyi_mapo',
      history: [{
        id: 'hist-1',
        type: '消费',
        category: '订场',
        date: '2026-04-11',
        campus: 'shunyi_mapo',
        venue: '1号场',
        startTime: '10:00',
        endTime: '12:00'
      }]
    }]
  ),
  'companion schedules created from bookings should not conflict with their own booking rows'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '李教练',
      campus: 'shunyi_mapo',
      venue: '2号场',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  /学员.*已有课程/,
  'same student overlapping time should be rejected'
);

assert.doesNotThrow(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 11:00',
      endTime: '2026-04-11 12:00',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    }]
  ),
  'back-to-back schedules should be allowed'
);

assert.deepStrictEqual(
  rules.collectScheduleRiskWarnings(
    {
      id: 'new',
      startTime: '2026-04-11 10:10',
      endTime: '2026-04-11 11:10',
      coach: '朝珺',
      campus: 'guowang',
      venue: '2号场',
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 09:00',
      endTime: '2026-04-11 10:00',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      status: '已排课'
    }]
  ),
  ['跨校区提醒：朝珺上一节在 顺义马坡，下一节在 国家网球中心，中间仅 10 分钟'],
  'cross-campus schedules less than 60 minutes apart should return a warning'
);

assert.deepStrictEqual(
  rules.collectScheduleRiskWarnings(
    {
      id: 'new-standard-mapo',
      startTime: '2026-04-11 10:10',
      endTime: '2026-04-11 11:10',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '2号场',
      status: '已排课'
    },
    [{
      id: 'old-legacy-mapo',
      startTime: '2026-04-11 09:00',
      endTime: '2026-04-11 10:00',
      coach: '朝珺',
      campus: legacyMapoCode,
      venue: '1号场',
      status: '已排课'
    }]
  ),
  [],
  'schedule risk warning should not treat legacy and standard Shunyi Mapo values as cross-campus'
);

const legacyMapoWarning = rules.collectScheduleRiskWarnings(
  {
    id: 'new-guowang-after-legacy-mapo',
    startTime: '2026-04-11 10:10',
    endTime: '2026-04-11 11:10',
    coach: '朝珺',
    campus: 'guowang',
    venue: '2号场',
    status: '已排课'
  },
  [{
    id: 'old-legacy-mapo-before-guowang',
    startTime: '2026-04-11 09:00',
    endTime: '2026-04-11 10:00',
    coach: '朝珺',
    campus: legacyMapoCode,
    venue: '1号场',
    status: '已排课'
  }]
)[0] || '';
assert.ok(legacyMapoWarning.includes('顺义马坡'), 'cross-campus warning should display the Chinese campus name');
assert.ok(!legacyMapoWarning.includes(legacyMapoCode), 'cross-campus warning should not leak legacy campus code');

assert.strictEqual(rules.normalizeVenue('马坡1号场'), '1号场');
assert.strictEqual(rules.normalizeVenue('4号场'), '4号场');

assert.throws(
  () => rules.assertScheduleEditableAfterFeedback(
    {
      id: 'sch-1',
      studentIds: ['stu-1'],
      studentName: '学员A',
      classId: 'class-1',
      entitlementId: 'ent-1'
    },
    {
      id: 'sch-1',
      studentIds: ['stu-2'],
      studentName: '学员B',
      classId: 'class-1',
      entitlementId: 'ent-1'
    },
    [{ id: 'fb-1', scheduleId: 'sch-1' }]
  ),
  /已有课后反馈/,
  'schedule with feedback should not allow changing linked student'
);

assert.doesNotThrow(
  () => rules.assertScheduleEditableAfterFeedback(
    {
      id: 'sch-1',
      studentIds: ['stu-1'],
      studentName: '学员A',
      classId: 'class-1',
      entitlementId: 'ent-1'
    },
    {
      id: 'sch-1',
      studentIds: ['stu-1'],
      studentName: '学员A',
      classId: 'class-1',
      entitlementId: 'ent-1',
      notes: '调整备注'
    },
    [{ id: 'fb-1', scheduleId: 'sch-1' }]
  ),
  'schedule with feedback can still edit non-linked fields'
);

assert.throws(
  () => rules.assertScheduleEditableAfterFeedback(
    {
      id: 'sch-1',
      studentIds: ['stu-1'],
      studentName: '学员A',
      classId: 'class-1',
      entitlementId: 'ent-1',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      courseType: '私教',
      isTrial: false,
      lessonCount: 1,
      status: '已排课'
    },
    {
      id: 'sch-1',
      studentIds: ['stu-1'],
      studentName: '学员A',
      classId: 'class-1',
      entitlementId: 'ent-1',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      courseType: '私教',
      isTrial: false,
      lessonCount: 1,
      status: '已排课'
    },
    [{ id: 'fb-1', scheduleId: 'sch-1' }]
  ),
  /已有课后反馈/,
  'schedule with feedback should not allow changing time'
);

assert.throws(
  () => rules.assertCanDeleteSchedule('sch-1', [{ id: 'fb-1', scheduleId: 'sch-1' }]),
  /该排课已有课后反馈/,
  'schedule with feedback should not be deletable'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteSchedule('sch-1', [{ id: 'fb-1', scheduleId: 'sch-2' }]),
  'schedule without feedback can be deleted'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteSchedule('sch-1', [], [{ id: 'led-1', scheduleId: 'sch-1', entitlementId: 'ent-1' }]),
  'schedule with entitlement ledger can be deleted after the route restores the package balance'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteSchedule({ id: 'sch-1', status: '已取消' }, [], [{ id: 'led-1', scheduleId: 'sch-1', entitlementId: 'ent-1' }]),
  'cancelled schedule with entitlement ledger can be deleted after refund'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteSchedule({ id: 'sch-1', status: '已排课' }, [], [{ id: 'led-1', scheduleId: 'sch-1', entitlementId: 'ent-1' }]),
  'active schedule with entitlement ledger should be deletable through the route balance rollback'
);

assert.throws(
  () => rules.validateCourtBookingConflicts(
    {
      startTime: '2026-04-11 09:30',
      endTime: '2026-04-11 10:30',
      campus: 'shunyi_mapo',
      venue: '1号场',
      status: '已排课'
    },
    [{
      id: 'court-1',
      name: '订场用户A',
      campus: 'shunyi_mapo',
      history: [{
        type: '消费',
        category: '订场',
        date: '2026-04-11',
        startTime: '09:00',
        endTime: '10:00',
        venue: '1号场',
        amount: 100
      }]
    }]
  ),
  /已被订场用户.*订场用户A.*订场/,
  'court bookings should block schedule venue conflicts'
);

assert.throws(
  () => rules.validateCourtBookingConflicts(
    {
      startTime: '2026-04-11 09:30',
      endTime: '2026-04-11 10:30',
      campus: 'shunyi_mapo',
      venue: '1号场',
      status: '已排课'
    },
    [{
      id: 'court-legacy-campus',
      name: '订场用户B',
      campus: legacyMapoCode,
      history: [{
        type: '消费',
        category: '订场',
        date: '2026-04-11',
        startTime: '09:00',
        endTime: '10:00',
        venue: '1号场',
        amount: 100
      }]
    }]
  ),
  /已被订场用户.*订场用户B.*订场/,
  'court booking conflict should treat legacy and standard Shunyi Mapo values as the same campus'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-14 23:00',
      endTime: '2026-04-15 00:00',
      coach: '朝珺',
      campus: 'shunyi_mapo',
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    []
  ),
  /不能跨天/,
  'schedules should be rejected when start and end time span two dates'
);

console.log('schedule rules tests passed');
