const crypto = require('crypto');
const zlib = require('zlib');
const { getOperationsRowsCacheKey } = require('../read-models/operations-source.js');

const OPERATIONS_SNAPSHOT_VERSION = 'operations-page-snapshot-v1';
const OPERATIONS_SNAPSHOT_NOT_READY_CODE = 'OPERATIONS_SNAPSHOT_NOT_READY';
const SNAPSHOT_SCOPE_INDEX_ID = 'active:scope-index';
const SNAPSHOT_SOURCE_MARKER_ID = 'active:source-marker';
const SNAPSHOT_LAST_REBUILD_TASK_ID = '__last_operations_snapshot_rebuild__';
const SNAPSHOT_REBUILD_TASK_PREFIX = 'pending:scope:';
const SNAPSHOT_BUNDLE_INLINE_LIMIT = 1500 * 1000;

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
  const normalized = {
    userScope: JSON.parse(getOperationsRowsCacheKey({ ...user, id: '', userId: '', username: '' })),
    campus: text(scope.campus),
    campusName: text(scope.campusName),
    startDate: text(dateRange.startDate).slice(0, 10),
    endDate: text(dateRange.endDate).slice(0, 10)
  };
  if (text(scope.view)) normalized.view = text(scope.view);
  return normalized;
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

function chunkIdForBundle(bundleId, index) {
  return `${bundleId}:chunk:${String(index).padStart(4, '0')}`;
}

function taskIdForScopeKey(key) {
  return `${SNAPSHOT_REBUILD_TASK_PREFIX}${key}`;
}

function timestampMs(value) {
  const time = Date.parse(text(value));
  return Number.isFinite(time) ? time : 0;
}

function sourceChangedAfterSnapshot(sourceMarker, meta) {
  const changedAt = timestampMs(meta?.sourceChangedAt || sourceMarker?.changedAt);
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
  const encodedPayload = encodePayload(payload);
  const chunkIds = [];
  for (let index = 0; encodedPayload.length > SNAPSHOT_BUNDLE_INLINE_LIMIT && index * SNAPSHOT_BUNDLE_INLINE_LIMIT < encodedPayload.length; index += 1) {
    chunkIds.push(chunkIdForBundle(bundleId, index));
  }
  const bundle = {
    id: bundleId,
    type: 'bundle',
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    codec: 'gzip-base64-json',
    scopeKey: key,
    payload: chunkIds.length ? '' : encodedPayload,
    chunkIds,
    chunkCount: chunkIds.length,
    checksum,
    batchId: finalBatchId,
    completedAt: now,
    sourceSnapshotAt: sourceSnapshotAt || now
  };
  const inlinePayload = chunkIds.length ? '' : encodedPayload;
  const chunks = chunkIds.map((id, index) => ({
    id,
    type: 'bundle-chunk',
    snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
    codec: 'gzip-base64-json',
    scopeKey: key,
    bundleId,
    index,
    payload: encodedPayload.slice(index * SNAPSHOT_BUNDLE_INLINE_LIMIT, (index + 1) * SNAPSHOT_BUNDLE_INLINE_LIMIT)
  }));
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
    inlinePayload,
    checksum,
    completedAt: now,
    publishedAt: now,
    sourceSnapshotAt: sourceSnapshotAt || now,
    sourceChangedAt: sourceSnapshotAt || now
  };
  return { meta, bundle, chunks, scopeKey: key, payload };
}

function storedScopeForNormalized(normalized = {}) {
  const scope = {
    campus: normalized.campus || '',
    campusName: normalized.campusName || '',
    dateRange: { startDate: normalized.startDate || '', endDate: normalized.endDate || '' },
    metricScope: {
      campus: normalized.campus || '',
      campusName: normalized.campusName || '',
      startDate: normalized.startDate || '',
      endDate: normalized.endDate || ''
    }
  };
  if (normalized.view) scope.view = normalized.view;
  return scope;
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
    sourceChangedAt: meta?.sourceChangedAt || sourceMarker?.changedAt || '',
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

  return async function loadOperationsSnapshot({ user = {}, scope = {}, forceFresh = false, allowRefreshing = false } = {}) {
    const key = scopeKey(user, scope);
    const meta = await readRow(metaIdForScopeKey(key));
    const sourceMarker = meta?.sourceChangedAt ? null : await readRow(SNAPSHOT_SOURCE_MARKER_ID).catch((err) => {
        if (err?.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE) return null;
        throw err;
      });
    if (meta?.status !== 'published' || meta?.snapshotVersion !== OPERATIONS_SNAPSHOT_VERSION || meta.scopeKey !== key || !meta.bundleId || !meta.batchId || !meta.completedAt || !meta.sourceSnapshotAt || !meta.checksum) {
      throw snapshotNotReadyError('经营分析快照未发布或契约不完整');
    }
    const refreshing = sourceChangedAfterSnapshot(sourceMarker, meta);
    if (refreshing && !allowRefreshing) {
      throw snapshotNotReadyError('经营分析快照正在刷新，请稍后重试');
    }
    const cacheKey = `${meta.bundleId}:${meta.checksum}`;
    let payload = null;
    if (!forceFresh && memory.has(cacheKey)) {
      payload = memory.get(cacheKey);
    } else {
      let encodedPayload = meta.inlinePayload || '';
      if (!encodedPayload) {
        const bundle = await readRow(meta.bundleId);
        if ((!bundle?.payload && !Array.isArray(bundle?.chunkIds)) || bundle?.codec !== 'gzip-base64-json' || bundle.scopeKey !== key) {
          throw snapshotNotReadyError('经营分析快照包无效');
        }
        encodedPayload = bundle.payload || '';
        if (!encodedPayload) {
          const chunkRows = await Promise.all((bundle.chunkIds || []).map((id) => readRow(id)));
          if (chunkRows.length !== Number(bundle.chunkCount || 0) || chunkRows.some((row) => !row?.payload || row.bundleId !== bundle.id || row.scopeKey !== key)) {
            throw snapshotNotReadyError('经营分析快照分片不完整');
          }
          encodedPayload = chunkRows
            .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
            .map((row) => row.payload)
            .join('');
        }
      }
      payload = decodePayload(encodedPayload);
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
        refreshing,
        completedAt: meta.completedAt,
        sourceSnapshotAt: meta.sourceSnapshotAt,
        checksum: meta.checksum
      }
    };
  };
}

function createOperationsSnapshotSync(deps = {}) {
  const { getCachedRow, put, mkTable, buildPayload, scanByIdPrefix, tables = {} } = deps;
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
      scopeKey: attrs.scopeKey || '',
      user: attrs.user || null,
      scope: attrs.scope || null,
      startedAt: attrs.startedAt || '',
      completedAt: attrs.completedAt || '',
      updatedAt: now,
      createdAt: attrs.createdAt || now
    }).catch(() => null);
  }

  async function rememberScope(user, scope) {
    if (!tables.operationsSnapshot || typeof put !== 'function') return null;
    const key = scopeKey(user, scope);
    const normalized = normalizeScope(user, scope);
    const storedScope = storedScopeForNormalized(normalized);
    const current = await readSnapshotRow(SNAPSHOT_SCOPE_INDEX_ID);
    const scopes = Array.isArray(current?.scopes) ? current.scopes : [];
    const byKey = new Map(scopes.map((item) => [text(item.scopeKey), item]).filter(([itemKey]) => itemKey));
    byKey.set(key, { scopeKey: key, user: normalized.userScope, scope: storedScope, updatedAt: new Date().toISOString() });
    const next = { id: SNAPSHOT_SCOPE_INDEX_ID, type: 'scope-index', scopes: [...byKey.values()] };
    await put(tables.operationsSnapshot, SNAPSHOT_SCOPE_INDEX_ID, next);
    return next;
  }

  async function updateTaskStatus(id, attrs = {}) {
    const taskId = text(id);
    if (taskId) await recordTask(taskId, attrs);
    await recordTask(SNAPSHOT_LAST_REBUILD_TASK_ID, attrs);
  }

  async function enqueueRebuildTask({ user = {}, scope = {}, reason = 'queued' } = {}) {
    const key = scopeKey(user, scope);
    const normalized = normalizeScope(user, scope);
    const taskId = taskIdForScopeKey(key);
    await ensureSnapshotTables();
    await recordTask(taskId, {
      status: 'pending',
      reason,
      error: '',
      scopeKey: key,
      user: normalized.userScope,
      scope: storedScopeForNormalized(normalized)
    });
    return { queued: true, scopeKey: key, taskId };
  }

  async function rebuildScope({ user = {}, scope = {}, dryRun = false, batchId = '', reason = 'manual', taskId = '' } = {}) {
    if (typeof buildPayload !== 'function') throw new Error('缺少经营快照重建数据源');
    const key = scopeKey(user, scope);
    if (rebuildPromises.has(key)) return rebuildPromises.get(key);
    const startedAt = new Date().toISOString();
    const normalized = normalizeScope(user, scope);
    const taskAttrs = {
      reason,
      scopeKey: key,
      user: normalized.userScope,
      scope: storedScopeForNormalized(normalized),
      startedAt,
      createdAt: startedAt
    };
    const run = (async () => {
      if (!dryRun) await updateTaskStatus(taskId, { ...taskAttrs, status: 'running', error: '' });
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
        for (const chunk of built.chunks) await put(tables.operationsSnapshot, chunk.id, chunk);
        await put(tables.operationsSnapshot, built.bundle.id, built.bundle);
        await put(tables.operationsSnapshot, built.meta.id, built.meta);
        await rememberScope(user, scope);
        await updateTaskStatus(taskId, { ...taskAttrs, status: 'done', error: '', completedAt: built.meta.completedAt });
        return { dryRun: false, scopeKey: built.scopeKey, checksum: built.meta.checksum, batchId: built.meta.batchId, bundleId: built.bundle.id };
      } catch (err) {
        if (!dryRun) await updateTaskStatus(taskId, { ...taskAttrs, status: 'failed', error: err?.message || err });
        throw err;
      } finally {
        rebuildPromises.delete(key);
      }
    })();
    rebuildPromises.set(key, run);
    return run;
  }

  async function queueRebuildScope(args = {}) {
    const queued = await enqueueRebuildTask(args);
    rebuildScope({ ...args, dryRun: false, taskId: queued.taskId }).catch((err) => {
      console.warn('[operations-snapshot] rebuild failed:', err?.message || err);
      return null;
    });
    return queued;
  }

  async function processQueuedRebuilds({ limit = 3, includeFailed = true, now = Date.now() } = {}) {
    if (!tables.operationsSnapshotTasks || typeof scanByIdPrefix !== 'function') {
      return { processed: 0, skipped: 0, tasks: [] };
    }
    await ensureSnapshotTables();
    const rows = await scanByIdPrefix(tables.operationsSnapshotTasks, SNAPSHOT_REBUILD_TASK_PREFIX).catch(() => []);
    const staleRunningCutoff = now - 5 * 60 * 1000;
    const candidates = (rows || []).filter((row) => {
      const status = text(row.status);
      if (status === 'pending') return true;
      if (includeFailed && status === 'failed') return true;
      if (status === 'running') return timestampMs(row.updatedAt) < staleRunningCutoff;
      return false;
    }).slice(0, Math.max(1, Math.min(parseInt(limit, 10) || 3, 10)));
    const tasks = [];
    for (const row of candidates) {
      try {
        const result = await rebuildScope({
          user: row.user || {},
          scope: row.scope || {},
          reason: row.reason || 'queued',
          taskId: row.id
        });
        tasks.push({ id: row.id, status: 'done', scopeKey: result.scopeKey, batchId: result.batchId });
      } catch (err) {
        tasks.push({ id: row.id, status: 'failed', error: text(err?.message || err).slice(0, 500) });
      }
    }
    return { processed: candidates.length, skipped: Math.max(0, (rows || []).length - candidates.length), tasks };
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
    await Promise.all(scopes.map((item) => {
      if (!item?.user) return null;
      return readSnapshotRow(metaIdForScopeKey(item.scopeKey)).then((row) => {
        if (row?.id) return put(tables.operationsSnapshot, row.id, { ...row, sourceChangedAt: marker.changedAt });
        return null;
      }).then(() => enqueueRebuildTask({ user: item.user, scope: item.scope, reason: 'source-change' }));
    }));
    return marker;
  }

  return {
    enqueueRebuildTask,
    ensureSnapshotTables,
    loadSnapshot,
    processQueuedRebuilds,
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
  SNAPSHOT_REBUILD_TASK_PREFIX,
  SNAPSHOT_BUNDLE_INLINE_LIMIT,
  buildOperationsSnapshot,
  checksumPayload,
  createOperationsSnapshotLoader,
  createOperationsSnapshotSync,
  decodePayload,
  encodePayload,
  chunkIdForBundle,
  metaIdForScopeKey,
  scopeKey,
  taskIdForScopeKey,
  snapshotHealth,
  snapshotNotReadyError
};
