const crypto = require('crypto');
const zlib = require('zlib');
const { getOperationsRowsCacheKey } = require('../read-models/operations-source.js');

const OPERATIONS_SNAPSHOT_VERSION = 'operations-page-snapshot-v2';
const OPERATIONS_SNAPSHOT_NOT_READY_CODE = 'OPERATIONS_SNAPSHOT_NOT_READY';
const COACH_DAILY_MONTH_PACK_VIEW = 'coach-month-pack';
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

function dateKey(value) {
  const textValue = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(textValue) ? textValue.slice(0, 10) : '';
}

function dateKeyUtcMs(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addUtcDays(day, offset) {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return '';
  return new Date(ms + offset * 86400000).toISOString().slice(0, 10);
}

function dateRangeDays(range = {}) {
  const startDate = dateKey(range.startDate || range.start);
  const endDate = dateKey(range.endDate || range.end);
  if (!startDate || !endDate) return [];
  const start = dateKeyUtcMs(startDate);
  const end = dateKeyUtcMs(endDate);
  if (start == null || end == null || end < start) return [];
  const count = Math.floor((end - start) / 86400000) + 1;
  return Array.from({ length: count }, (_, index) => addUtcDays(startDate, index));
}

function monthStart(day = '') {
  const key = dateKey(day);
  return key ? `${key.slice(0, 7)}-01` : '';
}

function monthEnd(day = '') {
  const start = monthStart(day);
  if (!start) return '';
  const [year, month] = start.split('-').map((item) => parseInt(item, 10));
  return `${start.slice(0, 7)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

function monthKeysInRange(range = {}) {
  const days = dateRangeDays(range);
  const months = [];
  const seen = new Set();
  days.forEach((day) => {
    const month = day.slice(0, 7);
    if (!seen.has(month)) {
      seen.add(month);
      months.push(month);
    }
  });
  return months;
}

function cloneDailyScope(scope = {}, day = '') {
  const daily = {
    ...scope,
    view: 'coach',
    dateRange: { startDate: day, endDate: day },
    metricScope: {
      ...(scope.metricScope || {}),
      startDate: day,
      endDate: day
    }
  };
  if (scope.campus) daily.metricScope.campus = scope.campus;
  if (scope.campusName) daily.metricScope.campusName = scope.campusName;
  return daily;
}

function cloneCoachDailyMonthPackScope(scope = {}, month = '') {
  const monthKey = String(month || dateKey(scope.dateRange?.startDate || scope.startDate).slice(0, 7)).slice(0, 7);
  const startDate = monthStart(`${monthKey}-01`);
  const endDate = monthEnd(startDate);
  const pack = {
    ...scope,
    view: COACH_DAILY_MONTH_PACK_VIEW,
    dateRange: { startDate, endDate },
    metricScope: {
      ...(scope.metricScope || {}),
      startDate,
      endDate
    }
  };
  if (scope.campus) pack.metricScope.campus = scope.campus;
  if (scope.campusName) pack.metricScope.campusName = scope.campusName;
  return pack;
}

function canComposeCoachDailyScope(scope = {}) {
  const range = scope.dateRange || scope || {};
  return text(scope.view) === 'coach' && dateRangeDays(range).length > 1;
}

function isCoachDailyMonthPackScope(scope = {}) {
  return text(scope.view) === COACH_DAILY_MONTH_PACK_VIEW;
}

function emptyCoachCard(title, unit, value = 0) {
  return { title, value, unit };
}

function roundMetric(value, digits = 1) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
}

function moneyMetric(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function rateMetric(numerator, denominator) {
  return denominator ? roundMetric((Number(numerator) || 0) * 100 / denominator, 1) : 0;
}

function mergeCourseMix(target = [], source = []) {
  const byType = new Map((target || []).map(row => [row.type, { ...row, hours: Number(row.hours) || 0 }]));
  (source || []).forEach(row => {
    const type = text(row.type);
    if (!type) return;
    const current = byType.get(type) || { type, hours: 0 };
    current.hours = roundMetric((Number(current.hours) || 0) + (Number(row.hours) || 0), 2);
    byType.set(type, current);
  });
  return [...byType.values()];
}

function mergeCampusDistribution(target = [], source = []) {
  const byCampus = new Map((target || []).map(row => [row.campusName, { ...row, hours: Number(row.hours) || 0 }]));
  (source || []).forEach(row => {
    const campusName = text(row.campusName);
    if (!campusName) return;
    const current = byCampus.get(campusName) || { campusName, hours: 0 };
    current.hours = roundMetric((Number(current.hours) || 0) + (Number(row.hours) || 0), 2);
    byCampus.set(campusName, current);
  });
  return [...byCampus.values()].sort((a, b) => b.hours - a.hours || a.campusName.localeCompare(b.campusName, 'zh-Hans-CN'));
}

function utilizationBandForRate(rateValue) {
  const value = Number(rateValue) || 0;
  if (value < 20) return { band: '0%-20%', label: '闲置', color: '#E05252' };
  if (value < 40) return { band: '20%-40%', label: '偏低', color: '#D89135' };
  if (value < 60) return { band: '40%-60%', label: '观察', color: '#8EA0B8' };
  if (value < 80) return { band: '60%-80%', label: '健康', color: '#7CBF8A' };
  return { band: '80%-100%', label: '高效', color: '#2E8B6D' };
}

const COACH_UTILIZATION_BANDS = [
  { band: '0%-20%', label: '闲置', color: '#E05252' },
  { band: '20%-40%', label: '偏低', color: '#D89135' },
  { band: '40%-60%', label: '观察', color: '#8EA0B8' },
  { band: '60%-80%', label: '健康', color: '#7CBF8A' },
  { band: '80%-100%', label: '高效', color: '#2E8B6D' }
];

function composeCoachSnapshotPayloads(payloads = [], scope = {}) {
  const first = payloads.find(Boolean) || {};
  const byCoach = new Map();
  (payloads || []).forEach(payload => {
    ((payload?.operations?.coach?.rows) || []).forEach(row => {
      const coach = text(row.coach || row.coachName);
      if (!coach) return;
      const current = byCoach.get(coach) || {
        ...row,
        coach,
        usedHours: 0,
        teachingHours: 0,
        teachingAttendanceCount: 0,
        teachingStudentCount: 0,
        teachingUniqueStudentCount: 0,
        lessonCount: 0,
        availableHours: 0,
        revenue: 0,
        trialBase: 0,
        trialConverted: 0,
        feedbackCompleted: 0,
        feedbackRequired: 0,
        oldCustomerBase: 0,
        renewalCount: 0,
        courseMix: [],
        campusDistribution: []
      };
      current.usedHours = roundMetric(current.usedHours + (Number(row.usedHours) || 0), 2);
      current.teachingHours = roundMetric(current.teachingHours + (Number(row.teachingHours) || 0), 2);
      current.teachingAttendanceCount += Number(row.teachingAttendanceCount ?? row.teachingStudentCount) || 0;
      current.teachingStudentCount += Number(row.teachingStudentCount ?? row.teachingAttendanceCount) || 0;
      current.teachingUniqueStudentCount += Number(row.teachingUniqueStudentCount) || 0;
      current.lessonCount += Number(row.lessonCount) || 0;
      current.availableHours = roundMetric(current.availableHours + (Number(row.availableHours) || 0), 2);
      current.revenue = moneyMetric(current.revenue + (Number(row.revenue) || 0));
      current.trialBase += Number(row.trialBase) || 0;
      current.trialConverted += Number(row.trialConverted) || 0;
      current.feedbackCompleted += Number(row.feedbackCompleted) || 0;
      current.feedbackRequired += Number(row.feedbackRequired) || 0;
      current.oldCustomerBase += Number(row.oldCustomerBase) || 0;
      current.renewalCount += Number(row.renewalCount) || 0;
      current.courseMix = mergeCourseMix(current.courseMix, row.courseMix || []);
      current.campusDistribution = mergeCampusDistribution(current.campusDistribution, row.campusDistribution || []);
      byCoach.set(coach, current);
    });
  });
  const rows = [...byCoach.values()].map(row => {
    const usedHours = roundMetric(row.usedHours, 1);
    const availableHours = roundMetric(row.availableHours, 1);
    const courseMix = (row.courseMix || []).map(item => ({ ...item, hours: roundMetric(item.hours, 1), share: rateMetric(item.hours, usedHours) }));
    const campusDistribution = row.campusDistribution || [];
    const utilizationRate = availableHours ? rateMetric(usedHours, availableHours) : 0;
    return {
      ...row,
      usedHours,
      teachingHours: roundMetric(row.teachingHours, 1),
      availableHours,
      revenue: moneyMetric(row.revenue),
      feedbackCompletionRate: rateMetric(row.feedbackCompleted, row.feedbackRequired),
      utilizationRate,
      trialConversionRate: rateMetric(row.trialConverted, row.trialBase),
      renewalRate: rateMetric(row.renewalCount, row.oldCustomerBase),
      courseMix,
      campusDistribution,
      campusDistributionText: campusDistribution.length ? campusDistribution.map(item => `${item.campusName} ${Number.isInteger(item.hours) ? item.hours : roundMetric(item.hours, 1)}`).join(' | ') : '-',
      utilizationBand: utilizationBandForRate(utilizationRate)
    };
  }).sort((a, b) => (Number(a.sortOrder) || 9999) - (Number(b.sortOrder) || 9999) || b.revenue - a.revenue || b.usedHours - a.usedHours || a.coach.localeCompare(b.coach, 'zh-Hans-CN'));
  const usedHours = roundMetric(rows.reduce((sum, row) => sum + (Number(row.usedHours) || 0), 0), 1);
  const availableHours = roundMetric(rows.reduce((sum, row) => sum + (Number(row.availableHours) || 0), 0), 1);
  const revenue = moneyMetric(rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0));
  const trialBase = rows.reduce((sum, row) => sum + (Number(row.trialBase) || 0), 0);
  const trialConverted = rows.reduce((sum, row) => sum + (Number(row.trialConverted) || 0), 0);
  const oldCustomerBase = rows.reduce((sum, row) => sum + (Number(row.oldCustomerBase) || 0), 0);
  const renewalCount = rows.reduce((sum, row) => sum + (Number(row.renewalCount) || 0), 0);
  let cumulativeRevenue = 0;
  const revenueParetoRows = rows.map(row => {
    cumulativeRevenue = moneyMetric(cumulativeRevenue + (Number(row.revenue) || 0));
    return {
      coach: row.coach,
      revenue: row.revenue,
      revenueShare: rateMetric(row.revenue, revenue),
      cumulativeShare: rateMetric(cumulativeRevenue, revenue)
    };
  });
  const overviewCards = (payloads || []).map(payload => payload?.operations?.overview?.cards || {});
  const sumOverviewCard = (key, title, unit) => emptyCoachCard(title, unit, moneyMetric(overviewCards.reduce((sum, cards) => sum + (Number(cards?.[key]?.value) || 0), 0)));
  return {
    campuses: first.campuses || [],
    operations: {
      overview: {
        cards: {
          totalIncome: sumOverviewCard('totalIncome', '总收入', '元'),
          recognizedRevenue: sumOverviewCard('recognizedRevenue', '已入账', '元'),
          pendingRevenue: sumOverviewCard('pendingRevenue', '未入账', '元'),
          tradeCount: emptyCoachCard('成交笔数', '笔', overviewCards.reduce((sum, cards) => sum + (Number(cards?.tradeCount?.value) || 0), 0))
        }
      },
      coach: {
        metricSource: 'standard-course-lifecycle',
        cards: {
          activeCoaches: emptyCoachCard('在岗教练', '人', rows.length),
          availableHoursThisWeek: emptyCoachCard('本周可排工时', '小时', availableHours),
          usedHours: emptyCoachCard('已排课时', '小时', usedHours),
          utilizationRate: emptyCoachCard('工时利用率', '%', availableHours ? rateMetric(usedHours, availableHours) : 0),
          revenue: emptyCoachCard('归属课程实收', '元', revenue),
          trialConversionRate: emptyCoachCard('体验转化率', '%', rateMetric(trialConverted, trialBase)),
          renewalRate: emptyCoachCard('老客续费率', '%', rateMetric(renewalCount, oldCustomerBase))
        },
        rows,
        period: { dateRange: scope.dateRange || {}, days: dateRangeDays(scope.dateRange || {}).length },
        trends: payloads.flatMap(payload => payload?.operations?.coach?.trends || []).sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
        trendMeta: { source: 'daily-snapshot-compose' },
        trendDiagnostics: [],
        trendComparisons: {},
        utilizationBands: COACH_UTILIZATION_BANDS.map(band => ({ ...band, count: rows.filter(row => row.utilizationBand?.band === band.band).length })),
        revenueParetoRows,
        courseMixRows: rows.map(row => ({
          coach: row.coach,
          trialHours: row.courseMix.find(item => item.type === '体验课')?.hours || 0,
          privateHours: row.courseMix.find(item => item.type === '私教课')?.hours || 0,
          smallGroupHours: row.courseMix.find(item => item.type === '小班课')?.hours || 0,
          specialHours: row.courseMix.find(item => item.type === '专项课')?.hours || 0,
          companionHours: row.courseMix.find(item => item.type === '陪打')?.hours || 0
        })),
        capabilityRows: rows.map(row => ({
          coach: row.coach,
          trialConversionRate: row.trialConversionRate,
          trialBase: row.trialBase,
          trialConverted: row.trialConverted,
          renewalRate: row.renewalRate,
          oldCustomerBase: row.oldCustomerBase,
          renewalCount: row.renewalCount,
          revenue: row.revenue
        })),
        alerts: []
      }
    },
    generatedAt: new Date().toISOString()
  };
}

function buildCoachDailyMonthPackPayload({ month = '', dailyPayloads = [] } = {}) {
  const days = {};
  (dailyPayloads || []).forEach((item) => {
    const day = dateKey(item?.day);
    if (day && item.payload) days[day] = item.payload;
  });
  return {
    coachDailyMonth: {
      month: String(month || '').slice(0, 7),
      days
    },
    generatedAt: new Date().toISOString()
  };
}

function payloadsFromCoachDailyMonthPacks(packs = [], range = {}) {
  const byDay = new Map();
  (packs || []).forEach((pack) => {
    const days = pack?.coachDailyMonth?.days || {};
    Object.entries(days).forEach(([day, payload]) => {
      if (dateKey(day) && payload) byDay.set(dateKey(day), payload);
    });
  });
  return dateRangeDays(range).map((day) => {
    const payload = byDay.get(day);
    if (!payload) throw snapshotNotReadyError(`经营分析月包快照缺少 ${day}`);
    return payload;
  });
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
    const readPublishedPayload = async (targetScope, targetKey) => {
      const meta = await readRow(metaIdForScopeKey(targetKey));
      const sourceMarker = meta?.sourceChangedAt ? null : await readRow(SNAPSHOT_SOURCE_MARKER_ID).catch((err) => {
          if (err?.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE) return null;
          throw err;
        });
      if (meta?.status !== 'published' || meta?.snapshotVersion !== OPERATIONS_SNAPSHOT_VERSION || meta.scopeKey !== targetKey || !meta.bundleId || !meta.batchId || !meta.completedAt || !meta.sourceSnapshotAt || !meta.checksum) {
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
          if ((!bundle?.payload && !Array.isArray(bundle?.chunkIds)) || bundle?.codec !== 'gzip-base64-json' || bundle.scopeKey !== targetKey) {
            throw snapshotNotReadyError('经营分析快照包无效');
          }
          encodedPayload = bundle.payload || '';
          if (!encodedPayload) {
            const chunkRows = await Promise.all((bundle.chunkIds || []).map((id) => readRow(id)));
            if (chunkRows.length !== Number(bundle.chunkCount || 0) || chunkRows.some((row) => !row?.payload || row.bundleId !== bundle.id || row.scopeKey !== targetKey)) {
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
      return { meta, payload, refreshing };
    };
    let loaded;
    try {
      loaded = await readPublishedPayload(scope, key);
    } catch (err) {
      if (err?.code !== OPERATIONS_SNAPSHOT_NOT_READY_CODE || !canComposeCoachDailyScope(scope)) throw err;
      const months = monthKeysInRange(scope.dateRange || {});
      const monthPacks = await Promise.all(months.map(async month => {
        const monthScope = cloneCoachDailyMonthPackScope(scope, month);
        const monthKey = scopeKey(user, monthScope);
        return (await readPublishedPayload(monthScope, monthKey)).payload;
      }));
      const days = dateRangeDays(scope.dateRange || {});
      const dailyPayloads = payloadsFromCoachDailyMonthPacks(monthPacks, scope.dateRange || {});
      return {
        ...composeCoachSnapshotPayloads(dailyPayloads, scope),
        snapshot: {
          source: 'operations-coach-daily-month-pack',
          snapshotVersion: OPERATIONS_SNAPSHOT_VERSION,
          batchId: `daily-compose:${days[0]}:${days[days.length - 1]}`,
          scopeKey: key,
          refreshing: false,
          completedAt: new Date().toISOString(),
          sourceSnapshotAt: '',
          checksum: checksumPayload(dailyPayloads)
        }
      };
    }
    const { meta, payload, refreshing } = loaded;
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

  async function rebuildCoachDailyMonthPackScope({ user = {}, scope = {}, dryRun = false, batchId = '', reason = 'manual', taskId = '' } = {}) {
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
        const days = dateRangeDays(scope.dateRange || {});
        if (!days.length || new Set(days.map(day => day.slice(0, 7))).size !== 1) {
          throw new Error('教练月包快照只允许单月范围');
        }
        const dailyPayloads = [];
        for (const day of days) {
          dailyPayloads.push({ day, payload: await buildPayload({ user, scope: cloneDailyScope(scope, day) }) });
        }
        const payload = buildCoachDailyMonthPackPayload({ month: days[0].slice(0, 7), dailyPayloads });
        const built = buildOperationsSnapshot({
          payload,
          user,
          scope,
          batchId: batchId || `operations-month-pack-${Date.now()}`,
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

  function enqueueScopesForRange(user = {}, scope = {}) {
    if (!canComposeCoachDailyScope(scope)) return [{ user, scope }];
    return monthKeysInRange(scope.dateRange || {}).map((month) => ({
      user,
      scope: cloneCoachDailyMonthPackScope(scope, month)
    }));
  }

  async function updateTaskStatus(id, attrs = {}) {
    const taskId = text(id);
    if (taskId) await recordTask(taskId, attrs);
    await recordTask(SNAPSHOT_LAST_REBUILD_TASK_ID, attrs);
  }

  async function enqueueRebuildTask({ user = {}, scope = {}, reason = 'queued' } = {}) {
    await ensureSnapshotTables();
    const queued = [];
    for (const item of enqueueScopesForRange(user, scope)) {
      const key = scopeKey(item.user, item.scope);
      const normalized = normalizeScope(item.user, item.scope);
      const taskId = taskIdForScopeKey(key);
      await recordTask(taskId, {
        status: 'pending',
        reason,
        error: '',
        scopeKey: key,
        user: normalized.userScope,
        scope: storedScopeForNormalized(normalized)
      });
      queued.push({ scopeKey: key, taskId });
    }
    return { queued: true, scopeKey: queued[0]?.scopeKey || scopeKey(user, scope), taskId: queued[0]?.taskId || taskIdForScopeKey(scopeKey(user, scope)), tasks: queued };
  }

  async function rebuildScope({ user = {}, scope = {}, dryRun = false, batchId = '', reason = 'manual', taskId = '' } = {}) {
    if (isCoachDailyMonthPackScope(scope)) {
      return rebuildCoachDailyMonthPackScope({ user, scope, dryRun, batchId, reason, taskId });
    }
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
      if (text(item?.scope?.view) === 'coach' && dateRangeDays(item?.scope?.dateRange || {}).length === 1) return null;
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
    rebuildCoachDailyMonthPackScope,
    rebuildScope,
    recordSourceChange,
    recordTask
  };
}

module.exports = {
  OPERATIONS_SNAPSHOT_VERSION,
  OPERATIONS_SNAPSHOT_NOT_READY_CODE,
  COACH_DAILY_MONTH_PACK_VIEW,
  SNAPSHOT_SCOPE_INDEX_ID,
  SNAPSHOT_SOURCE_MARKER_ID,
  SNAPSHOT_LAST_REBUILD_TASK_ID,
  SNAPSHOT_REBUILD_TASK_PREFIX,
  SNAPSHOT_BUNDLE_INLINE_LIMIT,
  buildOperationsSnapshot,
  buildCoachDailyMonthPackPayload,
  canComposeCoachDailyScope,
  checksumPayload,
  cloneDailyScope,
  cloneCoachDailyMonthPackScope,
  composeCoachSnapshotPayloads,
  createOperationsSnapshotLoader,
  createOperationsSnapshotSync,
  decodePayload,
  encodePayload,
  payloadsFromCoachDailyMonthPacks,
  chunkIdForBundle,
  metaIdForScopeKey,
  scopeKey,
  taskIdForScopeKey,
  snapshotHealth,
  snapshotNotReadyError
};
