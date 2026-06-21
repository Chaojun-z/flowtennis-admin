const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html, appSource: source } = require('./helpers/read-index-bundle');

const pagesCss = fs.readFileSync(path.join(__dirname, '../public/assets/styles/pages.css'), 'utf8');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}
function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = source.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

const campusShell = standardConfigBlock('campusmgr');

assert.match(html, /id="page-campusmgr" data-standard-list-shell="campusmgr"/, 'campus page should mount the standard list shell');
assert.match(campusShell, /search:\{id:'campusSearch'/, 'campus page should provide the unified search field');
assert.match(campusShell, /<button class="tms-btn tms-btn-primary" onclick="openCampusModal\(null\)"/, 'campus add button should use the court-style primary button');
assert.match(campusShell, /bodyId:'campusTbody'/, 'campus page should use the standard table shell');
assert.match(pagesCss, /#page-campusmgr \.tms-table\s*\{[^}]*min-width:900px/s, 'campus table should not inherit the wide court table min width');
assert.match(campusShell, /label:'操作'[\s\S]*className:'tms-sticky-r'/, 'campus action header should stay visible on the right');
assert.doesNotMatch(html, /校区管理仅管理员可操作/, 'campus page should remove the old instruction card');
assert.doesNotMatch(fnBody('renderCampuses'), /class="abtn"|✏️|🗑️|class="badge b-amber"/, 'campus rows should not use old icon buttons or old badge style');
assert.match(fnBody('renderCampuses'), /campusSearch/, 'campus table should filter by search input');
assert.match(fnBody('renderCampuses'), /renderStandardEmptyText/, 'campus rows should use the standard empty-value display rule');
assert.match(fnBody('renderCampuses'), /renderStandardCellText/, 'campus rows should use the standard cell display rule');
assert.match(fnBody('renderCampuses'), /<span class="tms-tag/, 'campus code should render as a tms tag');
assert.match(fnBody('renderCampuses'), /tms-action-link[\s\S]*编辑[\s\S]*删除/, 'campus actions should use text links');
assert.match(fnBody('renderCampuses'), /class="tms-sticky-r[^"]*tms-action-cell"[\s\S]*openCampusModal[\s\S]*confirmDel/, 'campus action cells should stay visible and keep edit/delete entries');
assert.match(fnBody('renderCampuses'), /tms-action-cell" style="width:\d+px;padding-right:20px;text-align:right"/, 'campus action area should right-align text links without blank gutter');
assert.match(pagesCss, /#page-campusmgr \.tms-table td\.tms-action-cell\{display:table-cell\}/, 'campus action cells should keep normal table layout while right-aligning links');
assert.match(fnBody('openCampusModal'), /openStandardModal/, 'campus create/edit should use the standard modal frame');
assert.match(fnBody('openCampusModal'), /tms-section-header[\s\S]*tms-form-row[\s\S]*tms-form-label[\s\S]*tms-form-control/, 'campus modal should use court-style form fields');
assert.match(source, /function normalizeCampusVenues\(/, 'campus page should normalize campus venue config');
assert.match(fnBody('renderCampuses'), /activeCampusVenueCount\(c\)/, 'campus table should derive court count from enabled venues');
assert.match(fnBody('openCampusModal'), /场地配置[\s\S]*renderCampusVenueRows/, 'campus modal should render the venue config section');
assert.match(fnBody('campusVenueRowHtml'), /场地名称[\s\S]*室内\/室外[\s\S]*室内[\s\S]*室外/, 'campus venue rows should only ask for venue name and indoor/outdoor type');
assert.doesNotMatch(fnBody('campusVenueRowHtml'), /状态|排序|ca_venue_status|data-campus-venue-sort/, 'campus venue rows should not expose status or sort controls');
assert.match(fnBody('collectCampusVenueFormRows'), /status:'active'[\s\S]*sortOrder:index\+1/, 'campus venue status and sort should be derived automatically');
assert.match(pagesCss, /#ca_venue_rows\{[\s\S]*flex-direction:column[\s\S]*\.campus-venue-row\{[\s\S]*grid-template-columns/, 'campus venue config should use a compact row layout');
assert.match(fnBody('saveCampus'), /venues:collectCampusVenueFormRows\(\)/, 'saving a campus should persist venue config rows');
assert.doesNotMatch(fnBody('openCampusModal'), /class="fgrid"|class="fg"|class="flabel"|class="mactions"/, 'campus modal should not use old form classes');
assert.doesNotMatch(fnBody('openCampusModal'), /confirmDel\([^)]*'campus'|删除/, 'campus modal should not include delete entry');

console.log('campus page view tests passed');
