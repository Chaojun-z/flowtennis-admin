const assert = require('assert');
const api = require('../api/index.js');
const { createPurchaseEntitlementRoutes } = require('../server/purchase-entitlement-routes');

const ownerEntitlement = {
  id: 'ent-boyfriend-gold',
  studentId: 'student-boyfriend',
  studentName: '男朋友',
  packageName: '成人1v1 黄金课包',
  purchaseId: 'purchase-boyfriend-gold',
  status: 'active',
  courseType: '私教课',
  totalLessons: 10,
  remainingLessons: 6,
  maxStudents: 1
};

const legacySchedule = {
  id: 'schedule-legacy-student-id',
  studentId: 'student-yiyi',
  entitlementId: ownerEntitlement.id,
  startTime: '2026-09-20 12:00',
  endTime: '2026-09-20 13:00',
  courseType: '私教课',
  settlementType: 'package',
  lessonCount: 1,
  status: '已排课'
};

const activeAuthorization = {
  id: 'auth-boyfriend-to-yiyi',
  entitlementId: ownerEntitlement.id,
  ownerStudentId: 'student-boyfriend',
  ownerStudentName: '男朋友',
  authorizedStudentId: 'student-yiyi',
  authorizedStudentName: '暴躁壹壹',
  status: 'active',
  validFrom: '2026-09-01',
  validUntil: '2026-09-30'
};

function buildHandler(tables) {
  return createPurchaseEntitlementRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    get: async (table, id) => (tables[table] || []).find(row => row.id === id) || null,
    getCachedScan: async table => tables[table] || [],
    getCachedRow: async (table, id) => (tables[table] || []).find(row => row.id === id) || null,
    getIndexedActiveEntitlementsForStudents: async () => [],
    parseArr: value => Array.isArray(value) ? value : (typeof value === 'string' && value ? JSON.parse(value) : []),
    parseLessonValue: value => Number(value) || 0,
    buildCoachRefs: () => [],
    recommendEntitlements: api._test.recommendEntitlements,
    scheduleEntitlementDeltas: api._test.scheduleEntitlementDeltas,
    T_SCHEDULE: 'ft_schedule',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_ENTITLEMENT_AUTHORIZATIONS: 'ft_entitlement_authorizations',
    T_COACHES: 'ft_coaches',
    T_USERS: 'ft_users'
  });
}

async function recommend(tables, body) {
  const response = {};
  await buildHandler(tables)({
    path: '/entitlements/recommend',
    method: 'POST',
    body,
    user: { role: 'admin', name: '测试运营' },
    query: new URLSearchParams(),
    res: response
  });
  assert.strictEqual(response.status, 200);
  return response.payload;
}

async function run() {
  const baseTables = {
    ft_schedule: [legacySchedule],
    ft_entitlements: [ownerEntitlement],
    ft_entitlement_authorizations: [activeAuthorization],
    ft_coaches: [],
    ft_users: []
  };

  const payload = await recommend(baseTables, {
    scheduleId: legacySchedule.id,
    startTime: legacySchedule.startTime,
    endTime: legacySchedule.endTime,
    courseType: legacySchedule.courseType,
    settlementType: 'package',
    lessonCount: 1
  });
  assert.strictEqual(payload.recommended?.entitlementId, ownerEntitlement.id, '编辑只有旧 studentId 时也必须推荐被授权课包');
  assert.strictEqual(payload.recommended?.usedByStudentId, 'student-yiyi', '推荐结果必须绑定实际上课学员');

  const wrongStudentPayload = await recommend({
    ...baseTables,
    ft_entitlement_authorizations: [{ ...activeAuthorization, authorizedStudentId: 'student-other' }]
  }, {
    scheduleId: legacySchedule.id,
    studentIds: ['student-yiyi'],
    startTime: legacySchedule.startTime,
    endTime: legacySchedule.endTime,
    courseType: legacySchedule.courseType,
    settlementType: 'package',
    lessonCount: 1
  });
  assert.strictEqual(wrongStudentPayload.recommended, null, '授权给错误学员时不能推荐男朋友课包');

  const expiredPayload = await recommend({
    ...baseTables,
    ft_entitlement_authorizations: [{ ...activeAuthorization, validUntil: '2026-09-19' }]
  }, {
    scheduleId: legacySchedule.id,
    startTime: legacySchedule.startTime,
    endTime: legacySchedule.endTime,
    courseType: legacySchedule.courseType,
    settlementType: 'package',
    lessonCount: 1
  });
  assert.strictEqual(expiredPayload.recommended, null, '授权已过期时不能推荐男朋友课包');

  const wrongEntitlementPayload = await recommend({
    ...baseTables,
    ft_entitlement_authorizations: [{ ...activeAuthorization, entitlementId: 'ent-not-exist' }]
  }, {
    scheduleId: legacySchedule.id,
    startTime: legacySchedule.startTime,
    endTime: legacySchedule.endTime,
    courseType: legacySchedule.courseType,
    settlementType: 'package',
    lessonCount: 1
  });
  assert.strictEqual(wrongEntitlementPayload.recommended, null, '授权指向不存在课包时不能推荐其他课包');
}

run()
  .then(() => console.log('legacy studentId entitlement recommendation tests passed'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
