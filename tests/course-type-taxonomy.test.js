const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(source, /const PRODUCT_TYPES=\['私教课','体验课','小班课','大师课','陪打'\]/, 'course type level1 options should use the five-type standard order');
assert.doesNotMatch(source, /const PRODUCT_TYPES=\[[^\]]*'训练营'[^\]]*\]/, '训练营 should not be a level1 course type');
assert.match(fnBody('openScheduleModal'), /smallClassOptions=\[\{value:'single',label:'单次'\},\{value:'bootcamp',label:'训练营'\},\{value:'dropin',label:'随到随学'\}\]/, 'schedule modal should keep 训练营 as a small-class subtype');
assert.match(fnBody('openPackageModal'), /smallClassOptions=\[\{value:'single',label:'单次'\},\{value:'bootcamp',label:'训练营'\},\{value:'dropin',label:'随到随学'\}\]/, 'package modal should keep 训练营 as a small-class subtype');

assert.match(fnBody('openScheduleModal'), /normalizeCourseTypeForForm\(s\|\|seed\)/, 'schedule modal should map legacy 训练营 rows to 小班课/训练营 for editing');
assert.match(fnBody('openPackageModal'), /normalizeCourseTypeForForm\(p\)/, 'package modal should map legacy 训练营 rows to 小班课/训练营 for editing');
assert.match(fnBody('saveSchedule'), /courseTypeLevel2:/, 'schedule save should persist the standard course subtype');
assert.match(fnBody('saveSchedule'), /standardCourseType:/, 'schedule save should persist the standard display course type');
assert.match(fnBody('savePackage'), /courseTypeLevel2:/, 'package save should persist the standard course subtype');
assert.match(fnBody('savePackage'), /standardCourseType:/, 'package save should persist the standard display course type');

console.log('course type taxonomy tests passed');
