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
  ['purchases', 'pur', 'Purchase', 'renderPurchases', 'onPurchaseFilterChange', null],
  ['packages', 'pkg', 'Package', 'renderPackages', 'onPackageFilterChange', null],
  ['prices', 'price', 'Price', 'renderPrices', 'onPriceFilterChange', null],
  ['admin-users', 'adminUser', 'AdminUser', 'renderAdminUsers', 'onAdminUserFilterChange', null]
].forEach(([file, prefix, title, renderFn, filterFn, sortFn]) => {
  const source = pageSource(file);
  assert.match(fnBody(source, filterFn), new RegExp(`${prefix}Page=standardListFirstPage\\(\\)`), `${file} filters should reset to first page through the global list flow`);
  if (sortFn) assert.match(fnBody(source, sortFn), new RegExp(`${prefix}Page=standardListFirstPage\\(\\)`), `${file} sorting should reset to first page through the global list flow`);
  assert.match(fnBody(source, `set${title}PageSize`), new RegExp(`${prefix}PageSize=standardListPageSize\\(value,${prefix}PageSize\\)`), `${file} page size should use the global 20/50/100 rule`);
  assert.match(fnBody(source, `set${title}Page`), /standardListPagination\(/, `${file} page switching should use global page normalization`);
  assert.match(fnBody(source, renderFn), /standardListSlice\(/, `${file} rendering should use global page slicing and empty-page fallback`);
  assert.doesNotMatch(source, /function \w+PageNumbers\(/, `${file} should not define page-number rules locally`);
});

assert.match(appSource, /infoId:'pkgPagerInfo'[\s\S]*pageSizeId:'pkgPageSize'[\s\S]*buttonsId:'pkgPagerBtns'/, 'package page should expose the standard pager shell');
assert.match(appSource, /infoId:'pricePagerInfo'[\s\S]*pageSizeId:'pricePageSize'[\s\S]*buttonsId:'pricePagerBtns'/, 'price page should expose the standard pager shell');

console.log('standard list flow tests passed');
