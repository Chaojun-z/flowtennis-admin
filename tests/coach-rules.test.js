const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose coach rule helpers');

const renamed = rules.buildCoachRenameUpdates(
  '测试1号教练',
  '测试教练',
  {
    classes: [{ id: 'class-1', coach: '测试1号教练', coachId: 'coach-old' }, { id: 'class-2', coach: '其他教练' }],
    schedule: [{ id: 'sch-1', coach: '测试1号教练', coachId: '测试1号教练' }],
    plans: [{ id: 'plan-1', coach: '测试1号教练' }],
    users: [{ id: 'user-1', coachName: '测试1号教练', coachId: 'coach-old' }],
    feedbacks: [{ id: 'fb-1', coach: '测试1号教练' }],
    leads: [{ id: 'lead-1', formalCoach: '测试1号教练' }],
    students: [{ id: 'stu-1', primaryCoach: '测试1号教练', primaryCoachId: 'coach-old' }],
    packages: [{ id: 'pkg-1', ownerCoach: '测试1号教练', coachNames: ['测试1号教练'], coachIds: ['coach-old'] }],
    purchases: [{ id: 'pur-1', ownerCoach: '测试1号教练', allowedCoaches: ['测试1号教练'], coachIds: ['测试1号教练'] }],
    entitlements: [{ id: 'ent-1', ownerCoach: '测试1号教练', allowedCoaches: ['测试1号教练'], coachNames: ['测试1号教练'] }]
  },
  '2026-04-12 00:00:00',
  { oldCoachId: 'coach-old', newCoachId: 'coach-new' }
);

assert.deepStrictEqual(renamed.classes.map(x => [x.id, x.coach]), [['class-1', '测试教练']]);
assert.deepStrictEqual(renamed.schedule.map(x => [x.id, x.coach]), [['sch-1', '测试教练']]);
assert.deepStrictEqual(renamed.plans.map(x => [x.id, x.coach]), [['plan-1', '测试教练']]);
assert.deepStrictEqual(renamed.users.map(x => [x.id, x.coachName]), [['user-1', '测试教练']]);
assert.deepStrictEqual(renamed.feedbacks.map(x => [x.id, x.coach]), [['fb-1', '测试教练']]);
assert.deepStrictEqual(renamed.leads.map(x => [x.id, x.formalCoach]), [['lead-1', '测试教练']]);
assert.deepStrictEqual(renamed.students.map(x => [x.id, x.primaryCoach, x.primaryCoachId]), [['stu-1', '测试教练', 'coach-new']]);
assert.deepStrictEqual(renamed.packages.map(x => [x.id, x.ownerCoach, x.coachNames, x.coachIds]), [['pkg-1', '测试教练', ['测试教练'], ['coach-new']]]);
assert.deepStrictEqual(renamed.purchases.map(x => [x.id, x.ownerCoach, x.allowedCoaches, x.coachIds]), [['pur-1', '测试教练', ['测试教练'], ['coach-new']]]);
assert.deepStrictEqual(renamed.entitlements.map(x => [x.id, x.ownerCoach, x.allowedCoaches, x.coachNames]), [['ent-1', '测试教练', ['测试教练'], ['测试教练']]]);
assert.strictEqual(renamed.classes[0].updatedAt, '2026-04-12 00:00:00');

assert.deepStrictEqual(
  rules.buildCoachRenameUpdates('测试教练', '测试教练', { classes: [{ id: 'class-1', coach: '测试教练' }] }).classes,
  [],
  'same name should not rewrite references'
);

assert.deepStrictEqual(
  rules.buildCoachRenameUpdates('朝珺教练', '朝珺教练', { schedule: [{ id: 'sch-alias', coach: '朝珺', coachId: '朝珺' }] }, '2026-04-12 00:00:00').schedule.map(x => [x.id, x.coach, x.coachId]),
  [['sch-alias', '朝珺教练', '朝珺教练']],
  'saving an already renamed coach should normalize old suffix aliases'
);

assert.throws(
  () => rules.assertCanDeleteCoachName('测试教练', {
    classes: [{ id: 'class-1', coach: '测试教练' }],
    schedule: [],
    plans: [],
    users: [],
    feedbacks: []
  }),
  /班次教练：class-1/,
  'referenced coach should not be deletable'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteCoachName('测试教练', {
    classes: [{ id: 'class-1', coach: '其他教练' }],
    schedule: [],
    plans: [],
    users: [],
    feedbacks: []
  }),
  'unreferenced coach can be deleted'
);

assert.throws(
  () => rules.assertCanDeleteCoachName('测试教练', {
    classes: [],
    schedule: [],
    plans: [],
    users: [],
    feedbacks: [],
    packages: [{ id: 'pkg-1', coachNames: ['测试教练'] }],
    entitlements: []
  }),
  /课包或权益关联：pkg-1/,
  'coach referenced by package name should not be deletable'
);

assert.throws(
  () => rules.assertCanDeleteCoachName('改名后的教练', {
    classes: [],
    schedule: [],
    plans: [],
    users: [],
    feedbacks: [],
    packages: [{ id: 'pkg-2', coachIds: ['coach-1'] }],
    entitlements: []
  }, 'coach-1'),
  /课包或权益关联：pkg-2/,
  'coach referenced only by package id should not be deletable'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteCoachName('小鹿', {
    classes: [],
    schedule: [{ id: 'sch-student-name', coach: '其他教练', studentName: '小鹿' }],
    plans: [],
    users: [],
    feedbacks: [],
    students: [{ id: 'stu-xiaolu', name: '小鹿' }],
    packages: [],
    purchases: [],
    entitlements: []
  }, 'coach-xiaolu'),
  'student name matching a coach name should not block coach deletion'
);

assert.throws(
  () => rules.assertCanDeleteCoachName('小鹿', {
    classes: [],
    schedule: [],
    plans: [],
    users: [{ id: 'shaobaolu', username: 'shaobaolu', role: 'editor', coachId: 'coach-xiaolu', coachName: '小鹿' }],
    feedbacks: [],
    packages: [],
    purchases: [],
    entitlements: []
  }, 'coach-xiaolu'),
  /账号绑定教练：shaobaolu/,
  'coach account binding should block deletion with a clear account name'
);

assert.throws(
  () => rules.assertUniqueCoachName('测试教练', [{ id: 'coach-1', name: ' 测试教练 ' }]),
  /教练姓名已存在/,
  'duplicate coach names should be rejected after trimming'
);

assert.doesNotThrow(
  () => rules.assertUniqueCoachName('测试教练', [{ id: 'coach-1', name: '测试教练' }], 'coach-1'),
  'editing the same coach should not reject its own name'
);

assert.deepStrictEqual(
  rules.mergeStoredAuthUser(
    { id: 'coach-user', name: '测试1号教练', role: 'editor', coachName: '测试1号教练' },
    { id: 'coach-user', name: '测试教练', role: 'editor', coachName: '测试教练' }
  ),
  {
    id: 'coach-user',
    name: '测试教练',
    role: 'editor',
    status: 'active',
    username: '',
    systemType: 'coach',
    dataScope: 'coach',
    campusIds: [],
    coachId: 'coach-user',
    coachName: '测试教练',
    featurePermissions: [],
    permissions: [],
    matchPermissions: []
  },
  'stale coach token should be refreshed from stored user'
);

console.log('coach rules tests passed');
