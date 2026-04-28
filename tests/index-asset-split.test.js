const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /assets\/styles\/base\.css/, 'index.html should load base.css');
assert.match(html, /assets\/styles\/components\.css/, 'index.html should load components.css');
assert.match(html, /assets\/styles\/pages\.css/, 'index.html should load pages.css');
assert.match(html, /assets\/styles\/pages\.css\?v=/, 'index.html should version pages.css to bust stale modal styles');
assert.match(html, /assets\/scripts\/core\/constants\.js/, 'index.html should load constants.js');
assert.match(html, /assets\/scripts\/core\/utils\.js/, 'index.html should load utils.js');
assert.match(html, /assets\/scripts\/core\/api\.js/, 'index.html should load api.js');
assert.match(html, /assets\/scripts\/core\/state\.js/, 'index.html should load state.js');
assert.match(html, /assets\/scripts\/core\/shell\.js/, 'index.html should load shell.js');
assert.match(html, /assets\/scripts\/core\/bootstrap\.js/, 'index.html should load bootstrap.js');
assert.match(html, /assets\/scripts\/pages\/admin-users\.js/, 'index.html should load admin-users page module');
assert.match(html, /assets\/scripts\/pages\/coaches\.js/, 'index.html should load coaches page module');
assert.match(html, /assets\/scripts\/pages\/campusmgr\.js/, 'index.html should load campusmgr page module');
assert.match(html, /assets\/scripts\/pages\/leads\.js/, 'index.html should load leads page module');
assert.match(html, /assets\/scripts\/pages\/classes\.js/, 'index.html should load classes page module');
assert.match(html, /assets\/scripts\/pages\/plans\.js/, 'index.html should load plans page module');
assert.match(html, /assets\/scripts\/pages\/products\.js/, 'index.html should load products page module');
assert.match(html, /assets\/scripts\/pages\/packages\.js/, 'index.html should load packages page module');
assert.match(html, /assets\/scripts\/pages\/purchases\.js/, 'index.html should load purchases page module');
assert.match(html, /assets\/scripts\/pages\/entitlements\.js/, 'index.html should load entitlements page module');
assert.match(html, /assets\/scripts\/pages\/coach-portal\.js/, 'index.html should load coach-portal page module');
assert.match(html, /assets\/scripts\/pages\/coachops\.js/, 'index.html should load coachops page module');
assert.match(html, /assets\/scripts\/pages\/coachops\.js\?v=/, 'index.html should version coachops.js to avoid stale finance behavior');
assert.match(html, /assets\/scripts\/pages\/courts\.js/, 'index.html should load courts page module');
assert.match(html, /assets\/scripts\/pages\/students\.js/, 'index.html should load students page module');
assert.match(html, /assets\/scripts\/pages\/schedule\.js/, 'index.html should load schedule page module');
assert.match(html, /goPage\('leads',this\)[\s\S]*线索池/, 'index.html should render the leads sidebar entry');
assert.match(html, /id="page-leads"/, 'index.html should render the leads page section');
assert.match(html, /assets\/scripts\/pages\/schedule\.js\?v=/, 'index.html should version schedule.js to avoid stale modal behavior');

assert.doesNotMatch(html, /<style>[\s\S]*<\/style>/, 'index.html should no longer keep inline style blocks');
assert.doesNotMatch(html, /<script>[\s\S]*<\/script>/, 'index.html should no longer keep one giant inline script block');

console.log('index asset split tests passed');
