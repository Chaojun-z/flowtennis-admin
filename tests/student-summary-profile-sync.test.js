const assert = require('assert');
const zlib = require('zlib');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryBundleId,
  buildStudentTeachingSummaryBundleRow,
  buildStudentTeachingSummaryListBundleId,
  buildStudentTeachingSummaryListBundleRow,
  readReadyStudentTeachingSummaryListRows,
  requireReadyStudentTeachingSummaryRows,
  studentTeachingSummaryBundleLogicalRows,
  upsertStudentProfileIntoTeachingSummary
} = require('../server/read-models/student-teaching-summary-cache.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bundleRows(row) {
  if (!row?.rowsGzipBase64) return [];
  return JSON.parse(zlib.gunzipSync(Buffer.from(row.rowsGzipBase64, 'base64')).toString('utf8'));
}

async function main() {
  {
    const mismatchVersion = 'profile-sync-recovers-list-bundle';
    const fullRows = [
      {
        id: 'student-a',
        studentId: 'student-a',
        name: '学员A',
        displayName: '学员A',
        primaryCoach: '汤教练',
        hasStudentProfile: true,
        isHistoricalStudentRoster: true,
        isActiveStudentRoster: true
      },
      {
        id: 'student-b',
        studentId: 'student-b',
        name: '学员B',
        displayName: '学员B',
        primaryCoach: '汤教练',
        hasStudentProfile: true,
        isHistoricalStudentRoster: true,
        isActiveStudentRoster: true
      }
    ];
    const staleListRows = [fullRows[0]];
    const mismatchTableRows = {
      ft_student_teaching_summary: [
        {
          id: STUDENT_TEACHING_SUMMARY_META_ID,
          kind: 'student-teaching-summary-meta',
          status: 'ready',
          rowCount: fullRows.length,
          generation: 1,
          batchId: mismatchVersion,
          activeVersion: mismatchVersion,
          sourceSnapshotAt: '2026-09-11T00:00:00.000Z',
          completedAt: '2026-09-11T00:00:01.000Z',
          checksum: buildStudentTeachingSummaryChecksum(fullRows),
          updatedAt: '2026-09-11T00:00:01.000Z'
        },
        buildStudentTeachingSummaryBundleRow(fullRows, mismatchVersion),
        buildStudentTeachingSummaryListBundleRow(staleListRows, mismatchVersion)
      ]
    };
    const getCachedRow = async (table, id) => clone((mismatchTableRows[table] || []).find(row => String(row.id || '') === String(id || '')) || null);
    const put = async (table, id, row) => {
      const list = mismatchTableRows[table] || [];
      const index = list.findIndex(item => String(item.id || '') === String(id || ''));
      if (index >= 0) list[index] = clone(row);
      else list.push(clone(row));
      mismatchTableRows[table] = list;
    };

    await upsertStudentProfileIntoTeachingSummary({
      tableName: 'ft_student_teaching_summary',
      student: {
        id: 'student-a',
        name: '学员A改名',
        primaryCoach: '汤教练',
        updatedAt: '2026-09-11T04:00:00.000Z'
      },
      getCachedRow,
      put,
      now: new Date('2026-09-11T04:00:01.000Z')
    });

    const meta = mismatchTableRows.ft_student_teaching_summary.find(row => row.id === STUDENT_TEACHING_SUMMARY_META_ID);
    const listBundle = mismatchTableRows.ft_student_teaching_summary.find(row => row.id === buildStudentTeachingSummaryListBundleId(mismatchVersion));
    const listRows = bundleRows(listBundle);
    assert.strictEqual(meta.rowCount, 2, 'meta 必须保持完整发布包行数');
    assert.strictEqual(listBundle.rowCount, 2, '轻量 list bundle 缺行时，资料同步必须按完整发布包重建，避免 338/339');
    assert.strictEqual(listRows.length, 2, '轻量 list bundle 解包后行数必须和 meta 一致');
    assert.ok(listRows.some(row => String(row.studentId || row.id || '') === 'student-b'), '轻量 list bundle 不能丢失未被本次更新命中的学员');
  }

  const version = 'profile-sync-version';
  const existingRows = Array.from({ length: 1200 }, (_, index) => ({
    id: `existing-student-${index + 1}`,
    studentId: `existing-student-${index + 1}`,
    name: `已有学员${index + 1}`,
    displayName: `已有学员${index + 1}`,
    studentStage: 'student',
    hasStudentProfile: true,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: false
  }));
  const tableRows = {
    ft_student_teaching_summary: [
      {
        id: STUDENT_TEACHING_SUMMARY_META_ID,
        kind: 'student-teaching-summary-meta',
        status: 'ready',
        rowCount: existingRows.length,
        generation: 1,
        batchId: version,
        activeVersion: version,
        sourceSnapshotAt: '2026-09-11T00:00:00.000Z',
        completedAt: '2026-09-11T00:00:01.000Z',
        checksum: buildStudentTeachingSummaryChecksum(existingRows),
        updatedAt: '2026-09-11T00:00:01.000Z'
      },
      buildStudentTeachingSummaryBundleRow(existingRows, version),
      buildStudentTeachingSummaryListBundleRow(existingRows, version)
    ]
  };
  const calls = { gets: [], puts: [], scans: [] };
  const getCachedRow = async (table, id) => {
    calls.gets.push({ table, id });
    const row = (tableRows[table] || []).find(item => String(item.id || '') === String(id || ''));
    return row ? clone(row) : null;
  };
  const put = async (table, id, row) => {
    calls.puts.push({ table, id });
    const list = tableRows[table] || [];
    const next = clone(row);
    const index = list.findIndex(item => String(item.id || '') === String(id || ''));
    if (index >= 0) list[index] = next;
    else list.push(next);
    tableRows[table] = list;
  };

  const startedAt = process.hrtime.bigint();
  const syncResult = await upsertStudentProfileIntoTeachingSummary({
    tableName: 'ft_student_teaching_summary',
    student: {
      id: 'stu-chrispo',
      name: 'Chrispo~',
      phone: '',
      campus: 'chaoyang_blue_harbor',
      primaryCoach: '汤教练',
      type: '成人',
      source: '未知',
      notes: '场地费按150元/h预收',
      createdAt: '2026-09-11T04:00:00.000Z',
      updatedAt: '2026-09-11T04:00:00.000Z'
    },
    getCachedRow,
    put,
    now: new Date('2026-09-11T04:00:01.000Z')
  });
  const syncElapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  assert.strictEqual(syncResult.synced, true, '新增学员保存后必须同步进入当前历史学员轻量快照包');
  assert.ok(syncElapsedMs < 1000, `1200 条已发布快照内单条新增同步必须 1 秒内完成，实际 ${Math.round(syncElapsedMs)}ms`);
  assert.deepStrictEqual(calls.scans, [], '单条新增同步不能扫描学员、排课、课包、流水等大表');
  assert.ok(calls.gets.some(item => item.id === buildStudentTeachingSummaryBundleId(version)), '单条同步应点读当前完整发布包');
  assert.ok(calls.gets.some(item => item.id === buildStudentTeachingSummaryListBundleId(version)), '单条同步应点读当前轻量列表包');

  const meta = tableRows.ft_student_teaching_summary.find(row => row.id === STUDENT_TEACHING_SUMMARY_META_ID);
  const fullBundle = tableRows.ft_student_teaching_summary.find(row => row.id === buildStudentTeachingSummaryBundleId(version));
  const fullRows = studentTeachingSummaryBundleLogicalRows(fullBundle);
  assert.strictEqual(meta.rowCount, 1201, '同步后 meta 行数必须跟发布包一致，避免 503');
  assert.strictEqual(meta.checksum, buildStudentTeachingSummaryChecksum(fullRows), '同步后 meta checksum 必须跟完整发布包一致，避免 checksum 失败');
  assert.strictEqual(requireReadyStudentTeachingSummaryRows([meta, ...fullRows]).length, 1201, '同步后完整发布包仍必须是 ready，不允许引入 503');

  const listRows = await readReadyStudentTeachingSummaryListRows({
    tableName: 'ft_student_teaching_summary',
    getCachedRow,
    getCachedScan: async table => {
      calls.scans.push(table);
      throw new Error(`不允许扫描表: ${table}`);
    },
    scanByIdPrefix: async (table, prefix) => {
      calls.scans.push(`${table}:${prefix}`);
      throw new Error(`不允许扫描前缀: ${table}`);
    },
    verifyChecksum: true
  });
  const pageHandler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      throw new Error(`历史学员首屏不允许扫描事实表: ${table}`);
    },
    getCachedScan: async table => {
      throw new Error(`历史学员首屏不允许扫描表: ${table}`);
    },
    getCachedRow,
    scanByIdPrefix: async () => {
      throw new Error('历史学员首屏不允许扫描摘要前缀');
    },
    filterLoadAllForUser: data => data,
    PRODUCTION_PAGE_READ_LIMITS: { schedule: 2000, entitlementLedger: 2000 },
    studentRosterIndexReader: {
      readCustomerCenterList: async ({ query }) => {
        const { buildCustomerCenterPagePayload, filterSummaryRowsForQuery } = require('../server/page-data/student-roster-index-reader.js');
        const summaryRows = filterSummaryRowsForQuery(listRows, query);
        return buildCustomerCenterPagePayload({ summaryRows, query });
      }
    },
    tables: {
      T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
    }
  });
  const res = {};
  const pageStartedAt = process.hrtime.bigint();
  await pageHandler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin' },
    res,
    query: new URLSearchParams('view=historicalStudents&paged=1&page=1&pageSize=15&q=chrispo&coach=%E6%B1%A4%E6%95%99%E7%BB%83')
  });
  const pageElapsedMs = Number(process.hrtime.bigint() - pageStartedAt) / 1e6;
  assert.strictEqual(res.statusCode, 200);
  assert.ok(pageElapsedMs < 1000, `1201 条轻量快照搜索+负责教练筛选必须 1 秒内返回，实际 ${Math.round(pageElapsedMs)}ms`);
  assert.strictEqual(res.body.listPage.total, 1, '搜索 Chrispo 且筛选汤教练时，后端分页列表必须返回 1');
  assert.strictEqual(res.body.standardLifecycleMetrics.teachingSummary.historicalStudentCount, 1, '顶部历史学员数必须和后端分页过滤后的完整集合一致');
  assert.strictEqual(res.body.listPage.rows[0].primaryCoach, '汤教练');

  console.log('student summary profile sync tests passed');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
