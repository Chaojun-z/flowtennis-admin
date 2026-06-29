const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

assert.doesNotMatch(
  fnBody('goPage'),
  /scrollActiveSidebarItemIntoView\(\)/,
  'menu clicks should keep the current sidebar scroll position instead of re-centering the active item'
);

assert.doesNotMatch(
  html,
  /function\s+scrollActiveSidebarItemIntoView\([\s\S]*?scrollTo\(/,
  'sidebar active-state updates should not programmatically scroll the menu'
);

console.log('sidebar scroll stability tests passed');
