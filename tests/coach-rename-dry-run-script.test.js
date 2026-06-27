const assert = require('assert');
const dryRun = require('../scripts/dry-run-coach-rename-liuruyang-20260527');

const plan = dryRun.buildCoachRenameDryRunPlan({
  fromName: '刘润扬教练',
  toName: '刘润扬',
  data: {
    coaches: [
      { id: 'coach-good', name: '刘润扬', status: 'active' },
      { id: 'coach-bad', name: '刘润扬教练', status: 'active' }
    ],
    users: [
      { id: 'u-good', role: 'editor', coachId: 'coach-good', coachName: '刘润扬' },
      { id: 'u-bad', role: 'editor', coachId: 'coach-bad', coachName: '刘润扬教练' }
    ],
    schedule: [
      { id: 's1', coachId: 'coach-bad', coach: '刘润扬教练' },
      { id: 's2', coachId: 'coach-good', coach: '刘润扬' }
    ],
    classes: [{ id: 'c1', coachId: 'coach-bad', coach: '刘润扬教练' }],
    plans: [{ id: 'p1', coach: '刘润扬教练' }],
    students: [{ id: 'stu1', primaryCoachId: 'coach-bad', primaryCoach: '刘润扬教练' }],
    feedbacks: [{ id: 'f1', coachId: 'coach-bad', coach: '刘润扬教练' }],
    packages: [
      { id: 'pkg1', ownerCoach: '刘润扬教练', coachIds: ['coach-bad'], coachNames: ['刘润扬教练'] },
      { id: 'pkg-untouched', ownerCoach: '其他教练' }
    ],
    purchases: [
      { id: 'pur1', ownerCoach: '刘润扬教练', allowedCoaches: ['刘润扬教练'], coachIds: ['coach-bad'] },
      { id: 'pur-untouched', ownerCoach: '其他教练' }
    ],
    entitlements: [
      { id: 'ent1', ownerCoach: '刘润扬教练', allowedCoaches: ['刘润扬教练'], coachNames: ['刘润扬教练'] },
      { id: 'ent-untouched', ownerCoach: '其他教练' }
    ]
  },
  now: '2026-05-27 10:00:00'
});

assert.deepStrictEqual(plan.coachRows, {
  keepCoachId: 'coach-good',
  aliasCoachIds: ['coach-bad'],
  duplicateAction: 'delete-alias-coach-row-after-confirmation'
});
assert.strictEqual(plan.counts.users, 1);
assert.strictEqual(plan.counts.schedule, 1);
assert.strictEqual(plan.counts.classes, 1);
assert.strictEqual(plan.counts.plans, 1);
assert.strictEqual(plan.counts.students, 1);
assert.strictEqual(plan.counts.feedbacks, 1);
assert.strictEqual(plan.counts.packages, 1);
assert.strictEqual(plan.counts.purchases, 1);
assert.strictEqual(plan.counts.entitlements, 1);
assert.strictEqual(plan.updates.schedule[0].coach, '刘润扬');
assert.strictEqual(plan.updates.schedule[0].coachId, 'coach-good');
assert.deepStrictEqual(plan.updates.packages[0].coachIds, ['coach-good']);
assert.deepStrictEqual(plan.updates.packages[0].coachNames, ['刘润扬']);
assert.deepStrictEqual(plan.updates.purchases[0].allowedCoaches, ['刘润扬']);

const accountPlan = dryRun.buildCoachAccountNameRepairPlan({
  mappings: [
    { fromName: 'RIVE教练', toUserId: 'rive_tianhao' },
    { fromName: '天昊', toUserId: 'rive_tianhao' },
    { fromName: 'rive', toUserId: 'rive_tianhao' },
    { fromName: '刘润扬教练', toUserId: 'liuruny' }
  ],
  data: {
    coaches: [
      { id: 'coach-rive', name: 'Rive 天昊', status: 'active' },
      { id: 'coach-liu', name: '刘润扬', status: 'active' }
    ],
    users: [
      { id: 'rive_tianhao', role: 'editor', coachId: 'coach-rive', coachName: 'Rive 天昊' },
      { id: 'liuruny', role: 'editor', coachId: 'coach-liu', coachName: '刘润扬' }
    ],
    schedule: [
      { id: 's-rive', coachId: 'RIVE教练', coach: 'RIVE教练' },
      { id: 's-tianhao', coachId: '天昊', coach: '天昊' },
      { id: 's-liu', coachId: '刘润扬教练', coach: '刘润扬教练' },
      { id: 's-ok', coachId: 'coach-rive', coach: 'Rive 天昊' }
    ],
    students: [{ id: 'stu-rive', primaryCoachId: '天昊', primaryCoach: 'rive' }]
  },
  now: '2026-05-28 10:00:00'
});

assert.strictEqual(accountPlan.counts.schedule, 3);
assert.strictEqual(accountPlan.counts.students, 1);
assert.deepStrictEqual(accountPlan.updateIds.schedule, ['s-rive', 's-tianhao', 's-liu']);
assert.deepStrictEqual(accountPlan.updates.schedule.map((row) => [row.id, row.coachId, row.coach]), [
  ['s-rive', 'coach-rive', 'Rive 天昊'],
  ['s-tianhao', 'coach-rive', 'Rive 天昊'],
  ['s-liu', 'coach-liu', '刘润扬']
]);
assert.strictEqual(accountPlan.updates.students[0].primaryCoachId, 'coach-rive');
assert.strictEqual(accountPlan.updates.students[0].primaryCoach, 'Rive 天昊');

console.log('coach rename dry-run script tests passed');
