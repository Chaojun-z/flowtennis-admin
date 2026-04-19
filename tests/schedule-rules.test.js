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
    page: 'pages/index/index',
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
  rules.scheduleLessonDelta({ classId: 'class-a', lessonCount: 1, status: '已排课' }),
  { classId: 'class-a', delta: 1 },
  'active schedule should consume lessons'
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
