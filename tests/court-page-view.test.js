const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(fnBody('scheduleTimeRangeControls'), /refreshScheduleTimeDerivedFields/, 'schedule time range controls should refresh lesson hours when date or time changes');

console.log('court page view tests passed');
