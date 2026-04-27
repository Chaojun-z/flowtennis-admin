const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose schedule rule helpers');
assert.ok(rules.effectiveScheduleStatus, 'api._test should expose effective schedule status helper');
assert.ok(rules.scheduleLessonChargeStatus, 'api._test should expose lesson charge status helper');
assert.ok(rules.buildWechatAccessTokenUrl, 'api._test should expose wechat access token helper');
assert.ok(rules.extractWechatAccessToken, 'api._test should expose wechat access token extractor');
assert.ok(rules.findWechatScheduleRecipient, 'api._test should expose schedule recipient finder');
assert.ok(rules.buildScheduleSubscribeMessage, 'api._test should expose schedule subscribe message builder');
assert.ok(rules.collectCourseReminderCandidates, 'api._test should expose course reminder candidate helper');
assert.ok(rules.buildCourseReminderSubscribeMessage, 'api._test should expose course reminder message helper');
assert.ok(rules.assertCanWriteSchedule, 'api._test should expose schedule write permission guard');
assert.ok(rules.buildWorkbenchStats, 'api._test should expose standard workbench stats helper');
assert.ok(rules.resolveWorkbenchState, 'api._test should expose standard workbench state helper');
assert.ok(rules.decorateWorkbenchClasses, 'api._test should expose class contract normalization helper');
assert.ok(rules.decorateWorkbenchStudents, 'api._test should expose student contract normalization helper');
assert.ok(rules.decorateWorkbenchFeedbacks, 'api._test should expose feedback contract normalization helper');
assert.ok(rules.feedbackScopeForSchedule, 'api._test should expose feedback scope helper');
assert.ok(rules.buildFeedbackRecord, 'api._test should expose feedback record builder');
assert.ok(rules.restoreEntitlementsForScheduleEdit, 'api._test should expose edit-mode entitlement restore helper');

assert.strictEqual(
  rules.effectiveScheduleStatus(
    { status: '已排课', endTime: '2026-04-11 10:00' },
    new Date('2026-04-11T10:01:00')
  ),
  '已结束',
  'past active schedule should behave as ended for filtering'
);

assert.strictEqual(
  rules.effectiveScheduleStatus(
    { status: '已下课', endTime: '2026-04-11 10:00' },
    new Date('2026-04-11T10:01:00')
  ),
  '已结束',
  'legacy or user-facing 已下课 status should normalize to ended'
);

assert.strictEqual(
  rules.effectiveScheduleStatus(
    { status: '已取消', endTime: '2026-04-11 10:00' },
    new Date('2026-04-11T10:01:00')
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
    { id: 'sch-1', status: '已取消', entitlementId: 'ent-1', lessonCount: 1 },
    [{ scheduleId: 'sch-1', entitlementId: 'ent-1', lessonDelta: 1 }]
  ),
  '不扣课',
  'cancelled schedule should show no charge'
);

assert.deepStrictEqual(
  rules.restoreEntitlementsForScheduleEdit(
    { id: 'sch-1', status: '已排课', studentIds: ['stu-1'], entitlementId: 'ent-1', lessonCount: 1.5 },
    [{ id: 'ent-1', studentId: 'stu-1', remainingLessons: 0.5, totalLessons: 20, status: 'depleted' }]
  ),
  [{ id: 'ent-1', studentId: 'stu-1', remainingLessons: 2, totalLessons: 20, status: 'active' }],
  'editing a schedule should temporarily restore the already-deducted lesson hours when recommending entitlements'
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
    trialConversionRate: 50
  }),
  {
    monthFinishedLessonUnits: 12,
    weekFinishedLessonUnits: 5,
    todayFinishedLessonUnits: 2,
    monthFeedbackCount: 4,
    pendingFeedbackCount: 3,
    monthTrialLessonCount: 2,
    trialConversionRate: 50
  },
  'workbench stats helper should keep the standard backend contract'
);

assert.deepStrictEqual(
  rules.buildWorkbenchStats({
    now: new Date('2026-04-23T12:00:00+08:00'),
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
    trialConversionRate: 0
  },
  'workbench stats helper should calculate month feedback count from ended schedules with feedback records'
);

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

assert.deepStrictEqual(
  rules.resolveWorkbenchState(
    {
      startTime: '2026-04-21 12:00',
      endTime: '2026-04-21 13:00',
      status: '已排课'
    },
    null,
    new Date('2026-04-21T12:15:00+08:00')
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
    new Date('2026-04-21T12:00:00+08:00')
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
      startTime: '2026-04-21 11:00',
      endTime: '2026-04-21 12:00',
      status: '已排课'
    },
    null,
    new Date('2026-04-21T12:30:00+08:00')
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
  }], new Date('2026-04-21T12:00:00+08:00')),
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
      campus: 'mabao',
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
      thing4: { value: 'mabao 1号场' }
    }
  },
  'schedule subscribe message should build the mini program template payload'
);

assert.deepStrictEqual(
  rules.buildScheduleNotificationUpdate(
    { id: 'sch-notify-1', notifyStatus: '未通知', notificationLogs: [] },
    { sent: true, userId: 'coach-user' },
    'schedule_created',
    '2026-04-20T10:00:00.000Z'
  ),
  {
    notifyStatus: '已通知教练',
    lastNotifyAt: '2026-04-20T10:00:00.000Z',
    lastNotifyError: '',
    notificationLogs: [{
      type: 'schedule_created',
      status: 'sent',
      channel: 'wechat_subscribe',
      targetUserId: 'coach-user',
      reason: '',
      error: '',
      createdAt: '2026-04-20T10:00:00.000Z'
    }]
  },
  'successful schedule notification should create an auditable notification log'
);

assert.deepStrictEqual(
  rules.buildScheduleNotificationUpdate(
    { id: 'sch-notify-2', notifyStatus: '未通知', notificationLogs: [] },
    { skipped: true, reason: 'missing_openid' },
    'schedule_created',
    '2026-04-20T10:05:00.000Z'
  ),
  {
    notifyStatus: '通知失败',
    lastNotifyAt: '2026-04-20T10:05:00.000Z',
    lastNotifyError: 'missing_openid',
    notificationLogs: [{
      type: 'schedule_created',
      status: 'failed',
      channel: 'wechat_subscribe',
      targetUserId: '',
      reason: 'missing_openid',
      error: '',
      createdAt: '2026-04-20T10:05:00.000Z'
    }]
  },
  'skipped schedule notification should still leave a failure reason for traceability'
);

const reminderRows = [
  { id: 'prev-cross', coach: '朝珺', startTime: '2026-04-20 09:00', endTime: '2026-04-20 10:00', campus: 'mabao', venue: '1号场', status: '已排课' },
  { id: 'due-cross', coach: '朝珺', startTime: '2026-04-20 11:00', endTime: '2026-04-20 12:00', campus: 'shunyi', venue: '2号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
  { id: 'too-soon', coach: '朝珺', startTime: '2026-04-20 10:20', endTime: '2026-04-20 11:20', campus: 'mabao', status: '已排课' },
  { id: 'sent', coach: '朝珺', startTime: '2026-04-20 11:05', endTime: '2026-04-20 12:05', campus: 'mabao', status: '已排课', courseReminderSentAt: '2026-04-20T09:50:00.000Z' },
  { id: 'cancelled', coach: '朝珺', startTime: '2026-04-20 11:10', endTime: '2026-04-20 12:10', campus: 'mabao', status: '已取消' }
];
const reminderCandidates = rules.collectCourseReminderCandidates(reminderRows, new Date('2026-04-20T10:00:00+08:00'));
assert.deepStrictEqual(
  reminderCandidates.map(x => [x.schedule.id, x.crossCampus]),
  [['due-cross', true]],
  'course reminder helper should pick unsent active courses starting around one hour later and flag cross-campus travel'
);

assert.deepStrictEqual(
  rules.buildCourseReminderSubscribeMessage({
    templateId: 'reminder-tpl',
    openid: 'openid-1',
    schedule: reminderRows[1],
    crossCampus: true
  }),
  {
    touser: 'openid-1',
    template_id: 'reminder-tpl',
    page: 'pages/detail/detail?scheduleId=due-cross',
    data: {
      thing1: { value: '跨校区，请预留通勤时间' },
      time2: { value: '2026-04-20 11:00' },
      thing3: { value: '小鹿' },
      thing4: { value: '私教课' }
    }
  },
  'course reminder message should use the selected class reminder template fields'
);

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

assert.strictEqual(
  rules.scheduleLessonDelta({ classId: 'class-a', lessonCount: 1, status: '已排课', giftLesson: true }),
  null,
  'gift lesson schedule should not consume class lessons'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas({ id: 'sch-late', status: '已排课', coachLateFree: true, entitlementId: 'ent-1', lessonCount: 1 }),
  [],
  'coach-late free schedule should not consume package lessons'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas({ id: 'sch-gift', status: '已排课', giftLesson: true, entitlementId: 'ent-1', lessonCount: 1 }),
  [],
  'gift lesson schedule should not consume package lessons'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas({ id: 'sch-half', status: '已排课', coachLateFree: false, entitlementId: 'ent-1', lessonCount: 0.5 }),
  [{ entitlementId: 'ent-1', delta: 0.5 }],
  'active schedule should preserve fractional package deductions'
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
    coachLateHandledAt: '2026-04-18T12:00:00.000Z',
    coachLateHandledBy: '管理员'
  }),
  {
    coachLateFree: true,
    lateMinutes: 12,
    lateReason: '堵车',
    coachLateFieldFeeAmount: 220,
    coachLateHandledAt: '2026-04-18T12:00:00.000Z',
    coachLateHandledBy: '管理员'
  },
  'coach late info should normalize settlement fields'
);

assert.deepStrictEqual(
  rules.normalizeGiftLessonInfo({ giftLesson: true }),
  { giftLesson: true },
  'gift lesson info should normalize the dedicated flag'
);

assert.deepStrictEqual(
  rules.buildCoachLateSettlementRows([
    { id: 'sch-late', coach: '朝珺', studentName: '张三', startTime: '2026-04-18 16:00', endTime: '2026-04-18 17:00', campus: 'mabao', venue: '1号场', coachLateFree: true, lateMinutes: 8, coachLateFieldFeeAmount: 220 },
    { id: 'sch-ok', coach: '朝珺', startTime: '2026-04-18 18:00', endTime: '2026-04-18 19:00', campus: 'mabao', venue: '2号场', coachLateFree: false }
  ], '2026-04'),
  [{
    scheduleId: 'sch-late',
    month: '2026-04',
    coach: '朝珺',
    date: '2026-04-18',
    time: '16:00-17:00',
    campus: 'mabao',
    venue: '1号场',
    studentName: '张三',
    lateMinutes: 8,
    fieldFeeAmount: 220
  }],
  'coach late settlement should include monthly fee details'
);

assert.throws(
  () => rules.assertClassSchedulable({ id: 'class-a', status: '已取消' }, { classId: 'class-a', status: '已排课' }),
  /已取消.*不能继续排课/,
  'cancelled class should not allow active schedule'
);

assert.throws(
  () => rules.assertClassSchedulable({ id: 'class-a', status: '已结课' }, { classId: 'class-a', status: '已排课' }),
  /已结课.*不能继续排课/,
  'finished class should not allow active schedule'
);

assert.doesNotThrow(
  () => rules.assertClassSchedulable({ id: 'class-a', status: '已排班' }, { classId: 'class-a', status: '已排课' }),
  'active class should allow active schedule'
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
  () => rules.assertLessonCapacity(
    { id: 'class-a', totalLessons: 10, usedLessons: 10 },
    null,
    { classId: 'class-a', delta: 1 }
  ),
  /剩余课时不足/,
  'over-consuming lessons should be rejected'
);

assert.doesNotThrow(
  () => rules.assertLessonCapacity(
    { id: 'class-a', totalLessons: 10, usedLessons: 10 },
    { classId: 'class-a', delta: 1 },
    { classId: 'class-a', delta: 1 }
  ),
  'editing an already-consumed schedule without increasing lessons should be allowed'
);

assert.throws(
  () => rules.assertLessonCapacity(
    { id: 'class-a', totalLessons: 10, usedLessons: 10 },
    { classId: 'class-a', delta: 1 },
    { classId: 'class-a', delta: 2 }
  ),
  /剩余课时不足/,
  'increasing lesson count should check remaining lessons after subtracting the old count'
);

assert.doesNotThrow(
  () => rules.assertLessonCapacity(
    { id: 'class-a', totalLessons: 10, usedLessons: 10 },
    { classId: 'class-a', delta: 1 },
    null
  ),
  'cancelling a schedule should not require remaining lesson capacity'
);

assert.throws(
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '朝珺',
      campus: 'mabao',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '朝珺',
      campus: 'mabao',
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
      campus: 'mabao',
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
      campus: 'mabao',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: 'mabao',
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
      id: 'new',
      startTime: '2026-04-11 10:30',
      endTime: '2026-04-11 11:30',
      coach: '李教练',
      campus: 'mabao',
      venue: '1号场',
      studentIds: ['stu-2'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: 'mabao',
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
      campus: 'mabao',
      venue: '1号场',
      scheduleSource: '订场陪打',
      status: '已排课'
    },
    [{
      id: 'court-1',
      name: '小鹿',
      campus: 'mabao',
      history: [{
        id: 'hist-1',
        type: '消费',
        category: '订场',
        date: '2026-04-11',
        campus: 'mabao',
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
      campus: 'mabao',
      venue: '2号场',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '王教练',
      campus: 'mabao',
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
      campus: 'mabao',
      venue: '1号场',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    [{
      id: 'old',
      startTime: '2026-04-11 10:00',
      endTime: '2026-04-11 11:00',
      coach: '朝珺',
      campus: 'mabao',
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
      campus: 'mabao',
      venue: '1号场',
      status: '已排课'
    }]
  ),
  ['跨校区提醒：朝珺上一节在 mabao，下一节在 guowang，中间仅 10 分钟'],
  'cross-campus schedules less than 60 minutes apart should return a warning'
);

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
      campus: 'mabao',
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
      campus: 'mabao',
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

assert.throws(
  () => rules.assertCanDeleteSchedule('sch-1', [], [{ id: 'led-1', scheduleId: 'sch-1', entitlementId: 'ent-1' }]),
  /权益消耗记录/,
  'schedule with entitlement ledger should not be deletable'
);

assert.throws(
  () => rules.validateCourtBookingConflicts(
    {
      startTime: '2026-04-11 09:30',
      endTime: '2026-04-11 10:30',
      campus: 'mabao',
      venue: '1号场',
      status: '已排课'
    },
    [{
      id: 'court-1',
      name: '订场用户A',
      campus: 'mabao',
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
  () => rules.validateScheduleConflicts(
    {
      id: 'new',
      startTime: '2026-04-14 23:00',
      endTime: '2026-04-15 00:00',
      coach: '朝珺',
      campus: 'mabao',
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
