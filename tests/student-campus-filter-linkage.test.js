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

assert.match(source, /function studentCampusValuesForList\(/, 'student list should derive campus from profile, purchases, entitlements, packages, and schedules');
assert.match(source, /function studentMatchesCampusForList\([\s\S]*studentCampusValuesForList\(stu\)[\s\S]*sameCampusValue/, 'student list should use the same business-campus sources as top stats');
assert.match(fnBody('getStudentBaseList'), /studentMatchesCampusForList\(s\)&&studentMatchesListPage\(s\)/, 'student list base rows should use the shared student campus matcher');
assert.match(fnBody('studentPageStats'), /studentIds\.has\(String\(e\.studentId\|\|''\)\)[\s\S]*studentStatsMatchesPackageCampus\(purchase,e\)/, 'student package stats should only count entitlements linked to visible students');

console.log('student campus filter linkage tests passed');
