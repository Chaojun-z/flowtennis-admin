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
  'student package and benefit tabs should wait for heavy detail datasets'
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
  fnBody('saveStudent'),
  /typeof mergeTeachingStudentDetail==='function'[\s\S]*mergeTeachingStudentDetail\(\{[\s\S]*studentId:savedEditId/,
  'student basic saves should update the visible drawer row locally'
);

console.log('student detail loading view tests passed');
