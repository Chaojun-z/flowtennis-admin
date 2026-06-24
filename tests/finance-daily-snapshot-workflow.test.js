const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'finance-daily-snapshot.yml');

assert.ok(fs.existsSync(workflowPath), 'finance daily snapshot workflow should exist');

const source = fs.readFileSync(workflowPath, 'utf8');

assert.match(source, /name:\s*Finance Daily Snapshot/, 'workflow should have a clear name');
assert.match(source, /cron:\s*'30 15 \* \* \*'/, 'workflow should run at 23:30 Asia/Shanghai');
assert.match(source, /workflow_dispatch:/, 'workflow should support manual runs');
assert.match(source, /npm ci/, 'workflow should install dependencies from lockfile');
assert.match(source, /npm run snapshot:finance/, 'workflow should run the existing finance snapshot command');
assert.match(source, /TS_ENDPOINT:\s*\$\{\{\s*secrets\.FLOWTENNIS_TS_ENDPOINT\s*\}\}/, 'workflow should read TS_ENDPOINT from GitHub Secrets');
assert.match(source, /TS_INSTANCE:\s*\$\{\{\s*secrets\.FLOWTENNIS_TS_INSTANCE\s*\}\}/, 'workflow should read TS_INSTANCE from GitHub Secrets');
assert.match(source, /ALIBABA_CLOUD_ACCESS_KEY_ID:\s*\$\{\{\s*secrets\.FLOWTENNIS_ALIYUN_ACCESS_KEY_ID\s*\}\}/, 'workflow should expose access key id using the name expected by snapshot script');
assert.match(source, /ALIBABA_CLOUD_ACCESS_KEY_SECRET:\s*\$\{\{\s*secrets\.FLOWTENNIS_ALIYUN_ACCESS_KEY_SECRET\s*\}\}/, 'workflow should expose access key secret using the name expected by snapshot script');
assert.match(source, /FLOWTENNIS_ADMIN_TOKEN:\s*\$\{\{\s*secrets\.FLOWTENNIS_ADMIN_TOKEN\s*\}\}/, 'workflow should pass optional admin bearer token for protected diag checks');
assert.match(source, /FLOWTENNIS_ADMIN_COOKIE:\s*\$\{\{\s*secrets\.FLOWTENNIS_ADMIN_COOKIE\s*\}\}/, 'workflow should pass optional admin cookie for protected diag checks');
assert.match(source, /actions\/upload-artifact@v4/, 'workflow should upload snapshot as a private artifact');
assert.match(source, /retention-days:\s*30/, 'workflow should retain daily snapshots for 30 days');
assert.doesNotMatch(source, /git add|git commit|git push/, 'workflow must not commit real snapshots to git');

console.log('finance daily snapshot workflow tests passed');
