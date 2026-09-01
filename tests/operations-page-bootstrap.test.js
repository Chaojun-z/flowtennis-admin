const assert = require('assert');

const { handleOperationsPageData } = require('../server/page-data/operations-page.js');
const { snapshotNotReadyError } = require('../server/page-data/operations-snapshot.js');

async function main() {
  let rebuilt = false;
  const responses = [];
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
      if (!rebuilt) throw snapshotNotReadyError('经营分析快照表未初始化');
      return {
        campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
        operations: { coach: { rows: [{ coachName: '朝珺', privateLessons: 18 }] } },
        snapshot: { source: 'operations-snapshot' }
      };
    },
    operationsSnapshotSync: {
      rebuildScope: async ({ scope }) => {
        assert.strictEqual(scope.campus, 'shunyi_mapo', '快照初始化必须使用当前校区');
        assert.strictEqual(scope.dateRange.startDate, '2026-08-01', '快照初始化必须使用当前开始日期');
        assert.strictEqual(scope.dateRange.endDate, '2026-08-31', '快照初始化必须使用当前结束日期');
        rebuilt = true;
        return { ok: true };
      }
    }
  });

  assert.strictEqual(responses.length, 1, '快照缺失时应初始化后只返回一次页面数据');
  assert.strictEqual(responses[0].code, 200, '快照缺失不能直接返回 503 给页面');
  assert.strictEqual(responses[0].body.snapshot.source, 'operations-snapshot', '初始化后仍必须从经营快照返回');
  assert.strictEqual(responses[0].body.operations.coach.rows[0].coachName, '朝珺', '初始化后应返回当前范围教练人效');
  assert.strictEqual(rebuilt, true, '快照缺失时必须重建当前范围');
}

main()
  .then(() => console.log('operations page bootstrap tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
