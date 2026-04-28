const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/api.js'), 'utf8');

assert.match(source, /if\(!res\.ok\)throw new Error\(`\$\{data\.error\|\|'请求失败'\} \[\$\{path\}\]`\);/, 'api errors should include the failing path');
assert.match(source, /const raw=await res\.text\(\);/, 'api call should read raw text before parsing');
assert.match(source, /data=JSON\.parse\(raw\);/, 'api call should still parse JSON responses');
assert.match(source, /服务器返回了非 JSON 响应|\$\{fallback\} \[\$\{path\}\]/, 'api call should surface a readable fallback when server does not return JSON');

console.log('api error path tests passed');
