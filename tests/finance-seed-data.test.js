const assert = require('assert');
const seed = require('../server/seeds/mabao-finance-seed.json');

assert.strictEqual(seed.purchases.length, 72, 'income report should include the confirmed package buyers and renewals');
assert.strictEqual(seed.entitlements.length, 72, 'confirmed purchases and renewal rows should create course entitlements');
assert.strictEqual(seed.products.length, 4, 'course products should stay as the four real course types');
assert.strictEqual(seed.packages.length, 7, 'imported purchases should link to seven course-product package records');
assert.deepStrictEqual(
  seed.products.map(x => x.name).sort(),
  ['成人1v1私教课', '成人1v2私教课', '青少年1v1私教课', '青少年1v2私教课'].sort(),
  'history special should not become a course product'
);
assert.deepStrictEqual(
  seed.packages.map(x => x.name).sort(),
  ['成人1v1 10节课包', '成人1v1 历史特殊课包', '成人1v2 历史特殊课包', '青少年1v1 10节课包', '青少年1v1 历史特殊课包', '青少年1v2 20节课包', '青少年1v2 40节课包'].sort(),
  'packages should be course-product based without splitting by coach-specific deal prices'
);
assert.ok(seed.packages.every(pkg => seed.products.some(product => product.id === pkg.productId)), 'every package should link to a real course product');
assert.ok(
  seed.purchases.every(purchase => {
    const pkg = seed.packages.find(x => x.id === purchase.packageId);
    return pkg && pkg.productId === purchase.productId && pkg.productName === purchase.productName;
  }),
  'every purchase should link through package to the same course product'
);
assert.ok(
  seed.entitlements.every(entitlement => {
    const purchase = seed.purchases.find(x => x.id === entitlement.purchaseId);
    return purchase && purchase.packageId === entitlement.packageId && purchase.productId === entitlement.productId;
  }),
  'every entitlement should keep purchase, package, and product linkage'
);
assert.ok(seed.meta.deletePackages.includes('seed-package-001'), 'old per-student package records should be cleaned from online data');
assert.strictEqual(
  seed.purchases.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0),
  392100,
  'income should include formula amounts and renewal fees without double-counting detailed lesson sheets'
);
assert.strictEqual(
  seed.purchases.reduce((sum, row) => sum + (Number(row.packageLessons) || 0), 0),
  890,
  'sold lessons should include renewal lessons'
);
assert.strictEqual(
  seed.entitlementLedger.reduce((sum, row) => sum + (Number(row.lessonDelta) < 0 ? Math.abs(Number(row.lessonDelta)) : 0), 0),
  312,
  'consume ledger should preserve monthly decimals and detailed lesson history'
);
assert.deepStrictEqual(
  [...new Set(seed.entitlementLedger.map(x => x.sourceMonth).filter(Boolean))].sort(),
  ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'],
  'consume ledger should include history through the 5/15 cutoff'
);
assert.ok(seed.entitlementLedger.length >= 190, 'consume ledger should include detailed lesson rows, not only monthly rows');
assert.strictEqual(seed.entitlementLedger.filter(x => x.sourceSheet === '马坡收入记录').length, 133, 'lesson consume rows should import concrete class times from the MaPo income table');
assert.ok(
  seed.entitlementLedger
    .filter(x => x.sourceSheet === '马坡收入记录' && Number(x.lessonDelta) < 0)
    .every(x => /\d{2}:\d{2}-\d{2}:\d{2}/.test(x.sourceTimeBand || '')),
  'imported lesson consume rows should all carry concrete time bands'
);
assert.strictEqual(seed.purchases.filter(x => x.sourceType === 'lesson_payment').length, 0, 'detailed lesson sheet transfer rows should stay as notes, not duplicated income');

const ledgerKeys = seed.entitlementLedger.map(row => [
  row.entitlementId,
  row.purchaseId,
  row.studentId,
  row.scheduleId || '',
  row.lessonDelta,
  row.action || '',
  row.reason || '',
  row.relatedDate || '',
  row.sourceMonth || '',
  row.sourceDate || '',
  row.sourceTimeBand || '',
  row.sourceLocation || '',
  row.coach || '',
  row.sourceSheet || '',
  row.notes || '',
  row.createdAt || ''
].join('|'));
assert.strictEqual(
  new Set(ledgerKeys).size,
  ledgerKeys.length,
  'historical consume ledger should not contain duplicate imported rows'
);

for (const entitlement of seed.entitlements) {
  const consumed = seed.entitlementLedger
    .filter(row => row.entitlementId === entitlement.id && Number(row.lessonDelta) < 0)
    .reduce((sum, row) => sum + Math.abs(Number(row.lessonDelta) || 0), 0);
  assert.strictEqual(Number(entitlement.usedLessons) || 0, consumed, `entitlement ${entitlement.id} used lessons should match consume ledger`);
  assert.strictEqual(Number(entitlement.remainingLessons) || 0, Math.max(0, (Number(entitlement.totalLessons) || 0) - consumed), `entitlement ${entitlement.id} remaining lessons should match consume ledger`);
}

const zhao = seed.purchases.find(x => x.studentName === '赵新阳 田秀楠');
assert.ok(zhao, '赵新阳 田秀楠 should be imported');
assert.strictEqual(zhao.amountPaid, 8800, 'formula fee for 赵新阳 田秀楠 should be evaluated');

const liRenewal = seed.purchases.find(x => x.studentName === '李嵚' && x.sourceType === 'renewal');
assert.ok(liRenewal, '李嵚 renewal should be imported');
assert.strictEqual(liRenewal.amountPaid, 21000, '李嵚 renewal fee should be imported');
assert.strictEqual(liRenewal.packageLessons, 50, '李嵚 renewal lessons should be imported');
assert.strictEqual(liRenewal.packageName, '成人1v1 历史特殊课包', '李嵚 50 lesson renewal should stay under adult 1v1 history package');
assert.strictEqual(liRenewal.coachPriceName, '晓哲教练', 'coach price dimension should stay on the purchase snapshot');

const wjingRenewal = seed.purchases.find(x => x.studentName === 'W.Jing' && x.sourceType === 'renewal');
assert.ok(wjingRenewal, 'W.Jing renewal should be imported');
assert.strictEqual(wjingRenewal.amountPaid, 3800, 'W.Jing renewal fee should stay split from W.Jing friend');
assert.strictEqual(wjingRenewal.packageLessons, 10, 'W.Jing renewal lessons should stay split from W.Jing friend');
assert.strictEqual(wjingRenewal.packageName, '成人1v1 历史特殊课包', 'W.Jing renewal should stay under adult 1v1 history package');
assert.strictEqual(wjingRenewal.coachPriceName, 'siren', 'coach price dimension should stay on the purchase snapshot');

const wjingFriendRenewal = seed.purchases.find(x => x.studentName === 'W.Jing朋友' && x.sourceType === 'renewal');
assert.ok(wjingFriendRenewal, 'W.Jing friend second package should be imported separately');
assert.strictEqual(wjingFriendRenewal.amountPaid, 3800, 'W.Jing friend renewal fee should be imported');
assert.strictEqual(wjingFriendRenewal.packageLessons, 10, 'W.Jing friend renewal lessons should be imported');

const hammerEntitlement = seed.entitlements.find(x => x.studentName === '是锤锤呀');
assert.ok(hammerEntitlement, '锤锤 package should be imported');
assert.strictEqual(hammerEntitlement.usedLessons, 8, '锤锤 should consume 8 lessons through 5/15');
assert.strictEqual(hammerEntitlement.remainingLessons, 12, '锤锤 should have 12 lessons remaining');

const liRenewalEntitlement = seed.entitlements.find(x => x.id === 'seed-renewal-entitlement-006');
assert.strictEqual(liRenewalEntitlement.remainingLessons, 35.5, '李嵚 renewal balance should stay 35.5/50');

const majieRows = seed.entitlementLedger.filter(x => x.studentId === 'seed-student-018' && Number(x.lessonDelta) < 0);
assert.strictEqual(majieRows.length, 7, '马杰 should display seven concrete lesson records');

const yayaInitial = seed.purchases.find(x => x.id === 'seed-purchase-007');
assert.strictEqual(yayaInitial.packageLessons, 20, '丫丫 2026-01-19 first purchase should be one 20 lesson package');
assert.strictEqual(yayaInitial.amountPaid, 8800, '丫丫 2026-01-19 first purchase amount should match the 20 lesson package');
assert.ok(!seed.purchases.some(x => x.id === 'seed-renewal-007'), '丫丫 should not keep the old split 10 lesson renewal row');

const yayaInitialEntitlement = seed.entitlements.find(x => x.id === 'seed-entitlement-007');
assert.strictEqual(yayaInitialEntitlement.totalLessons, 20, '丫丫 first entitlement should hold 20 lessons');
assert.strictEqual(yayaInitialEntitlement.usedLessons, 20, '丫丫 first 20 lesson package should be depleted');
assert.strictEqual(yayaInitialEntitlement.remainingLessons, 0, '丫丫 first 20 lesson package should have no remaining balance');
assert.ok(!seed.entitlements.some(x => x.id === 'seed-renewal-entitlement-007'), '丫丫 should not keep the old split 10 lesson entitlement row');
assert.ok(!seed.entitlementLedger.some(x => x.purchaseId === 'seed-renewal-007' || x.entitlementId === 'seed-renewal-entitlement-007'), '丫丫 consumed lessons should point to the real first 20 lesson package');

const misha = seed.purchases.find(x => x.studentName === 'misha');
assert.ok(misha && /每周四20-21点/.test(misha.notes || ''), 'purchase notes should include notes from 课时统计 remarks column');

const mishaLedger = seed.entitlementLedger.filter(x => x.purchaseId === 'seed-purchase-002');
assert.ok(mishaLedger.every(x => /每周四20-21点/.test(x.notes || '')), 'consume rows should preserve remarks for traceability');
assert.ok(mishaLedger.every(x => x.importSource === '系统导入' && x.createdAt === seed.meta.generatedAt), 'imported consume rows should use system import time instead of fake class time');

const songPurchase = seed.purchases.find(x => x.id === 'seed-purchase-036');
assert.ok(songPurchase, '宋缇缇 purchase should exist');
assert.strictEqual(songPurchase.packagePrice, 5000, '宋缇缇 should show 5000 payable price');
assert.strictEqual(songPurchase.systemAmount, 5000, '宋缇缇 should show 5000 system amount');
assert.strictEqual(songPurchase.finalAmount, 4500, '宋缇缇 should show 4500 actual paid amount');
assert.strictEqual(songPurchase.amountPaid, 4500, '宋缇缇 paid amount should stay 4500');

const songEntitlement = seed.entitlements.find(x => x.id === 'seed-entitlement-036');
assert.ok(songEntitlement, '宋缇缇 entitlement should exist');
assert.strictEqual(songEntitlement.usedLessons, 10, '宋缇缇 package should be fully used on 2026-05-21');
assert.strictEqual(songEntitlement.remainingLessons, 0, '宋缇缇 package should display 0/10 after depletion');

const songRows = seed.entitlementLedger.filter(x => x.studentId === 'seed-student-036');
assert.ok(songRows.some(x => x.relatedDate === '2026-04-23' && x.sourceTimeBand === '12:30-13:30' && x.sourceVenue === '2号场' && x.coach === '朝珺' && Number(x.lessonDelta) === -1), '宋缇缇 4/23 should be corrected to one paid lesson on court 2');
assert.ok(songRows.some(x => x.relatedDate === '2026-05-15' && x.sourceTimeBand === '12:30-13:30' && x.sourceVenue === '2号场' && x.coach === '朝珺' && Number(x.lessonDelta) === -1), '宋缇缇 5/15 should be one paid lesson on court 2');
assert.ok(songRows.some(x => x.relatedDate === '2026-05-21' && x.sourceTimeBand === '12:30-13:30' && x.sourceVenue === '2号场' && x.coach === '朝珺' && Number(x.lessonDelta) === -1), '宋缇缇 5/21 should be one paid lesson on court 2');
assert.ok(songRows.some(x => x.relatedDate === '2026-04-24' && x.sourceTimeBand === '12:30-13:30' && x.sourceVenue === '2号场' && x.coach === '小宋' && Number(x.lessonDelta) === 0 && /免费/.test(x.reason + x.notes)), '宋缇缇 4/24 should show the free make-up lesson');
assert.ok(!songRows.some(x => x.relatedDate === '2026-05-22'), '宋缇缇 should not keep a 5/22 lesson row');

console.log('finance seed data tests passed');
