const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standardSource = fs.readFileSync(path.join(root, 'public/assets/scripts/standard/components.js'), 'utf8');
const studentsSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/students.js'), 'utf8');
const filtersCss = fs.readFileSync(path.join(root, 'public/assets/styles/components/filters.css'), 'utf8');
const pagesCss = fs.readFileSync(path.join(root, 'public/assets/styles/pages.css'), 'utf8');

assert.match(
  standardSource,
  /function renderStandardGroupedFilterHtml\(/,
  'grouped filter should be a reusable standard component'
);
assert.match(
  standardSource,
  /function refreshStandardGroupedFilterPanel\(/,
  'grouped filter should update only its panel when switching groups'
);
assert.match(
  standardSource,
  /function toggleStandardGroupedFilterOption\(/,
  'grouped filter should keep the dropdown open while selecting options'
);
assert.match(
  standardSource,
  /function clearStandardGroupedFilter\(/,
  'grouped filter should provide a shared clear action'
);
assert.match(
  standardSource,
  /Object\.assign\(window,[\s\S]*renderStandardGroupedFilterHtml[\s\S]*refreshStandardGroupedFilterPanel[\s\S]*toggleStandardGroupedFilterOption[\s\S]*clearStandardGroupedFilter/,
  'grouped filter helpers should be exposed globally'
);

assert.match(
  studentsSource,
  /renderStandardGroupedFilterHtml\(studentTagGroupedFilterConfig\(baseRows\)\)/,
  'student tag filter should reuse the standard grouped filter component'
);
assert.match(
  studentsSource,
  /selectedValuesByGroup:\s*studentTagFilterState/,
  'student tag filter should pass selected state into the standard component'
);
assert.match(
  studentsSource,
  /onToggle:\s*'toggleStudentTagFilter'/,
  'student tag filter should keep its existing business toggle handler'
);
assert.match(
  studentsSource,
  /onClear:\s*'clearStudentTagFilters'/,
  'student tag filter should keep its existing clear handler'
);
assert.doesNotMatch(
  studentsSource,
  /student-tag-cascader-(parent|child|columns|option|footer|selected)/,
  'student page should not keep page-local grouped filter markup classes'
);

assert.match(filtersCss, /\.tms-grouped-filter-menu\{/, 'grouped filter menu style should live in shared filters css');
assert.match(filtersCss, /\.tms-grouped-filter-option\{/, 'grouped filter option style should live in shared filters css');
assert.match(filtersCss, /\.tms-grouped-filter-clear\{/, 'grouped filter clear style should live in shared filters css');
assert.doesNotMatch(
  pagesCss,
  /student-tag-cascader-(parent|child|columns|option|footer|selected)/,
  'student page css should not own reusable grouped filter styles'
);

assert.match(
  standardSource,
  /data-keep-open="true"/,
  'option toggles should mark clicks as keep-open for continuous multi-select'
);
assert.match(
  standardSource,
  /aria-checked="\$\{checked\?'true':'false'\}"/,
  'option checkboxes should expose checked state'
);
assert.match(
  standardSource,
  /selectedCount\?\`\$\{esc\(label\)\} \$\{selectedCount\}`:esc\(label\)/,
  'closed trigger should show the selected count without cramming all labels'
);

console.log('grouped filter component tests passed');
