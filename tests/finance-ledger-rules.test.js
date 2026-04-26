const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');

assert.match(source, /function financeCampusNameFromTextClues\(/, 'finance ledger should normalize campus names from free-text clues');
assert.match(source, /function financeNormalizedRows\(/, 'finance page should reuse the normalized backend finance rows');
assert.match(source, /function financeRevenueRowsFromLedger\(/, 'finance revenue report should support a financial-ledger-first source');
assert.match(source, /function financeConsumeRowsFromLedger\(/, 'finance recognized report should support a financial-ledger-first source');
assert.match(source, /function financeLessonDeferredRows\(\)\{[\s\S]*purchaseEntitlement\(purchase\.id\)/, 'lesson deferred report should still compute from purchases and entitlements instead of depending on revenue rows');
assert.match(source, /if\(Array\.isArray\(financeRows\)&&financeRows\.length\)return financeRevenueRowsFromLedger\(\);/, 'finance revenue report should prefer normalized financeRows before older stitched sources');
assert.match(source, /if\(Array\.isArray\(financeRows\)&&financeRows\.length\)\{[\s\S]*return financeConsumeRowsFromLedger\(\)\.filter/, 'finance recognized report should prefer normalized financeRows before older entitlement stitching');
assert.match(source, /return loadedDatasets\.has\('financeRows'\)\|\|loadedDatasets\.has\('financialLedger'\)\|\|loadedDatasets\.has\('financePage'\);/, 'finance center loading state should recognize normalized finance rows');
assert.match(source, /const overviewFromApi=campusName[\s\S]*: financeOverviewData\?\.all;/, 'finance overview cards should prefer the backend normalized overview summary');
assert.match(source, /const audit=financeAuditData\|\|\{\};[\s\S]*缺校区记录[\s\S]*历史导入缺日期[\s\S]*朝珺误归马坡风险[\s\S]*总实收-分校区差额/, 'finance overview should surface import and campus-risk audit summary cards');
assert.match(source, /function renderFinanceAuditTable\(/, 'finance page should render audit detail rows from backend audit payload');
assert.match(source, /financeAuditTbody/, 'finance ledger tab should show an audit detail table');
assert.match(source, /row\.suggestion/, 'finance audit detail table should surface actionable handling guidance');
assert.match(source, /purchase\.saleCampusId\|\|entitlementCampus\|\|purchase\.campus\|\|studentCampus/, 'course income campus should prefer saleCampusId before old fallback fields');
assert.match(source, /if\(actionType==='核销'\)return '已入账';/, 'finance ledger should treat write-off rows as recognized revenue actions');
assert.match(source, /if\(actionType==='留痕'\)return '记录';/, 'finance ledger should preserve trace-only rows as non-revenue records');
assert.match(source, /if\(userId==='match-court-finance'\)return '顺义马坡';/, 'finance ledger should pin match-court-finance to mabao campus');

console.log('finance ledger rules tests passed');
