const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(
  source,
  /function clientUserHasFullManagementAccess\(/,
  'frontend should expose a full-management permission helper'
);

assert.match(
  fnBody('clientPageRequiresFullManagementAccess'),
  /finance[\s\S]*operations[\s\S]*weekly-reports[\s\S]*coaches[\s\S]*admin-users[\s\S]*campusmgr/,
  'finance, operations and base settings pages should require full management access'
);

assert.match(
  fnBody('adminMobileNavConfig'),
  /filter\(adminMobileNavGroupVisible\)/,
  'mobile admin navigation should filter modules by page visibility'
);

assert.match(
  fnBody('renderSidebarShell'),
  /clientUserHasFullManagementAccess\(currentUser\)/,
  'desktop sidebar should render finance, operations and base settings only for full-management users'
);

assert.match(
  fnBody('goPage'),
  /clientUserCanOpenManagementPage\(currentUser,pg\)/,
  'direct page switching should block hidden management pages'
);

assert.match(
  fnBody('normalizeCurrentPageForRole'),
  /clientUserCanOpenManagementPage\(currentUser,currentPage\)/,
  'already logged-in users on a hidden page should be moved to an allowed page'
);

assert.match(
  source,
  /const DATA_CACHE_VERSION='2026-09-04-management-page-visibility-v1'/,
  'local dataset cache should be versioned so already logged-in users drop stale cached page data after refresh'
);

console.log('management page visibility tests passed');
