const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));

assert.ok(Array.isArray(config.crons), 'vercel.json should define cron jobs');
assert.ok(
  config.crons.some(job => job.path === '/api/cron/course-reminders' && job.schedule === '*/15 * * * *'),
  'vercel.json should run course reminders every 15 minutes'
);

console.log('vercel config tests passed');
