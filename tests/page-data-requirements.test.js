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
assert.match(source, /const PAGE_DATA_BACKGROUND_REQUIREMENTS=\{[\s\S]*students:\['classes','schedule','feedbacks','products','courts'\][\s\S]*plans:\['campuses','students','classes','plans','products','schedule','courts','entitlements'\][\s\S]*packages:\['packages','products'\][\s\S]*purchases:\['purchases','packages','students','entitlements'\][\s\S]*courts:\['campuses','students','courts','membershipAccounts','coaches','pricePlans'\][\s\S]*memberships:\['campuses','students','courts','membershipAccounts','coaches'\][\s\S]*workbench:\['campuses','students','classes','schedule','feedbacks'\][\s\S]*myschedule:\['campuses','students','classes','schedule','feedbacks'\][\s\S]*mystudents:\['campuses','students','classes','schedule','feedbacks','entitlements'\][\s\S]*myclasses:\['students','classes','products'\]/, 'heavy page datasets should move behind first render, including the extra student detail datasets');
assert.match(source, /for\(const name of names\)/, 'background loading should process datasets incrementally');
assert.match(source, /await ensureDatasetsByName\(\[name\],\{force\}\)/, 'background loading should fetch one dataset at a time so partial data can render early');
assert.match(source, /const DATA_CACHE_PREFIX='ft_dataset_cache_';/, 'state should persist the last successful datasets for refresh fallback');
assert.match(source, /function hydrateDatasetsFromCache\(\)/, 'state should hydrate cached datasets before network refresh');
assert.match(source, /function persistDatasetCache\(name,data\)/, 'state should cache every successful dataset load');
assert.match(source, /const datasetLoadPromises=new Map\(\);/, 'state should de-duplicate concurrent dataset requests');
assert.match(source, /datasetLoadPromises\.has\(name\)/, 'dataset loading should reuse in-flight requests');
assert.match(source, /loadPageBackgroundDatasets\(pg,requestVersion,\{force:true\}\);/, 'page background loading should revalidate cached data without blocking first paint');

console.log('page data requirements tests passed');
