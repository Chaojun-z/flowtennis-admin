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
assert.match(html, /thirdPartySyncStatsCompactCards/, 'sync center should use compact one-row stats cards');
assert.match(html, /third-party-sync-stats-row/, 'sync center stats should stay on one compact row');
assert.match(html, /订场订单[\s\S]*会员资料[\s\S]*接口缺口/, 'sync center should split pulled records by business meaning');
assert.match(html, /待确认[\s\S]*高危异常[\s\S]*重复跳过/, 'sync center should display precheck categories');
assert.match(html, /<th style="width:120px;padding-left:20px">日期<\/th><th style="width:120px">时间段<\/th>/, 'precheck table should split date and time range into separate columns');
assert.match(html, /thirdPartySyncBookingPrechecks/, 'precheck table should default to booking records only');
assert.match(html, /thirdPartySyncMemberProfileNote/, 'sync center should show member profiles as a separate note');
assert.match(html, /会员资料只同步到资料层，不进入订场预检判断/, 'member profile note should explain why profiles are not booking confirmations');
assert.match(html, /第三方用户[\s\S]*第三方备注[\s\S]*金额/, 'sync center should expose operator-facing third party fields');
assert.match(html, /confirmThirdPartySyncItem/, 'sync center should support operation confirmation');
assert.match(html, /runThirdPartySyncImportPlan/, 'sync center should expose import plan preview');
assert.match(html, /runThirdPartySyncImport/, 'sync center should support one-click semi-auto import');
assert.match(html, /手动拉取/, 'manual pull button should make its purpose clear');
assert.match(html, /缺少第三方账号配置/, 'manual pull errors should explain missing third-party account config');
assert.match(html, /thirdPartySyncPullLoading/, 'manual pull should expose a loading state');
assert.match(html, /正在拉取/, 'manual pull button should show progress while waiting');
assert.match(html, /setThirdPartySyncTableTab/, 'sync center should switch long tables through tabs');
assert.match(html, /thirdPartySyncEffectiveBatchId/, 'precheck tab should default to the latest batch instead of all historical batches');
assert.match(html, /同步批次[\s\S]*预检确认[\s\S]*写入回滚[\s\S]*变更报警/, 'sync center should expose four table tabs');
assert.match(html, /写入结果[\s\S]*失败原因/, 'sync center should show import results and failure reasons');
assert.match(html, /第三方变更回看[\s\S]*异常报警/, 'sync center should expose third-party change review and alerts');
assert.match(html, /runThirdPartySyncRollback/, 'sync center should support batch rollback action');
assert.match(html, /回滚影响/, 'sync center should show rollback impact details');
assert.match(html, /稳定自动同步/, 'sync center should label the V3 auto sync capability');
assert.match(html, /third-party-sync-center\.js/, 'index should load sync center page script');

assert.ok(fs.existsSync(workflowPath), 'daily sync workflow should exist');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /cron:\s*'0 16 \* \* \*'/, 'daily sync should run at 00:00 Asia/Shanghai');
assert.match(workflow, /TZ:\s*Asia\/Shanghai/, 'workflow should pin Asia/Shanghai timezone');
assert.match(workflow, /\/api\/cron\/third-party-sync-center/, 'workflow should trigger sync center cron endpoint');
assert.match(workflow, /CRON_SECRET:\s*\$\{\{\s*secrets\.CRON_SECRET\s*\|\|\s*secrets\.FLOWTENNIS_ADMIN_TOKEN\s*\}\}/, 'workflow should reuse existing cron auth fallback');

console.log('third-party sync center view tests passed');
