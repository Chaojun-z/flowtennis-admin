const assert = require('assert');
const { html, appSource: source } = require('./helpers/read-index-bundle');
const coachSidebar = html.match(/<div id="sbCoachView"[\s\S]*?<\/div>\s*<!-- 管理员视角 -->/);
const adminSidebar = html.match(/<div id="sbAdminView">[\s\S]*?<\/div>\s*<\/div>\s*<div class="sb-bottom">/);
assert.ok(coachSidebar, 'coach sidebar should exist');
assert.ok(adminSidebar, 'admin sidebar should exist');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.doesNotMatch(coachSidebar[0], /goPage\('admin-users',this\)[\s\S]*?账号管理/, 'coach sidebar should not expose account management');
assert.match(adminSidebar[0], /goPage\('admin-users',this\)[\s\S]*?账号管理/, 'admin sidebar should expose account management');
assert.match(source, /goPage\('admin-users',this\)[\s\S]*?账号管理/, 'sidebar should provide account management entry');
assert.match(source, /id="page-admin-users"[\s\S]*class="tms-toolbar"/, 'account page should use the shared toolbar shell');
assert.match(source, /id="adminUserSearch"[\s\S]*placeholder="搜索账号、姓名或绑定教练"/, 'account page should provide a search field');
assert.match(source, /<button class="tms-btn tms-btn-primary" onclick="openAdminUserModal\(null\)"/, 'account page should provide add button');
assert.match(source, /id="page-admin-users"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/, 'account page should use the shared table shell');
assert.match(fnBody('renderAdminUsers'), /adminUserTbody/, 'account page should render rows into adminUserTbody');
assert.match(fnBody('renderAdminUsers'), /绑定教练/, 'account rows should show coach binding text');
assert.match(fnBody('renderAdminUsers'), /微信通知/, 'account rows should show wechat notification binding text');
assert.match(fnBody('renderAdminUsers'), /unbindAdminUserWechat/, 'account rows should expose wechat unbind action');
assert.match(fnBody('renderAdminUsers'), /停用|启用/, 'account rows should expose enable and disable actions');
assert.match(fnBody('loadAdminUsers'), /apiCall\('GET','\/admin\/users'\)/, 'account page should load users from admin api');
assert.match(fnBody('openAdminUserModal'), /setCourtModalFrame/, 'account modal should use shared modal shell');
assert.match(fnBody('openAdminUserModal'), /au_id/, 'account modal should include account id field');
assert.match(fnBody('openAdminUserModal'), /au_password/, 'account modal should include password field for create');
assert.match(fnBody('openAdminUserModal'), /au_role/, 'account modal should include role field');
assert.match(fnBody('openAdminUserModal'), /au_coachId/, 'account modal should include coach binding field');
assert.match(fnBody('saveAdminUser'), /\/admin\/create-user/, 'account create should call create-user api');
assert.match(fnBody('saveAdminUser'), /\/admin\/update-user/, 'account edit should call update-user api');
assert.match(fnBody('toggleAdminUserStatus'), /\/admin\/update-user/, 'account status toggle should reuse update-user api');
assert.match(fnBody('toggleAdminUserStatus'), /status/, 'account status toggle should send status field');
assert.match(fnBody('unbindAdminUserWechat'), /clearWechat/, 'wechat unbind should send clearWechat flag');

console.log('admin users page tests passed');
