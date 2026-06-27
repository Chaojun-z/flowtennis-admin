#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClientFromEnv, scanTable } = require('./lib/staging-data-store');

const ROOT = path.join(__dirname, '..');
const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const REPORT_DIR = path.join(ROOT, 'docs/reports/shunyi_mapo-import-preview-2026-05-23-final');
const OUT_DIR = path.join(REPORT_DIR, 'dry-run');

const FILES = {
  schedule: path.join(REPORT_DIR, 'final-schedule-import.csv'),
  entitlement: path.join(REPORT_DIR, 'final-entitlement-consume.csv'),
  income: path.join(REPORT_DIR, 'final-income-import.csv')
};

const TABLES = {
  students: 'ft_students',
  schedule: 'ft_schedule',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  courts: 'ft_courts',
  membershipOrders: 'ft_membership_orders',
  financialLedger: 'ft_financial_ledger'
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env') });
}

async function assertProductionTarget() {
  const res = await fetch(PROD_DIAG_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`线上 diag 失败：${res.status}`);
  const diag = await res.json();
  const onlineEndpoint = String(diag.TS_ENDPOINT || diag.env?.TS_ENDPOINT || '').trim();
  const onlineInstance = String(diag.TS_INSTANCE || diag.env?.TS_INSTANCE || '').trim();
  const localEndpoint = String(process.env.TS_ENDPOINT || '').trim();
  const localInstance = String(process.env.TS_INSTANCE || process.env.TARGET_TS_INSTANCE || '').trim();
  if (localEndpoint !== onlineEndpoint || localInstance !== onlineInstance) {
    throw new Error(`停止：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  if (onlineInstance !== 'flowtennis-ue') {
    throw new Error(`停止：线上实例不是 flowtennis-ue，当前是 ${onlineInstance}`);
  }
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => String(value || '').length)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => String(value || '').length)) rows.push(row);
  return rows;
}

function csvRows(filePath) {
  const rows = parseCsv(readText(filePath));
  const header = rows[0] || [];
  return rows.slice(1).map((row) => Object.fromEntries(header.map((key, idx) => [key, row[idx] || ''])));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(headers.map((key) => csvEscape(row[key])).join(','));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[（(]\s*\d+(?:\.\d+)?\s*[)）]/g, '')
    .replace(/教练/g, '')
    .replace(/\s+/g, '')
    .replace(/[·.。_\-]/g, '')
    .trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function money(value) {
  const n = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function isoStart(date, time) {
  return `${date} ${String(time || '').slice(0, 5)}`;
}

function isoEnd(date, time) {
  return `${date} ${String(time || '').slice(0, 5)}`;
}

function timeRangeFromIncome(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*[-~至]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match) return { start: '', end: '' };
  return {
    start: `${String(match[1]).padStart(2, '0')}:${match[2] || '00'}`,
    end: `${String(match[3]).padStart(2, '0')}:${match[4] || '00'}`
  };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const a1 = Date.parse(String(aStart || '').replace(' ', 'T'));
  const a2 = Date.parse(String(aEnd || '').replace(' ', 'T'));
  const b1 = Date.parse(String(bStart || '').replace(' ', 'T'));
  const b2 = Date.parse(String(bEnd || '').replace(' ', 'T'));
  if (![a1, a2, b1, b2].every(Number.isFinite)) return false;
  return a1 < b2 && b1 < a2;
}

function likelyCourse(row) {
  return /私教|体验|课/.test(`${row['收入类型'] || ''}${row['客户/学员'] || ''}${row['当前判断'] || ''}`);
}

function extractCourseName(value) {
  let text = String(value || '');
  text = text.replace(/^\s*\S+\s+/, '');
  text = text.replace(/私教课订场|私教课|体验课|订场|定场|发球机|课包划扣|大众点评支付|小程序|微信转账/g, '');
  text = text.replace(/\d+\s*元?/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text.split(' ')[0] || String(value || '').trim();
}

function buildStudentIndexes(students) {
  const byName = new Map();
  for (const row of students) {
    const names = [
      row.name,
      row.nickname,
      row.studentName,
      row.realName,
      ...(parseArr(row.aliases || row.aliasNames))
    ].filter(Boolean);
    for (const name of names) {
      const key = normalizeName(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }
  }
  return { byName };
}

function findStudent(indexes, name) {
  const key = normalizeName(name);
  const matches = indexes.byName.get(key) || [];
  return { key, matches };
}

function buildCourtIndexes(courts) {
  const byName = new Map();
  for (const row of courts) {
    const names = [row.name, row.courtName, row.customerName, row.contactName, row.memberName].filter(Boolean);
    for (const name of names) {
      const key = normalizeName(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }
  }
  return { byName };
}

function findCourt(indexes, name) {
  const key = normalizeName(name);
  const exact = indexes.byName.get(key) || [];
  if (exact.length) return { key, matches: exact };
  const loose = [];
  for (const [candidateKey, rows] of indexes.byName.entries()) {
    if (key && candidateKey && (key.includes(candidateKey) || candidateKey.includes(key))) loose.push(...rows);
  }
  return { key, matches: loose };
}

function activeEntitlementsForStudent(entitlements, studentId) {
  return entitlements
    .filter((row) => String(row.studentId || '') === String(studentId || ''))
    .filter((row) => String(row.status || 'active') === 'active')
    .filter((row) => Number(row.remainingLessons) > 0 || Number(row.totalLessons) > 0);
}

function existingLedgerFor(entitlementLedger, row) {
  const date = row['日期'];
  const studentKey = normalizeName(row['学员']);
  const lessonDelta = String(row['课时变化'] || '').trim();
  return entitlementLedger.filter((item) => {
    const itemDate = String(item.relatedDate || item.sourceDate || item.createdAt || '').slice(0, 10);
    const itemStudent = normalizeName(item.studentName || item.student || '');
    const itemDelta = String(item.lessonDelta || '').trim();
    return itemDate === date && itemStudent === studentKey && itemDelta === lessonDelta;
  });
}

function duplicateSchedules(scheduleRows, row, studentMatches) {
  const start = isoStart(row['日期'], row['开始']);
  const end = isoEnd(row['日期'], row['结束']);
  const coachKey = normalizeName(row['教练']);
  const venueKey = normalizeName(`${row['场馆'] || ''}${row['场地'] || ''}`);
  const studentIds = new Set(studentMatches.map((item) => String(item.id || '')));
  return scheduleRows.filter((item) => {
    const sameStudent = parseArr(item.studentIds).some((id) => studentIds.has(String(id))) ||
      normalizeName(item.studentName || '') === normalizeName(row['学员']);
    if (!sameStudent) return false;
    const sameCoach = !coachKey || normalizeName(item.coach || item.coachName || '') === coachKey;
    const itemVenue = normalizeName(`${item.externalVenueName || item.campusName || item.campus || ''}${item.venue || item.externalCourtName || ''}`);
    const sameVenue = !venueKey || !itemVenue || itemVenue.includes(venueKey) || venueKey.includes(itemVenue);
    return sameCoach && sameVenue && overlaps(start, end, item.startTime, item.endTime);
  });
}

function schedulePlan(rows, data, indexes) {
  return rows.map((row, idx) => {
    const student = findStudent(indexes.students, row['学员']);
    const dups = duplicateSchedules(data.schedule, row, student.matches);
    const activeEnts = student.matches.flatMap((item) => activeEntitlementsForStudent(data.entitlements, item.id));
    const issues = [];
    if (!student.matches.length) issues.push('找不到学员');
    if (student.matches.length > 1) issues.push('学员重名需确认');
    if (dups.length) issues.push('线上已有疑似重复排课');
    if (/课包划扣/.test(row['支付方式'] || '') && !activeEnts.length) issues.push('找不到可用课包');
    if (/待确认/.test(`${row['金额/核销金额'] || ''}${row['备注'] || ''}`)) issues.push('金额待确认');
    return {
      no: idx + 1,
      action: row['导入动作'],
      date: row['日期'],
      time: `${row['开始']}-${row['结束']}`,
      student: row['学员'],
      coach: row['教练'],
      amount: row['金额/核销金额'],
      targetTables: 'ft_schedule + ft_entitlement_ledger/ft_entitlements(课包课)',
      matchedStudentIds: student.matches.map((item) => item.id).join('|'),
      activeEntitlementIds: activeEnts.map((item) => item.id).join('|'),
      duplicateScheduleIds: dups.map((item) => item.id).join('|'),
      status: issues.length ? '需复核' : 'dry-run通过',
      issues: issues.join('；')
    };
  });
}

function entitlementPlan(rows, data, indexes) {
  return rows.map((row, idx) => {
    const student = findStudent(indexes.students, row['学员']);
    const activeEnts = student.matches.flatMap((item) => activeEntitlementsForStudent(data.entitlements, item.id));
    const existing = existingLedgerFor(data.entitlementLedger, row);
    const issues = [];
    if (!student.matches.length) issues.push('找不到学员');
    if (student.matches.length > 1) issues.push('学员重名需确认');
    if (!activeEnts.length) issues.push('找不到可用课包');
    if (existing.length) issues.push('疑似已有相同核销流水');
    if (/待确认/.test(`${row['核销金额'] || ''}${row['备注'] || ''}`)) issues.push('金额待确认');
    return {
      no: idx + 1,
      action: row['核销类型'],
      date: row['日期'],
      time: row['时间'],
      student: row['学员'],
      coach: row['教练'],
      lessonDelta: row['课时变化'],
      amount: row['核销金额'],
      targetTables: 'ft_entitlement_ledger + ft_entitlements',
      matchedStudentIds: student.matches.map((item) => item.id).join('|'),
      activeEntitlementIds: activeEnts.map((item) => item.id).join('|'),
      duplicateLedgerIds: existing.map((item) => item.id).join('|'),
      status: issues.length ? '需复核' : 'dry-run通过',
      issues: issues.join('；')
    };
  });
}

function incomePlan(rows, data, indexes) {
  return rows.map((row, idx) => {
    const action = row['导入动作'] || '';
    const customer = row['客户/学员'] || '';
    const courseName = likelyCourse(row) ? extractCourseName(customer) : customer.replace(/订场|定场|发球机/g, '').trim();
    const student = likelyCourse(row) ? findStudent(indexes.students, courseName) : { matches: [] };
    const court = findCourt(indexes.courts, courseName || customer);
    const range = timeRangeFromIncome(row['时间']);
    const start = range.start ? `${row['日期']} ${range.start}` : '';
    const end = range.end ? `${row['日期']} ${range.end}` : '';
    const duplicateSchedule = likelyCourse(row) && start && end
      ? data.schedule.filter((item) => overlaps(start, end, item.startTime, item.endTime) && normalizeName(item.coach || '').includes(normalizeName(String(customer).split(/\s+/)[0] || '')) && (student.matches.length ? parseArr(item.studentIds).some((id) => student.matches.some((s) => String(s.id) === String(id))) : true))
      : [];
    const issues = [];
    if (/待确认/.test(`${action}${row['实收/核销'] || ''}${row['当前判断'] || ''}${row['最终备注'] || ''}`)) issues.push('金额/收入待确认');
    if (likelyCourse(row) && !student.matches.length && !/已有排课|不新增排课/.test(action)) issues.push('课程收入找不到学员');
    if (!likelyCourse(row) && !court.matches.length) issues.push('订场/储值找不到订场会员');
    if (/储值卡|储值扣款|8折储值/.test(row['支付方式'] || '') && !court.matches.length) issues.push('储值扣款无会员账户匹配');
    return {
      no: idx + 1,
      action,
      date: row['日期'],
      time: row['时间'],
      customer,
      incomeType: row['收入类型'],
      payMethod: row['支付方式'],
      amount: row['实收/核销'],
      targetTables: likelyCourse(row) ? 'ft_entitlement_ledger/ft_schedule相关财务增量' : 'ft_courts.history',
      matchedStudentIds: student.matches.map((item) => item.id).join('|'),
      matchedCourtIds: court.matches.map((item) => item.id).join('|'),
      duplicateScheduleIds: duplicateSchedule.map((item) => item.id).join('|'),
      status: issues.length ? '需复核' : 'dry-run通过',
      issues: issues.join('；')
    };
  });
}

function summarize(rows) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.status] = (acc[row.status] || 0) + 1;
    if (row.issues) {
      for (const issue of row.issues.split('；').filter(Boolean)) {
        acc.issues[issue] = (acc.issues[issue] || 0) + 1;
      }
    }
    return acc;
  }, { total: 0, issues: {} });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.write) throw new Error('本脚本当前只允许 dry-run，不能写入线上');
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const [students, scheduleRows, entitlements, entitlementLedger, courts, membershipOrders, financialLedger] = await Promise.all([
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.courts),
    scanTable(client, TABLES.membershipOrders).catch(() => []),
    scanTable(client, TABLES.financialLedger).catch(() => [])
  ]);
  const data = { students, schedule: scheduleRows, entitlements, entitlementLedger, courts, membershipOrders, financialLedger };
  const indexes = { students: buildStudentIndexes(students), courts: buildCourtIndexes(courts) };
  const scheduleRowsInput = csvRows(FILES.schedule);
  const entitlementRowsInput = csvRows(FILES.entitlement);
  const incomeRowsInput = csvRows(FILES.income);
  const plans = {
    schedule: schedulePlan(scheduleRowsInput, data, indexes),
    entitlement: entitlementPlan(entitlementRowsInput, data, indexes),
    income: incomePlan(incomeRowsInput, data, indexes)
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run-only',
    target,
    sourceFiles: FILES,
    onlineRows: {
      students: students.length,
      schedule: scheduleRows.length,
      entitlements: entitlements.length,
      entitlementLedger: entitlementLedger.length,
      courts: courts.length,
      membershipOrders: membershipOrders.length,
      financialLedger: financialLedger.length
    },
    plan: {
      schedule: summarize(plans.schedule),
      entitlement: summarize(plans.entitlement),
      income: summarize(plans.income)
    }
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeCsv(path.join(OUT_DIR, 'dry-run-schedule.csv'), Object.keys(plans.schedule[0] || { no: '' }), plans.schedule);
  writeCsv(path.join(OUT_DIR, 'dry-run-entitlement.csv'), Object.keys(plans.entitlement[0] || { no: '' }), plans.entitlement);
  writeCsv(path.join(OUT_DIR, 'dry-run-income.csv'), Object.keys(plans.income[0] || { no: '' }), plans.income);
  fs.writeFileSync(path.join(OUT_DIR, 'dry-run-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    outDir: OUT_DIR,
    target: target.onlineInstance,
    schedule: summary.plan.schedule,
    entitlement: summary.plan.entitlement,
    income: summary.plan.income
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
