const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coach-portal.js'), 'utf8');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const renderWorkbenchBody = fnBody('renderWorkbench');

assert.match(
  renderWorkbenchBody,
  /const currentTimeText=/,
  'renderWorkbench should build the live clock text separately from the main shell markup'
);

assert.match(
  renderWorkbenchBody,
  /host\.dataset\.workbenchRenderKey!==renderKey[\s\S]*host\.innerHTML=/,
  'renderWorkbench should guard innerHTML writes behind a stable render key instead of rewriting the whole page every second'
);

assert.match(
  renderWorkbenchBody,
  /host\.querySelector\('\.coach-wb-current-time'\)[\s\S]*textContent=currentTimeText/,
  'renderWorkbench should update the clock node text directly during ticker refreshes'
);

console.log('coach workbench render guard tests passed');
