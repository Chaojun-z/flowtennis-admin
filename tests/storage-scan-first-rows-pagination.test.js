const assert = require('assert');
const Module = require('module');
const path = require('path');

let pages = [];
const clients = [];
const originalLoad = Module._load;

const fakeTableStore = {
  Direction: { FORWARD: 'FORWARD', BACKWARD: 'BACKWARD' },
  INF_MIN: '__INF_MIN__',
  INF_MAX: '__INF_MAX__',
  PrimaryKeyType: { STRING: 'STRING' },
  RowExistenceExpectation: { IGNORE: 'IGNORE', EXPECT_NOT_EXIST: 'EXPECT_NOT_EXIST' },
  Condition: function Condition() {},
  Client: class FakeClient {
    constructor() {
      this.calls = [];
      clients.push(this);
    }

    getRange(request, callback) {
      this.calls.push(request);
      const page = pages.shift();
      if (!page) return callback(new Error('unexpected getRange call'));
      callback(null, page);
    }

    putRow(request, callback) {
      this.calls.push(request);
      callback(null, { ok: true });
    }

    deleteRow(request, callback) {
      this.calls.push(request);
      callback(null, { ok: true });
    }
  }
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'tablestore') return fakeTableStore;
  return originalLoad.call(this, request, parent, isMain);
};

const storagePath = path.join(__dirname, '../server/storage.js');
delete require.cache[require.resolve(storagePath)];
const { createStorageServices } = require(storagePath);
Module._load = originalLoad;

function row(id, attrs = {}) {
  return {
    primaryKey: [{ name: 'id', value: id }],
    attributes: Object.entries(attrs).map(([columnName, columnValue]) => ({
      columnName,
      columnValue: JSON.stringify(columnValue)
    }))
  };
}

(async () => {
  clients.length = 0;
  pages = [
    {
      rows: [row('schedule-1', { studentId: 'student-1' }), row('schedule-2', { studentId: 'student-2' })],
      nextStartPrimaryKey: [{ name: 'id', value: 'schedule-2' }]
    },
    {
      rows: [row('schedule-3', { studentId: 'student-3' })],
      nextStartPrimaryKey: null
    }
  ];

  const storage = createStorageServices();
  const rows = await storage.scanFirstRows('ft_schedule', {
    limit: 5,
    columns: ['studentId'],
    detectOverflow: true
  });

  assert.deepStrictEqual(rows.map(item => item.id), ['schedule-1', 'schedule-2', 'schedule-3'], 'scanFirstRows 应翻页读全上限内的数据');
  assert.strictEqual(clients[0].calls.length, 2, 'scanFirstRows 不应只读 TableStore 第一页');
  assert.deepStrictEqual(clients[0].calls[1].inclusiveStartPrimaryKey, [{ id: 'schedule-2' }], '第二页应使用 TableStore 返回的游标继续读取');
  assert.strictEqual(clients[0].calls[1].limit, 4, '第二页最多只读剩余额度，保留溢出检测语义');

  clients.length = 0;
  pages = [
    {
      rows: [row('schedule-1'), row('schedule-2')],
      nextStartPrimaryKey: [{ name: 'id', value: 'schedule-2' }]
    },
    {
      rows: [row('schedule-3')],
      nextStartPrimaryKey: null
    }
  ];

  const overflowStorage = createStorageServices();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(
      () => overflowStorage.scanFirstRows('ft_schedule', { limit: 2, detectOverflow: true }),
      error => error && error.code === 'PRODUCTION_READ_TRUNCATED',
      'detectOverflow=true 时，超过上限必须报错，不能截断后继续返回假完整数据'
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.strictEqual(clients[0].calls.length, 2, '跨页超过上限时也必须真的读到溢出证据');

  const writeEvents = [];
  const writeStorage = createStorageServices({
    onTableWrite: async (table, meta) => writeEvents.push({ table, meta })
  });
  await writeStorage.put(
    'ft_schedule',
    'schedule-1',
    { id: 'schedule-1', studentId: 'student-1' },
    { skipStudentTeachingSummaryRefresh: true, writeReason: 'official-account-daily-digest-marker' }
  );
  await writeStorage.del('ft_schedule', 'schedule-1', { writeReason: 'cleanup-marker' });
  assert.deepStrictEqual(
    writeEvents,
    [
      {
        table: 'ft_schedule',
        meta: {
          skipStudentTeachingSummaryRefresh: true,
          writeReason: 'official-account-daily-digest-marker',
          op: 'put',
          id: 'schedule-1',
          attrs: { id: 'schedule-1', studentId: 'student-1' }
        }
      },
      {
        table: 'ft_schedule',
        meta: {
          writeReason: 'cleanup-marker',
          op: 'delete',
          id: 'schedule-1'
        }
      }
    ],
    'storage writes should pass non-secret write context to the table-write hook'
  );

  console.log('storage scanFirstRows pagination tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
