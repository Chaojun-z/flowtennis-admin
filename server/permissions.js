const FEATURE_PERMISSION_KEYS = [
  'match_ops',
  'match_finance',
  'agent_auth_read',
  'agent_lead_read',
  'agent_student_read',
  'agent_schedule_read',
  'agent_reference_read',
  'agent_schedule_write'
];
const ADMIN_DEFAULT_FEATURE_PERMISSIONS = ['match_ops', 'match_finance'];
const OPERATOR_DEFAULT_FEATURE_PERMISSIONS = [
  'agent_auth_read',
  'agent_lead_read',
  'agent_student_read',
  'agent_schedule_read',
  'agent_reference_read'
];
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

function parseList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function uniqueList(value) {
  return [...new Set(parseList(value))];
}

function normalizeRole(role) {
  const value = String(role || '').trim();
  if (value === 'editor') return 'editor';
  if (value === 'operator') return 'operator';
  return 'admin';
}

function normalizeDataScope(value, role, campusIds) {
  const raw = String(value || '').trim();
  if (['all', 'campus', 'coach'].includes(raw)) return role === 'editor' && raw === 'all' ? 'coach' : raw;
  if (role === 'editor') return 'coach';
  if (role === 'operator') return 'campus';
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
  const hasExplicitPermissions = ['featurePermissions', 'permissions', 'matchPermissions', 'matchOps', 'matchFinance']
    .some(key => Object.prototype.hasOwnProperty.call(user, key));
  if (role === 'operator' && !hasExplicitPermissions) OPERATOR_DEFAULT_FEATURE_PERMISSIONS.forEach((item) => permissions.add(item));
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

function userCanAccessWeeklyReports(user) {
  const profile = normalizePermissionProfile(user);
  if (profile.dataScope === 'all') return true;
  return profile.dataScope === 'campus' && userCanAccessCampus(profile, 'shunyi_mapo');
}

module.exports = {
  FEATURE_PERMISSION_KEYS,
  ADMIN_DEFAULT_FEATURE_PERMISSIONS,
  OPERATOR_DEFAULT_FEATURE_PERMISSIONS,
  parseList,
  uniqueList,
  normalizePermissionProfile,
  userCanAccessCampus,
  userCanAccessWeeklyReports,
  userHasFeaturePermission
};
