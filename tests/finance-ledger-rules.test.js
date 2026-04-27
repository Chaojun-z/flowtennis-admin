const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');

assert.match(source, /function renderFinanceOverview\(/, 'finance center should expose overview rendering');
assert.match(source, /const overviewCandidate=campusName[\s\S]*: financeOverviewData\?\.all;/, 'finance overview cards should read the backend normalized overview summary candidate');
assert.match(source, /const hasApiLedger=financeNormalizedRows\(\)\.length\|\|\s*\(Array\.isArray\(financialLedger\)&&financialLedger\.length\);[\s\S]*const overviewFromApi=hasApiLedger\?overviewCandidate:null;/, 'finance overview cards should fall back to legacy stitched totals when the financial ledger is empty');
assert.doesNotMatch(source, /financeOverviewSecondaryStats/, 'owner-facing finance overview should not render a second audit card row');
assert.match(source, /const bookingOverviewRows=overviewFromApi\?\[\]:ledgerRows\.filter\(row=>\{[\s\S]*paymentChannel\|\|''\)\.trim\(\)==='历史导入'[\s\S]*期初导入汇总\|历史导入/, 'booking overview cards should exclude historical import and migration-only booking rows from the owner-facing summary');
assert.match(source, /const finalBookingIncome=overviewFromApi\?bookingIncome:bookingOverviewRows\.reduce/, 'booking income summary should only use the filtered operating booking rows');
assert.match(source, /const finalBookingRecognized=overviewFromApi\?bookingRecognized:bookingOverviewRows\.reduce/, 'booking recognized summary should use the same operating booking rows as booking income');
assert.match(source, /value:financeCardValue\(finalCash\)/, 'finance overview should render fallback totals instead of zeroing owner cards');
assert.match(source, /value:financeCardValue\(finalBookingIncome,finalBookingRecognized\)/, 'booking overview should render the filtered booking totals');

console.log('finance ledger rules tests passed');
