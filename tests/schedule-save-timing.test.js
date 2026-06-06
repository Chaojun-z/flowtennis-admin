const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /timed\('schedule create validate',async\(\)=>\{/, 'schedule create should expose a validate timing segment');
assert.match(apiSource, /function withRequiredStorageTimeout\(/, 'schedule save should have a required storage timeout helper');
assert.match(apiSource, /function scheduleSaveErrorStatus\(/, 'schedule save should classify user-visible save failures');
assert.match(apiSource, /withRequiredStorageTimeout\(getCachedScan\(T_SCHEDULE\),3500,'排课校验超时，请稍后重试'\)/, 'schedule conflict scan should fail fast instead of letting Vercel return FUNCTION_INVOCATION_FAILED');
assert.match(apiSource, /catch\(err\)\{return sendJson\(res,\{error:String\(err\?\.message\|\|err\)\},scheduleSaveErrorStatus\(err\)\);\}/, 'schedule save validation should return JSON errors instead of falling through to the global 500 handler');
assert.match(apiSource, /timed\('schedule create persist',\(\)=>put\(T_SCHEDULE,id,r\)\)/, 'schedule create should expose a persist timing segment');
assert.match(apiSource, /timed\('schedule create entitlement writes',async\(\)=>\{/, 'schedule create should expose entitlement write timing');
assert.match(apiSource, /return \{risk,entitlementDeltas,entitlementRows\};[\s\S]*const \{risk,entitlementDeltas,entitlementRows\}=validation;[\s\S]*applySmallGroupFreeAbsences\(r,entitlementRows,user(?:,[^)]+)?\)/, 'schedule create should keep entitlement rows available for free-absence writes');
assert.match(apiSource, /timed\('schedule create lesson writes',\(\)=>applyLessonDelta\(nextDelta\.classId,nextDelta\.delta,r\.studentIds\)\)/, 'schedule create should expose lesson write timing');
assert.doesNotMatch(apiSource, /notifyCoachScheduleCreated\(r\)/, 'schedule create should not send one-time mini program subscribe notifications');
assert.match(apiSource, /notification=\{skipped:true,reason:'official_account_reminder_only'\}/, 'schedule create should leave reminders to official account cron');
assert.match(apiSource, /async function sendCourseReminders[\s\S]*return \{success:true,skipped:true,reason:'official_account_reminder_only'/, 'legacy mini program course reminder endpoint should be disabled');
assert.match(apiSource, /timed\('schedule update validate',async\(\)=>\{/, 'schedule update should expose a validate timing segment');
assert.match(apiSource, /timed\(\s*'schedule update feedback guard'[\s\S]*?withTimeout\(scanFeedbacks\(\)\.catch\(\(\)=>\[\]\),3000,\[\]\)/, 'schedule update should guard feedback fetch latency before blocking edits');
assert.match(apiSource, /timed\('schedule update persist',\(\)=>put\(T_SCHEDULE,id,r\)\)/, 'schedule update should expose a persist timing segment');
assert.match(apiSource, /timed\('schedule update entitlement writes',async\(\)=>\{/, 'schedule update should expose entitlement write timing');
assert.match(apiSource, /timed\('schedule update lesson writes',async\(\)=>\{/, 'schedule update should expose lesson write timing');

console.log('schedule save timing tests passed');
