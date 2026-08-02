const assert = require('assert');
const api = require('../api/index.js');
const { validateScheduleConflicts } = require('../server/schedule');
const { createPurchaseEntitlementRoutes } = require('../server/purchase-entitlement-routes');

const rules = api._test;

assert.ok(rules.activeEntitlementAuthorizationForSchedule, 'authorization matcher should be exposed');
assert.ok(rules.entitlementAuthorizedUseContext, 'authorization context helper should be exposed');
assert.ok(rules.scheduleEntitlementUsageContext, 'ledger usage context helper should be exposed');

const ownerEntitlement = {
  id: 'ent-owner',
  studentId: 'student-owner',
  studentName: '哥哥',
  purchaseId: 'purchase-owner',
  packageName: '私教 10 节',
  status: 'active',
  courseType: '私教课',
  totalLessons: 10,
  remainingLessons: 6
};
const authorizedSchedule = {
  id: 'schedule-authorized',
  status: '已排课',
  settlementType: 'package',
  courseType: '私教课',
  lessonCount: 1,
  studentIds: ['student-brother'],
  studentName: '弟弟',
  startTime: '2026-07-24 12:00',
  endTime: '2026-07-24 13:00',
  authorizationId: 'auth-1',
  packageOwnerStudentId: 'student-owner',
  packageOwnerStudentName: '哥哥',
  usedByStudentId: 'student-brother',
  usedByStudentName: '弟弟'
};
const authorization = {
  id: 'auth-1',
  entitlementId: 'ent-owner',
  ownerStudentId: 'student-owner',
  ownerStudentName: '哥哥',
  authorizedStudentId: 'student-brother',
  authorizedStudentName: '弟弟',
  status: 'active',
  validFrom: '2026-07-01',
  validUntil: '2026-07-31'
};

assert.throws(
  () => rules.validateEntitlementForSchedule(ownerEntitlement, authorizedSchedule),
  /课包所属学员不匹配/,
  'student A should not consume student B package without an active authorization'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(ownerEntitlement, authorizedSchedule, { authorizations: [authorization] }),
  'student A should consume student B package when B has authorized A'
);

assert.strictEqual(
  rules.activeEntitlementAuthorizationForSchedule(ownerEntitlement, authorizedSchedule, [authorization])?.id,
  'auth-1',
  'authorization matcher should find the active matching authorization'
);

const recommendation = rules.recommendEntitlements([
  { ...ownerEntitlement, isAuthorizedUse: true, authorizationId: 'auth-1', packageOwnerStudentId: 'student-owner', packageOwnerStudentName: '哥哥', authorizedStudentId: 'student-brother', authorizedStudentName: '弟弟' }
], authorizedSchedule);

assert.strictEqual(recommendation.recommended.entitlementId, 'ent-owner', 'authorized package should be selectable');
assert.strictEqual(recommendation.recommended.studentId, 'student-brother', 'recommended row should belong to the actual learner');
assert.strictEqual(recommendation.recommended.packageOwnerStudentId, 'student-owner', 'recommended row should keep the package owner');

assert.deepStrictEqual(
  rules.scheduleEntitlementUsageContext(ownerEntitlement, authorizedSchedule),
  {
    isAuthorizedUse: true,
    authorizationId: 'auth-1',
    packageOwnerStudentId: 'student-owner',
    packageOwnerStudentName: '哥哥',
    usedByStudentId: 'student-brother',
    usedByStudentName: '弟弟'
  },
  'ledger context should keep both actual learner and package owner'
);

assert.doesNotThrow(
  () => validateScheduleConflicts(
    { id: 's2', status: '已排课', startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', campus: 'shunyi_mapo', venue: '2号场', coach: '教练乙', studentIds: ['student-brother'], allowLinkedVenueConflict: true },
    [{ id: 's1', status: '已排课', startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', campus: 'shunyi_mapo', venue: '2号场', coach: '教练甲', studentIds: ['student-owner'] }],
    's2'
  ),
  'linked schedule should allow same venue at the same time'
);

assert.throws(
  () => validateScheduleConflicts(
    { id: 's3', status: '已排课', startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', campus: 'shunyi_mapo', venue: '2号场', coach: '教练甲', studentIds: ['student-brother'], allowLinkedVenueConflict: true },
    [{ id: 's1', status: '已排课', startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', campus: 'shunyi_mapo', venue: '2号场', coach: '教练甲', studentIds: ['student-owner'] }],
    's3'
  ),
  /教练/,
  'linked schedule must still block same coach conflicts'
);

assert.throws(
  () => validateScheduleConflicts(
    { id: 's4', status: '已排课', startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', campus: 'shunyi_mapo', venue: '2号场', coach: '教练乙', studentIds: ['student-owner'], allowLinkedVenueConflict: true },
    [{ id: 's1', status: '已排课', startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', campus: 'shunyi_mapo', venue: '2号场', coach: '教练甲', studentIds: ['student-owner'] }],
    's4'
  ),
  /学员/,
  'linked schedule must still block same student conflicts'
);

async function runRouteTests(){
  const tables = {
    ft_entitlements: [ownerEntitlement],
    ft_entitlement_authorizations: [authorization],
    ft_coaches: [],
    ft_users: []
  };
  const response = {};
  const handler = createPurchaseEntitlementRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    getCachedScan: async table => tables[table] || [],
    getCachedRow: async (table, id) => (tables[table] || []).find(row => row.id === id) || null,
    getIndexedActiveEntitlementsForStudents: async () => [],
    parseArr: value => Array.isArray(value) ? value : [],
    parseLessonValue: value => Number(value) || 0,
    buildCoachRefs: () => [],
    recommendEntitlements: rules.recommendEntitlements,
    scheduleEntitlementDeltas: rules.scheduleEntitlementDeltas,
    T_ENTITLEMENTS: 'ft_entitlements',
    T_ENTITLEMENT_AUTHORIZATIONS: 'ft_entitlement_authorizations',
    T_COACHES: 'ft_coaches',
    T_USERS: 'ft_users'
  });
  await handler({
    path: '/entitlements/recommend',
    method: 'POST',
    body: { studentIds: ['student-brother'], startTime: '2026-07-24 12:00', endTime: '2026-07-24 13:00', courseType: '私教课', settlementType: 'package', lessonCount: 1 },
    user: { role: 'admin', name: '测试运营' },
    query: new URLSearchParams(),
    res: response
  });
  assert.strictEqual(response.status, 200, 'recommend route should return 200');
  assert.strictEqual(response.payload.recommended.entitlementId, 'ent-owner', 'recommend route should include authorized owner package');
  assert.strictEqual(response.payload.recommended.usedByStudentId, 'student-brother', 'recommend route should mark actual learner');
}

runRouteTests()
  .then(() => console.log('entitlement authorization rule tests passed'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
