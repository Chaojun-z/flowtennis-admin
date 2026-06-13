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

assert.match(source, /const PRODUCT_TYPES=BUSINESS_TAXONOMY\.PRODUCT_TYPES/, 'course type level1 options should come from the global business dictionary');
assert.match(source, /const STANDARD_COURSE_TYPE_OPTIONS=BUSINESS_TAXONOMY\.STANDARD_COURSE_TYPE_OPTIONS/, 'course type filters should come from the global business dictionary');
assert.match(source, /const SMALL_CLASS_TYPE_OPTIONS=BUSINESS_TAXONOMY\.SMALL_CLASS_TYPE_OPTIONS/, 'small-class subtype options should come from the global business dictionary');
assert.match(fnBody('openPackageModal'), /const smallClassOptions=SMALL_CLASS_TYPE_OPTIONS/, 'package modal should keep 训练营 as a global small-class subtype option');

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
assert.match(fnBody('getFilteredPackages'), /standardCourseTypeFilterValue\(p\)/, 'package filtering should match full standard course type values');

console.log('course type taxonomy tests passed');
