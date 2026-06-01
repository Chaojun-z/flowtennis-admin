const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'scripts', 'verify-finance-page-authenticated.js');
assert.ok(fs.existsSync(scriptPath), 'authenticated finance verify script should exist');

const source = fs.readFileSync(scriptPath, 'utf8');
assert.match(source, /FLOWTENNIS_ADMIN_COOKIE|FLOWTENNIS_ADMIN_TOKEN/, 'script should read auth from env');
assert.doesNotMatch(source, /eyJ|Bearer\s+[A-Za-z0-9_-]{20,}|Cookie:\s*[^'"]+/, 'script must not hardcode auth secrets');

console.log('finance page authenticated verify script tests passed');
