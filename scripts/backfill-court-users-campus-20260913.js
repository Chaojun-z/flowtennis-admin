#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const TableStore = require('tablestore');
const { createStorageServices } = require('../server/storage');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  createCourtAccountListSnapshotSync,
  createCourtAccountListSnapshotLoader,
  applyDeltaRows,
  decodePayload
} = require('../server/page-data/court-account-list-snapshot');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const OPERATION_ID = 'court-campus-backfill-20260913';
const BATCH_ID = `batch-${OPERATION_ID}`;
const CAMPUS = 'shunyi_mapo';
const CAMPUS_NAME = '顺义马坡';
const TABLES = {
  courts: 'ft_courts',
  index: 'ft_court_account_list_index',
  snapshot: 'ft_court_account_list_snapshot',
  snapshotTasks: 'ft_court_account_list_snapshot_tasks'
};
const COURT_PROJECTION_COLUMNS = ['campus', 'status', 'deletedAt', 'mergedIntoCourtId'];

function text(value) {
  return String(value ?? '').trim();
}

function isMissingCampus(value) {
  const normalized = text(value).toLowerCase();
  return !normalized || ['-', 'null', 'undefined'].includes(normalized);
}

function isActiveCourt(row = {}) {
  const status = text(row.status || 'active').toLowerCase();
  return !['inactive', 'deleted'].includes(status) && !text(row.deletedAt) && !text(row.mergedIntoCourtId);
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env.local') });
  dotenv.config({ path: path.join(ROOT, '.env') });
  process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';
}

function encodeRow(row) {
  if (!row || !row.primaryKey) return null;
  const result = { id: row.primaryKey[0]?.value };
  (row.attributes || []).forEach((attribute) => {
    try {
      result[attribute.columnName] = JSON.parse(attribute.columnValue);
    } catch {
      result[attribute.columnName] = attribute.columnValue;
    }
  });
  return result;
}

function createProjectedClient() {
  return new TableStore.Client({
    endpoint: process.env.TS_ENDPOINT,
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    instancename: process.env.TS_INSTANCE,
    maxRetries: 3
  });
}

function scanProjectedCourts(client) {
  return new Promise((resolve, reject) => {
    const rows = [];
    function next(startPrimaryKey) {
      client.getRange({
        tableName: TABLES.courts,
        direction: TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey: startPrimaryKey || [{ id: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
        maxVersions: 1,
        limit: 500,
        columnsToGet: COURT_PROJECTION_COLUMNS
      }, (error, data) => {
        if (error) return reject(error);
        (data.rows || []).forEach((row) => {
          const decoded = encodeRow(row);
          if (decoded) rows.push(decoded);
        });
        if (data.nextStartPrimaryKey) {
          return next(data.nextStartPrimaryKey.map((item) => ({ [item.name]: item.value })));
        }
        resolve(rows);
      });
    }
    next();
  });
}

function writeJsonReport(name, data) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${name}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
  return reportPath;
}

function buildTargetSummary(row) {
  return {
    id: text(row?.id),
    beforeCampus: text(row?.campus),
    beforeStatus: text(row?.status || 'active'),
    beforeUpdatedAt: text(row?.updatedAt)
  };
}

async function loadPlan(storage) {
  const projectedCourts = await scanProjectedCourts(createProjectedClient());
  const targetIds = projectedCourts
    .filter((row) => isActiveCourt(row) && isMissingCampus(row.campus))
    .map((row) => text(row.id))
    .filter(Boolean);
  const targetRows = [];
  for (let index = 0; index < targetIds.length; index += 20) {
    const batch = targetIds.slice(index, index + 20);
    const rows = await Promise.all(batch.map((id) => storage.get(TABLES.courts, id)));
    targetRows.push(...rows.filter(Boolean));
  }
  const invalidTargets = targetRows.filter((row) => !isActiveCourt(row) || !isMissingCampus(row.campus));
  if (invalidTargets.length) {
    throw new Error(`写入前目标发生变化，停止：${invalidTargets.map((row) => text(row.id)).join(',')}`);
  }
  const indexRows = await Promise.all(
    targetRows.map((row) => storage.get(TABLES.index, text(row.id)).catch(() => null))
  );
  const indexById = new Map(indexRows.map((row) => [text(row?.id || row?.courtId), row]).filter(([id, row]) => id && row));
  const missingIndexRows = targetRows.filter((row) => !indexById.has(text(row.id)));
  if (missingIndexRows.length) {
    throw new Error(`订场用户列表索引缺少目标记录，停止：${missingIndexRows.map((row) => text(row.id)).join(',')}`);
  }
  const now = new Date().toISOString();
  const courtUpdates = targetRows.map((before) => ({
    id: text(before.id),
    before,
    after: {
      ...before,
      campus: CAMPUS,
      updatedAt: now
    }
  }));
  const indexUpdates = targetRows.map((before) => {
    const current = indexById.get(text(before.id));
    return {
      id: text(before.id),
      before: current,
      after: {
        ...current,
        item: {
          ...current.item,
          campusCode: CAMPUS,
          campusName: CAMPUS_NAME
        },
        sourceUpdatedAt: now,
        generatedAt: now
      }
    };
  });
  const snapshotMeta = await storage.get(TABLES.snapshot, 'active:meta').catch(() => null);
  const snapshotDelta = await storage.get(TABLES.snapshot, 'active:delta').catch(() => null);
  const snapshotBundle = snapshotMeta?.bundleId
    ? await storage.get(TABLES.snapshot, snapshotMeta.bundleId).catch(() => null)
    : null;
  if (!snapshotBundle?.payload) {
    throw new Error('订场用户列表快照包缺失，停止');
  }
  const snapshotRows = applyDeltaRows(
    decodePayload(snapshotBundle.payload),
    snapshotDelta || {}
  );
  const updatedSnapshotRows = snapshotRows.map((row) => {
    const update = indexUpdates.find((item) => item.id === text(row.id || row.courtId));
    return update ? update.after : row;
  });
  return {
    generatedAt: now,
    courtUpdates,
    indexUpdates,
    snapshotRows: updatedSnapshotRows,
    snapshot: { meta: snapshotMeta, delta: snapshotDelta, bundle: snapshotBundle },
    targetSummaries: courtUpdates.map((item) => buildTargetSummary(item.before))
  };
}

async function writePlan(storage, plan) {
  for (const item of plan.courtUpdates) {
    await storage.put(TABLES.courts, item.id, item.after, { operationId: OPERATION_ID, batchId: BATCH_ID });
  }
  for (const item of plan.indexUpdates) {
    await storage.put(TABLES.index, item.id, item.after, { operationId: OPERATION_ID, batchId: BATCH_ID });
  }
  const snapshotSync = createCourtAccountListSnapshotSync({
    getCachedRow: storage.get,
    put: storage.put,
    mkTable: storage.mkTable,
    tables: {
      courtAccountListSnapshot: TABLES.snapshot,
      courtAccountListSnapshotTasks: TABLES.snapshotTasks
    }
  });
  const rebuiltSnapshot = await snapshotSync.rebuildFromIndexRows(
    plan.snapshotRows,
    { dryRun: false, versionId: OPERATION_ID }
  );
  return rebuiltSnapshot;
}

async function verify(storage, targetIds) {
  const [courts, indexRows, snapshotMeta] = await Promise.all([
    Promise.all(targetIds.map((id) => storage.get(TABLES.courts, id))).then((rows) => rows.filter(Boolean)),
    Promise.all(targetIds.map((id) => storage.get(TABLES.index, id).catch(() => null))).then((rows) => rows.filter(Boolean)),
    storage.get(TABLES.snapshot, 'active:meta').catch(() => null)
  ]);
  const indexById = new Map(indexRows.map((row) => [text(row.id || row.courtId), row]));
  const courtFailures = courts.filter((row) => text(row.campus) !== CAMPUS);
  const indexFailures = targetIds.filter((id) => {
    const row = indexById.get(id);
    return text(row?.item?.campusCode) !== CAMPUS || text(row?.item?.campusName) !== CAMPUS_NAME;
  });
  const snapshotLoader = createCourtAccountListSnapshotLoader({
    getCachedRow: storage.get,
    tables: { courtAccountListSnapshot: TABLES.snapshot }
  });
  const snapshotView = await snapshotLoader({ forceFresh: true });
  const snapshotFailures = targetIds.filter((id) => {
    const row = (snapshotView.items || []).find((item) => text(item.id) === id);
    return text(row?.campusCode) !== CAMPUS || text(row?.campusName) !== CAMPUS_NAME;
  });
  return {
    courtsChecked: courts.length,
    indexRowsChecked: targetIds.length,
    snapshotMeta: {
      status: text(snapshotMeta?.status),
      total: Number(snapshotMeta?.total) || 0,
      bundleId: text(snapshotMeta?.bundleId)
    },
    courtFailures,
    indexFailures,
    snapshotFailures,
    ok: courtFailures.length === 0 && indexFailures.length === 0 && snapshotFailures.length === 0
  };
}

async function main() {
  loadEnv();
  const { write } = parseWriteFlags(process.argv.slice(2));
  const confirm = process.argv.includes('--confirm-production-write');
  if (write && !confirm) throw new Error('写入生产前必须显式加 --confirm-production-write');
  if (write) await assertProductionWriteTarget({ env: process.env });
  const storage = createStorageServices({
    tableStoreConfig: {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: process.env.TS_ENDPOINT,
      instanceName: process.env.TS_INSTANCE
    }
  });
  const plan = await loadPlan(storage);
  const reportBase = {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    targetInstance: text(process.env.TS_INSTANCE),
    targetEndpoint: text(process.env.TS_ENDPOINT),
    campus: CAMPUS,
    campusName: CAMPUS_NAME,
    targetCount: plan.courtUpdates.length,
    targets: plan.targetSummaries,
    generatedAt: plan.generatedAt,
    snapshotBefore: {
      meta: plan.snapshot.meta,
      delta: plan.snapshot.delta
        ? {
            count: Number(plan.snapshot.delta.count) || 0,
            upserts: Array.isArray(plan.snapshot.delta.upserts) ? plan.snapshot.delta.upserts.length : 0,
            deletes: Array.isArray(plan.snapshot.delta.deletes) ? plan.snapshot.delta.deletes.length : 0,
            updatedAt: text(plan.snapshot.delta.updatedAt)
          }
        : null
    }
  };
  if (!write) {
    const reportPath = writeJsonReport('dry-run', reportBase);
    console.log(JSON.stringify({ dryRun: true, reportPath, ...reportBase }, null, 2));
    return;
  }
  const reportPath = writeJsonReport('backup', {
    ...reportBase,
    backup: {
      courts: plan.courtUpdates.map((item) => item.before),
      indexRows: plan.indexUpdates.map((item) => item.before),
      snapshot: plan.snapshot
    }
  });
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const snapshotAfterWrite = await writePlan(storage, plan);
  const verification = await verify(storage, plan.courtUpdates.map((item) => item.id));
  const resultPath = writeJsonReport('result', {
    ...reportBase,
    reportPath,
    snapshotAfterWrite,
    verification
  });
  console.log(JSON.stringify({
    dryRun: false,
    reportPath,
    resultPath,
    ...reportBase,
    snapshotAfterWrite: {
      total: snapshotAfterWrite.total,
      bundleId: snapshotAfterWrite.bundleId
    },
    verification
  }, null, 2));
  if (!verification.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
