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
  ['packages', '', 'pkgSearch', 'packageGrid', '', '', ''],
  ['prices', '', 'priceSearch', 'priceTbody', 'pricePagerInfo', 'pricePageSize', 'pricePagerBtns'],
  ['admin-users', '', 'adminUserSearch', 'adminUserTbody', 'adminUserPagerInfo', 'adminUserPageSize', 'adminUserPagerBtns'],
  ['coachops', '', '', 'coachOpsTbody', '', '', ''],
  ['matches', '', 'matchSearch', 'matchTbody', '', '', ''],
  ['coaches', '', 'coachSearch', 'coachTbody', '', '', ''],
  ['courts', 'courtStatsRow', 'courtSearch', 'courtTbody', 'courtPagerInfo', 'courtPageSize', 'courtPagerBtns'],
  ['memberships', 'membershipStatsRow', 'membershipSearch', 'membershipTbody', 'membershipPagerInfo', 'membershipPageSize', 'membershipPagerBtns'],
  ['membership-plans', '', 'membershipPlanSearch', 'membershipPlanTbody', '', '', ''],
  ['products', '', 'prodSearch', 'productGrid', '', '', ''],
  ['entitlements', '', 'entSearch', 'entitlementTbody', '', '', ''],
  ['mystudents', 'myStudentStats', '', 'myStuTbody', '', '', ''],
  ['myclasses', 'myClassStats', '', 'myClsTbody', '', '', ''],
  ['campusmgr', '', 'campusSearch', 'campusTbody', '', '', '']
];
const financePanelTargets = [
  ['finance-ledger', 'financeLedgerReady', 'financeOverviewPrimaryStats', 'financeLedgerSearch', 'financeLedgerTbody', 'financeLedgerPagerInfo', 'financeLedgerPageSize', 'financeLedgerPagerBtns'],
  ['finance-revenue', 'financeRevenuePanel', 'coachOpsRevenueStats', 'coachOpsRevenueSearch', 'financeRevenueTbody', 'financeRevenuePagerInfo', 'financeRevenuePageSize', 'financeRevenuePagerBtns'],
  ['finance-recognized', 'financeRecognizedPanel', 'coachOpsConsumeStats', 'coachOpsConsumeSearch', 'financeConsumeTbody', 'financeRecognizedPagerInfo', 'financeRecognizedPageSize', 'financeRecognizedPagerBtns']
];

function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = appSource.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a global list shell config`);
  const rest = appSource.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

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
  const configBlock = standardConfigBlock(page);
  const pageRe = new RegExp(`<div class="page-section[^"]*" id="page-${page}" data-standard-list-shell="${page}"></div>`);
  assert.match(html, pageRe, `${page} should only keep the standard list shell mount point in index.html`);
  const manualSection = html.match(new RegExp(`id="page-${page}"[\\s\\S]*?(?=\\n    <!--|\\n    <div class="page-section"|\\n</div>\\n</div>\\n</div>)`))?.[0] || '';
  assert.doesNotMatch(manualSection, /tms-toolbar|tms-table-card|tms-pagination|tms-search-wrapper/, `${page} should not define list chrome directly in index.html`);
  if (searchId) assert.ok(configBlock.includes(`search:{id:'${searchId}'`), `${page} should define its search through the global list config`);
  if (statsId) assert.ok(configBlock.includes(`statsId:'${statsId}'`), `${page} should define stats through the global list config`);
  assert.ok(configBlock.includes(bodyId), `${page} should expose its row/body mount through the global list shell`);
  if (pagerInfoId) {
    assert.ok(configBlock.includes(pagerInfoId) && configBlock.includes(pageSizeId) && configBlock.includes(pagerBtnsId), `${page} should define standard pager hosts through the global list shell`);
  } else {
    assert.doesNotMatch(configBlock, /pager:/, `${page} should not define standard pager hosts`);
  }
});

financePanelTargets.forEach(([key, hostId, statsId, searchId, bodyId, pagerInfoId, pageSizeId, pagerBtnsId]) => {
  const configBlock = standardConfigBlock(key);
  assert.match(html, new RegExp(`id="${hostId}"[^>]*data-standard-list-shell="${key}"`), `${key} should keep only a standard list shell mount point`);
  const manualSection = html.match(new RegExp(`id="${hostId}"[\\s\\S]*?(?=\\n      <div id="finance|\\n      </div>\\n      <div id="financeSettlementPanel"|\\n    </div>)`))?.[0] || '';
  assert.doesNotMatch(manualSection, /tms-toolbar|tms-table-card|tms-pagination|tms-search-wrapper/, `${key} should not define list chrome directly in index.html`);
  assert.ok(configBlock.includes(`search:{id:'${searchId}'`), `${key} should define search through the global list config`);
  assert.ok(configBlock.includes(`statsId:'${statsId}'`), `${key} should define stats through the global list config`);
  assert.ok(configBlock.includes(bodyId), `${key} should expose its row/body mount through the global list shell`);
  assert.ok(configBlock.includes(pagerInfoId) && configBlock.includes(pageSizeId) && configBlock.includes(pagerBtnsId), `${key} should define standard pager hosts through the global list shell`);
});

console.log('standard list shell tests passed');
