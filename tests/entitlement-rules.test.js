const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose entitlement rule helpers');

const pkg = {
  id: 'pkg-1',
  name: '五一私教非黄金课包',
  productId: 'prod-1',
  productName: '成人私教',
  courseType: '私教课',
  price: 1000,
  lessons: 5,
  validDays: 60,
  usageStartDate: '2026-05-01',
  usageEndDate: '2026-07-01',
  dailyTimeWindows: [{ label: '非黄金时段', startTime: '07:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }],
  timeBand: '非黄金时段',
  coachIds: ['coach-1'],
  coachNames: ['朝珺'],
  campusIds: ['mabao'],
  maxStudents: 1
};

const purchase = {
  id: 'pur-1',
  studentId: 'stu-1',
  studentName: '张三',
  purchaseDate: '2026-05-02',
  amountPaid: 1000,
  payMethod: '微信'
};

const entitlement = rules.buildEntitlementFromPurchase(pkg, purchase, { id: 'stu-1', name: '张三' }, 'ent-1', '2026-04-12T00:00:00.000Z');

assert.deepStrictEqual(
  {
    id: entitlement.id,
    studentId: entitlement.studentId,
    packageName: entitlement.packageName,
    courseType: entitlement.courseType,
    totalLessons: entitlement.totalLessons,
    usedLessons: entitlement.usedLessons,
    remainingLessons: entitlement.remainingLessons,
    validFrom: entitlement.validFrom,
    validUntil: entitlement.validUntil,
    timeBand: entitlement.timeBand
  },
  {
    id: 'ent-1',
    studentId: 'stu-1',
    packageName: '五一私教非黄金课包',
    courseType: '私教课',
    totalLessons: 5,
    usedLessons: 0,
    remainingLessons: 5,
    validFrom: '2026-05-02',
    validUntil: '2026-07-01',
    timeBand: '非黄金时段'
  },
  'purchase should create a matching entitlement account'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-1',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'matching non-prime package can be consumed'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-2',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 18:00',
    endTime: '2026-05-04 19:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /不在课包可用时间段/,
  'non-prime package should not be usable during prime time'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-3',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 16:30',
    endTime: '2026-05-04 17:30',
    lessonCount: 1,
    status: '已排课'
  }),
  /不在课包可用时间段/,
  'schedule must fit fully inside one available time window'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-4',
    studentIds: ['stu-1'],
    courseType: '团课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /课程类型不匹配/,
  'private package should not pay for group class'
);

assert.throws(
  () => rules.validateEntitlementForSchedule({ ...entitlement, remainingLessons: 0 }, {
    id: 'sch-5',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /剩余课时不足/,
  'depleted package cannot be consumed'
);

assert.deepStrictEqual(
  rules.recommendEntitlements([
    { ...entitlement, id: 'ent-late', packageName: '六一私教非黄金课包', validUntil: '2026-08-01', remainingLessons: 5 },
    { ...entitlement, id: 'ent-soon', packageName: '五一私教非黄金课包', validUntil: '2026-07-01', remainingLessons: 3 }
  ], {
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }).recommended.id,
  'ent-soon',
  'system should recommend the soonest expiring matching package'
);

assert.strictEqual(
  rules.applyEntitlementLessonDelta({ ...entitlement, usedLessons: 1, remainingLessons: 4 }, -1).remainingLessons,
  3,
  'consume should reduce remaining lessons'
);

assert.strictEqual(
  rules.applyEntitlementLessonDelta({ ...entitlement, usedLessons: 2, remainingLessons: 3 }, 1).remainingLessons,
  4,
  'cancelled schedule should return lessons'
);

console.log('entitlement rules tests passed');
