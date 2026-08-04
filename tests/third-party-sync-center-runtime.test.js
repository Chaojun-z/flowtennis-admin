const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'third-party-sync-center.js'), 'utf8');
const context = {
  thirdPartySyncCenterData: {
    batches: [{ batchId: 'batch-1', id: 'batch-1', pulledAt: '2026-07-30T00:00:00+08:00' }],
    rawRecords: [{
      batchId: 'batch-1',
      sourceType: 'order',
      thirdPartyId: 'ORDER-1',
      rawJson: {
        sourceType: 'order',
        orderNo: 'ORDER-1',
        realName: '秋明',
        phone: '8618600689666',
        orderInfo: [
          { time: '2026-07-29', region: '09:30-10:00', priceBasicsInfo: { placeName: '室内2号' } },
          { time: '2026-07-29', region: '10:00-10:30', priceBasicsInfo: { placeName: '室内2号' } }
        ],
        remark: '替会员订场'
      }
    }],
    prechecks: [],
    changes: [{
      batchId: 'batch-1',
      sourceType: 'order',
      sourceRecordId: 'ORDER-1',
      changeType: 'remark_changed',
      currentRaw: {
        sourceType: 'order',
        orderNo: 'ORDER-1',
        realName: '秋明',
        phone: '8618600689666',
        orderInfo: [{ time: '2026-07-29', region: '09:30-10:30', priceBasicsInfo: { placeName: '室内2号' } }],
        remark: '替会员订场'
      },
      status: 'pending_review'
    }],
    alerts: [{
      batchId: 'batch-1',
      sourceRecordId: 'ORDER-1',
      reason: '手机号格式不正确',
      status: 'open'
    }, {
      batchId: 'batch-1',
      reason: '历史空壳报警',
      status: 'open'
    }],
    confirmations: [],
    importResults: [],
    rollbacks: []
  },
  document: { getElementById: () => null },
  esc: value => String(value ?? ''),
  fmt: value => String(value ?? ''),
  renderStandardCellText: value => String(value ?? ''),
  renderStandardTooltipText: value => String(value ?? '')
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'third-party-sync-center.js' });

const rows = vm.runInContext("thirdPartySyncNeedsProcessingRows('batch-1')", context);
assert.strictEqual(rows.length, 1, 'runtime should merge change and alert for the same third-party row into one needs-processing row');
assert.match(rows[0].reason, /备注修改|手机号格式不正确/, 'merged needs-processing row should keep both business reasons');
assert.ok(!rows.some(row => row.reason === '历史空壳报警'), 'source-less legacy alerts should not pollute operator handling rows');
for (const row of rows) {
  assert.strictEqual(row.date, '2026-07-29', 'needs-processing row should show booking date, not pull date');
  assert.strictEqual(row.time, '09:30-10:30', 'needs-processing row should show booking time range');
  assert.strictEqual(row.venue, '2号场', 'needs-processing row should show court venue');
  assert.strictEqual(row.customerName, '秋明', 'needs-processing row should show third-party user name');
  assert.strictEqual(row.phone, '18600689666', 'needs-processing row should normalize 86 country code');
  assert.strictEqual(row.remark, '替会员订场', 'needs-processing row should show third-party remark');
  assert.match(row.action, /openThirdPartySyncConfirmModal/, 'needs-processing row should expose a real handling action');
}

console.log('third-party sync center runtime tests passed');
