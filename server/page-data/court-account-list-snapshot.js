const crypto = require('crypto');
const zlib = require('zlib');

const {
  COURT_ACCOUNT_LIST_INDEX_VERSION,
  COURT_ACCOUNT_LIST_NOT_READY_CODE,
  buildCourtAccountListViewFromIndexRows
} = (() => {
  const index = require('./court-account-list-index.js');
  return {
    COURT_ACCOUNT_LIST_INDEX_VERSION: index.COURT_ACCOUNT_LIST_INDEX_VERSION,
    COURT_ACCOUNT_LIST_NOT_READY_CODE: index.COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE,
    buildCourtAccountListViewFromIndexRows: index.buildCourtAccountListViewFromIndexRows
  };
})();

const COURT_ACCOUNT_LIST_SNAPSHOT_VERSION = 'court-account-list-snapshot-v1';
const SNAPSHOT_ACTIVE_META_ID = 'active:meta';
const SNAPSHOT_ACTIVE_DELTA_ID = 'active:delta';
const SNAPSHOT_LAST_MERGE_TASK_ID = '__last_snapshot_auto_merge__';
const SNAPSHOT_DELTA_MERGE_THRESHOLD = 50;
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_MERGE_COOLDOWN_MS = 5 * 60 * 1000;

function text(value) {
  return String(value || '').trim();
}

function snapshotNotReadyError(message = '订场会员列表快照未初始化') {
  const err = new Error(message);
  err.code = COURT_ACCOUNT_LIST_NOT_READY_CODE;
  err.statusCode = 503;
  return err;
}

function isTableNotExistError(err) {
  const message = String(err?.message || err || '');
  return err?.code === 400 && /table not exist|Request table not exist/i.test(message);
}

function encodePayload(value) {
  const json = JSON.stringify(value || []);
  return zlib.gzipSync(Buffer.from(json)).toString('base64');
}

function decodePayload(payload) {
  if (!payload) return [];
  const json = zlib.gunzipSync(Buffer.from(String(payload), 'base64')).toString('utf8');
  return JSON.parse(json);
}

function checksumRows(rows = []) {
  return crypto.createHash('sha256').update(JSON.stringify(rows || [])).digest('hex');
}

function normalizeRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && text(row.id || row.courtId))
    .map((row) => ({
      ...row,
      id: text(row.id || row.courtId),
      courtId: text(row.courtId || row.id)
    }));
}

function applyDeltaRows(baseRows = [], delta = {}) {
  const byId = new Map(normalizeRows(baseRows).map((row) => [text(row.id), row]));
  (Array.isArray(delta.deletes) ? delta.deletes : []).forEach((id) => {
    const key = text(id);
    if (key) byId.delete(key);
  });
  (Array.isArray(delta.upserts) ? delta.upserts : []).forEach((row) => {
    const normalized = normalizeRows([row])[0];
    if (normalized?.id) byId.set(normalized.id, normalized);
  });
  return [...byId.values()];
}

function buildSnapshotBundleRows(indexRows = []) {
  return normalizeRows(indexRows);
}

function buildSnapshotRows(indexRows = [], options = {}) {
  const now = options.generatedAt || new Date().toISOString();
  const versionId = options.versionId || `snapshot:${now.replace(/[^0-9A-Za-z]/g, '')}`;
  const bundleId = `${versionId}:bundle`;
  const rows = buildSnapshotBundleRows(indexRows);
  const checksum = checksumRows(rows);
  const bundle = {
    id: bundleId,
    type: 'bundle',
    snapshotVersion: COURT_ACCOUNT_LIST_SNAPSHOT_VERSION,
    indexVersion: COURT_ACCOUNT_LIST_INDEX_VERSION,
    codec: 'gzip-base64-json',
    payload: encodePayload(rows),
    total: rows.length,
    checksum,
    generatedAt: now
  };
  const meta = {
    id: SNAPSHOT_ACTIVE_META_ID,
    type: 'meta',
    status: 'done',
    snapshotVersion: COURT_ACCOUNT_LIST_SNAPSHOT_VERSION,
    indexVersion: COURT_ACCOUNT_LIST_INDEX_VERSION,
    bundleId,
    total: rows.length,
    checksum,
    generatedAt: now,
    activatedAt: now
  };
  return { meta, bundle, rows };
}

function timestampMs(value) {
  const time = Date.parse(text(value));
  return Number.isFinite(time) ? time : 0;
}

function snapshotHealth(meta = null, delta = null, task = null, options = {}) {
  const now = Number(options.now) || Date.now();
  const deltaCount = Number(delta?.count) || 0;
  const generatedAtMs = timestampMs(meta?.generatedAt || meta?.activatedAt);
  const ageMs = generatedAtMs ? Math.max(0, now - generatedAtMs) : null;
  const reasons = [];
  if (!meta || meta.status !== 'done') reasons.push('snapshot-not-ready');
  if (deltaCount >= SNAPSHOT_DELTA_MERGE_THRESHOLD) reasons.push('delta-threshold');
  if (ageMs !== null && ageMs >= SNAPSHOT_MAX_AGE_MS) reasons.push('snapshot-age');
  const lastTaskAt = timestampMs(task?.updatedAt);
  const inCooldown = lastTaskAt > 0 && now - lastTaskAt < SNAPSHOT_MERGE_COOLDOWN_MS;
  const lastMergeFailed = task?.status === 'failed';
  return {
    ok: !!meta && meta.status === 'done' && !lastMergeFailed,
    needsMerge: reasons.includes('delta-threshold') || reasons.includes('snapshot-age'),
    mergeAllowed: (reasons.includes('delta-threshold') || reasons.includes('snapshot-age')) && !inCooldown,
    reasons,
    deltaCount,
    threshold: SNAPSHOT_DELTA_MERGE_THRESHOLD,
    snapshotAgeMs: ageMs,
    maxAgeMs: SNAPSHOT_MAX_AGE_MS,
    inCooldown,
    lastMergeStatus: task?.status || '',
    lastMergeError: task?.error || '',
    snapshotGeneratedAt: meta?.generatedAt || '',
    deltaUpdatedAt: delta?.updatedAt || '',
    bundleId: meta?.bundleId || '',
    total: Number(meta?.total) || 0
  };
}

function createCourtAccountListSnapshotLoader(deps = {}) {
  const { getCachedRow, tables = {} } = deps;
  let memory = null;

  async function readRow(id) {
    if (!tables.courtAccountListSnapshot || typeof getCachedRow !== 'function') {
      throw snapshotNotReadyError('订场会员列表快照表未配置');
    }
    try {
      const startedAt = Date.now();
      const row = await getCachedRow(tables.courtAccountListSnapshot, id);
      if (process.env.DEBUG_COURT_SNAPSHOT_TIMING === 'true') {
        console.log(`[court-snapshot-debug] get ${id} ${Date.now() - startedAt}ms`);
      }
      return row;
    } catch (err) {
      if (isTableNotExistError(err)) throw snapshotNotReadyError('订场会员列表快照表未初始化');
      throw err;
    }
  }

  return async function loadCourtAccountListSnapshot(options = {}) {
    const loadStartedAt = Date.now();
    const meta = await readRow(SNAPSHOT_ACTIVE_META_ID);
    if (meta?.status !== 'done' || !meta?.bundleId || !(Number(meta?.total) > 0)) {
      throw snapshotNotReadyError('订场会员列表快照未完成首轮重建');
    }
    let rows = null;
    const cacheKey = `${meta.bundleId}:${meta.checksum || ''}:${meta.total || ''}`;
    if (!options.forceFresh && memory?.key === cacheKey) {
      rows = memory.rows;
    } else {
      const bundle = await readRow(meta.bundleId);
      if (!bundle?.payload || bundle?.codec !== 'gzip-base64-json') {
        throw snapshotNotReadyError('订场会员列表快照包无效');
      }
      rows = decodePayload(bundle.payload);
      if ((Number(meta.total) || 0) > rows.length) {
        throw snapshotNotReadyError(`订场会员列表快照不完整：${rows.length}/${meta.total}`);
      }
      const actualChecksum = checksumRows(rows);
      if (meta.checksum && actualChecksum !== meta.checksum) {
        throw snapshotNotReadyError('订场会员列表快照校验失败');
      }
      memory = { key: cacheKey, rows };
    }
    const delta = await readRow(SNAPSHOT_ACTIVE_DELTA_ID).catch((err) => {
      if (err?.code === COURT_ACCOUNT_LIST_NOT_READY_CODE) return null;
      throw err;
    });
    const mergedRows = applyDeltaRows(rows, delta || {});
    const view = buildCourtAccountListViewFromIndexRows(mergedRows, options);
    if (process.env.DEBUG_COURT_SNAPSHOT_TIMING === 'true') {
      console.log(`[court-snapshot-debug] build ${Date.now() - loadStartedAt}ms`);
    }
    return {
      ...view,
      meta: {
        ...view.meta,
        source: 'court-account-list-snapshot',
        snapshotVersion: COURT_ACCOUNT_LIST_SNAPSHOT_VERSION,
        snapshotGeneratedAt: meta.generatedAt || '',
        deltaUpdatedAt: delta?.updatedAt || ''
      }
    };
  };
}

function createCourtAccountListSnapshotSync(deps = {}) {
  const { getCachedRow, put, mkTable, loadIndexRows, tables = {} } = deps;
  let mergePromise = null;

  async function ensureSnapshotTables() {
    if (typeof mkTable !== 'function') return;
    if (tables.courtAccountListSnapshot) await mkTable(tables.courtAccountListSnapshot);
    if (tables.courtAccountListSnapshotTasks) await mkTable(tables.courtAccountListSnapshotTasks);
  }

  async function recordTask(id, attrs = {}) {
    if (!tables.courtAccountListSnapshotTasks || typeof put !== 'function') return null;
    const now = new Date().toISOString();
    return put(tables.courtAccountListSnapshotTasks, text(id) || `task:${now}`, {
      id: text(id) || `task:${now}`,
      status: attrs.status || 'pending',
      reason: attrs.reason || '',
      error: text(attrs.error).slice(0, 500),
      updatedAt: now,
      createdAt: attrs.createdAt || now
    }).catch(() => null);
  }

  async function rebuildFromIndexRows(indexRows = {}, options = {}) {
    const rows = Array.isArray(indexRows) ? indexRows : [];
    if (!rows.length) throw new Error('订场会员列表快照重建失败：索引行为空');
    const built = buildSnapshotRows(rows, options);
    if (options.dryRun) return { dryRun: true, total: built.rows.length, checksum: built.meta.checksum };
    await ensureSnapshotTables();
    await put(tables.courtAccountListSnapshot, built.bundle.id, built.bundle);
    await put(tables.courtAccountListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID, {
      id: SNAPSHOT_ACTIVE_DELTA_ID,
      type: 'delta',
      upserts: [],
      deletes: [],
      count: 0,
      updatedAt: built.meta.generatedAt
    });
    await put(tables.courtAccountListSnapshot, SNAPSHOT_ACTIVE_META_ID, built.meta);
    await recordTask('__last_full_snapshot_rebuild__', {
      status: 'done',
      reason: 'full-rebuild',
      error: ''
    });
    return { dryRun: false, total: built.rows.length, checksum: built.meta.checksum, bundleId: built.bundle.id };
  }

  async function readSnapshotStatus() {
    const read = async (id) => {
      if (!tables.courtAccountListSnapshot || typeof getCachedRow !== 'function') return null;
      return getCachedRow(tables.courtAccountListSnapshot, id).catch(() => null);
    };
    const [meta, delta, task] = await Promise.all([
      read(SNAPSHOT_ACTIVE_META_ID),
      read(SNAPSHOT_ACTIVE_DELTA_ID),
      tables.courtAccountListSnapshotTasks && typeof getCachedRow === 'function'
        ? getCachedRow(tables.courtAccountListSnapshotTasks, SNAPSHOT_LAST_MERGE_TASK_ID).catch(() => null)
        : Promise.resolve(null)
    ]);
    return snapshotHealth(meta, delta, task);
  }

  async function autoMergeIfNeeded(reason = 'auto') {
    if (mergePromise) return mergePromise;
    const health = await readSnapshotStatus();
    if (!health.mergeAllowed) return { skipped: true, health };
    if (typeof loadIndexRows !== 'function') {
      await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, {
        status: 'failed',
        reason,
        error: '缺少快照自动合并读取索引函数'
      });
      return { skipped: false, failed: true, health };
    }
    mergePromise = (async () => {
      await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, { status: 'running', reason, error: '' });
      try {
        const rows = await loadIndexRows();
        const result = await rebuildFromIndexRows(rows, { dryRun: false, versionId: `auto-${Date.now()}` });
        await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, { status: 'done', reason, error: '' });
        return { skipped: false, result };
      } catch (err) {
        await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, {
          status: 'failed',
          reason,
          error: err?.message || err
        });
        return { skipped: false, failed: true, error: err?.message || String(err || '') };
      } finally {
        mergePromise = null;
      }
    })();
    return mergePromise;
  }

  async function recordDelta(row, options = {}) {
    if (!tables.courtAccountListSnapshot || typeof put !== 'function') return null;
    const courtId = text(options.courtId || row?.id || row?.courtId);
    if (!courtId) return null;
    try {
      const current = typeof getCachedRow === 'function'
        ? await getCachedRow(tables.courtAccountListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID).catch(() => null)
        : null;
      const upserts = new Map((Array.isArray(current?.upserts) ? current.upserts : [])
        .map((item) => [text(item.id || item.courtId), item])
        .filter(([id]) => id));
      const deletes = new Set((Array.isArray(current?.deletes) ? current.deletes : []).map(text).filter(Boolean));
      if (options.deleted || !row) {
        upserts.delete(courtId);
        deletes.add(courtId);
      } else {
        const normalized = normalizeRows([row])[0];
        if (normalized) upserts.set(courtId, normalized);
        deletes.delete(courtId);
      }
      const next = {
        id: SNAPSHOT_ACTIVE_DELTA_ID,
        type: 'delta',
        upserts: [...upserts.values()],
        deletes: [...deletes.values()],
        count: upserts.size + deletes.size,
        updatedAt: new Date().toISOString()
      };
      await put(tables.courtAccountListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID, next);
      if (next.count >= SNAPSHOT_DELTA_MERGE_THRESHOLD) {
        autoMergeIfNeeded(options.reason || 'delta-threshold').catch(() => null);
      }
      return next;
    } catch (err) {
      await recordTask(courtId, {
        status: 'pending',
        reason: options.reason || 'delta-sync',
        error: err?.message || err
      });
      return null;
    }
  }

  return {
    autoMergeIfNeeded,
    ensureSnapshotTables,
    readSnapshotStatus,
    rebuildFromIndexRows,
    recordDelta,
    recordTask
  };
}

module.exports = {
  COURT_ACCOUNT_LIST_SNAPSHOT_VERSION,
  SNAPSHOT_ACTIVE_META_ID,
  SNAPSHOT_ACTIVE_DELTA_ID,
  SNAPSHOT_DELTA_MERGE_THRESHOLD,
  SNAPSHOT_LAST_MERGE_TASK_ID,
  SNAPSHOT_MAX_AGE_MS,
  applyDeltaRows,
  buildSnapshotRows,
  decodePayload,
  encodePayload,
  snapshotHealth,
  createCourtAccountListSnapshotLoader,
  createCourtAccountListSnapshotSync
};
