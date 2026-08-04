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

assert.match(remindersWorkflow, /workflow_dispatch:/, 'reminders workflow should keep manual dispatch');
assert.match(remindersWorkflow, /cron:\s*'2,32 \* \* \* \*'/, 'reminders workflow should run every 30 minutes from GitHub Actions');
assert.match(remindersWorkflow, /fail-fast:\s*false/, 'reminders workflow should let split reminder jobs finish independently');
assert.match(remindersWorkflow, /official-account-coach-reminders/, 'reminders workflow should call the coach reminder endpoint');
assert.match(remindersWorkflow, /official-account-student-reminders/, 'reminders workflow should call the student reminder endpoint');
assert.match(remindersWorkflow, /official-account-feedback-reminders/, 'reminders workflow should call the feedback reminder endpoint');
assert.doesNotMatch(remindersWorkflow, /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/official-account-reminders/, 'reminders workflow should not call the combined timeout-prone endpoint');
assert.match(remindersWorkflow, /User-Agent:\s*vercel-cron/, 'reminders workflow should mimic Vercel cron user agent');
assert.match(remindersWorkflow, /hour=\$\(date \+%H\)/, 'reminders workflow should check current hour');
assert.match(remindersWorkflow, /if \[ "\$hour" -ge 23 \] \|\| \[ "\$hour" -lt 5 \]; then/, 'reminders workflow should skip 23:00-04:59 quiet hours');
assert.match(remindersWorkflow, /Quiet hours, skip reminder run\./, 'reminders workflow should log quiet hours skip');

assert.match(digestWorkflow, /workflow_dispatch:/, 'digest workflow should keep manual dispatch');
assert.match(digestWorkflow, /cron:\s*'2 12 \* \* \*'/, 'digest workflow should run daily at 20:02 from GitHub Actions');
assert.match(digestWorkflow, /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/official-account-daily-digests/, 'digest workflow should call the digest endpoint');
assert.match(digestWorkflow, /User-Agent:\s*vercel-cron/, 'digest workflow should mimic Vercel cron user agent');

console.log('official account cron workflow tests passed');
