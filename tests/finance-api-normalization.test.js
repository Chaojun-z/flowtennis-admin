const assert = require('assert');
const api = require('../api/index.js')._test;

const campuses = [
  { id: 'mabao', code: 'mabao', name: '顺义马坡' },
  { id: 'chaojun', code: 'chaojun', name: '朝珺私教' }
];

const rows = api.buildNormalizedFinanceRows({
  campuses,
  courts: [{ id: 'court-1', campus: 'mabao' }],
  financialLedger: [
    {
      id: 'ledger-1',
      businessDate: '2026-04-20',
      userId: 'stu-1',
      userName: '张三',
      businessType: '课程',
      actionType: '核销',
      cashDelta: 0,
      recognizedRevenueDelta: 120000,
      deferredRevenueDelta: -120000,
      paymentChannel: '课包划扣',
      productSnapshotName: '成人1v1 10节课包',
      sourceId: 'pur-1',
      purchaseId: 'pur-1',
      entitlementId: 'ent-1',
      campusId: 'chaojun',
      notes: '朝珺私教'
    },
    {
      id: 'ledger-2',
      businessDate: '2026-04-21',
      userId: 'match-court-finance',
      userName: '约球订场',
      businessType: '',
      actionType: '留痕',
      cashDelta: 20000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 0,
      paymentChannel: '微信',
      productSnapshotMeta: { courtId: 'court-1' },
      sourceId: 'match-1',
      notes: ''
    }
  ]
});
const overview = api.buildFinanceOverview(rows);
const audit = api.buildFinanceAudit(rows, overview);

assert.strictEqual(rows.length, 2, 'finance normalization should keep every active ledger row');
assert.strictEqual(rows[0].campusName, '朝珺私教', 'finance normalization should prefer explicit ledger campus');
assert.strictEqual(rows[0].actionType, '已入账', 'write-off rows should normalize to recognized revenue action');
assert.strictEqual(rows[0].recognizedRevenueDelta, 1200, 'finance normalization should convert ledger cents into yuan');
assert.strictEqual(rows[1].campusName, '顺义马坡', 'match-court-finance rows should fall back to mabao campus');
assert.strictEqual(rows[1].actionType, '记录', 'trace rows should stay as non-revenue records');
assert.strictEqual(rows[1].sourceDocument, '账本记录 match-1', 'finance normalization should emit a readable source document');
assert.strictEqual(overview.all.cash, 200, 'finance overview should aggregate total cash from normalized rows');
assert.strictEqual(overview.all.recognized, 1200, 'finance overview should aggregate total recognized revenue from normalized rows');
assert.strictEqual(overview.campuses.length, 2, 'finance overview should keep campus-level buckets');
assert.strictEqual(overview.campuses[0].campusName, '朝珺私教', 'finance overview should expose campus names in the summary');
assert.strictEqual(audit.missingCampusCount, 0, 'finance audit should report zero missing campus rows for normalized fixtures');
assert.strictEqual(audit.cashGap, 0, 'finance audit should keep total cash aligned with campus buckets');
assert.strictEqual(audit.recognizedGap, 0, 'finance audit should keep total recognized revenue aligned with campus buckets');
assert.strictEqual(audit.details.length, 6, 'finance audit should expose a fixed anomaly detail checklist');
assert.strictEqual(audit.details[0].type, '缺校区', 'finance audit detail should include missing campus checks');

console.log('finance api normalization tests passed');
