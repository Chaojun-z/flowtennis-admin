const assert = require('assert');
const permissions = require('../server/permissions');
const legacyMapoCode = ['ma', 'bao'].join('');

assert.ok(permissions.normalizePermissionProfile, 'permission module should expose profile normalizer');
assert.ok(permissions.userCanAccessCampus, 'permission module should expose campus access checker');
assert.ok(permissions.userHasFeaturePermission, 'permission module should expose feature permission checker');
assert.ok(permissions.userCanAccessWeeklyReports, 'permission module should expose weekly report access checker');

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
    campusIds: ['shunyi_mapo', 'shunyi_mapo', ''],
    matchPermissions: ['match_ops']
  }),
  {
    role: 'admin',
    systemType: 'management',
    dataScope: 'campus',
    campusIds: ['shunyi_mapo'],
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
  permissions.userCanAccessCampus({ role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] }, 'shunyi_mapo'),
  true,
  'campus scoped user should access matching campus'
);

assert.strictEqual(
  permissions.userCanAccessCampus({ role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] }, 'shilipu'),
  false,
  'campus scoped user should not access another campus'
);

assert.strictEqual(
  permissions.userCanAccessCampus({ role: 'admin', dataScope: 'campus', campusIds: [legacyMapoCode] }, 'shunyi_mapo'),
  true,
  'campus scoped user should treat legacy and standard Shunyi Mapo values as the same campus'
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

assert.strictEqual(
  permissions.userCanAccessWeeklyReports({ role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] }),
  true,
  'Mapo campus scoped management users should access Mapo weekly reports'
);

assert.strictEqual(
  permissions.userCanAccessWeeklyReports({ role: 'admin', dataScope: 'campus', campusIds: ['shilipu'] }),
  false,
  'non-Mapo campus scoped management users should not access Mapo weekly reports'
);

assert.strictEqual(
  permissions.userCanAccessWeeklyReports({ role: 'editor', dataScope: 'campus', campusIds: ['shunyi_mapo'] }),
  false,
  'coach/editor users should not access management weekly reports'
);

console.log('permissions rules tests passed');
