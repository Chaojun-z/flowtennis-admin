const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html, appSource } = require('./helpers/read-index-bundle');

const root = path.join(__dirname, '..');
const standardSource = fs.readFileSync(path.join(root, 'public/assets/scripts/standard/components.js'), 'utf8');

const targetPages = [
  ['students', 'studentStatsRow', 'stuSearch', 'stuTbody', 'stuPagerInfo', 'stuPageSize', 'stuPagerBtns'],
  ['schedule', '', 'schSearch', 'schTbody', 'schPagerInfo', 'schPageSize', 'schPagerBtns'],
  ['leads', 'leadStatsRow', 'leadSearch', 'leadTbody', 'leadPagerInfo', 'leadPageSize', 'leadPagerBtns'],
  ['purchases', '', 'purSearch', 'purchaseTbody', 'purPagerInfo', 'purPageSize', 'purPagerBtns'],
  ['packages', '', 'pkgSearch', 'packageGrid', 'pkgPagerInfo', 'pkgPageSize', 'pkgPagerBtns'],
  ['prices', '', 'priceSearch', 'priceTbody', 'pricePagerInfo', 'pricePageSize', 'pricePagerBtns'],
  ['admin-users', '', 'adminUserSearch', 'adminUserTbody', 'adminUserPagerInfo', 'adminUserPageSize', 'adminUserPagerBtns']
];

[
  'renderStandardSearchHtml',
  'renderStandardToolbarHtml',
  'renderStandardStatsShellHtml',
  'renderStandardTableShellHtml',
  'renderStandardListPagerShellHtml',
  'renderStandardListStateHtml',
  'renderStandardListPageShellHtml',
  'mountStandardListShells'
].forEach(name => {
  assert.match(standardSource, new RegExp(`function ${name}\\(`), `${name} should live in the global standard list shell`);
  assert.match(standardSource, new RegExp(`Object\\.assign\\(window,[\\s\\S]*${name}`), `${name} should be exposed globally`);
});

assert.match(appSource, /function standardListPageShellConfigs\(/, 'target list page configs should be centralized');
assert.match(appSource, /function renderRoleShell\([\s\S]*mountStandardListShells\(\)/, 'standard list shells should mount before page renderers fill rows');

targetPages.forEach(([page, statsId, searchId, bodyId, pagerInfoId, pageSizeId, pagerBtnsId]) => {
  const pageRe = new RegExp(`<div class="page-section[^"]*" id="page-${page}" data-standard-list-shell="${page}"></div>`);
  assert.match(html, pageRe, `${page} should only keep the standard list shell mount point in index.html`);
  const manualSection = html.match(new RegExp(`id="page-${page}"[\\s\\S]*?(?=\\n    <!--|\\n    <div class="page-section"|\\n</div>\\n</div>\\n</div>)`))?.[0] || '';
  assert.doesNotMatch(manualSection, /tms-toolbar|tms-table-card|tms-pagination|tms-search-wrapper/, `${page} should not define list chrome directly in index.html`);
  assert.match(appSource, new RegExp(`key:'${page}'[\\s\\S]*search:\\{id:'${searchId}'`), `${page} should define its search through the global list config`);
  if (statsId) assert.match(appSource, new RegExp(`key:'${page}'[\\s\\S]*statsId:'${statsId}'`), `${page} should define stats through the global list config`);
  assert.match(appSource, new RegExp(`key:'${page}'[\\s\\S]*${bodyId}`), `${page} should expose its row/body mount through the global list shell`);
  assert.match(appSource, new RegExp(`key:'${page}'[\\s\\S]*${pagerInfoId}[\\s\\S]*${pageSizeId}[\\s\\S]*${pagerBtnsId}`), `${page} should define standard pager hosts through the global list shell`);
});

console.log('standard list shell tests passed');
