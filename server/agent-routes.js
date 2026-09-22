const crypto = require('crypto');
const { normalizePermissionProfile, userCanAccessCampus, userHasFeaturePermission } = require('./permissions');
const { normalizeCampusValue, displayCampusName } = require('../public/assets/scripts/core/campus.js');

const TIME_ZONE = 'Asia/Shanghai';
const AGENT_ERRORS = {
  AUTH_REQUIRED: { code: 'AGENT_AUTH_REQUIRED', message: '请先登录' },
  PERMISSION_DENIED: { code: 'AGENT_PERMISSION_DENIED', message: '没有该 Agent 功能权限' },
  CAMPUS_FORBIDDEN: { code: 'AGENT_CAMPUS_FORBIDDEN', message: '没有该校区访问权限' },
  INVALID_PARAMETER: { code: 'AGENT_INVALID_PARAMETER', message: '请求参数错误' },
  SYSTEM_ERROR: { code: 'AGENT_SYSTEM_ERROR', message: 'Agent 服务暂时不可用' }
};
const SCHEDULE_WRITE_ERRORS = {
  PERMISSION_DENIED: { code: 'PERMISSION_DENIED', message: '没有排课写入权限' },
  CAMPUS_FORBIDDEN: { code: 'CAMPUS_FORBIDDEN', message: '没有该校区排课权限' },
  STUDENT_NOT_FOUND: { code: 'STUDENT_NOT_FOUND', message: '学员不存在' },
  STUDENT_AMBIGUOUS: { code: 'STUDENT_AMBIGUOUS', message: '存在同名学员，请先确认具体学员' },
  COACH_NOT_FOUND: { code: 'COACH_NOT_FOUND', message: '教练不存在' },
  VENUE_NOT_FOUND: { code: 'VENUE_NOT_FOUND', message: '场地不能为空' },
  SCHEDULE_CONFLICT_COACH: { code: 'SCHEDULE_CONFLICT_COACH', message: '教练时间冲突' },
  SCHEDULE_CONFLICT_VENUE: { code: 'SCHEDULE_CONFLICT_VENUE', message: '场地时间冲突' },
  SCHEDULE_CONFLICT_STUDENT: { code: 'SCHEDULE_CONFLICT_STUDENT', message: '学员时间冲突' },
  ENTITLEMENT_NOT_FOUND: { code: 'ENTITLEMENT_NOT_FOUND', message: '课包不存在或不可用' },
  ENTITLEMENT_INSUFFICIENT: { code: 'ENTITLEMENT_INSUFFICIENT', message: '课包余额不足' },
  ENTITLEMENT_NOT_MATCHED: { code: 'ENTITLEMENT_NOT_MATCHED', message: '课包与学员、课程或校区不匹配' },
  PREVIEW_EXPIRED: { code: 'PREVIEW_EXPIRED', message: '排课预览已过期，请重新预览' },
  PREVIEW_STALE: { code: 'PREVIEW_STALE', message: '排课预览已失效，请重新预览' },
  IDEMPOTENCY_KEY_REUSED: { code: 'IDEMPOTENCY_KEY_REUSED', message: '幂等键已用于其他请求' },
  IDEMPOTENCY_IN_PROGRESS: { code: 'IDEMPOTENCY_IN_PROGRESS', message: '相同操作正在处理中' },
  OPERATION_ID_REUSED: { code: 'OPERATION_ID_REUSED', message: 'operationId 已用于其他请求' },
  OPERATION_NOT_FOUND: { code: 'OPERATION_NOT_FOUND', message: '未找到该操作记录' },
  AUDIT_PENDING: { code: 'AUDIT_PENDING', message: '排课业务已完成，但审计记录待补偿，请勿重复提交' },
  AUDIT_UNAVAILABLE: { code: 'AUDIT_UNAVAILABLE', message: '审计存储不可用，排课尚未执行，可安全重试' },
  INVALID_PARAMETER: { code: 'AGENT_INVALID_PARAMETER', message: '排课参数错误' },
  SYSTEM_ERROR: { code: 'AGENT_SYSTEM_ERROR', message: '排课服务暂时不可用' }
};
const PREVIEW_TTL_MS = 10 * 60 * 1000;

const LEAD_COLUMNS = [
  'name', 'displayName', 'phone', 'campus', 'source', 'owner', 'status', 'systemStatus',
  'leadStage', 'createdAt', 'updatedAt', 'mergedIntoLeadId', 'voidedAt', 'voidReason'
];

function text(value) {
  return String(value == null ? '' : value).trim();
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function requestIdFrom(req) {
  const incoming = text(req?.headers?.['x-request-id']);
  return incoming.slice(0, 128) || crypto.randomUUID();
}

function phoneMasked(value) {
  const phone = text(value).replace(/\s+/g, '');
  if (!phone) return '';
  if (/^1[3-9]\d{9}$/.test(phone)) return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  if (phone.length <= 4) return '*'.repeat(phone.length);
  return `${phone.slice(0, 2)}****${phone.slice(-2)}`;
}

function dateKeyInShanghai(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function parseDate(value) {
  if (value instanceof Date) return value;
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00+08:00`);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    return new Date(`${normalized}${normalized.length === 16 ? ':00' : ''}+08:00`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dateKeyInShanghai(`${value}T00:00:00+08:00`) === value;
}

function formatShanghai(value) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function rowCampus(row = {}) {
  return normalizeCampusValue(row.campus || row.campusId || row.campusCode || row.campusName || '');
}

function rowVisibleForUser(row, user) {
  const profile = normalizePermissionProfile(user);
  if (profile.role === 'admin' || profile.dataScope === 'all') return true;
  if (profile.role !== 'operator' || profile.dataScope !== 'campus') return false;
  const campus = rowCampus(row);
  return !!campus && profile.campusIds.includes(campus);
}

function requestedCampus(query) {
  return normalizeCampusValue(query?.get('campusId') || query?.get('campus') || '');
}

function leadIsValid(row = {}) {
  const status = text(row.status || row.systemStatus || 'active').toLowerCase();
  return ![
    'merged', 'voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled',
    '已合并', '已作废', '已删除', '已取消'
  ].includes(status) && !text(row.mergedIntoLeadId) && !text(row.voidedAt);
}

function normalizeQuery(query) {
  if (query && typeof query.get === 'function') return query;
  return new URLSearchParams(query || '');
}

function makeError(error, requestId, details) {
  return {
    ok: false,
    data: null,
    error: { code: error.code, message: error.message, ...(details ? { details } : {}) },
    requestId
  };
}

function makeSuccess(data, requestId) {
  return { ok: true, data, error: null, requestId };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value == null ? null : value);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function scheduleWriteError(error) {
  const message = String(error?.message || error || '');
  if (error?.code && Object.values(SCHEDULE_WRITE_ERRORS).some(item => item.code === error.code)) return error.code;
  if (/无权限/.test(message)) return 'PERMISSION_DENIED';
  if (/没有该校区|校区.*权限|校区.*不匹配/.test(message)) return 'CAMPUS_FORBIDDEN';
  if (/教练.*不存在|不存在.*教练/.test(message)) return 'COACH_NOT_FOUND';
  if (/场地.*(不能为空|不存在)/.test(message)) return message.includes('不存在') ? 'VENUE_NOT_FOUND' : 'VENUE_NOT_FOUND';
  if (/教练.*(已有课程|时间冲突)/.test(message)) return 'SCHEDULE_CONFLICT_COACH';
  if (/场地.*(已被占用|冲突)/.test(message)) return 'SCHEDULE_CONFLICT_VENUE';
  if (/学员.*(已有课程|冲突)/.test(message)) return 'SCHEDULE_CONFLICT_STUDENT';
  if (/课包.*(不存在|余额不存在|不可用)/.test(message)) return 'ENTITLEMENT_NOT_FOUND';
  if (/剩余课时不足|余额不足/.test(message)) return 'ENTITLEMENT_INSUFFICIENT';
  if (/课包.*(不匹配|所属学员|课程类型|可用校区|时间段)/.test(message)) return 'ENTITLEMENT_NOT_MATCHED';
  return 'AGENT_SYSTEM_ERROR';
}

function scheduleWriteErrorStatus(code) {
  if (code === 'OPERATION_NOT_FOUND') return 404;
  if (code === 'AUDIT_PENDING' || code === 'AUDIT_UNAVAILABLE') return 503;
  return ['PERMISSION_DENIED', 'CAMPUS_FORBIDDEN', 'STUDENT_NOT_FOUND', 'STUDENT_AMBIGUOUS', 'COACH_NOT_FOUND', 'VENUE_NOT_FOUND',
    'SCHEDULE_CONFLICT_COACH', 'SCHEDULE_CONFLICT_VENUE', 'SCHEDULE_CONFLICT_STUDENT', 'ENTITLEMENT_NOT_FOUND', 'ENTITLEMENT_INSUFFICIENT',
    'ENTITLEMENT_NOT_MATCHED', 'PREVIEW_EXPIRED', 'PREVIEW_STALE', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS', 'OPERATION_ID_REUSED'].includes(code) ? 409 : 400;
}

function createAgentRoutes(deps = {}) {
  const {
    sendJson,
    getCachedScan,
    getFastStudentsRead,
    getScheduleListRows,
    listCampusesWithDefaults,
    get,
    put,
    putIfAbsent,
    mkTable,
    createSchedule,
    validateScheduleSave,
    resolveScheduleEntitlementDeltas,
    assertScheduleEntitlementRequired = () => {},
    assertScheduleEntitlementDeltasRequired = () => {},
    assertScheduleEntitlementCapacity = async () => null,
    assertScheduleFieldFeeInput = () => {},
    buildCoachRefs = ({ coaches = [] } = {}) => coaches.map(row => ({ id: text(row.id), name: text(row.name) })),
    uuidv4 = () => crypto.randomUUID(),
    tables = {},
    now = () => new Date()
  } = deps;

  const table = name => tables[name] || name;

  function sendError(res, error, requestId, status = 500, details) {
    return sendJson(res, makeError(error, requestId, details), status);
  }

  function assertBaseAccess(user, permission, requestId, res) {
    const profile = normalizePermissionProfile(user || {});
    if (!user || !profile.role) {
      sendError(res, AGENT_ERRORS.AUTH_REQUIRED, requestId, 401);
      return null;
    }
    if (!['admin', 'operator'].includes(profile.role)) {
      sendError(res, AGENT_ERRORS.PERMISSION_DENIED, requestId, 403);
      return null;
    }
    if (profile.role !== 'admin' && !userHasFeaturePermission(user, permission)) {
      sendError(res, AGENT_ERRORS.PERMISSION_DENIED, requestId, 403);
      return null;
    }
    return profile;
  }

  function assertRequestedCampus(user, query, requestId, res) {
    const campus = requestedCampus(query);
    if (campus && !userCanAccessCampus(user, campus)) {
      sendError(res, AGENT_ERRORS.CAMPUS_FORBIDDEN, requestId, 403);
      return null;
    }
    return campus;
  }

  function scopedRows(rows, user, campus) {
    return (rows || []).filter(row => (!campus || rowCampus(row) === campus) && rowVisibleForUser(row, user));
  }

  function leadView(row) {
    return {
      id: text(row.id),
      name: text(row.displayName || row.name || row.wechatName),
      phone: phoneMasked(row.phone),
      campusId: rowCampus(row),
      campusName: displayCampusName(rowCampus(row)),
      source: text(row.source),
      owner: text(row.owner),
      status: text(row.systemStatus || row.leadStage || row.status),
      createdAt: formatShanghai(row.createdAt)
    };
  }

  function studentView(row) {
    return {
      id: text(row.id),
      name: text(row.name || row.displayName),
      phone: phoneMasked(row.phone),
      campusId: rowCampus(row),
      campusName: displayCampusName(rowCampus(row)),
      primaryCoach: text(row.primaryCoach || row.primaryCoachName),
      activePackageCount: Number(row.activePackageCount ?? row.packageCount ?? 0) || 0
    };
  }

  function scheduleView(row, studentMap) {
    const studentIds = parseArray(row.studentIds).map(text).filter(Boolean);
    if (text(row.studentId) && !studentIds.includes(text(row.studentId))) studentIds.push(text(row.studentId));
    return {
      id: text(row.id),
      startTime: formatShanghai(row.startTime),
      endTime: formatShanghai(row.endTime),
      campusId: rowCampus(row),
      campusName: displayCampusName(rowCampus(row)),
      venue: text(row.venue || row.venueName),
      venueId: text(row.venueId),
      coachId: text(row.coachId),
      coachName: text(row.coach || row.coachName),
      students: studentIds.map(id => {
        const student = studentMap.get(id) || {};
        return { id, name: text(student.name || student.displayName || row.studentName) };
      }),
      courseType: text(row.courseType || row.type),
      status: text(row.status || row.confirmStatus)
    };
  }

  function referenceView(row, kind) {
    const id = text(row.id || row.code);
    const name = text(row.name || row.displayName || row.venue || row.venueName);
    const campusId = kind === 'campus' ? normalizeCampusValue(row.code || row.id || row.name || '') : rowCampus(row);
    return {
      id,
      name,
      campusId,
      campusName: displayCampusName(campusId),
      ...(kind === 'court' ? { venueType: text(row.venueSpaceType || row.type) } : {})
    };
  }

  function writePermission(user, requestId, res) {
    const profile = normalizePermissionProfile(user || {});
    if (!user || !profile.role) {
      sendError(res, AGENT_ERRORS.AUTH_REQUIRED, requestId, 401);
      return null;
    }
    if (!['admin', 'operator'].includes(profile.role)) {
      writeError(res, 'PERMISSION_DENIED', requestId);
      return null;
    }
    if (profile.role !== 'admin' && !userHasFeaturePermission(user, 'agent_schedule_write')) {
      writeError(res, 'PERMISSION_DENIED', requestId);
      return null;
    }
    return profile;
  }

  function errorByCode(code) {
    return Object.values(SCHEDULE_WRITE_ERRORS).find(item => item.code === code) || SCHEDULE_WRITE_ERRORS.SYSTEM_ERROR;
  }

  function writeError(res, code, requestId, details) {
    const error = errorByCode(code);
    return sendJson(res, makeError(error, requestId, details), code === 'PERMISSION_DENIED' || code === 'CAMPUS_FORBIDDEN' ? 403 : scheduleWriteErrorStatus(code));
  }

  function idempotencyHeader(req) {
    return text(req?.headers?.['idempotency-key'] || req?.headers?.['Idempotency-Key']);
  }

  function previewHashPayload(record) {
    return {
      request: record.request,
      operatorId: record.operatorId,
      campusIds: record.campusIds,
      expiresAt: record.expiresAt,
      balanceBefore: record.balanceBefore,
      balanceAfter: record.balanceAfter
    };
  }

  function previewHashFor(record) {
    return hashValue(previewHashPayload(record));
  }

  function rejectUnsupportedScheduleInput(body) {
    const settlementType = text(body.settlementType || body.paymentType || 'package');
    if (settlementType !== 'package') return 'AGENT_INVALID_PARAMETER';
    if (body.requiresFieldFee === true || Number(body.fieldFeeAmount || 0) > 0) return 'AGENT_INVALID_PARAMETER';
    const settlementRows = parseArray(body.studentSettlementRows);
    if (settlementRows.some(row => text(row.settlementType || 'package') !== 'package' || Number(row.fieldFeeAmount || 0) > 0 || text(row.fieldFeeMode) !== '' && text(row.fieldFeeMode) !== 'none')) return 'AGENT_INVALID_PARAMETER';
    if (body.repeatRule || body.recurrence || body.recurring || body.repeat || body.cycle) return 'AGENT_INVALID_PARAMETER';
    if (text(body.courseType || body.type) === '小班课') return 'AGENT_INVALID_PARAMETER';
    if (parseArray(body.studentIds).length > 1) return 'AGENT_INVALID_PARAMETER';
    if (Number(body.lessonCount || 1) !== 1) return 'AGENT_INVALID_PARAMETER';
    if (text(body.status) === '已取消' || body.id) return 'AGENT_INVALID_PARAMETER';
    return '';
  }

  async function resolveSchedulePreviewRequest(body, user, previewId) {
    const unsupported = rejectUnsupportedScheduleInput(body);
    if (unsupported) throw Object.assign(new Error('第一版仅支持已有课包的普通单节排课'), { code: unsupported });
    const campus = normalizeCampusValue(body.campusId || body.campus);
    if (!campus || !userCanAccessCampus(user, campus)) throw Object.assign(new Error('没有该校区排课权限'), { code: 'CAMPUS_FORBIDDEN' });
    const students = await getFastStudentsRead({});
    const studentId = text(body.studentId || parseArray(body.studentIds)[0]);
    const studentName = text(body.studentName || body.name);
    let student;
    if (studentId) student = (students || []).find(row => text(row.id) === studentId);
    else {
      const candidates = (students || []).filter(row => text(row.status).toLowerCase() !== 'inactive' && text(row.name || row.displayName) === studentName && rowVisibleForUser(row, user));
      if (candidates.length > 1) throw Object.assign(new Error('存在同名学员，请先确认具体学员'), { code: 'STUDENT_AMBIGUOUS' });
      student = candidates[0];
    }
    if (!student) throw Object.assign(new Error('学员不存在'), { code: 'STUDENT_NOT_FOUND' });
    if (!rowVisibleForUser(student, user) || (rowCampus(student) && rowCampus(student) !== campus)) throw Object.assign(new Error('没有该校区排课权限'), { code: 'CAMPUS_FORBIDDEN' });

    const coaches = await getCachedScan(table('coaches'));
    const users = await getCachedScan(table('users')).catch(() => []);
    const coachRefs = buildCoachRefs({ coaches, users });
    const inputCoachId = text(body.coachId);
    const inputCoachName = text(body.coach || body.coachName);
    const coach = coachRefs.find(ref => (inputCoachId && ref.id === inputCoachId) || (!inputCoachId && inputCoachName && ref.name === inputCoachName));
    if (!coach || (inputCoachId && inputCoachName && coach.name !== inputCoachName)) throw Object.assign(new Error('教练不存在'), { code: 'COACH_NOT_FOUND' });
    const coachSource = [...(coaches || []), ...(users || [])].find(row =>
      (inputCoachId && text(row.id || row.coachId || row.username) === inputCoachId) ||
      (!inputCoachId && inputCoachName && text(row.name || row.coachName) === inputCoachName)
    );
    const coachCampus = rowCampus(coachSource || {});
    if (coachCampus && coachCampus !== campus) throw Object.assign(new Error('没有该校区排课权限'), { code: 'CAMPUS_FORBIDDEN' });

    const venue = text(body.venue || body.venueName);
    if (!venue) throw Object.assign(new Error('场地不能为空'), { code: 'VENUE_NOT_FOUND' });
    const entitlementId = text(body.entitlementId || parseArray(body.entitlementIds)[0]);
    if (!entitlementId) throw Object.assign(new Error('课包不存在或不可用'), { code: 'ENTITLEMENT_NOT_FOUND' });
    const entitlement = await get(table('entitlements'), entitlementId).catch(() => null);
    if (!entitlement) throw Object.assign(new Error('课包不存在或不可用'), { code: 'ENTITLEMENT_NOT_FOUND' });

    const candidate = {
      campus,
      studentId: text(student.id),
      studentIds: [text(student.id)],
      studentName: text(student.name || student.displayName),
      coachId: coach.id,
      coach: coach.name,
      venue,
      venueId: text(body.venueId),
      startTime: text(body.startTime),
      endTime: text(body.endTime),
      courseType: text(body.courseType || body.type || '私教'),
      settlementType: 'package',
      paymentType: 'package',
      lessonCount: 1,
      entitlementId,
      entitlementIds: [entitlementId],
      studentSettlementRows: [{ studentId: text(student.id), settlementType: 'package', entitlementId }],
      expectedStudentIds: [text(student.id)],
      absentStudentIds: [],
      requiresFieldFee: false,
      fieldFeeAmount: 0,
      coachLateFree: false,
      status: '已排课',
      scheduleSource: 'Agent'
    };
    candidate.id = previewId;
    if (typeof validateScheduleSave !== 'function') throw new Error('排课校验服务未配置');
    await validateScheduleSave(candidate, null);
    assertScheduleEntitlementRequired(candidate);
    assertScheduleFieldFeeInput(candidate);
    const availableEntitlements = await getCachedScan(table('entitlements'));
    const deltas = resolveScheduleEntitlementDeltas(candidate, availableEntitlements);
    assertScheduleEntitlementDeltasRequired(candidate, deltas);
    await assertScheduleEntitlementCapacity(candidate, null);
    const balanceBefore = Number(entitlement.remainingLessons || 0);
    if (balanceBefore < 1) throw Object.assign(new Error('课包剩余课时不足'), { code: 'ENTITLEMENT_INSUFFICIENT' });
    return { candidate, student, coach, entitlement, balanceBefore, balanceAfter: balanceBefore - 1 };
  }

  async function writePreviewAudit(record) {
    if (typeof put !== 'function') return;
    await put(table('operations'), `preview:${record.id}`, {
      operationId: '', source: 'Agent', action: 'schedule_preview', status: 'preview_created',
      operatorId: record.operatorId, operatorName: record.operatorName, previewId: record.id,
      previewSnapshot: record.request, createdAt: record.createdAt, updatedAt: record.createdAt
    });
  }

  async function saveOperation(operation) {
    if (typeof put === 'function') await put(table('operations'), operation.operationId, operation);
  }

  async function saveIdempotency(id, record) {
    if (typeof put === 'function') await put(table('operations'), id, record);
  }

  function operationStatus(record = {}) {
    if (record.status === 'processing') return 'pending';
    return text(record.status) || 'pending';
  }

  function operationScheduleId(record = {}) {
    return text(record.scheduleId || record.finalResult?.schedule?.id || record.result?.schedule?.id);
  }

  function operationCampusIds(record = {}) {
    const explicit = parseArray(record.campusIds).map(normalizeCampusValue).filter(Boolean);
    if (explicit.length) return explicit;
    const snapshotCampus = rowCampus(record.previewSnapshot || record.finalResult?.schedule || record.result?.schedule || {});
    return snapshotCampus ? [snapshotCampus] : [];
  }

  function operationVisibleForUser(record, user) {
    const profile = normalizePermissionProfile(user || {});
    if (profile.role === 'admin' || profile.dataScope === 'all') return true;
    if (profile.role !== 'operator' || profile.dataScope !== 'campus') return false;
    const campuses = operationCampusIds(record);
    if (campuses.length) return campuses.some(campus => profile.campusIds.includes(campus));
    return text(record.operatorId) === text(user?.id || user?.username);
  }

  function operationView(record = {}) {
    const status = operationStatus(record);
    const scheduleId = operationScheduleId(record);
    return {
      operationId: text(record.operationId),
      status,
      businessStatus: text(record.businessStatus || (status === 'succeeded_audit_pending' ? 'succeeded' : status)),
      auditStatus: text(record.auditStatus || (status === 'succeeded_audit_pending' ? 'pending' : status === 'succeeded' ? 'complete' : '')),
      operator: { id: text(record.operatorId), name: text(record.operatorName) },
      operationType: text(record.action || 'schedule_confirm'),
      source: text(record.source || 'Agent'),
      createdAt: text(record.createdAt),
      updatedAt: text(record.updatedAt),
      scheduleId: scheduleId || null,
      error: record.errorCode ? { code: text(record.errorCode), message: text(record.errorMessage) } : null,
      canRetry: typeof record.canRetry === 'boolean' ? record.canRetry : status === 'failed'
    };
  }

  function auditPendingResponse(requestId, data, details) {
    const error = errorByCode('AUDIT_PENDING');
    return {
      ok: false,
      data: { ...(data || {}), status: 'succeeded_audit_pending', businessStatus: 'succeeded', auditStatus: 'pending', canRetry: false },
      error: { code: error.code, message: error.message, ...(details ? { details } : {}) },
      requestId
    };
  }

  return async function handleAgentRoutes({ path, method, body, user, res, req, query }) {
    if (!path.startsWith('/agent/v1/')) return false;
    const requestId = requestIdFrom(req);
    const params = normalizeQuery(query);
    try {
      if (path === '/agent/v1/schedules/preview' && method === 'POST') {
        const profile = writePermission(user, requestId, res);
        if (!profile) return true;
        try {
          const previewId = uuidv4();
          const resolved = await resolveSchedulePreviewRequest(body || {}, user, previewId);
          const createdAt = new Date(now()).toISOString();
          const expiresAt = new Date(new Date(createdAt).getTime() + PREVIEW_TTL_MS).toISOString();
          const record = {
            id: previewId,
            request: resolved.candidate,
            operatorId: text(user.id || user.username),
            operatorName: text(user.name),
            campusIds: profile.campusIds,
            createdAt,
            expiresAt,
            balanceBefore: resolved.balanceBefore,
            balanceAfter: resolved.balanceAfter,
            status: 'active'
          };
          record.previewHash = previewHashFor(record);
          await put(table('previews'), previewId, record);
          await writePreviewAudit(record);
          return sendJson(res, makeSuccess({
            previewId,
            previewHash: record.previewHash,
            expiresAt,
            operator: { id: record.operatorId, name: record.operatorName },
            permission: { dataScope: profile.dataScope, campusIds: profile.campusIds, campusId: resolved.candidate.campus, allowed: true },
            student: { id: resolved.student.id, name: resolved.candidate.studentName },
            coach: { id: resolved.coach.id, name: resolved.coach.name },
            campus: { id: resolved.candidate.campus, name: displayCampusName(resolved.candidate.campus) },
            venue: { id: resolved.candidate.venueId, name: resolved.candidate.venue },
            time: { startTime: formatShanghai(resolved.candidate.startTime), endTime: formatShanghai(resolved.candidate.endTime), timeZone: TIME_ZONE },
            conflictChecks: { coach: { ok: true }, venue: { ok: true }, student: { ok: true } },
            balanceBefore: resolved.balanceBefore,
            balanceAfter: resolved.balanceAfter,
            entitlement: { id: resolved.entitlement.id, name: text(resolved.entitlement.packageName), balanceBefore: resolved.balanceBefore, balanceAfter: resolved.balanceAfter },
            affects: ['schedule', 'entitlement', 'entitlement_ledger', 'student_teaching_summary', 'schedule_conflict_index']
          }, requestId));
        } catch (error) {
          const code = error?.code || scheduleWriteError(error);
          return writeError(res, code, requestId);
        }
      }

      if (path === '/agent/v1/schedules/confirm' && method === 'POST') {
        const profile = writePermission(user, requestId, res);
        if (!profile) return true;
        const previewId = text(body?.previewId);
        const previewHash = text(body?.previewHash);
        const operationId = text(body?.operationId);
        const idempotencyKey = idempotencyHeader(req);
        const operatorId = text(user.id || user.username);
        if (!previewId || !previewHash || !operationId || body?.confirm !== true || !idempotencyKey) return writeError(res, 'AGENT_INVALID_PARAMETER', requestId);
        const requestHash = hashValue({ operatorId, previewId, previewHash, operationId, confirm: true, body: body || {} });
        const idempotencyId = `idempotency:${idempotencyKey}`;
        const operationTable = table('operations');
        const previewTable = table('previews');
        const existingOperation = typeof get === 'function' ? await get(operationTable, operationId).catch(() => null) : null;
        const existingOperationProcessing = existingOperation?.requestHash === requestHash && existingOperation.status === 'processing';
        if (existingOperation && existingOperation.requestHash && existingOperation.requestHash !== requestHash) return writeError(res, 'OPERATION_ID_REUSED', requestId);
        if (existingOperation && existingOperation.requestHash === requestHash) {
          if (existingOperation.status === 'succeeded') return sendJson(res, makeSuccess(existingOperation.result || operationView(existingOperation), requestId));
          if (existingOperation.status === 'succeeded_audit_pending') {
            return sendJson(res, existingOperation.response || auditPendingResponse(requestId, existingOperation.result, { operationId }), 503);
          }
          if (existingOperation.status === 'failed' && existingOperation.response) return sendJson(res, existingOperation.response, existingOperation.httpStatus || 400);
        }
        let idempotency = typeof get === 'function' ? await get(operationTable, idempotencyId).catch(() => null) : null;
        if (idempotency) {
          if (idempotency.requestHash !== requestHash) return writeError(res, 'IDEMPOTENCY_KEY_REUSED', requestId);
          if (idempotency.status === 'succeeded') return sendJson(res, makeSuccess(idempotency.result, requestId));
          if (idempotency.status === 'succeeded_audit_pending') return sendJson(res, idempotency.response || auditPendingResponse(requestId, idempotency.result, { operationId }), 503);
          if (idempotency.status === 'failed') return sendJson(res, idempotency.response, idempotency.httpStatus || 400);
          if (idempotency.status === 'processing' && typeof getScheduleListRows === 'function') {
            const recoveredSchedule = (await getScheduleListRows().catch(() => [])).find(row => text(row.operationId) === operationId);
            if (recoveredSchedule) {
              const recoveredData = { operationId, previewId, schedule: recoveredSchedule, entitlement: null, entitlementLedger: [] };
              const recoveredResponse = auditPendingResponse(requestId, recoveredData, { operationId, scheduleId: text(recoveredSchedule.id), message: '已从正式排课记录恢复业务成功状态' });
              try {
                await saveIdempotency(idempotencyId, { ...idempotency, status: 'succeeded_audit_pending', result: recoveredData, response: recoveredResponse, scheduleId: text(recoveredSchedule.id), updatedAt: new Date(now()).toISOString() });
              } catch (error) {
                // 只读恢复已经阻止重复创建，补偿失败不改变业务事实。
              }
              return sendJson(res, recoveredResponse, 503);
            }
          }
          return writeError(res, 'IDEMPOTENCY_IN_PROGRESS', requestId);
        }
        const pending = { id: idempotencyId, requestHash, operatorId, operationId, status: 'processing', createdAt: new Date(now()).toISOString() };
        const recoveredSchedule = typeof getScheduleListRows === 'function'
          ? (await getScheduleListRows().catch(() => [])).find(row => text(row.operationId) === operationId)
          : null;
        if (recoveredSchedule) {
          const recoveredData = {
            operationId,
            previewId,
            schedule: recoveredSchedule,
            entitlement: null,
            entitlementLedger: []
          };
          const recoveredResponse = auditPendingResponse(requestId, recoveredData, {
            operationId,
            scheduleId: text(recoveredSchedule.id),
            message: '已从正式排课记录恢复业务成功状态'
          });
          const recoveredRecord = {
            id: operationId,
            operationId,
            source: 'Agent',
            action: 'schedule_confirm',
            status: 'succeeded_audit_pending',
            businessStatus: 'succeeded',
            auditStatus: 'pending',
            canRetry: false,
            operatorId,
            operatorName: text(user.name),
            previewId,
            previewHash,
            requestHash,
            idempotencyKey,
            campusIds: [rowCampus(recoveredSchedule)].filter(Boolean),
            scheduleId: text(recoveredSchedule.id),
            result: recoveredData,
            response: recoveredResponse,
            createdAt: text(recoveredSchedule.createdAt) || new Date(now()).toISOString(),
            updatedAt: new Date(now()).toISOString()
          };
          try {
            await saveOperation(recoveredRecord);
          } catch (error) {
            // 只读恢复结果仍然可返回，后续由操作查询继续恢复。
          }
          try {
            await saveIdempotency(idempotencyId, { ...pending, status: 'succeeded_audit_pending', result: recoveredData, response: recoveredResponse, scheduleId: text(recoveredSchedule.id), updatedAt: new Date(now()).toISOString() });
          } catch (error) {
            // 不能因为补偿存储失败再次创建排课。
          }
          return sendJson(res, recoveredResponse, 503);
        }
        if (existingOperationProcessing) return writeError(res, 'IDEMPOTENCY_IN_PROGRESS', requestId);
        try {
          if (typeof putIfAbsent !== 'function') throw new Error('幂等存储服务未配置');
          await putIfAbsent(operationTable, idempotencyId, pending);
          idempotency = pending;
        } catch (error) {
          idempotency = typeof get === 'function' ? await get(operationTable, idempotencyId).catch(() => null) : null;
          if (!idempotency) throw error;
          if (idempotency.requestHash !== requestHash) return writeError(res, 'IDEMPOTENCY_KEY_REUSED', requestId);
          if (idempotency.status === 'succeeded') return sendJson(res, makeSuccess(idempotency.result, requestId));
          if (idempotency.status === 'succeeded_audit_pending') return sendJson(res, idempotency.response || auditPendingResponse(requestId, idempotency.result, { operationId }), 503);
          if (idempotency.status === 'failed') return sendJson(res, idempotency.response, idempotency.httpStatus || 400);
          return writeError(res, 'IDEMPOTENCY_IN_PROGRESS', requestId);
        }
        const auditBase = {
          id: operationId,
          operationId,
          source: 'Agent',
          action: 'schedule_confirm',
          operatorId,
          operatorName: text(user.name),
          previewId,
          previewHash,
          requestHash,
          idempotencyKey,
          campusIds: profile.campusIds,
          businessStatus: 'pending',
          auditStatus: 'pending',
          canRetry: false,
          status: 'processing',
          createdAt: new Date(now()).toISOString(),
          updatedAt: new Date(now()).toISOString()
        };
        let previewSnapshot = null;
        const finishFailure = async (code, details) => {
          const response = makeError(errorByCode(code), requestId, details);
          const httpStatus = code === 'PERMISSION_DENIED' || code === 'CAMPUS_FORBIDDEN' ? 403 : scheduleWriteErrorStatus(code);
          let persistenceError = null;
          try {
            await saveOperation({ ...auditBase, ...(previewSnapshot ? { previewSnapshot } : {}), status: 'failed', businessStatus: 'failed', auditStatus: 'complete', canRetry: true, errorCode: code, errorMessage: response.error.message, response, httpStatus, updatedAt: new Date(now()).toISOString() });
          } catch (error) {
            persistenceError = error;
          }
          try {
            await saveIdempotency(idempotencyId, { ...pending, status: 'failed', response, httpStatus, updatedAt: new Date(now()).toISOString() });
          } catch (error) {
            persistenceError = persistenceError || error;
          }
          if (persistenceError) {
            const unavailable = makeError(errorByCode('AUDIT_UNAVAILABLE'), requestId, { originalCode: code, message: String(persistenceError?.message || persistenceError) });
            return sendJson(res, unavailable, 503);
          }
          return sendJson(res, response, httpStatus);
        };
        try {
          try {
            await saveOperation(auditBase);
          } catch (error) {
            return finishFailure('AUDIT_UNAVAILABLE', { message: String(error?.message || error) });
          }
          const preview = typeof get === 'function' ? await get(previewTable, previewId).catch(() => null) : null;
          previewSnapshot = preview?.request || null;
          if (!preview || preview.operatorId !== text(user.id || user.username)) return finishFailure('PREVIEW_STALE');
          if (new Date(now()).getTime() > new Date(preview.expiresAt).getTime()) return finishFailure('PREVIEW_EXPIRED');
          if (preview.previewHash !== previewHash || previewHashFor(preview) !== preview.previewHash) return finishFailure('PREVIEW_STALE');
          const previewRequest = { ...(preview.request || {}) };
          delete previewRequest.id;
          const resolved = await resolveSchedulePreviewRequest(previewRequest, user, previewId);
          const writeBody = { ...resolved.candidate };
          delete writeBody.id;
          const result = await createSchedule(writeBody, user, { source: 'agent-confirm', agentWriteAllowed: true, operationId, idempotencyKey });
          const data = {
            operationId,
            previewId,
            schedule: result?.schedule || result,
            entitlement: result?.entitlement || null,
            entitlementLedger: result?.entitlementLedger || result?.ledger || []
          };
          const scheduleId = text(data.schedule?.id);
          const finalAudit = {
            ...auditBase,
            status: 'succeeded',
            businessStatus: 'succeeded',
            auditStatus: 'complete',
            canRetry: false,
            scheduleId,
            campusId: rowCampus(data.schedule || resolved.candidate),
            result: data,
            previewSnapshot: preview.request,
            finalResult: data,
            updatedAt: new Date(now()).toISOString()
          };
          let finalizationError = null;
          try {
            await saveOperation(finalAudit);
          } catch (error) {
            finalizationError = error;
          }
          try {
            await saveIdempotency(idempotencyId, { ...pending, status: 'succeeded', result: data, scheduleId, updatedAt: new Date(now()).toISOString() });
          } catch (error) {
            finalizationError = finalizationError || error;
          }
          try {
            await put(previewTable, previewId, { ...preview, status: 'confirmed', confirmedAt: new Date(now()).toISOString(), operationId });
          } catch (error) {
            finalizationError = finalizationError || error;
          }
          if (finalizationError) {
            const pendingResponse = auditPendingResponse(requestId, data, {
              operationId,
              scheduleId,
              message: String(finalizationError?.message || finalizationError)
            });
            const pendingAudit = {
              ...finalAudit,
              status: 'succeeded_audit_pending',
              auditStatus: 'pending',
              errorCode: 'AUDIT_PENDING',
              errorMessage: errorByCode('AUDIT_PENDING').message,
              response: pendingResponse,
              updatedAt: new Date(now()).toISOString()
            };
            try {
              await saveOperation(pendingAudit);
            } catch (error) {
              // 操作查询还可以从正式排课记录的 operationId 恢复业务成功状态。
            }
            try {
              await saveIdempotency(idempotencyId, { ...pending, status: 'succeeded_audit_pending', result: data, response: pendingResponse, scheduleId, updatedAt: new Date(now()).toISOString() });
            } catch (error) {
              // 不能把已创建的排课当成失败；后续通过 operationId 只读恢复。
            }
            return sendJson(res, pendingResponse, 503);
          }
          return sendJson(res, makeSuccess(data, requestId));
        } catch (error) {
          return finishFailure(error?.code || scheduleWriteError(error), { message: String(error?.message || error) });
        }
      }

      if (method !== 'GET') return sendError(res, AGENT_ERRORS.INVALID_PARAMETER, requestId, 400);

      const operationMatch = path.match(/^\/agent\/v1\/operations\/([^/]+)$/);
      if (operationMatch) {
        const profile = assertBaseAccess(user, 'agent_schedule_read', requestId, res);
        if (!profile) return true;
        const operationId = decodeURIComponent(operationMatch[1]);
        if (!operationId) return writeError(res, 'OPERATION_NOT_FOUND', requestId);
        const operation = typeof get === 'function' ? await get(table('operations'), operationId).catch(() => null) : null;
        if (operation) {
          if (operation.status === 'processing' && typeof getScheduleListRows === 'function') {
            const schedules = await getScheduleListRows().catch(() => []);
            const recoveredSchedule = (schedules || []).find(row => text(row.operationId) === operationId);
            if (recoveredSchedule) {
              const recovered = {
                ...operation,
                status: 'succeeded_audit_pending',
                businessStatus: 'succeeded',
                auditStatus: 'pending',
                canRetry: false,
                campusIds: [rowCampus(recoveredSchedule)].filter(Boolean),
                scheduleId: text(recoveredSchedule.id),
                updatedAt: text(recoveredSchedule.updatedAt || recoveredSchedule.createdAt)
              };
              if (!operationVisibleForUser(recovered, user)) {
                return sendError(res, AGENT_ERRORS.CAMPUS_FORBIDDEN, requestId, 403);
              }
              return sendJson(res, makeSuccess(operationView(recovered), requestId));
            }
          }
          let visibleOperation = operation;
          if (operation.status === 'processing' && operation.previewId && typeof get === 'function') {
            const preview = await get(table('previews'), operation.previewId).catch(() => null);
            const campusId = rowCampus(preview?.request || {});
            if (campusId) visibleOperation = { ...operation, campusIds: [campusId] };
          }
          if (!operationVisibleForUser(visibleOperation, user)) {
            return sendError(res, AGENT_ERRORS.CAMPUS_FORBIDDEN, requestId, 403);
          }
          return sendJson(res, makeSuccess(operationView(visibleOperation), requestId));
        }

        // 审计落库异常时，用正式排课记录中的 operationId 做只读恢复，避免网络超时后重复创建。
        const schedules = typeof getScheduleListRows === 'function' ? await getScheduleListRows().catch(() => []) : [];
        const recoveredSchedule = (schedules || []).find(row => text(row.operationId) === operationId);
        if (recoveredSchedule) {
          const recovered = {
            operationId,
            status: 'succeeded_audit_pending',
            businessStatus: 'succeeded',
            auditStatus: 'pending',
            source: 'Agent',
            action: 'schedule_confirm',
            operatorId: text(recoveredSchedule.createdById),
            operatorName: text(recoveredSchedule.createdBy),
            campusIds: [rowCampus(recoveredSchedule)].filter(Boolean),
            createdAt: text(recoveredSchedule.createdAt),
            updatedAt: text(recoveredSchedule.updatedAt || recoveredSchedule.createdAt),
            scheduleId: text(recoveredSchedule.id),
            canRetry: false
          };
          if (!operationVisibleForUser(recovered, user)) {
            return sendError(res, AGENT_ERRORS.CAMPUS_FORBIDDEN, requestId, 403);
          }
          return sendJson(res, makeSuccess(operationView(recovered), requestId));
        }
        return writeError(res, 'OPERATION_NOT_FOUND', requestId);
      }

      if (path === '/agent/v1/auth/me') {
        const profile = assertBaseAccess(user, 'agent_auth_read', requestId, res);
        if (!profile) return true;
        return sendJson(res, makeSuccess({
          operatorId: text(user.id || user.username),
          name: text(user.name),
          role: profile.role,
          dataScope: profile.dataScope,
          campusIds: profile.campusIds,
          featurePermissions: profile.featurePermissions.filter(item => item.startsWith('agent_')),
          timeZone: TIME_ZONE
        }, requestId));
      }

      if (path === '/agent/v1/leads/today-new') {
        const profile = assertBaseAccess(user, 'agent_lead_read', requestId, res);
        if (!profile) return true;
        const campus = assertRequestedCampus(user, params, requestId, res);
        if (campus === null && requestedCampus(params)) return true;
        const source = await getCachedScan(table('leads'), { columns: LEAD_COLUMNS });
        const visible = scopedRows(source, user, campus);
        const today = dateKeyInShanghai(now());
        const todayNew = visible.filter(row => leadIsValid(row) && dateKeyInShanghai(row.createdAt) === today)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const active = visible.filter(leadIsValid);
        return sendJson(res, makeSuccess({
          date: today,
          timeZone: TIME_ZONE,
          todayNewCount: todayNew.length,
          currentValidTotal: active.length,
          activeTotal: active.length,
          items: todayNew.map(leadView)
        }, requestId));
      }

      if (path === '/agent/v1/students/search') {
        const profile = assertBaseAccess(user, 'agent_student_read', requestId, res);
        if (!profile) return true;
        const campus = assertRequestedCampus(user, params, requestId, res);
        if (campus === null && requestedCampus(params)) return true;
        const name = text(params.get('name') || params.get('keyword'));
        const phone = text(params.get('phone'));
        if (!name && !phone) return sendError(res, AGENT_ERRORS.INVALID_PARAMETER, requestId, 400);
        const source = await getFastStudentsRead({});
        const visible = scopedRows(source, user, campus).filter(row => {
          if (['merged', 'archived', 'deleted', 'inactive'].includes(text(row.status).toLowerCase())) return false;
          const matchName = name && text(row.name || row.displayName).includes(name);
          const matchPhone = phone && text(row.phone).replace(/\s+/g, '').includes(phone.replace(/\s+/g, ''));
          return !!(matchName || matchPhone);
        });
        return sendJson(res, makeSuccess({ total: visible.length, items: visible.map(studentView) }, requestId));
      }

      if (path === '/agent/v1/schedules') {
        const profile = assertBaseAccess(user, 'agent_schedule_read', requestId, res);
        if (!profile) return true;
        const campus = assertRequestedCampus(user, params, requestId, res);
        if (campus === null && requestedCampus(params)) return true;
        const requestedDate = text(params.get('date')) || dateKeyInShanghai(now());
        if (!isValidDateKey(requestedDate)) return sendError(res, AGENT_ERRORS.INVALID_PARAMETER, requestId, 400);
        const coachId = text(params.get('coachId'));
        const coachName = text(params.get('coach'));
        const [source, students] = await Promise.all([getScheduleListRows(), getFastStudentsRead({})]);
        const studentMap = new Map((students || []).map(row => [text(row.id), row]));
        const visible = scopedRows(source, user, campus).filter(row => {
          if (dateKeyInShanghai(row.startTime) !== requestedDate) return false;
          if (coachId && text(row.coachId) !== coachId) return false;
          if (coachName && text(row.coach || row.coachName) !== coachName) return false;
          return true;
        });
        return sendJson(res, makeSuccess({
          date: requestedDate,
          timeZone: TIME_ZONE,
          total: visible.length,
          items: visible.map(row => scheduleView(row, studentMap))
        }, requestId));
      }

      if (path === '/agent/v1/references') {
        const profile = assertBaseAccess(user, 'agent_reference_read', requestId, res);
        if (!profile) return true;
        const campus = assertRequestedCampus(user, params, requestId, res);
        if (campus === null && requestedCampus(params)) return true;
        const [campuses, coaches, courts] = await Promise.all([
          listCampusesWithDefaults(),
          getCachedScan(table('coaches')),
          getCachedScan(table('courts'))
        ]);
        const filter = rows => scopedRows(rows, user, campus);
        const campusRows = (campuses || []).filter(row => {
          const id = normalizeCampusValue(row.code || row.id || row.name || '');
          if (campus && id !== campus) return false;
          const profile = normalizePermissionProfile(user);
          return profile.role === 'admin' || profile.dataScope === 'all' || profile.campusIds.includes(id);
        });
        return sendJson(res, makeSuccess({
          timeZone: TIME_ZONE,
          campuses: campusRows.map(row => referenceView(row, 'campus')),
          coaches: filter(coaches).map(row => referenceView(row, 'coach')),
          courts: filter(courts).map(row => referenceView(row, 'court'))
        }, requestId));
      }

      return sendError(res, AGENT_ERRORS.INVALID_PARAMETER, requestId, 400);
    } catch (error) {
      console.error('[agent] request failed:', error?.message || error);
      return sendError(res, AGENT_ERRORS.SYSTEM_ERROR, requestId, 500);
    }
  };
}

module.exports = {
  TIME_ZONE,
  phoneMasked,
  dateKeyInShanghai,
  formatShanghai,
  createAgentRoutes
};
