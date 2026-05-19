const assert = require('assert');
const fs = require('fs');
const path = require('path');

const remindersWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'official-account-reminders.yml'),
  'utf8'
);
const digestWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'official-account-daily-digests.yml'),
  'utf8'
);

assert.match(remindersWorkflow, /cron:\s*'2,32 \* \* \* \*'/, 'reminders workflow should run every 30 minutes');
assert.match(remindersWorkflow, /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/official-account-reminders/, 'reminders workflow should call the reminder endpoint');
assert.match(remindersWorkflow, /Quiet hours, skip reminder run\./, 'reminders workflow should skip quiet hours');
assert.match(remindersWorkflow, /User-Agent:\s*vercel-cron/, 'reminders workflow should mimic Vercel cron user agent');

assert.match(digestWorkflow, /cron:\s*'2 12 \* \* \*'/, 'digest workflow should run at 20:02 Asia/Shanghai');
assert.match(digestWorkflow, /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/official-account-daily-digests/, 'digest workflow should call the digest endpoint');
assert.match(digestWorkflow, /User-Agent:\s*vercel-cron/, 'digest workflow should mimic Vercel cron user agent');

console.log('official account cron workflow tests passed');
