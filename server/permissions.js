const FEATURE_PERMISSION_KEYS = ['match_ops', 'match_finance'];
const ADMIN_DEFAULT_FEATURE_PERMISSIONS = ['match_ops', 'match_finance'];

function parseList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function uniqueList(value) {
  return [...new Set(parseList(value))];
}

const CAMPUS_ALIASES = {
  shunyi_mapo: 'shunyi_mapo',
  '顺义马坡': 'shunyi_mapo',
  '马坡': 'shunyi_mapo'
};
CAMPUS_ALIASES[['ma', 'bao'].join('')] = 'shunyi_mapo';
CAMPUS_ALIASES[['马', '宝'].join('')] = 'shunyi_mapo';
function normalizeCampusValue(value) {
  const raw = String(value || '').trim();
  return CAMPUS_ALIASES[raw] || raw;
}

function normalizeRole(role) {
  return String(role || '').trim() === 'editor' ? 'editor' : 'admin';
}

function normalizeDataScope(value, role, campusIds) {
  const raw = String(value || '').trim();
  if (['all', 'campus', 'coach'].includes(raw)) return role === 'editor' ? 'coach' : raw;
  if (role === 'editor') return 'coach';
  if (campusIds.length) return 'campus';
  return 'all';
}

function normalizeFeaturePermissions(user = {}) {
  const role = normalizeRole(user.role);
  const permissions = new Set([
    ...parseList(user.featurePermissions),
    ...parseList(user.permissions),
    ...parseList(user.matchPermissions)
  ]);
  if (role === 'admin') ADMIN_DEFAULT_FEATURE_PERMISSIONS.forEach((item) => permissions.add(item));
  if (user.matchOps) permissions.add('match_ops');
  if (user.matchFinance) permissions.add('match_finance');
  return FEATURE_PERMISSION_KEYS.filter((item) => permissions.has(item));
}

function normalizePermissionProfile(user = {}) {
  const role = normalizeRole(user.role);
  const campusIds = uniqueList(user.campusIds).map(normalizeCampusValue);
  const dataScope = normalizeDataScope(user.dataScope, role, campusIds);
  return {
    role,
    systemType: role === 'editor' ? 'coach' : 'management',
    dataScope,
    campusIds: dataScope === 'campus' ? campusIds : [],
    coachId: String(user.coachId || '').trim(),
    coachName: String(user.coachName || user.name || '').trim(),
    featurePermissions: normalizeFeaturePermissions({ ...user, role })
  };
}

function userHasFeaturePermission(user, permission) {
  return normalizePermissionProfile(user).featurePermissions.includes(String(permission || '').trim());
}

function userCanAccessCampus(user, campusId) {
  const profile = normalizePermissionProfile(user);
  if (profile.dataScope === 'all') return true;
  if (profile.dataScope !== 'campus') return true;
  const value = normalizeCampusValue(campusId);
  return !!value && profile.campusIds.includes(value);
}

module.exports = {
  FEATURE_PERMISSION_KEYS,
  ADMIN_DEFAULT_FEATURE_PERMISSIONS,
  parseList,
  uniqueList,
  normalizePermissionProfile,
  userCanAccessCampus,
  userHasFeaturePermission
};
