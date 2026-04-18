const assert = require('assert');
const seed = require('../api/seeds/mabao-finance-seed.json');

assert.strictEqual(seed.purchases.length, 45, 'Sheet1 should import all 45 income/course rows');
assert.strictEqual(seed.entitlements.length, 45, 'course statistics should create one entitlement per student row');
assert.strictEqual(
  seed.purchases.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0),
  242500,
  'Sheet1 income should include formula amounts such as 赵新阳 田秀楠 8800'
);
assert.strictEqual(
  seed.purchases.reduce((sum, row) => sum + (Number(row.packageLessons) || 0), 0),
  540,
  'Sheet1 sold lessons should match the source table'
);
assert.strictEqual(
  seed.entitlementLedger.reduce((sum, row) => sum + (Number(row.lessonDelta) < 0 ? Math.abs(Number(row.lessonDelta)) : 0), 0),
  152.5,
  'consume ledger should preserve decimal lesson usage'
);
assert.deepStrictEqual(
  [...new Set(seed.entitlementLedger.map(x => x.sourceMonth))].sort(),
  ['2026-01', '2026-02', '2026-03'],
  'consume ledger should include Jan/Feb/Mar history'
);
assert.ok(seed.entitlementLedger.length >= 50, 'consume ledger should include monthly consumption rows, not only April rows');

const zhao = seed.purchases.find(x => x.studentName === '赵新阳 田秀楠');
assert.ok(zhao, '赵新阳 田秀楠 should be imported');
assert.strictEqual(zhao.amountPaid, 8800, 'formula fee for 赵新阳 田秀楠 should be evaluated');

const misha = seed.purchases.find(x => x.studentName === 'misha');
assert.ok(misha && /每周四20-21点/.test(misha.notes || ''), 'purchase notes should include notes from 课时统计 remarks column');

const mishaLedger = seed.entitlementLedger.filter(x => x.purchaseId === 'seed-purchase-002');
assert.ok(mishaLedger.every(x => /每周四20-21点/.test(x.notes || '')), 'consume rows should preserve remarks for traceability');
assert.ok(mishaLedger.every(x => x.importSource === '系统导入' && x.createdAt === seed.meta.generatedAt), 'imported consume rows should use system import time instead of fake class time');

console.log('finance seed data tests passed');
