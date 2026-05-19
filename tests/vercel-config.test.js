const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));

assert.ok(
  !Array.isArray(config.crons) || config.crons.length === 0,
  'vercel.json should not define official account cron jobs now that GitHub Actions handles scheduling'
);

console.log('vercel config tests passed');
