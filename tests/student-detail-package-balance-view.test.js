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

const body = fnBody('studentPackageLessonMeta');
assert.match(
  body,
  /detailPackageBalanceRemaining[\s\S]*detailPackageBalanceTotal[\s\S]*packageBalanceRemaining[\s\S]*packageBalanceTotal/,
  'student detail package metric should prefer the backend all-history package balance before the list balance'
);
assert.match(
  fnBody('studentDetailMetricsHtml'),
  /studentPackageLessonMeta\(stu\)[\s\S]*剩余课时\/总数/,
  'student detail top card should render remaining lessons from the detail package metric'
);

console.log('student detail package balance view tests passed');
