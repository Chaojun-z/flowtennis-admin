const assert = require('assert');
const permissions = require('../server/permissions');

assert.ok(permissions.normalizePermissionProfile, 'permission module should expose profile normalizer');
assert.ok(permissions.userCanAccessCampus, 'permission module should expose campus access checker');
assert.ok(permissions.userHasFeaturePermission, 'permission module should expose feature permission checker');

assert.deepStrictEqual(
  permissions.normalizePermissionProfile({ id: 'admin', role: 'admin' }),
  {
    role: 'admin',
    systemType: 'management',
    dataScope: 'all',
    campusIds: [],
    coachId: '',
    coachName: '',
    featurePermissions: ['match_ops', 'match_finance']
  },
  'admin users should default to management system, all data, and built-in match permissions'
);

assert.deepStrictEqual(
  permissions.normalizePermissionProfile({
    id: 'mira',
    role: 'admin',
    dataScope: 'campus',
    campusIds: ['mabao', 'mabao', ''],
    matchPermissions: ['match_ops']
  }),
  {
    role: 'admin',
    systemType: 'management',
    dataScope: 'campus',
    campusIds: ['mabao'],
    coachId: '',
    coachName: '',
    featurePermissions: ['match_ops', 'match_finance']
  },
  'campus scoped management users should keep a deduped campus list and admin feature defaults'
);

assert.deepStrictEqual(
  permissions.normalizePermissionProfile({ id: 'coach_1', role: 'editor', coachId: 'coach-a', coachName: 'Siren' }),
  {
    role: 'editor',
    systemType: 'coach',
    dataScope: 'coach',
    campusIds: [],
    coachId: 'coach-a',
    coachName: 'Siren',
    featurePermissions: []
  },
  'coach users should default to coach system and coach data scope'
);

assert.strictEqual(
  permissions.userCanAccessCampus({ role: 'admin', dataScope: 'campus', campusIds: ['mabao'] }, 'mabao'),
  true,
  'campus scoped user should access matching campus'
);

assert.strictEqual(
  permissions.userCanAccessCampus({ role: 'admin', dataScope: 'campus', campusIds: ['mabao'] }, 'shilipu'),
  false,
  'campus scoped user should not access another campus'
);

assert.strictEqual(
  permissions.userCanAccessCampus({ role: 'admin', dataScope: 'all' }, 'shilipu'),
  true,
  'all scoped user should access every campus'
);

assert.strictEqual(
  permissions.userHasFeaturePermission({ role: 'admin' }, 'match_finance'),
  true,
  'admin users should keep match finance permission by default'
);

assert.strictEqual(
  permissions.userHasFeaturePermission({ role: 'editor', matchPermissions: ['match_ops'] }, 'match_ops'),
  true,
  'feature permission helper should read explicit match permissions'
);

console.log('permissions rules tests passed');
