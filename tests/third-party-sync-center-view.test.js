const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const filePath = path.join(repoRoot, 'public/assets/scripts/pages/third-party-sync-center.js');
const source = fs.readFileSync(filePath, 'utf8');

assert(!source.includes('绑定对象ID'), '第三方确认弹窗不能要求运营填写绑定对象ID');
assert(!source.includes('<select'), '第三方确认弹窗必须使用系统标准下拉，不使用原生 select');
assert(source.includes("thirdPartySyncTableTabButton('prechecks','需处理数据')"), '必须保留需处理数据 Tab');
assert(source.includes("thirdPartySyncTableTabButton('batches','同步记录')"), '必须保留同步记录 Tab');
assert(source.includes("thirdPartySyncTableTabButton('confirmations','已处理记录')"), '必须保留已处理记录 Tab');
assert(!source.includes("thirdPartySyncTableTabButton('rollbacks'"), '默认 Tab 不应包含历史异常/作废批次');

const oldBatchId = 'cxe-sync-20260726-old';
const newBatchId = 'cxe-sync-20260726-new';
const latestBatchId = 'cxe-sync-20260803-latest';
const makeRows = (count, batchId, sourceType, recommendedType, needsConfirmation) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${batchId}-${sourceType}-${index}`,
    batchId,
    sourceRecordId: `${batchId}-source-${index}`,
    sourceType,
    date: batchId.includes('20260803') ? '2026-08-03' : '2026-07-26',
    startTime: '10:00',
    endTime: '11:00',
    venue: '1号场',
    customerName: `测试${index}`,
    phone: `1380000${String(index).padStart(4, '0')}`,
    recommendedType,
    needsConfirmation,
    riskReason: needsConfirmation ? '备注为空' : ''
  }));

const context = {
  console,
  thirdPartySyncCenterData: {
    batches: [
      { id: oldBatchId, batchId: oldBatchId, rangeStart: '2026-07-26 00:00:00', rangeEnd: '2026-07-27 00:00:00', pulledAt: '2026-07-29T05:15:15.875Z', status: 'prechecked' },
      { id: newBatchId, batchId: newBatchId, rangeStart: '2026-07-26 00:00:00', rangeEnd: '2026-07-27 00:00:00', pulledAt: '2026-07-29T05:30:03.179Z', status: 'prechecked' },
      { id: latestBatchId, batchId: latestBatchId, rangeStart: '2026-08-03 00:00:00', rangeEnd: '2026-08-04 00:00:00', pulledAt: '2026-08-03T18:46:01.306Z', status: 'paused' }
    ],
    rawRecords: [
      ...makeRows(1370, oldBatchId, 'order', 'high_risk_exception', true),
      ...makeRows(25, newBatchId, 'order', 'auto_import', false),
      ...makeRows(1, latestBatchId, 'order', 'auto_import', false),
      ...makeRows(6, latestBatchId, 'lock', 'needs_confirmation', true)
    ],
    prechecks: [
      ...makeRows(1370, oldBatchId, 'order', 'high_risk_exception', true),
      ...makeRows(25, newBatchId, 'order', 'auto_import', false),
      ...makeRows(1, latestBatchId, 'order', 'auto_import', false),
      ...makeRows(6, latestBatchId, 'lock', 'needs_confirmation', true)
    ],
    confirmations: [],
    importResults: [],
    changes: [],
    alerts: [],
    rollbacks: []
  },
  esc: value => String(value ?? ''),
  fmt: value => String(Number(value || 0)),
  jsArg: value => JSON.stringify(value)
};

vm.createContext(context);
vm.runInContext(source, context);

const activeIds = context.thirdPartySyncActiveBatches().map(row => row.batchId);
assert(activeIds.includes(newBatchId), '同一天应保留最新有效批次');
assert(!activeIds.includes(oldBatchId), '旧异常批次不应进入默认同步记录');
assert.strictEqual(context.thirdPartySyncNeedsProcessingRows('').length, 6, '默认需处理数据只统计所有最新有效批次的未处理项');

const stats = context.thirdPartySyncStatsCompactCards();
assert.strictEqual(stats.total, 7, '顶部提示条应展示最近批次订场/锁场总数');
assert.strictEqual(stats.auto, 1, '顶部提示条应展示最近批次可自动导入数量');
assert.strictEqual(stats.need, 6, '顶部提示条应展示最近批次需运营处理数量');
assert.strictEqual(stats.allNeed, 6, '顶部提示条累计待处理不应包含旧异常批次');

console.log('third-party-sync-center-view.test.js passed');
