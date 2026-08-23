const crypto = require('crypto');
const zlib = require('zlib');

const {
  buildScheduleListViewFromData,
  buildScheduleListViewFromItems
} = require('./schedule-list-read-model.js');

const SCHEDULE_LIST_SNAPSHOT_VERSION = 'schedule-list-snapshot-v1';
const SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE = 'SCHEDULE_LIST_SNAPSHOT_NOT_READY';
const SNAPSHOT_ACTIVE_META_ID = 'active:meta';
const SNAPSHOT_ACTIVE_DELTA_ID = 'active:delta';
const SNAPSHOT_LAST_MERGE_TASK_ID = '__last_schedule_snapshot_auto_merge__';
const SNAPSHOT_DELTA_MERGE_THRESHOLD = 100;
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_MERGE_COOLDOWN_MS = 5 * 60 * 1000;

function text(value) {
  return String(value || '').trim();
}

function snapshotNotReadyError(message = '排课列表快照未初始化') {
  const err = new Error(message);
  err.code = SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE;
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

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((row) => row && text(row.id))
    .map((row) => ({ ...row, id: text(row.id) }));
}

function applyDeltaRows(baseRows = [], delta = {}) {
  const byId = new Map(normalizeItems(baseRows).map((row) => [row.id, row]));
  (Array.isArray(delta.deletes) ? delta.deletes : []).forEach((id) => {
    const key = text(id);
    if (key) byId.delete(key);
  });
  (Array.isArray(delta.upserts) ? delta.upserts : []).forEach((row) => {
    const normalized = normalizeItems([row])[0];
    if (normalized?.id) byId.set(normalized.id, normalized);
  });
  return [...byId.values()];
}

function buildSnapshotRowsFromSourceData(sourceData = {}, options = {}) {
  const view = buildScheduleListViewFromData(sourceData, { ...options, all: '1' });
  return normalizeItems(view.items);
}

function buildSnapshotRows(sourceData = {}, options = {}) {
  const now = options.completedAt || options.generatedAt || new Date().toISOString();
  const batchId = text(options.batchId) || `schedule-snapshot:${now.replace(/[^0-9A-Za-z]/g, '')}`;
  const bundleId = `${batchId}:bundle`;
  const rows = buildSnapshotRowsFromSourceData(sourceData, options);
  const checksum = checksumRows(rows);
  const bundle = {
    id: bundleId,
    type: 'bundle',
    snapshotVersion: SCHEDULE_LIST_SNAPSHOT_VERSION,
    codec: 'gzip-base64-json',
    payload: encodePayload(rows),
    total: rows.length,
    checksum,
    batchId,
    sourceSnapshotAt: options.sourceSnapshotAt || now,
    completedAt: now
  };
  const meta = {
    id: SNAPSHOT_ACTIVE_META_ID,
    type: 'meta',
    status: 'published',
    snapshotVersion: SCHEDULE_LIST_SNAPSHOT_VERSION,
    version: SCHEDULE_LIST_SNAPSHOT_VERSION,
    batchId,
    bundleId,
    total: rows.length,
    checksum,
    sourceSnapshotAt: options.sourceSnapshotAt || now,
    completedAt: now,
    publishedAt: now
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
  const completedAtMs = timestampMs(meta?.completedAt || meta?.publishedAt);
  const ageMs = completedAtMs ? Math.max(0, now - completedAtMs) : null;
  const reasons = [];
  if (!meta || meta.status !== 'published') reasons.push('snapshot-not-published');
  if (meta && meta.snapshotVersion !== SCHEDULE_LIST_SNAPSHOT_VERSION) reasons.push('snapshot-version-mismatch');
  if (meta && (!meta.batchId || !meta.completedAt || !meta.sourceSnapshotAt || !meta.checksum || !meta.bundleId)) reasons.push('snapshot-contract-incomplete');
  if (deltaCount >= SNAPSHOT_DELTA_MERGE_THRESHOLD) reasons.push('delta-threshold');
  if (ageMs !== null && ageMs >= SNAPSHOT_MAX_AGE_MS) reasons.push('snapshot-age');
  const lastTaskAt = timestampMs(task?.updatedAt);
  const inCooldown = lastTaskAt > 0 && now - lastTaskAt < SNAPSHOT_MERGE_COOLDOWN_MS;
  const lastMergeFailed = task?.status === 'failed';
  return {
    ok: !!meta && meta.status === 'published' && meta.snapshotVersion === SCHEDULE_LIST_SNAPSHOT_VERSION && !lastMergeFailed,
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
    batchId: meta?.batchId || '',
    bundleId: meta?.bundleId || '',
    completedAt: meta?.completedAt || '',
    sourceSnapshotAt: meta?.sourceSnapshotAt || '',
    checksum: meta?.checksum || '',
    total: Number(meta?.total) || 0
  };
}

function createScheduleListSnapshotLoader(deps = {}) {
  const { getCachedRow, tables = {} } = deps;
  let memory = null;

  async function readRow(id) {
    if (!tables.scheduleListSnapshot || typeof getCachedRow !== 'function') {
      throw snapshotNotReadyError('排课列表快照表未配置');
    }
    try {
      return await getCachedRow(tables.scheduleListSnapshot, id);
    } catch (err) {
      if (isTableNotExistError(err)) throw snapshotNotReadyError('排课列表快照表未初始化');
      throw err;
    }
  }

  return async function loadScheduleListSnapshot(options = {}) {
    const meta = await readRow(SNAPSHOT_ACTIVE_META_ID);
    if (meta?.status !== 'published' || meta?.snapshotVersion !== SCHEDULE_LIST_SNAPSHOT_VERSION || !meta?.bundleId || !meta?.batchId || !meta?.completedAt || !meta?.sourceSnapshotAt || !meta?.checksum) {
      throw snapshotNotReadyError('排课列表快照未发布或契约不完整');
    }
    const cacheKey = `${meta.bundleId}:${meta.checksum}:${meta.total}`;
    let rows = null;
    if (!options.forceFresh && memory?.key === cacheKey) {
      rows = memory.rows;
    } else {
      const bundle = await readRow(meta.bundleId);
      if (!bundle?.payload || bundle?.codec !== 'gzip-base64-json') {
        throw snapshotNotReadyError('排课列表快照包无效');
      }
      rows = normalizeItems(decodePayload(bundle.payload));
      if ((Number(meta.total) || 0) !== rows.length) {
        throw snapshotNotReadyError(`排课列表快照数量校验失败：${rows.length}/${meta.total}`);
      }
      const actualChecksum = checksumRows(rows);
      if (actualChecksum !== meta.checksum) {
        throw snapshotNotReadyError('排课列表快照 checksum 校验失败');
      }
      memory = { key: cacheKey, rows };
    }
    const delta = await readRow(SNAPSHOT_ACTIVE_DELTA_ID).catch((err) => {
      if (err?.code === SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE) return null;
      throw err;
    });
    const mergedRows = applyDeltaRows(rows, delta || {});
    const view = buildScheduleListViewFromItems(mergedRows, options);
    return {
      ...view,
      meta: {
        ...view.meta,
        source: 'schedule-list-snapshot',
        snapshotVersion: SCHEDULE_LIST_SNAPSHOT_VERSION,
        version: SCHEDULE_LIST_SNAPSHOT_VERSION,
        batchId: meta.batchId,
        completedAt: meta.completedAt,
        sourceSnapshotAt: meta.sourceSnapshotAt,
        checksum: meta.checksum,
        deltaUpdatedAt: delta?.updatedAt || ''
      }
    };
  };
}

function createScheduleListSnapshotSync(deps = {}) {
  const { getCachedRow, put, mkTable, loadSourceData, loadDeltaSourceData, tables = {} } = deps;
  let mergePromise = null;

  async function ensureSnapshotTables() {
    if (typeof mkTable !== 'function') return;
    if (tables.scheduleListSnapshot) await mkTable(tables.scheduleListSnapshot);
    if (tables.scheduleListSnapshotTasks) await mkTable(tables.scheduleListSnapshotTasks);
  }

  async function recordTask(id, attrs = {}) {
    if (!tables.scheduleListSnapshotTasks || typeof put !== 'function') return null;
    const now = new Date().toISOString();
    return put(tables.scheduleListSnapshotTasks, text(id) || `task:${now}`, {
      id: text(id) || `task:${now}`,
      status: attrs.status || 'pending',
      reason: attrs.reason || '',
      error: text(attrs.error).slice(0, 500),
      updatedAt: now,
      createdAt: attrs.createdAt || now
    }).catch(() => null);
  }

  async function rebuildFromSourceData(sourceData = {}, options = {}) {
    const built = buildSnapshotRows(sourceData, options);
    if (options.dryRun) return { dryRun: true, total: built.rows.length, checksum: built.meta.checksum, batchId: built.meta.batchId };
    await ensureSnapshotTables();
    await put(tables.scheduleListSnapshot, built.bundle.id, built.bundle);
    await put(tables.scheduleListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID, {
      id: SNAPSHOT_ACTIVE_DELTA_ID,
      type: 'delta',
      upserts: [],
      deletes: [],
      count: 0,
      updatedAt: built.meta.completedAt
    });
    await put(tables.scheduleListSnapshot, SNAPSHOT_ACTIVE_META_ID, built.meta);
    await recordTask('__last_schedule_snapshot_rebuild__', { status: 'done', reason: 'full-rebuild', error: '' });
    return { dryRun: false, total: built.rows.length, checksum: built.meta.checksum, batchId: built.meta.batchId, bundleId: built.bundle.id };
  }

  async function readSnapshotStatus() {
    const read = async (table, id) => {
      if (!table || typeof getCachedRow !== 'function') return null;
      return getCachedRow(table, id).catch(() => null);
    };
    const [meta, delta, task] = await Promise.all([
      read(tables.scheduleListSnapshot, SNAPSHOT_ACTIVE_META_ID),
      read(tables.scheduleListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID),
      read(tables.scheduleListSnapshotTasks, SNAPSHOT_LAST_MERGE_TASK_ID)
    ]);
    return snapshotHealth(meta, delta, task);
  }

  async function autoMergeIfNeeded(reason = 'auto') {
    if (mergePromise) return mergePromise;
    const health = await readSnapshotStatus();
    if (!health.mergeAllowed) return { skipped: true, health };
    if (typeof loadSourceData !== 'function') {
      await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, { status: 'failed', reason, error: '缺少排课快照重建数据源' });
      return { skipped: false, failed: true, health };
    }
    mergePromise = (async () => {
      await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, { status: 'running', reason, error: '' });
      try {
        const result = await rebuildFromSourceData(await loadSourceData(), { dryRun: false, batchId: `auto-${Date.now()}` });
        await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, { status: 'done', reason, error: '' });
        return { skipped: false, result };
      } catch (err) {
        await recordTask(SNAPSHOT_LAST_MERGE_TASK_ID, { status: 'failed', reason, error: err?.message || err });
        return { skipped: false, failed: true, error: err?.message || String(err || '') };
      } finally {
        mergePromise = null;
      }
    })();
    return mergePromise;
  }

  async function buildDeltaItem(row = {}, options = {}) {
    if (options.item) return normalizeItems([options.item])[0] || null;
    if (typeof loadDeltaSourceData === 'function') {
      const data = await loadDeltaSourceData(row, options);
      return buildSnapshotRowsFromSourceData(data, { all: '1' }).find((item) => item.id === text(row.id)) || null;
    }
    throw new Error('缺少排课快照增量数据源，禁止只用单条排课拼接索引');
  }

  async function recordDelta(row, options = {}) {
    if (!tables.scheduleListSnapshot || typeof put !== 'function') return null;
    const scheduleId = text(options.scheduleId || row?.id);
    if (!scheduleId) return null;
    try {
      const current = typeof getCachedRow === 'function'
        ? await getCachedRow(tables.scheduleListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID).catch(() => null)
        : null;
      const upserts = new Map((Array.isArray(current?.upserts) ? current.upserts : []).map((item) => [text(item.id), item]).filter(([id]) => id));
      const deletes = new Set((Array.isArray(current?.deletes) ? current.deletes : []).map(text).filter(Boolean));
      if (options.deleted || !row) {
        upserts.delete(scheduleId);
        deletes.add(scheduleId);
      } else {
        const item = await buildDeltaItem(row, options);
        if (item) upserts.set(scheduleId, item);
        deletes.delete(scheduleId);
      }
      const next = {
        id: SNAPSHOT_ACTIVE_DELTA_ID,
        type: 'delta',
        upserts: [...upserts.values()],
        deletes: [...deletes.values()],
        count: upserts.size + deletes.size,
        updatedAt: new Date().toISOString()
      };
      await put(tables.scheduleListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID, next);
      if (next.count >= SNAPSHOT_DELTA_MERGE_THRESHOLD) {
        autoMergeIfNeeded(options.reason || 'delta-threshold').catch(() => null);
      }
      return next;
    } catch (err) {
      await recordTask(scheduleId, { status: 'pending', reason: options.reason || 'delta-sync', error: err?.message || err });
      return null;
    }
  }

  return {
    autoMergeIfNeeded,
    ensureSnapshotTables,
    readSnapshotStatus,
    rebuildFromSourceData,
    recordDelta,
    recordTask
  };
}

module.exports = {
  SCHEDULE_LIST_SNAPSHOT_VERSION,
  SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE,
  SNAPSHOT_ACTIVE_META_ID,
  SNAPSHOT_ACTIVE_DELTA_ID,
  SNAPSHOT_DELTA_MERGE_THRESHOLD,
  SNAPSHOT_LAST_MERGE_TASK_ID,
  SNAPSHOT_MAX_AGE_MS,
  applyDeltaRows,
  buildSnapshotRows,
  decodePayload,
  encodePayload,
  checksumRows,
  snapshotHealth,
  createScheduleListSnapshotLoader,
  createScheduleListSnapshotSync
};
