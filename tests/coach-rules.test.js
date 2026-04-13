const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose coach rule helpers');

const renamed = rules.buildCoachRenameUpdates(
  '测试1号教练',
  '测试教练',
  {
    classes: [{ id: 'class-1', coach: '测试1号教练' }, { id: 'class-2', coach: '其他教练' }],
    schedule: [{ id: 'sch-1', coach: '测试1号教练' }],
    plans: [{ id: 'plan-1', coach: '测试1号教练' }],
    users: [{ id: 'user-1', coachName: '测试1号教练' }],
    feedbacks: [{ id: 'fb-1', coach: '测试1号教练' }]
  },
  '2026-04-12T00:00:00.000Z'
);

assert.deepStrictEqual(renamed.classes.map(x => [x.id, x.coach]), [['class-1', '测试教练']]);
assert.deepStrictEqual(renamed.schedule.map(x => [x.id, x.coach]), [['sch-1', '测试教练']]);
assert.deepStrictEqual(renamed.plans.map(x => [x.id, x.coach]), [['plan-1', '测试教练']]);
assert.deepStrictEqual(renamed.users.map(x => [x.id, x.coachName]), [['user-1', '测试教练']]);
assert.deepStrictEqual(renamed.feedbacks.map(x => [x.id, x.coach]), [['fb-1', '测试教练']]);
assert.strictEqual(renamed.classes[0].updatedAt, '2026-04-12T00:00:00.000Z');

assert.deepStrictEqual(
  rules.buildCoachRenameUpdates('测试教练', '测试教练', { classes: [{ id: 'class-1', coach: '测试教练' }] }).classes,
  [],
  'same name should not rewrite references'
);

assert.throws(
  () => rules.assertCanDeleteCoachName('测试教练', {
    classes: [{ id: 'class-1', coach: '测试教练' }],
    schedule: [],
    plans: [],
    users: [],
    feedbacks: []
  }),
  /已有班次、排课、学习计划、账号、反馈、课包或权益关联/,
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
  /课包或权益关联/,
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
  /课包或权益关联/,
  'coach referenced only by package id should not be deletable'
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
  { id: 'coach-user', name: '测试教练', role: 'editor', username: '', coachId: '', coachName: '测试教练' },
  'stale coach token should be refreshed from stored user'
);

console.log('coach rules tests passed');
