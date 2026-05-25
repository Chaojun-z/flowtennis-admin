const assert = require('assert');
const crypto = require('crypto');
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
assert.ok(rules.buildOfficialAccountBoundUser, 'api._test should expose official account bind helper');
assert.ok(rules.buildOfficialAccountUnboundUser, 'api._test should expose official account unbind helper');
assert.ok(rules.findOfficialAccountScheduleRecipient, 'api._test should expose official account recipient finder');
assert.ok(rules.collectCoachDailyDigestCandidates, 'api._test should expose coach daily digest collector');
assert.ok(rules.buildCoachDailyDigestMessage, 'api._test should expose coach daily digest message builder');
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

assert.deepStrictEqual(
  rules.buildOfficialAccountBoundUser(
    { id: 'coach_1', name: '朝珺', role: 'editor' },
    'oa-openid-1',
    '2026-05-15T09:00:00.000Z'
  ),
  {
    id: 'coach_1',
    name: '朝珺',
    role: 'editor',
    officialAccountOpenId: 'oa-openid-1',
    officialAccountBoundAt: '2026-05-15T09:00:00.000Z'
  },
  'official account bind helper should attach service account openid'
);

assert.deepStrictEqual(
  rules.buildOfficialAccountUnboundUser({
    id: 'coach_1',
    name: '朝珺',
    officialAccountOpenId: 'oa-openid-1',
    officialAccountBoundAt: '2026-05-15T09:00:00.000Z'
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
  { id: 'prev-cross', coach: '朝珺', startTime: '2026-04-20 09:30', endTime: '2026-04-20 10:30', campus: 'mabao', venue: '1号场', status: '已排课' },
  { id: 'too-late', coach: '朝珺', startTime: '2026-04-20 11:20', endTime: '2026-04-20 12:20', campus: 'mabao', status: '已排课' },
  { id: 'delayed-edge', coach: '朝珺', startTime: '2026-04-20 11:35', endTime: '2026-04-20 12:35', campus: 'mabao', status: '已排课' },
  { id: 'due-cross', coach: '朝珺', startTime: '2026-04-20 12:00', endTime: '2026-04-20 13:00', campus: 'shunyi', venue: '2号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
  { id: 'too-soon', coach: '朝珺', startTime: '2026-04-20 10:20', endTime: '2026-04-20 11:20', campus: 'mabao', status: '已排课' },
  { id: 'early-edge', coach: '朝珺', startTime: '2026-04-20 12:29', endTime: '2026-04-20 13:29', campus: 'mabao', status: '已排课' },
  { id: 'too-early', coach: '朝珺', startTime: '2026-04-20 12:40', endTime: '2026-04-20 13:40', campus: 'mabao', status: '已排课' },
  { id: 'sent', coach: '朝珺', startTime: '2026-04-20 12:05', endTime: '2026-04-20 13:05', campus: 'mabao', status: '已排课', courseReminderSentAt: '2026-04-20T09:50:00.000Z' },
  { id: 'cancelled', coach: '朝珺', startTime: '2026-04-20 12:10', endTime: '2026-04-20 13:10', campus: 'mabao', status: '已取消' }
];
const reminderCandidates = rules.collectCourseReminderCandidates(reminderRows, new Date('2026-04-20T10:00:00+08:00'));
assert.deepStrictEqual(
  reminderCandidates.map(x => [x.schedule.id, x.crossCampus]),
  [['delayed-edge', false], ['due-cross', true], ['early-edge', false]],
  'course reminder helper should use a 90-150 minute safety window and flag cross-campus travel'
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
      time3: { value: '12:00-13:00' },
      thing4: { value: 'shunyi 2号场' },
      const7: { value: '私教课' },
      thing2: { value: '朝珺' },
      thing6: { value: '小鹿' }
    }
  },
  'course reminder message should use the selected class reminder template fields'
);

const digestCandidates = rules.collectCoachDailyDigestCandidates(
  [
    { id: 'dig-1', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 09:00', endTime: '2026-05-16 10:00', campus: 'mabao', venue: '1号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
    { id: 'dig-2', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 14:00', endTime: '2026-05-16 15:00', campus: 'mabao', venue: '2号场', courseType: '双人课', studentName: 'Misha', status: '已排课' },
    { id: 'dig-3', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 18:00', endTime: '2026-05-16 19:00', campus: 'mabao', venue: '3号场', courseType: '私教课', studentName: '已发', status: '已排课', coachDailyDigestSentDate: '2026-05-16' },
    { id: 'dig-4', coachId: 'coach-other', coach: '其他教练', startTime: '2026-05-16 10:00', endTime: '2026-05-16 11:00', campus: 'guowang', venue: '1号场', courseType: '私教课', studentName: '学员B', status: '已排课' },
    { id: 'dig-5', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-17 09:00', endTime: '2026-05-17 10:00', campus: 'mabao', venue: '1号场', courseType: '私教课', studentName: '后天', status: '已排课' },
    { id: 'dig-6', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-16 11:00', endTime: '2026-05-16 12:00', campus: 'mabao', venue: '4号场', courseType: '私教课', studentName: '取消课', status: '已取消' }
  ],
  new Date('2026-05-15T21:00:00+08:00')
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
    data: {
      thing1: { value: '明日排课汇总' },
      phrase2: { value: '朝珺' },
      time4: { value: '2026-05-16' },
      thing7: { value: '09:00-10:00 私教课｜小鹿｜顺' },
      character_string11: { value: '2' }
    }
  },
  'official account digest payload should match the selected daily digest template fields'
);

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
      { id:'admin', name:'管理员', role:'admin', status:'active', phone:'13800138000' },
      { id:'coach_1', name:'朝珺', role:'editor', status:'active', phone:'', coachId:'coach-chaojun', coachName:'朝珺' }
    ],'13800138000',[
      { id:'coach-chaojun', name:'朝珺', phone:'13800138000', status:'active' }
    ]);
    assert.strictEqual(result.user?.id,'coach_1','official account binding should find the coach account through the linked coach profile phone');
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const now=new Date('2026-05-19T20:02:00.000Z');
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
    assert.strictEqual(users.coach_1.officialAccountBoundAt, '2026-05-19T20:02:00.000Z', 'binding callback should record the bind time');
  }

  {
    const token='flowtennisoa2026';
    const appId='wx4c76dc29b1d48df3';
    const encodingAesKey='abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    const now=new Date('2026-05-19T20:02:00.000Z');
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
      { id: 'due-1', coach: '朝珺', coachId: 'coach-chaojun', startTime: '2026-05-19 22:02', endTime: '2026-05-19 23:00', campus: 'mabao', venue: '1号场', status: '已排课' }
    ];
    const users=[
      { id: 'coach_1', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-123' }
    ];
    const writes=[];
    const sent=[];
    const reminderNow=new Date('2026-05-19T20:02:00+08:00');
    const result=await rules.sendOfficialAccountCourseReminders({
      now: reminderNow,
      rows,
      users,
      appId: 'wx-appid',
      secret: 'secret',
      templateId: 'tpl',
      forceMock: false,
      sendTemplate: async message => sent.push(message),
      putSchedule: async (id,row) => writes.push([id,row])
    });

    assert.strictEqual(result.sent, 1, 'official account course reminder should send once');
    assert.strictEqual(sent.length, 1, 'official account course reminder should build one outgoing message');
    assert.strictEqual(writes[0][0], 'due-1', 'official account course reminder should write back to the same schedule');
    assert.strictEqual(writes[0][1].courseReminderSentAt, reminderNow.toISOString(), 'official account course reminder should mark the sent time');
  }

  {
    const rows=[
      { id: 'dig-1', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 09:00', endTime: '2026-05-20 10:00', campus: 'mabao', venue: '1号场', courseType: '私教课', studentName: '小鹿', status: '已排课' },
      { id: 'dig-2', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 14:00', endTime: '2026-05-20 15:00', campus: 'mabao', venue: '2号场', courseType: '双人课', studentName: 'Misha', status: '已排课' },
      { id: 'dig-3', coachId: 'coach-chaojun', coach: '朝珺', startTime: '2026-05-20 18:00', endTime: '2026-05-20 19:00', campus: 'mabao', venue: '3号场', courseType: '私教课', studentName: '已发', status: '已排课', coachDailyDigestSentDate: '2026-05-20' }
    ];
    const users=[
      { id: 'coach_1', role: 'editor', status: 'active', coachId: 'coach-chaojun', coachName: '朝珺', officialAccountOpenId: 'oa-openid-123' }
    ];
    const writes=[];
    const sent=[];
    const digestNow=new Date('2026-05-19T20:02:00+08:00');
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

assert.strictEqual(
  rules.scheduleNotifyLocation({ campus: 'mabao', venue: '1号场' }),
  '顺义马坡 1号场',
  'schedule notification should display campus name instead of internal code'
);

assert.strictEqual(
  rules.buildCoachDailyDigestMessage({
    coachName: 'Siren',
    digestDate: '2026-05-16',
    schedules: [{ startTime: '2026-05-16 14:00', endTime: '2026-05-16 15:00', courseType: '私教课', studentName: 'LKY', campus: 'mabao', venue: '1号场' }]
  }).lines[0],
  '14:00-15:00 私教课｜LKY｜顺义马坡 1号场',
  'daily digest should display campus name instead of internal code'
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
  ['跨校区提醒：朝珺上一节在 马坡，下一节在 国家网球中心，中间仅 10 分钟'],
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
