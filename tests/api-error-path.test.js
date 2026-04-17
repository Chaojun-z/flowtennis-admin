const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/api.js'), 'utf8');

assert.match(source, /if\(!res\.ok\)throw new Error\(`\$\{data\.error\|\|'请求失败'\} \[\$\{path\}\]`\);/, 'api errors should include the failing path');

console.log('api error path tests passed');
