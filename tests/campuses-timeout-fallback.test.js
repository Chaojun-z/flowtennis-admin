const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(
  apiSource,
  /async function listCampusesWithDefaults\(\)\{[\s\S]*return rows\.length\?rows:DEFAULT_CAMPUSES;[\s\S]*\}/,
  'campuses list should keep default campuses as the read fallback'
);

console.log('campuses timeout fallback tests passed');
