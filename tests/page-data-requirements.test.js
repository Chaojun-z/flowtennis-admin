const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(source, /students:\['campuses','students'\]/, 'students page should only block on the dataset needed to paint the list immediately');
assert.match(source, /plans:\[\]/, 'plans page should open shell immediately and load data in background');
assert.match(source, /packages:\[\]/, 'packages page should open shell immediately and load data in background');
assert.match(source, /purchases:\[\]/, 'purchases page should open shell immediately and load data in background');
assert.match(source, /finance:\['campuses','students','schedule','entitlements','entitlementLedger','coaches','products','purchases','packages'\]/, 'finance center should load the datasets needed for reports');
assert.match(source, /courts:\[\]/, 'courts page should open shell immediately and load data in background');
assert.match(source, /memberships:\[\]/, 'memberships page should open shell immediately and load data in background');
assert.match(source, /workbench:\[\]/, 'coach workbench should open immediately and load data in background');
assert.match(source, /myschedule:\[\]/, 'coach schedule should open immediately and load data in background');
assert.match(source, /mystudents:\[\]/, 'coach students should open immediately and load data in background');
assert.match(source, /myclasses:\[\]/, 'coach classes should open immediately and load data in background');
assert.match(source, /const PAGE_DATA_BACKGROUND_REQUIREMENTS=\{[\s\S]*students:\['classes','schedule','feedbacks','products','courts'\][\s\S]*plans:\['plansPage'\][\s\S]*packages:\['packages','products'\][\s\S]*purchases:\['purchasesPage'\][\s\S]*courts:\['campuses','students','courts','membershipAccounts','coaches','pricePlans'\][\s\S]*memberships:\['campuses','students','courts','membershipAccounts','coaches'\][\s\S]*workbench:\['workbenchPage'\][\s\S]*myschedule:\['campuses','students','classes','schedule','feedbacks'\][\s\S]*mystudents:\['campuses','students','classes','schedule','feedbacks','entitlements'\][\s\S]*myclasses:\['students','classes','products'\]/, 'heavy page datasets should move behind first render, and plans purchases workbench should use single aggregated datasets');
assert.match(source, /plansPage:\(\)=>apiCall\('GET','\/page-data\/plans'\)/, 'plans page should use a dedicated aggregated endpoint');
assert.match(source, /purchasesPage:\(\)=>apiCall\('GET','\/page-data\/purchases'\)/, 'purchases page should use a dedicated aggregated endpoint');
assert.match(source, /workbenchPage:\(\)=>apiCall\('GET','\/page-data\/workbench'\)/, 'coach workbench should use a dedicated aggregated endpoint');
assert.match(source, /Promise\.allSettled\(names\.map/, 'background loading should fetch page datasets in parallel');
assert.match(source, /if\(name==='plansPage'\)\{[\s\S]*setDatasetValue\('campuses',data\.campuses\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('classes',data\.classes\|\|\[\]\);[\s\S]*setDatasetValue\('plans',data\.plans\|\|\[\]\);[\s\S]*setDatasetValue\('products',data\.products\|\|\[\]\);[\s\S]*setDatasetValue\('schedule',data\.schedule\|\|\[\]\);[\s\S]*setDatasetValue\('courts',data\.courts\|\|\[\]\);[\s\S]*setDatasetValue\('entitlements',data\.entitlements\|\|\[\]\);/, 'plans page aggregate loader should hydrate all dependent datasets from one response');
assert.match(source, /if\(name==='purchasesPage'\)\{[\s\S]*setDatasetValue\('purchases',data\.purchases\|\|\[\]\);[\s\S]*setDatasetValue\('packages',data\.packages\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('entitlements',data\.entitlements\|\|\[\]\);/, 'purchases page aggregate loader should hydrate all dependent datasets from one response');
assert.match(source, /if\(name==='workbenchPage'\)\{[\s\S]*setDatasetValue\('campuses',data\.campuses\|\|\[\]\);[\s\S]*setDatasetValue\('students',data\.students\|\|\[\]\);[\s\S]*setDatasetValue\('classes',data\.classes\|\|\[\]\);[\s\S]*setDatasetValue\('schedule',data\.schedule\|\|\[\]\);[\s\S]*setDatasetValue\('feedbacks',data\.feedbacks\|\|\[\]\);/, 'workbench aggregate loader should hydrate coach homepage dependencies from one response');
assert.match(source, /const DATA_CACHE_PREFIX='ft_dataset_cache_';/, 'state should persist the last successful datasets for refresh fallback');
assert.match(source, /function hydrateDatasetsFromCache\(\)/, 'state should hydrate cached datasets before network refresh');
assert.match(source, /function persistDatasetCache\(name,data\)/, 'state should cache every successful dataset load');
assert.match(source, /function missingRequiredDatasetsForPage\(pg\)/, 'state should be able to detect when the current page still lacks blocking datasets');
assert.match(source, /function renderPageLoading\(pg\)/, 'state should render inline loading placeholders instead of empty pages');
assert.match(source, /if\(pageNeedsInlineLoading\(pg\)\)\{\s*renderPageLoading\(pg\);\s*return;\s*\}/, 'page rendering should show inline loading placeholders until the page has the datasets it needs');
assert.match(source, /const datasetLoadPromises=new Map\(\);/, 'state should de-duplicate concurrent dataset requests');
assert.match(source, /datasetLoadPromises\.has\(name\)/, 'dataset loading should reuse in-flight requests');
assert.match(source, /loadPageBackgroundDatasets\(pg,requestVersion,\{force:true\}\);/, 'page background loading should revalidate cached data without blocking first paint');

console.log('page data requirements tests passed');
