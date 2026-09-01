const crypto = require('crypto');
const zlib = require('zlib');
const { getOperationsRowsCacheKey } = require('../read-models/operations-source.js');

const OPERATIONS_SNAPSHOT_VERSION = 'operations-page-snapshot-v1';
const OPERATIONS_SNAPSHOT_NOT_READY_CODE = 'OPERATIONS_SNAPSHOT_NOT_READY';
const SNAPSHOT_SCOPE_INDEX_ID = 'active:scope-index';
const SNAPSHOT_SOURCE_MARKER_ID = 'active:source-marker';
const SNAPSHOT_LAST_REBUILD_TASK_ID = '__last_operations_snapshot_rebuild__';

function text(value) {
  return String(value || '').trim();
}

function snapshotNotReadyError(message = '经营分析快照未初始化') {
  const err = new Error(message);
  err.code = OPERATIONS_SNAPSHOT_NOT_READY_CODE;
  err.statusCode = 503;
  return err;
}

function isTableNotExistError(err) {
  const message = String(err?.message || err || '');
  return err?.code === 400 && /table not exist|Request table not exist/i.test(message);
}

function encodePayload(value) {
  const json = JSON.stringify(value || {});
  return zlib.gzipSync(Buffer.from(json)).toString('base64');
}

function decodePayload(payload) {
  if (!payload) return null;
  const json = zlib.gunzipSync(Buffer.from(String(payload), 'base64')).toString('utf8');
  return JSON.parse(json);
}

function checksumPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

function normalizeScope(user = {}, scope = {}) {
  const dateRange = scope.dateRange || scope || {};
  return {
    user: JSON.parse(getOperationsRowsCacheKey(user)),
    campus: text(scope.campus),
    campusName: text(scope.campusName),
    startDate: text(dateRange.startDate).slice(0, 10),
    endDate: text(dateRange.endDate).slice(0, 10)
  };
}

function scopeKey(user = {}, scope = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizeScope(user, scope))).digest('hex');
}

function metaIdForScopeKey(key) {
  return `scope:${key}:meta`;
}

function bundleIdForScopeKey(key, batchId) {
  return `scope:${key}:bundle:${batchId}`;
}

function timestampMs(value) {
  const time = Date.parse(text(value));
  return Number.isFinite(time) ? time : 0;
}

function sourceChangedAfterSnapshot(sourceMarker, meta) {
  const changedAt = timestampMs(sourceMarker?.changedAt);
  const sourceSnapshotAt = timestampMs(meta?.sourceSnapshotAt);
  return changedAt > 0 && sourceSnapshotAt > 0 && changedAt > sourceSnapshotAt;
}

function buildOperationsSnapshot({ payload, user, scope, batchId, completedAt, sourceSnapshotAt } = {}) {
  const now = completedAt || new Date().toISOString();
  const normalizedScope = normalizeScope(user, scope);
  const key = scopeKey(user, scope);
  const finalBatchId = text(batchId) || `operations-snapshot:${now.replace(/[^0-9A-Za-z]/g, '')}`;
  const bundleId = bundleIdForScopeKey(key, finalBatchId);
  const checksum = checksumPayload(payload);
  const bundle = {
    id: bundleId,
    type: 'bundle',
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    codec: 'gzip-base64-json',
    scopeKey: key,
    payload: encodePayload(payload),
    checksum,
    batchId: finalBatchId,
    completedAt: now,
    sourceSnapshotAt: sourceSnapshotAt || now
  };
  const meta = {
    id: metaIdForScopeKey(key),
    type: 'meta',
    status: 'published',
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    version: OPERATIONS_SNAPSHOT_VERSION,
    scopeKey: key,
    scope: normalizedScope,
    batchId: finalBatchId,
    bundleId,
    checksum,
    completedAt: now,
    publishedAt: now,
    sourceSnapshotAt: sourceSnapshotAt || now
  };
  return { meta, bundle, scopeKey: key, payload };
}

function snapshotHealth(meta = null, sourceMarker = null, task = null) {
  const reasons = [];
  if (!meta || meta.status !== 'published') reasons.push('snapshot-not-published');
  if (meta && meta.snapshotVersion !== OPERATIONS_SNAPSHOT_VERSION) reasons.push('snapshot-version-mismatch');
  if (meta && (!meta.batchId || !meta.bundleId || !meta.completedAt || !meta.sourceSnapshotAt || !meta.checksum || !meta.scopeKey)) reasons.push('snapshot-contract-incomplete');
  if (sourceChangedAfterSnapshot(sourceMarker, meta)) reasons.push('source-newer-than-snapshot');
  if (task?.status === 'failed') reasons.push('last-rebuild-failed');
  return {
    ok: !!meta && reasons.length === 0,
    reasons,
    batchId: meta?.batchId || '',
    bundleId: meta?.bundleId || '',
    scopeKey: meta?.scopeKey || '',
    completedAt: meta?.completedAt || '',
    sourceSnapshotAt: meta?.sourceSnapshotAt || '',
    checksum: meta?.checksum || '',
    sourceChangedAt: sourceMarker?.changedAt || '',
    lastRebuildStatus: task?.status || '',
    lastRebuildError: task?.error || ''
  };
}

function createOperationsSnapshotLoader(deps = {}) {
  const { getCachedRow, tables = {} } = deps;
  const memory = new Map();

  async function readRow(id) {
    if (!tables.operationsSnapshot || typeof getCachedRow !== 'function') {
      throw snapshotNotReadyError('经营分析快照表未配置');
    }
    try {
      return await getCachedRow(tables.operationsSnapshot, id);
    } catch (err) {
      if (isTableNotExistError(err)) throw snapshotNotReadyError('经营分析快照表未初始化');
      throw err;
    }
  }

  return async function loadOperationsSnapshot({ user = {}, scope = {}, forceFresh = false } = {}) {
    const key = scopeKey(user, scope);
    const [meta, sourceMarker] = await Promise.all([
      readRow(metaIdForScopeKey(key)),
      readRow(SNAPSHOT_SOURCE_MARKER_ID).catch((err) => {
        if (err?.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE) return null;
        throw err;
      })
    ]);
    if (meta?.status !== 'published' || meta?.snapshotVersion !== OPERATIONS_SNAPSHOT_VERSION || meta.scopeKey !== key || !meta.bundleId || !meta.batchId || !meta.completedAt || !meta.sourceSnapshotAt || !meta.checksum) {
      throw snapshotNotReadyError('经营分析快照未发布或契约不完整');
    }
    if (sourceChangedAfterSnapshot(sourceMarker, meta)) {
      throw snapshotNotReadyError('经营分析快照正在刷新，请稍后重试');
    }
    const cacheKey = `${meta.bundleId}:${meta.checksum}`;
    let payload = null;
    if (!forceFresh && memory.has(cacheKey)) {
      payload = memory.get(cacheKey);
    } else {
      const bundle = await readRow(meta.bundleId);
      if (!bundle?.payload || bundle?.codec !== 'gzip-base64-json' || bundle.scopeKey !== key) {
        throw snapshotNotReadyError('经营分析快照包无效');
      }
      payload = decodePayload(bundle.payload);
      const actualChecksum = checksumPayload(payload);
      if (actualChecksum !== meta.checksum) {
        throw snapshotNotReadyError('经营分析快照 checksum 校验失败');
      }
      memory.set(cacheKey, payload);
    }
    return {
      ...(payload || {}),
      snapshot: {
        source: 'operations-snapshot',
        snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
        batchId: meta.batchId,
        scopeKey: key,
        completedAt: meta.completedAt,
        sourceSnapshotAt: meta.sourceSnapshotAt,
        checksum: meta.checksum
      }
    };
  };
}

function createOperationsSnapshotSync(deps = {}) {
  const { getCachedRow, put, mkTable, buildPayload, tables = {} } = deps;
  const loadSnapshot = createOperationsSnapshotLoader({ getCachedRow, tables });
  const rebuildPromises = new Map();

  async function ensureSnapshotTables() {
    if (typeof mkTable !== 'function') return;
    if (tables.operationsSnapshot) await mkTable(tables.operationsSnapshot);
    if (tables.operationsSnapshotTasks) {
      try {
        await mkTable(tables.operationsSnapshotTasks);
      } catch (err) {
        console.warn('[operations-snapshot] tasks table ensure skipped:', err?.message || err);
      }
    }
  }

  async function readSnapshotRow(id) {
    if (!tables.operationsSnapshot || typeof getCachedRow !== 'function') return null;
    return getCachedRow(tables.operationsSnapshot, id).catch(() => null);
  }

  async function recordTask(id, attrs = {}) {
    if (!tables.operationsSnapshotTasks || typeof put !== 'function') return null;
    const now = new Date().toISOString();
    return put(tables.operationsSnapshotTasks, text(id) || SNAPSHOT_LAST_REBUILD_TASK_ID, {
      id: text(id) || SNAPSHOT_LAST_REBUILD_TASK_ID,
      status: attrs.status || 'pending',
      reason: attrs.reason || '',
      error: text(attrs.error).slice(0, 500),
      updatedAt: now,
      createdAt: attrs.createdAt || now
    }).catch(() => null);
  }

  async function rememberScope(user, scope) {
    if (!tables.operationsSnapshot || typeof put !== 'function') return null;
    const key = scopeKey(user, scope);
    const normalized = normalizeScope(user, scope);
    const storedScope = {
      campus: normalized.campus,
      campusName: normalized.campusName,
      dateRange: { startDate: normalized.startDate, endDate: normalized.endDate },
      metricScope: {
        campus: normalized.campus,
        campusName: normalized.campusName,
        startDate: normalized.startDate,
        endDate: normalized.endDate
      }
    };
    const current = await readSnapshotRow(SNAPSHOT_SCOPE_INDEX_ID);
    const scopes = Array.isArray(current?.scopes) ? current.scopes : [];
    const byKey = new Map(scopes.map((item) => [text(item.scopeKey), item]).filter(([itemKey]) => itemKey));
    byKey.set(key, { scopeKey: key, user: normalized.user, scope: storedScope, updatedAt: new Date().toISOString() });
    const next = { id: SNAPSHOT_SCOPE_INDEX_ID, type: 'scope-index', scopes: [...byKey.values()] };
    await put(tables.operationsSnapshot, SNAPSHOT_SCOPE_INDEX_ID, next);
    return next;
  }

  async function rebuildScope({ user = {}, scope = {}, dryRun = false, batchId = '', reason = 'manual' } = {}) {
    if (typeof buildPayload !== 'function') throw new Error('缺少经营快照重建数据源');
    const key = scopeKey(user, scope);
    if (rebuildPromises.has(key)) return rebuildPromises.get(key);
    const startedAt = new Date().toISOString();
    const run = (async () => {
      if (!dryRun) await recordTask(SNAPSHOT_LAST_REBUILD_TASK_ID, { status: 'running', reason, error: '' });
      try {
        const payload = await buildPayload({ user, scope });
        const built = buildOperationsSnapshot({
          payload,
          user,
          scope,
          batchId: batchId || `operations-${Date.now()}`,
          sourceSnapshotAt: startedAt,
          completedAt: new Date().toISOString()
        });
        if (dryRun) return { dryRun: true, scopeKey: built.scopeKey, checksum: built.meta.checksum, batchId: built.meta.batchId };
        await ensureSnapshotTables();
        await put(tables.operationsSnapshot, built.bundle.id, built.bundle);
        await put(tables.operationsSnapshot, built.meta.id, built.meta);
        await rememberScope(user, scope);
        await recordTask(SNAPSHOT_LAST_REBUILD_TASK_ID, { status: 'done', reason, error: '' });
        return { dryRun: false, scopeKey: built.scopeKey, checksum: built.meta.checksum, batchId: built.meta.batchId, bundleId: built.bundle.id };
      } catch (err) {
        if (!dryRun) await recordTask(SNAPSHOT_LAST_REBUILD_TASK_ID, { status: 'failed', reason, error: err?.message || err });
        throw err;
      } finally {
        rebuildPromises.delete(key);
      }
    })();
    rebuildPromises.set(key, run);
    return run;
  }

  function queueRebuildScope(args = {}) {
    return rebuildScope({ ...args, dryRun: false }).catch((err) => {
      console.warn('[operations-snapshot] rebuild failed:', err?.message || err);
      return null;
    });
  }

  async function readSnapshotStatus({ user = {}, scope = {} } = {}) {
    const key = scopeKey(user, scope);
    const [meta, sourceMarker, task] = await Promise.all([
      readSnapshotRow(metaIdForScopeKey(key)),
      readSnapshotRow(SNAPSHOT_SOURCE_MARKER_ID),
      tables.operationsSnapshotTasks && typeof getCachedRow === 'function'
        ? getCachedRow(tables.operationsSnapshotTasks, SNAPSHOT_LAST_REBUILD_TASK_ID).catch(() => null)
        : Promise.resolve(null)
    ]);
    return snapshotHealth(meta, sourceMarker, task);
  }

  async function recordSourceChange(meta = {}) {
    if (!tables.operationsSnapshot || typeof put !== 'function') return null;
    const marker = {
      id: SNAPSHOT_SOURCE_MARKER_ID,
      type: 'source-marker',
      changedAt: new Date().toISOString(),
      sourceTable: text(meta.table || meta.sourceTable),
      op: text(meta.op),
      sourceId: text(meta.id)
    };
    await put(tables.operationsSnapshot, SNAPSHOT_SOURCE_MARKER_ID, marker);
    const index = await readSnapshotRow(SNAPSHOT_SCOPE_INDEX_ID);
    const scopes = Array.isArray(index?.scopes) ? index.scopes : [];
    scopes.forEach((item) => {
      if (!item?.scope?.user) return;
      queueRebuildScope({ user: item.scope.user, scope: item.scope, reason: 'source-change' });
    });
    return marker;
  }

  return {
    ensureSnapshotTables,
    loadSnapshot,
    queueRebuildScope,
    readSnapshotStatus,
    rebuildScope,
    recordSourceChange,
    recordTask
  };
}

module.exports = {
  OPERATIONS_SNAPSHOT_VERSION,
  OPERATIONS_SNAPSHOT_NOT_READY_CODE,
  SNAPSHOT_SCOPE_INDEX_ID,
  SNAPSHOT_SOURCE_MARKER_ID,
  SNAPSHOT_LAST_REBUILD_TASK_ID,
  buildOperationsSnapshot,
  checksumPayload,
  createOperationsSnapshotLoader,
  createOperationsSnapshotSync,
  decodePayload,
  encodePayload,
  metaIdForScopeKey,
  scopeKey,
  snapshotHealth,
  snapshotNotReadyError
};
