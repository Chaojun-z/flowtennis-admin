const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'third-party-sync-center.yml');
const source = fs.readFileSync(workflowPath, 'utf8');

assert.match(source, /run_sync_once\(\)/, 'third-party sync workflow should wrap the cron call in a verifiable function');
assert.match(source, /notification\.sent === true/, 'third-party sync workflow must require Feishu delivery before success');
assert.match(source, /notification sent=\$\{sent\}/, 'third-party sync workflow should log Feishu delivery state');
assert.match(source, /third party sync notification not delivered/, 'third-party sync workflow should fail loudly when Feishu delivery is missing');
assert.match(source, /send_fallback_alert "系统已自动重试 1 次仍失败，或飞书业务通知未送达"/, 'third-party sync workflow should send fallback alert after retry');
assert.doesNotMatch(source, /if curl "\$\{curl_args\[@\]\}"; then\s*\n\s*exit 0/, 'third-party sync workflow must not treat HTTP 200 alone as success');

console.log('third-party sync center workflow tests passed');
