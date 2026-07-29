const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: html } = require('./helpers/read-index-bundle');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'third-party-sync-center.yml');

assert.match(html, /page-third-party-sync/, 'admin app should include third-party sync center page container');
assert.match(html, /第三方同步中心/, 'admin navigation should expose 第三方同步中心');
assert.match(html, /goPage\('third-party-sync'/, 'navigation should route to third-party sync page');
assert.match(html, /thirdPartySyncCenterPage:\(\)=>apiCall\('GET','\/third-party-sync\/overview'\)/, 'state loader should fetch sync center overview');
assert.match(html, /function renderThirdPartySyncCenter\(/, 'sync center page renderer should exist');
assert.match(html, /待确认[\s\S]*高危异常[\s\S]*重复跳过/, 'sync center should display precheck categories');
assert.match(html, /第三方用户[\s\S]*第三方备注[\s\S]*金额/, 'sync center should expose operator-facing third party fields');
assert.match(html, /confirmThirdPartySyncItem/, 'sync center should support operation confirmation');
assert.match(html, /third-party-sync-center\.js/, 'index should load sync center page script');

assert.ok(fs.existsSync(workflowPath), 'daily sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /cron:\s*'0 16 \* \* \*'/, 'daily sync should run at 00:00 Asia/Shanghai');
assert.match(workflow, /TZ:\s*Asia\/Shanghai/, 'workflow should pin Asia/Shanghai timezone');
assert.match(workflow, /\/api\/cron\/third-party-sync-center/, 'workflow should trigger sync center cron endpoint');
assert.match(workflow, /CRON_SECRET:\s*\$\{\{\s*secrets\.CRON_SECRET\s*\|\|\s*secrets\.FLOWTENNIS_ADMIN_TOKEN\s*\}\}/, 'workflow should reuse existing cron auth fallback');

console.log('third-party sync center view tests passed');
