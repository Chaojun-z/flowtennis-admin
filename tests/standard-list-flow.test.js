const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource, html } = require('./helpers/read-index-bundle');

const root = path.join(__dirname, '..');
const standardSource = fs.readFileSync(path.join(root, 'public/assets/scripts/standard/components.js'), 'utf8');

function pageSource(name) {
  return fs.readFileSync(path.join(root, 'public/assets/scripts/pages', `${name}.js`), 'utf8');
}

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

['standardListFirstPage', 'standardListPageSize', 'standardListPagination', 'standardListSlice'].forEach(name => {
  assert.match(standardSource, new RegExp(`function ${name}\\(`), `${name} should live in the global standard component module`);
  assert.match(standardSource, new RegExp(`Object\\.assign\\(window,[\\s\\S]*${name}`), `${name} should be exposed globally`);
});

[
  ['students', 'stu', 'Student', 'renderStudents', 'onStudentFilterChange', 'cycleStudentSort'],
  ['schedule', 'sch', 'Schedule', 'renderSchedule', 'onScheduleFilterChange', null],
  ['leads', 'lead', 'Lead', 'renderLeads', 'onLeadFilterChange', 'cycleLeadSort'],
  ['purchases', 'pur', 'Purchase', 'renderPurchases', 'onPurchaseSearchChange', null],
  ['prices', 'price', 'Price', 'renderPrices', 'onPriceFilterChange', null],
  ['admin-users', 'adminUser', 'AdminUser', 'renderAdminUsers', 'onAdminUserFilterChange', null]
].forEach(([file, prefix, title, renderFn, filterFn, sortFn]) => {
  const source = pageSource(file);
  const resetPattern = new RegExp(`${prefix}Page=standardListFirstPage\\(\\)`);
  const filterBody = fnBody(source, filterFn);
  if (file === 'students' && /resetCurrentStudentListPage\(\)/.test(filterBody)) {
    assert.match(fnBody(source, 'resetCurrentStudentListPage'), resetPattern, `${file} filters should reset to first page through the global list flow`);
  } else {
    assert.match(filterBody, resetPattern, `${file} filters should reset to first page through the global list flow`);
  }
  if (sortFn) {
    const sortBody = fnBody(source, sortFn);
    if (file === 'students' && /resetCurrentStudentListPage\(\)/.test(sortBody)) {
      assert.match(fnBody(source, 'resetCurrentStudentListPage'), resetPattern, `${file} sorting should reset to first page through the global list flow`);
    } else {
      assert.match(sortBody, resetPattern, `${file} sorting should reset to first page through the global list flow`);
    }
  }
  assert.match(fnBody(source, `set${title}PageSize`), new RegExp(`${prefix}PageSize=standardListPageSize\\(value,${prefix}PageSize\\)`), `${file} page size should use the global 15/50/100 rule`);
  assert.match(fnBody(source, `set${title}Page`), /standardListPagination\(/, `${file} page switching should use global page normalization`);
  assert.match(fnBody(source, renderFn), /standardListSlice\(/, `${file} rendering should use global page slicing and empty-page fallback`);
  assert.doesNotMatch(source, /function \w+PageNumbers\(/, `${file} should not define page-number rules locally`);
});

const packageSource = pageSource('packages');
assert.doesNotMatch(fnBody(packageSource, 'onPackageFilterChange'), /pkgPage=standardListFirstPage\(\)/, 'package board filters should not reset table pagination');
assert.doesNotMatch(fnBody(packageSource, 'renderPackages'), /standardListSlice\(/, 'package board should not use table pagination slicing');
assert.doesNotMatch(appSource.match(/key:'packages'[\s\S]*?(?=\n    \{key:|\n  \];)/)?.[0] || '', /pager:/, 'package board should not expose the standard pager shell');
assert.match(appSource, /infoId:'pricePagerInfo'[\s\S]*pageSizeId:'pricePageSize'[\s\S]*buttonsId:'pricePagerBtns'/, 'price page should expose the standard pager shell');

const financeSource = pageSource('coachops');
[
  ['finance ledger', 'FinanceLedger', 'financeLedger'],
  ['finance revenue', 'FinanceRevenue', 'financeRevenue'],
  ['finance recognized', 'FinanceRecognized', 'financeRecognized']
].forEach(([label, title, prefix]) => {
  assert.match(fnBody(financeSource, `set${title}PageSize`), new RegExp(`${prefix}PageSize=standardListPageSize\\(value,${prefix}PageSize\\)`), `${label} page size should use the global 15/50/100 rule`);
  assert.match(fnBody(financeSource, `set${title}Page`), /standardListPagination\(/, `${label} page switching should use global page normalization`);
});
assert.match(fnBody(financeSource, 'renderFinanceLedger'), /standardListSlice\(/, 'finance ledger rendering should use global page slicing and empty-page fallback');
assert.match(fnBody(financeSource, 'renderFinanceRevenueReport'), /standardListSlice\(/, 'finance revenue rendering should use global page slicing and empty-page fallback');
assert.match(fnBody(financeSource, 'renderFinanceConsumeReport'), /standardListSlice\(/, 'finance recognized rendering should use global page slicing and empty-page fallback');
assert.match(fnBody(financeSource, 'renderFinanceLedgerFilterChange'), /financeLedgerPage=standardListFirstPage\(\)/, 'finance ledger filters should reset to the first page');
assert.match(fnBody(financeSource, 'resetFinanceRevenuePage'), /financeRevenuePage=standardListFirstPage\(\)/, 'finance revenue filters should reset to the first page');
assert.match(fnBody(financeSource, 'resetFinanceRecognizedPage'), /financeRecognizedPage=standardListFirstPage\(\)/, 'finance recognized filters should reset to the first page');

console.log('standard list flow tests passed');
