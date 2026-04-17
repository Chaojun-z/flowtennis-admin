const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /timed\('schedule create validate',async\(\)=>\{/, 'schedule create should expose a validate timing segment');
assert.match(apiSource, /timed\('schedule create persist',\(\)=>put\(T_SCHEDULE,id,r\)\)/, 'schedule create should expose a persist timing segment');
assert.match(apiSource, /timed\('schedule create entitlement writes',async\(\)=>\{/, 'schedule create should expose entitlement write timing');
assert.match(apiSource, /timed\('schedule create lesson writes',\(\)=>applyLessonDelta\(nextDelta\.classId,nextDelta\.delta,r\.studentIds\)\)/, 'schedule create should expose lesson write timing');
assert.match(apiSource, /timed\('schedule update validate',async\(\)=>\{/, 'schedule update should expose a validate timing segment');
assert.match(apiSource, /timed\('schedule update persist',\(\)=>put\(T_SCHEDULE,id,r\)\)/, 'schedule update should expose a persist timing segment');
assert.match(apiSource, /timed\('schedule update entitlement writes',async\(\)=>\{/, 'schedule update should expose entitlement write timing');
assert.match(apiSource, /timed\('schedule update lesson writes',async\(\)=>\{/, 'schedule update should expose lesson write timing');

console.log('schedule save timing tests passed');
