const assert = require('assert');

const { handleOperationsPageData } = require('../server/page-data/operations-page.js');
const { snapshotNotReadyError } = require('../server/page-data/operations-snapshot.js');

async function main() {
  let queued = false;
  let syncRebuildCalled = false;
  const responses = [];
  const started = Date.now();
  await handleOperationsPageData({
    query: new URLSearchParams('campus=shunyi_mapo&campusName=%E9%A1%BA%E4%B9%89%E9%A9%AC%E5%9D%A1&startDate=2026-08-01&endDate=2026-08-31'),
    user: { id: 'admin-1', role: 'admin' },
    res: {},
    sendJson: (res, body, code = 200) => {
      responses.push({ body, code });
      return { body, code };
    },
    init: async () => {},
    loadOperationsSnapshot: async () => {
      throw snapshotNotReadyError('经营分析快照表未初始化');
    },
    operationsSnapshotSync: {
      queueRebuildScope: async ({ scope }) => {
        assert.strictEqual(scope.campus, 'shunyi_mapo', '快照初始化必须使用当前校区');
        assert.strictEqual(scope.dateRange.startDate, '2026-08-01', '快照初始化必须使用当前开始日期');
        assert.strictEqual(scope.dateRange.endDate, '2026-08-31', '快照初始化必须使用当前结束日期');
        queued = true;
        return { ok: true };
      },
      rebuildScope: async ({ scope }) => {
        syncRebuildCalled = true;
        assert.strictEqual(scope.campus, 'shunyi_mapo', '快照初始化必须使用当前校区');
        assert.strictEqual(scope.dateRange.startDate, '2026-08-01', '快照初始化必须使用当前开始日期');
        assert.strictEqual(scope.dateRange.endDate, '2026-08-31', '快照初始化必须使用当前结束日期');
        await new Promise(() => {});
      }
    }
  });

  assert.ok(Date.now() - started < 1000, '快照缺失时页面请求不能等待慢重建');
  assert.strictEqual(responses.length, 1, '快照缺失时应快速返回一次生成中状态');
  assert.strictEqual(responses[0].code, 202, '快照缺失不能直接返回 503 给页面');
  assert.strictEqual(responses[0].body.snapshot.source, 'operations-snapshot', '生成中状态仍应标记经营快照来源');
  assert.strictEqual(responses[0].body.snapshot.refreshing, true, '页面应知道当前范围快照正在生成');
  assert.strictEqual(queued, true, '快照缺失时必须后台排队重建当前范围');
  assert.strictEqual(syncRebuildCalled, false, '页面请求不能同步等待 rebuildScope');
}

main()
  .then(() => console.log('operations page bootstrap tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
