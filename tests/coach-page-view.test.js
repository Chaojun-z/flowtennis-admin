const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = html.indexOf('\nfunction ', start + 1);
  const nextAsync = html.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(html, /id="page-coaches"[\s\S]*class="tms-toolbar"/, 'coach page should use the court-style toolbar');
assert.match(html, /id="coachSearch"[\s\S]*placeholder="搜索教练姓名、电话或备注"/, 'coach page should use the court-style search field');
assert.match(html, /<button class="tms-btn tms-btn-primary" onclick="openCoachModal\(null\)"/, 'coach add button should use the court-style primary button');
assert.match(html, /id="page-coaches"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/, 'coach page should use the court-style table shell');
assert.match(html, /#page-coaches \.tms-table\s*\{[^}]*min-width:1000px/s, 'coach table should not inherit the wide court table min width');
assert.match(html, /#page-coaches \.tms-table-wrapper\s*\{[^}]*max-height:calc\(100vh - 190px\)/s, 'coach table should use more vertical space before scrolling');
assert.match(html, /\.tms-dropdown-menu[^}]*overscroll-behavior:contain/s, 'dropdown scrolling should not drag the modal or page behind it');
assert.match(html, /<th class="tms-sticky-r"[\s\S]*>操作<\/th>/, 'coach action header should stay visible on the right');
assert.match(html, /<th[^>]*>入职时间<\/th>/, 'coach table should show hire date');
assert.doesNotMatch(fnBody('renderCoaches'), /class="abtn"|✏️|🗑️|class="badge /, 'coach rows should not use old icon buttons or old badge style');
assert.match(fnBody('renderCoaches'), /renderCourtCellText/, 'coach rows should reuse court empty-value display rule');
assert.match(fnBody('renderCoaches'), /hireDate/, 'coach rows should render hire date');
assert.match(fnBody('renderCoaches'), /<span class="tms-tag/, 'coach status should render as a tms tag');
assert.match(fnBody('renderCoaches'), /class="tms-sticky-r[^"]*tms-action-cell"[\s\S]*openCoachModal[\s\S]*confirmDel/, 'coach action cells should keep edit/delete entries in the list');
assert.match(fnBody('renderCoaches'), /tms-action-link[\s\S]*编辑[\s\S]*删除/, 'coach actions should use text links');
assert.match(fnBody('openCoachModal'), /setCourtModalFrame/, 'coach create/edit should use the court-style modal frame');
assert.match(fnBody('openCoachModal'), /tms-section-header[\s\S]*tms-form-row[\s\S]*tms-form-label[\s\S]*tms-form-control/, 'coach modal should use court-style form fields');
assert.match(fnBody('openCoachModal'), /co_hireDate/, 'coach modal should include hire date field');
assert.match(fnBody('openCoachModal'), /courtDateButtonHtml\('co_hireDate'/, 'coach hire date should use the shared court-style date picker');
assert.doesNotMatch(fnBody('openCoachModal'), /confirmDel\([^)]*'coach'|删除|class="fgrid"|class="fg"|class="flabel"|class="mactions"/, 'coach modal should not include delete entry or old form classes');
assert.match(fnBody('saveCoach'), /hireDate:document\.getElementById\('co_hireDate'\)\.value/, 'coach save should include hire date');
assert.match(html, /function renderCourtDropdownHtml[\s\S]*onwheel="event\.stopPropagation\(\);event\.preventDefault\(\);this\.scrollTop \+= event\.deltaY"/, 'coach campus dropdown should consume wheel scrolling inside the menu');

console.log('coach page view tests passed');
