const assert = require('assert');
const fs = require('fs');

const components = fs.readFileSync('public/assets/scripts/standard/components.js', 'utf8');
const state = fs.readFileSync('public/assets/scripts/core/state.js', 'utf8');

assert.match(
  components,
  /const STANDARD_SEARCH_INPUT_DELAY_MS=\d+;/,
  'standard search should define a shared debounce delay'
);

assert.match(
  components,
  /function queueStandardSearchInput\(/,
  'standard search should queue input handlers instead of running heavy renders inline'
);

assert.match(
  components,
  /function runStandardSearchInputHandlers\(/,
  'standard search should execute queued no-argument handlers through a safe parser'
);

assert.match(
  components,
  /data-search-oninput="\$\{esc\(oninput\)\}"[\s\S]*oninput="queueStandardSearchInput\(this\.dataset\.searchOninput\)"/,
  'standard search input should store the heavy handler and call the lightweight queue on each keystroke'
);

assert.doesNotMatch(
  components,
  /<input type="text" class="tms-search-input"[^>]*\$\{oninput\?` oninput="\$\{esc\(oninput\)\}"/,
  'standard search input must not render page-specific heavy handlers directly into oninput'
);

assert.match(
  components,
  /function standardSearchInputIsActive\(/,
  'standard search should expose whether the user is actively typing in a list search field'
);

assert.match(
  state,
  /function renderLoadedCurrentPageWhenSearchIdle\(/,
  'background data completion should route through an input-idle page rerender helper'
);

assert.match(
  state,
  /standardSearchInputIsActive\(\)[\s\S]*setTimeout\(\(\)=>renderLoadedCurrentPageWhenSearchIdle\(pg,requestVersion\),250\)/,
  'background rerender should wait while a standard search input is focused'
);

assert.match(
  state,
  /if\(typeof standardSearchInputIsActive==='function'&&standardSearchInputIsActive\(\)\)return;/,
  'quiet background refresh should not run while the user is using a standard search input'
);

console.log('search input performance tests passed');
