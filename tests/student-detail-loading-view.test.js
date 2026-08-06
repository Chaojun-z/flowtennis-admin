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

assert.match(
  source,
  /function studentDetailTabNeedsDatasets\(tab=studentDetailActiveTab\)\{[\s\S]*\['orders','benefits'\]\.includes\(tab\)/,
  'student detail should only block heavy datasets for package and benefit tabs'
);
assert.match(
  fnBody('openStudentDetail'),
  /studentDetailTabNeedsDatasets\(\)&&ensureStudentDetailDatasets\(id,\{block:true\}\)/,
  'student package and benefit tabs should wait only when the local detail rows are missing'
);
assert.match(
  source,
  /function studentDetailLocalRowsReady\([\s\S]*if\(tab==='orders'\)return false[\s\S]*detailBenefitRows/,
  'student package tab should request precise single-student detail instead of trusting lightweight rows'
);
assert.match(
  fnBody('studentDetailDatasetsReady'),
  /detailReady\|\|studentDetailLocalRowsReady\(id,studentDetailActiveTab\)/,
  'student detail should skip the per-student endpoint only after precise detail is loaded or for safe local tabs'
);
assert.match(
  source,
  /const studentDetailLoadPromises=new Map\(\);/,
  'student detail requests should de-duplicate in-flight loads'
);
assert.match(
  fnBody('ensureStudentDetailData'),
  /apiCall\('GET',`\/page-data\/student-detail\?id=\$\{encodeURIComponent\(id\)\}\$\{force\?'&fresh=1':''\}`,null,20000\)/,
  'student detail loads should use the single-student endpoint with a bounded timeout'
);
assert.doesNotMatch(
  fnBody('openStudentDetail'),
  /!studentDetailTabNeedsDatasets\(\)\)ensureStudentDetailDatasets\(id,\{block:false\}\)/,
  'student basic tab should not start the heavy detail load in the background'
);
assert.doesNotMatch(
  fnBody('saveStudent'),
  /ensureStudentDetailData\(savedEditId,\{force:true\}\)/,
  'student basic saves should not force-refresh package and lesson detail facts'
);
assert.match(
  source,
  /const studentDetailViewCache=new Map\(\);/,
  'student detail hydration should keep precise drawer rows available even when the list row is lightweight'
);
assert.match(
  fnBody('studentUnifiedRecordForId'),
  /studentDetailViewForId\(sid\)[\s\S]*return detail\?\{\.\.\.\(base\|\|\{\}\),\.\.\.detail\}:base/,
  'student detail should prefer the precise refreshed row over the lightweight list row'
);
assert.match(
  fnBody('saveStudent'),
  /typeof mergeTeachingStudentDetail==='function'[\s\S]*mergeTeachingStudentDetail\(\{[\s\S]*studentId:savedEditId/,
  'student basic saves should update the visible drawer row locally'
);

console.log('student detail loading view tests passed');
