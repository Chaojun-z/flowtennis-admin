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
assert.doesNotMatch(remindersWorkflow, /cron:/, 'reminders workflow should not use GitHub schedule after moving to Vercel Cron');
assert.match(remindersWorkflow, /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/official-account-reminders/, 'reminders workflow should call the reminder endpoint');
assert.match(remindersWorkflow, /User-Agent:\s*vercel-cron/, 'reminders workflow should mimic Vercel cron user agent');

assert.match(digestWorkflow, /workflow_dispatch:/, 'digest workflow should keep manual dispatch');
assert.doesNotMatch(digestWorkflow, /cron:/, 'digest workflow should not use GitHub schedule after moving to Vercel Cron');
assert.match(digestWorkflow, /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/official-account-daily-digests/, 'digest workflow should call the digest endpoint');
assert.match(digestWorkflow, /User-Agent:\s*vercel-cron/, 'digest workflow should mimic Vercel cron user agent');

console.log('official account cron workflow tests passed');
