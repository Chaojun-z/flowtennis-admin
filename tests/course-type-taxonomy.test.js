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
assert.match(source, /const STANDARD_COURSE_TYPE_OPTIONS=\[\{value:'私教课',label:'私教课'\},\{value:'体验课 \/ 私教体验课',label:'体验课 \/ 私教体验课'\},\{value:'体验课 \/ 小班体验课',label:'体验课 \/ 小班体验课'\},\{value:'小班课 \/ 单次',label:'小班课 \/ 单次'\},\{value:'小班课 \/ 训练营',label:'小班课 \/ 训练营'\},\{value:'小班课 \/ 随到随学',label:'小班课 \/ 随到随学'\},\{value:'大师课',label:'大师课'\},\{value:'陪打',label:'陪打'\}\]/, 'course type filters should use full backend storage values with trial subtypes before small-class single');
assert.match(fnBody('openScheduleModal'), /smallClassOptions=\[\{value:'single',label:'单次'\},\{value:'bootcamp',label:'训练营'\},\{value:'dropin',label:'随到随学'\}\]/, 'schedule modal should keep 训练营 as a small-class subtype');
assert.match(fnBody('openPackageModal'), /smallClassOptions=\[\{value:'single',label:'单次'\},\{value:'bootcamp',label:'训练营'\},\{value:'dropin',label:'随到随学'\}\]/, 'package modal should keep 训练营 as a small-class subtype');

assert.match(fnBody('openScheduleModal'), /normalizeCourseTypeForForm\(s\|\|seed\)/, 'schedule modal should map legacy 训练营 rows to 小班课/训练营 for editing');
assert.match(fnBody('openPackageModal'), /normalizeCourseTypeForForm\(p\)/, 'package modal should map legacy 训练营 rows to 小班课/训练营 for editing');
assert.match(fnBody('saveSchedule'), /courseTypeLevel2:/, 'schedule save should persist the standard course subtype');
assert.match(fnBody('saveSchedule'), /standardCourseType:/, 'schedule save should persist the standard display course type');
assert.match(fnBody('savePackage'), /courseTypeLevel2:/, 'package save should persist the standard course subtype');
assert.match(fnBody('savePackage'), /standardCourseType:/, 'package save should persist the standard display course type');
assert.match(fnBody('syncScheduleFilterOptions'), /STANDARD_COURSE_TYPE_OPTIONS/, 'schedule course type filter should expose standard subtype options');
assert.match(fnBody('getFilteredSchedules'), /standardCourseTypeFilterValue\(s\)!==tf/, 'schedule filtering should match full standard course type values');
assert.match(fnBody('syncPackageFilterOptions'), /STANDARD_COURSE_TYPE_OPTIONS/, 'package course type filter should expose standard subtype options');
assert.match(fnBody('packageMatchesCourseType'), /standardCourseTypeFilterValue\(p\)===value/, 'package linked filter counts should match full standard course type values');
assert.match(fnBody('renderPackages'), /standardCourseTypeFilterValue\(p\)/, 'package filtering should match full standard course type values');

console.log('course type taxonomy tests passed');
