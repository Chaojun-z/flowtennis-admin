const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'public/assets/scripts/core/api.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/courts.js'), 'utf8');

assert.match(
  apiSource,
  /const error=new Error\(`\$\{data\.error\|\|'请求失败'\} \[\$\{path\}\]`\);[\s\S]*error\.status=res\.status;[\s\S]*throw error;/,
  'apiCall should attach HTTP status before throwing so detail loaders can detect expired login'
);

assert.match(
  courtsSource,
  /if\(Number\(e\?\.status\)===401\|\|String\(e\.message\|\|''\)\.includes\('未登录'\)\|\|String\(e\.message\|\|''\)\.includes\('登录'\)\)\{doLogout\(\);return;\}/,
  'membership detail drawer should logout on expired login instead of showing a generic detail failure toast'
);

console.log('membership detail auth expiry tests passed');
