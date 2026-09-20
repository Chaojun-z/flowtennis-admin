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
  source,
  /function clientUserCanAccessWeeklyReports\(/,
  'frontend should expose a Mapo weekly report permission helper'
);

assert.match(
  fnBody('clientPageRequiresFullManagementAccess'),
  /finance[\s\S]*operations[\s\S]*coaches[\s\S]*admin-users[\s\S]*campusmgr/,
  'finance, operations and base settings pages should require full management access'
);

assert.doesNotMatch(
  source,
  /function clientPageRequiresFullManagementAccess\(page\)\{\s*return \[[^\]]*weekly-reports/,
  'weekly reports should use the dedicated Mapo campus permission helper instead of full-management access'
);

assert.match(
  source,
  /const HIDDEN_MANAGEMENT_PAGES=\['operations'\]/,
  'operations dashboard should be globally hidden from the management UI'
);

assert.match(
  fnBody('clientPageIsHiddenManagementView'),
  /HIDDEN_MANAGEMENT_PAGES\.includes/,
  'hidden management page helper should use the explicit hidden page list'
);

assert.match(
  fnBody('clientUserCanOpenManagementPage'),
  /!clientPageIsHiddenManagementView\(page\)/,
  'direct page switching should reject globally hidden management pages before role checks'
);

assert.match(
  fnBody('clientUserCanOpenManagementPage'),
  /page==='weekly-reports'[\s\S]*clientUserCanAccessWeeklyReports\(user\)/,
  'direct page switching should allow weekly reports through the dedicated Mapo campus permission helper'
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
  fnBody('goPage'),
  /weekly-reports[\s\S]*clientUserCanOpenManagementPage\(currentUser,pg\)/,
  'campus-scoped coach accounts should be able to switch to weekly reports'
);

assert.match(
  fnBody('normalizeCurrentPageForRole'),
  /clientUserCanOpenManagementPage\(currentUser,'weekly-reports'\)[\s\S]*weekly-reports/,
  'campus-scoped coach accounts should retain weekly reports as the current page'
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
