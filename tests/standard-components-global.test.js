const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const standardPath = path.join(root, 'public/assets/scripts/standard/components.js');
const courtsPath = path.join(root, 'public/assets/scripts/pages/courts.js');
const campusPath = path.join(root, 'public/assets/scripts/pages/campusmgr.js');

assert.ok(fs.existsSync(standardPath), 'standard global components file should exist');

const standardSource = fs.readFileSync(standardPath, 'utf8');
const courtsSource = fs.readFileSync(courtsPath, 'utf8');
const campusSource = fs.readFileSync(campusPath, 'utf8');

assert.match(html, /assets\/scripts\/standard\/components\.js\?v=/, 'index should load the standard global components bundle');
assert.ok(
  html.indexOf('/assets/scripts/standard/components.js') < html.indexOf('/assets/scripts/pages/courts.js'),
  'standard components should load before page modules'
);

[
  'renderStandardEmptyText',
  'renderStandardCellText',
  'renderStandardDropdownHtml',
  'toggleStandardDropdown',
  'selectStandardDropdownItem',
  'closeStandardDropdowns',
  'renderStandardPaginationButtonsHtml'
].forEach(name => {
  assert.match(standardSource, new RegExp(`function ${name}\\(`), `${name} should live in standard components`);
  assert.match(standardSource, new RegExp(`Object\\.assign\\(window,[\\s\\S]*${name}`), `${name} should be explicitly exposed on window`);
});

assert.match(courtsSource, /function renderCourtDropdownHtml\([^)]*\)\{\s*return renderStandardDropdownHtml\(/, 'old court dropdown helper should be a compatibility wrapper');
assert.match(courtsSource, /function renderCourtCellText\([^)]*\)\{\s*return renderStandardCellText\(/, 'old court cell helper should be a compatibility wrapper');
assert.match(courtsSource, /function renderCourtEmptyText\([^)]*\)\{\s*return renderStandardEmptyText\(/, 'old court empty helper should be a compatibility wrapper');
assert.match(campusSource, /renderStandardCellText\(/, 'a non-court page should use the standard cell helper directly');
assert.match(campusSource, /renderStandardEmptyText\(/, 'a non-court page should use the standard empty helper directly');
assert.match(standardSource, /document\.documentElement\.dataset\.standardComponents='loaded'/, 'standard bundle should expose a DOM execution marker for smoke tests');
assert.match(
  standardSource,
  /dropdown\.classList\.remove\('open'\)[\s\S]*changeHandler=dropdown\.dataset\.onchange\|\|''[\s\S]*defer\(\(\)=>\{[\s\S]*try\{window\[changeHandler\]\(value,label\);\}[\s\S]*catch\(e\)/,
  'dropdown selection should close the menu before running deferred onchange logic'
);

console.log('standard components global tests passed');
