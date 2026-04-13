const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(html, /id="page-campusmgr"[\s\S]*class="tms-toolbar"/, 'campus page should use the court-style toolbar');
assert.match(html, /id="campusSearch"[\s\S]*placeholder="搜索校区名称或代码"/, 'campus page should provide a court-style search field');
assert.match(html, /<button class="tms-btn tms-btn-primary" onclick="openCampusModal\(null\)"/, 'campus add button should use the court-style primary button');
assert.match(html, /id="page-campusmgr"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/, 'campus page should use the court-style table shell');
assert.match(html, /#page-campusmgr \.tms-table\s*\{[^}]*min-width:900px/s, 'campus table should not inherit the wide court table min width');
assert.match(html, /<th class="tms-sticky-r"[\s\S]*>操作<\/th>/, 'campus action header should stay visible on the right');
assert.doesNotMatch(html, /校区管理仅管理员可操作/, 'campus page should remove the old instruction card');
assert.doesNotMatch(fnBody('renderCampuses'), /class="abtn"|✏️|🗑️|class="badge b-amber"/, 'campus rows should not use old icon buttons or old badge style');
assert.match(fnBody('renderCampuses'), /campusSearch/, 'campus table should filter by search input');
assert.match(fnBody('renderCampuses'), /renderCourtEmptyText/, 'campus rows should reuse court empty-value display rule');
assert.match(fnBody('renderCampuses'), /<span class="tms-tag/, 'campus code should render as a tms tag');
assert.match(fnBody('renderCampuses'), /tms-action-link[\s\S]*编辑[\s\S]*删除/, 'campus actions should use text links');
assert.match(fnBody('renderCampuses'), /class="tms-sticky-r[^"]*tms-action-cell"[\s\S]*openCampusModal[\s\S]*confirmDel/, 'campus action cells should stay visible and keep edit/delete entries');
assert.match(fnBody('renderCampuses'), /tms-action-cell" style="width:\d+px;padding-right:20px;text-align:right"/, 'campus action area should right-align text links without blank gutter');
assert.match(html, /#page-campusmgr \.tms-table td\.tms-action-cell\{display:table-cell\}/, 'campus action cells should keep normal table layout while right-aligning links');
assert.match(fnBody('openCampusModal'), /setCourtModalFrame/, 'campus create/edit should use the court-style modal frame');
assert.match(fnBody('openCampusModal'), /tms-section-header[\s\S]*tms-form-row[\s\S]*tms-form-label[\s\S]*tms-form-control/, 'campus modal should use court-style form fields');
assert.doesNotMatch(fnBody('openCampusModal'), /class="fgrid"|class="fg"|class="flabel"|class="mactions"/, 'campus modal should not use old form classes');
assert.doesNotMatch(fnBody('openCampusModal'), /confirmDel\([^)]*'campus'|删除/, 'campus modal should not include delete entry');

console.log('campus page view tests passed');
