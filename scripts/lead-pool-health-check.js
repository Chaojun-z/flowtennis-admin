#!/usr/bin/env node

const { resolveSmokeConfig, requestJson, extractToken } = require('./release-api-smoke.js');

function text(value) {
  return String(value || '').trim();
}

function cleanEdgePunctuation(value) {
  return text(value).replace(/^[\s、，,;；/|｜]+|[\s、，,;；/|｜]+$/g, '').trim();
}

function normalizeIdentity(value) {
  return cleanEdgePunctuation(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·.。_\-\/|｜，,;；]/g, '');
}

function splitCompositeName(value) {
  return cleanEdgePunctuation(value)
    .split(/[、,，/+＋&]+/)
    .map(cleanEdgePunctuation)
    .filter(Boolean);
}

function stripCompositeNoise(value) {
  return cleanEdgePunctuation(value)
    .replace(/[.。]+$/g, '')
    .replace(/[（(]\s*(?:体验|正式|小班|团课|训练营|集训营|\d+\s*人)\s*[）)]$/g, '')
    .replace(/(?:等)?\s*\d+\s*人$/g, '')
    .replace(/等三人$/g, '')
    .replace(/[.。]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function canonicalDirtyName(value) {
  const parts = splitCompositeName(value);
  if (!parts.length) return '';
  return stripCompositeNoise(parts[0]);
}

function isObviousNoiseName(value) {
  const raw = cleanEdgePunctuation(value).replace(/\s+/g, '');
  if (!raw) return true;
  if (/^[+\-—_~·.。,，、/&]+$/.test(raw)) return true;
  if (/^(?:朋友|家长|学员|多人|待定|未知|三人|等三人|零基础|随到随学|随到随学小班课|多球课)$/u.test(raw)) return true;
  return false;
}

function shouldCleanCompositeName(value) {
  const raw = cleanEdgePunctuation(value);
  if (!raw) return false;
  const cleanName = canonicalDirtyName(raw);
  return raw !== text(value) || cleanName !== raw || isObviousNoiseName(cleanName);
}

function leadDisplayName(row = {}) {
  return text(row.displayName || row.wechatName || row.name);
}

function leadCanonicalKey(row = {}) {
  const phone = text(row.phone).replace(/\s+/g, '');
  if (phone) return `phone:${phone}`;
  const name = normalizeIdentity(leadDisplayName(row));
  if (name) return `name:${name}`;
  return `id:${text(row.id || row.leadId)}`;
}

function earliestBusinessTouch(row = {}) {
  return [
    row.firstTouchAt,
    row.trialAtRaw,
    row.trialBookedAt,
    row.trialAttendedAt,
    row.courseFirstPurchaseAt,
    row.lastFormalLessonAt,
    row.detailRecentLessonDate,
    row.conversionAt
  ].map(text).find(Boolean) || '';
}

function extractRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function extractSummary(payload = {}) {
  if (Array.isArray(payload)) return {};
  return payload?.summary || payload?.standardLifecycleMetrics?.teachingSummary || payload?.teachingStudentViews?.summary || {};
}

function extractTeachingSummary(payload = {}) {
  return payload?.standardLifecycleMetrics?.teachingSummary || {};
}

function extractTeachingViewSummary(payload = {}) {
  return payload?.teachingStudentViews?.summary || {};
}

function assertCountMatch(issues, label, actual, expected) {
  if (Number(actual) !== Number(expected)) {
    issues.push(`${label}不一致：${actual} != ${expected}`);
  }
}

function buildLeadPoolHealthReport({
  leadRows = [],
  leadSummary = {},
  customerCenterPayload = {},
  lifecyclePayload = {}
} = {}) {
  const issues = [];
  const rows = Array.isArray(leadRows) ? leadRows : [];
  const customerTeachingSummary = extractTeachingSummary(customerCenterPayload);
  const customerViewSummary = extractTeachingViewSummary(customerCenterPayload);
  const lifecycleTeachingSummary = extractTeachingSummary(lifecyclePayload);
  const lifecycleViewSummary = extractTeachingViewSummary(lifecyclePayload);

  if (!rows.length) {
    issues.push('线索池没有拿到任何行');
  }

  assertCountMatch(issues, '线索池总数', Number(leadSummary.total ?? rows.length), rows.length);

  const leadHistorical = Number(leadSummary.historicalStudents || 0);
  const leadActive = Number(leadSummary.activeStudents || 0);
  const leadTrial = Number(leadSummary.trialAttended || 0);
  const leadTrialToFormal = Number(leadSummary.trialAttendedToFormalPurchase || 0);

  const customerHistorical = Number(customerTeachingSummary.historicalStudentCount || 0);
  const customerActive = Number(customerTeachingSummary.activeStudentCount || 0);
  const customerTrial = Number(customerTeachingSummary.trialAttendedStudentCount || 0);
  const customerTrialToFormal = Number(customerTeachingSummary.trialAttendedToFormalPurchaseCount || 0);

  const customerViewHistorical = Number(customerViewSummary.historicalStudentCount || 0);
  const customerViewActive = Number(customerViewSummary.activeStudentCount || 0);
  const customerViewTrial = Number(customerViewSummary.trialAttendedStudentCount || 0);
  const customerViewTrialToFormal = Number(customerViewSummary.trialAttendedToFormalPurchaseCount || 0);

  const lifecycleHistorical = Number(lifecycleTeachingSummary.historicalStudentCount || 0);
  const lifecycleActive = Number(lifecycleTeachingSummary.activeStudentCount || 0);
  const lifecycleTrial = Number(lifecycleTeachingSummary.trialAttendedStudentCount || 0);
  const lifecycleTrialToFormal = Number(lifecycleTeachingSummary.trialAttendedToFormalPurchaseCount || 0);

  assertCountMatch(issues, '历史学员数', leadHistorical, customerHistorical);
  assertCountMatch(issues, '历史学员数', customerHistorical, customerViewHistorical);
  assertCountMatch(issues, '历史学员数', customerHistorical, lifecycleHistorical);
  assertCountMatch(issues, '在期学员数', leadActive, customerActive);
  assertCountMatch(issues, '在期学员数', customerActive, customerViewActive);
  assertCountMatch(issues, '在期学员数', customerActive, lifecycleActive);
  assertCountMatch(issues, '体验课人数', leadTrial, customerTrial);
  assertCountMatch(issues, '体验课人数', customerTrial, customerViewTrial);
  assertCountMatch(issues, '体验课人数', customerTrial, lifecycleTrial);
  assertCountMatch(issues, '体验后买正式课', leadTrialToFormal, customerTrialToFormal);
  assertCountMatch(issues, '体验后买正式课', customerTrialToFormal, customerViewTrialToFormal);
  assertCountMatch(issues, '体验后买正式课', customerTrialToFormal, lifecycleTrialToFormal);

  const duplicateGroups = [];
  const grouped = new Map();
  rows.forEach(row => {
    const key = leadCanonicalKey(row);
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  });
  grouped.forEach((group, key) => {
    if (group.length <= 1) return;
    duplicateGroups.push({
      key,
      count: group.length,
      names: [...new Set(group.map(leadDisplayName).filter(Boolean))],
      ids: group.map(row => text(row.id || row.leadId)).filter(Boolean)
    });
    issues.push(`重复线索：${key} × ${group.length}`);
  });

  const dirtyRows = [];
  const timeIssues = [];
  rows.forEach(row => {
    const name = leadDisplayName(row);
    if (name && shouldCleanCompositeName(name)) {
      dirtyRows.push({
        id: text(row.id || row.leadId),
        name,
        reason: '脏名字'
      });
      issues.push(`脏名字：${text(row.id || row.leadId)} / ${name}`);
    }
    const leadDate = text(row.leadDate);
    const firstTouchAt = earliestBusinessTouch(row);
    if (!leadDate) {
      timeIssues.push({
        id: text(row.id || row.leadId),
        leadDate,
        firstTouchAt,
        createdAt: text(row.createdAt || '')
      });
      issues.push(`线索时间为空：${text(row.id || row.leadId)}`);
      return;
    }
    if (firstTouchAt && leadDate !== firstTouchAt) {
      timeIssues.push({
        id: text(row.id || row.leadId),
        leadDate,
        firstTouchAt,
        createdAt: text(row.createdAt || '')
      });
      issues.push(`线索时间不对：${text(row.id || row.leadId)} ${leadDate} != ${firstTouchAt}`);
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    duplicateGroups,
    dirtyRows,
    timeIssues,
    counts: {
      leadRows: rows.length,
      leadSummaryTotal: Number(leadSummary.total || rows.length),
      leadHistorical,
      leadActive,
      leadTrial,
      leadTrialToFormal,
      customerHistorical,
      customerActive,
      customerTrial,
      customerTrialToFormal,
      lifecycleHistorical,
      lifecycleActive,
      lifecycleTrial,
      lifecycleTrialToFormal
    }
  };
}

async function resolveAuthToken(config, fetchImpl) {
  if (config.token) return config.token;
  if (!config.username || !config.password) return '';
  const login = await requestJson({
    baseUrl: config.baseUrl,
    pathname: '/server/auth/login',
    method: 'POST',
    body: { username: config.username, password: config.password },
    fetchImpl,
    timeoutMs: config.timeoutMs
  });
  if (!login.ok) throw new Error(`登录接口失败：HTTP ${login.status}`);
  const token = extractToken(login.json);
  if (!token) throw new Error('登录接口未返回 token');
  return token;
}

async function runLeadPoolHealthCheck({
  baseUrl,
  expectedInstance = '',
  token = '',
  username = '',
  password = '',
  fetchImpl = fetch,
  timeoutMs = 15000
} = {}) {
  const config = { baseUrl, expectedInstance, token, username, password, timeoutMs };
  const checks = [];
  const errors = [];

  const diag = await requestJson({ baseUrl, pathname: '/api/diag', fetchImpl, timeoutMs });
  checks.push({ pathname: '/api/diag', status: diag.status });
  if (!diag.ok) errors.push(`/api/diag HTTP ${diag.status}`);
  const actualInstance = diag.json?.TS_INSTANCE || diag.json?.tsInstance || diag.json?.instance || '';
  if (expectedInstance && actualInstance && actualInstance !== expectedInstance) {
    errors.push(`/api/diag 实例不匹配：expected=${expectedInstance}, actual=${actualInstance}`);
  }

  const authToken = await resolveAuthToken(config, fetchImpl);
  if (!authToken) throw new Error('缺少管理员 token 或账号密码，无法做线上核验');

  const [leadRowsResponse, leadSummaryResponse, customerCenterResponse, lifecycleResponse] = await Promise.all([
    requestJson({ baseUrl, pathname: '/leads', token: authToken, fetchImpl, timeoutMs }),
    requestJson({ baseUrl, pathname: '/leads?paged=1&page=1&pageSize=1', token: authToken, fetchImpl, timeoutMs }),
    requestJson({ baseUrl, pathname: '/page-data/customer-center-list', token: authToken, fetchImpl, timeoutMs }),
    requestJson({ baseUrl, pathname: '/page-data/lifecycle-metrics', token: authToken, fetchImpl, timeoutMs })
  ]);

  checks.push(
    { pathname: '/leads', status: leadRowsResponse.status },
    { pathname: '/leads?paged=1&page=1&pageSize=1', status: leadSummaryResponse.status },
    { pathname: '/page-data/customer-center-list', status: customerCenterResponse.status },
    { pathname: '/page-data/lifecycle-metrics', status: lifecycleResponse.status }
  );

  if (!leadRowsResponse.ok) errors.push(`/leads HTTP ${leadRowsResponse.status}`);
  if (!leadSummaryResponse.ok) errors.push(`/leads?paged=1&page=1&pageSize=1 HTTP ${leadSummaryResponse.status}`);
  if (!customerCenterResponse.ok) errors.push(`/page-data/customer-center-list HTTP ${customerCenterResponse.status}`);
  if (!lifecycleResponse.ok) errors.push(`/page-data/lifecycle-metrics HTTP ${lifecycleResponse.status}`);

  const report = buildLeadPoolHealthReport({
    leadRows: extractRows(leadRowsResponse.json),
    leadSummary: extractSummary(leadSummaryResponse.json),
    customerCenterPayload: customerCenterResponse.json,
    lifecyclePayload: lifecycleResponse.json
  });

  return {
    ok: errors.length === 0 && report.ok,
    errors: [...errors, ...report.issues],
    checks,
    report,
    endpointStatuses: {
      leads: leadRowsResponse.status,
      leadSummary: leadSummaryResponse.status,
      customerCenter: customerCenterResponse.status,
      lifecycleMetrics: lifecycleResponse.status
    }
  };
}

async function main() {
  const config = resolveSmokeConfig(process.env, process.argv.slice(2));
  if (!config.ok) {
    console.error(config.errors.join('\n'));
    process.exit(1);
  }
  if (!config.enabled) {
    console.log('lead pool health check not configured');
    console.log(JSON.stringify({ ok: true, enabled: false, warnings: config.errors }, null, 2));
    return;
  }
  const result = await runLeadPoolHealthCheck(config);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exit(1);
  }
  console.log('lead pool health check passed');
}

if (require.main === module) {
  main().catch(error => {
    console.error(`lead pool health check failed: ${error.stack || error.message || error}`);
    process.exit(1);
  });
}

module.exports = {
  buildLeadPoolHealthReport,
  runLeadPoolHealthCheck,
  cleanEdgePunctuation,
  normalizeIdentity,
  canonicalDirtyName,
  isObviousNoiseName,
  shouldCleanCompositeName,
  leadCanonicalKey,
  earliestBusinessTouch
};
