const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');

assert.match(source, /function financeCampusNameFromTextClues\(/, 'finance ledger should normalize campus names from free-text clues');
assert.match(source, /function financeRevenueRowsFromLedger\(/, 'finance revenue report should support a financial-ledger-first source');
assert.match(source, /if\(Array\.isArray\(financialLedger\)&&financialLedger\.length\)return financeRevenueRowsFromLedger\(\);/, 'finance revenue report should prefer financialLedger before legacy stitched sources');
assert.match(source, /purchase\.saleCampusId\|\|entitlementCampus\|\|purchase\.campus\|\|studentCampus/, 'course income campus should prefer saleCampusId before old fallback fields');
assert.match(source, /if\(actionType==='核销'\)return '已入账';/, 'finance ledger should treat write-off rows as recognized revenue actions');
assert.match(source, /if\(userId==='match-court-finance'\)return '顺义马坡';/, 'finance ledger should pin match-court-finance to mabao campus');

console.log('finance ledger rules tests passed');
