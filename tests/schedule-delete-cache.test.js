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

const doDeleteBody = fnBody('doDelete');

assert.match(
  doDeleteBody,
  /else if\(currentDelType==='schedule'\)\{schedules=schedules\.filter\(u=>u\.id!==currentDelId\);[\s\S]*noteScheduleLocalMutation\(\)[\s\S]*setDatasetValue\('schedule',schedules\)/,
  'schedule delete should sync the updated schedule dataset cache immediately after removing the row'
);

assert.match(
  doDeleteBody,
  /if\(currentDelType==='schedule'\)\{[\s\S]*renderAfterScheduleMutation\(\)[\s\S]*return;\s*\}\s*if\(!result\?\.purchaseVoid\)renderAll\(\);/,
  'schedule delete should rerender schedule views and return before the full app render path'
);

console.log('schedule delete cache tests passed');
