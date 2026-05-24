const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { randomUUID } = require('crypto');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./staging-data-store');

const ROOT = path.join(__dirname, '..', '..');
const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const REPORT_DIR = path.join(ROOT, 'docs/reports/mabao-import-preview-2026-05-23-final');
const SOURCE_FILES = {
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
  purchases: 'ft_purchases',
  membershipOrders: 'ft_membership_orders',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};
const IMPORT_TAG = 'mabao-finance-import-20260524';
const IMPORT_PREFIX = 'private_lesson_csv_import_20260524';
const STUDENT_ALIASES = {
  mjh小胡: 'mjh（小胡）',
  赵新阳孩子: '赵新阳 田秀楠',
  连女士: '莲儿（连女士）',
  锤锤: '是锤锤呀',
  哈库呐: '线熙宇（哈库呐玛塔塔）',
  小土豆的姐姐朋友: '小土豆的姐姐的朋友',
  宋缇缇: '宋缇缇',
  苏女士: 'LKY（苏女士）',
  晓曼: '晓曼-马坡',
  张佳良老大: '张佳良老大',
  张佳良老二: '张佳良老二'
};

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

function safeText(value) {
  return String(value || '').trim();
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
  text = text.replace(/私教课订场|私教课|体验课|订场|定场|发球机|课包划扣|大众点评支付|小程序|微信转账支付/g, '');
  text = text.replace(/\d+\s*元?/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text.split(' ')[0] || String(value || '').trim();
}

function lessonStudentName(value) {
  const raw = String(value || '').trim();
  if (/张佳良\s*老大|张佳良老大/.test(raw)) return STUDENT_ALIASES.张佳良老大;
  if (/张佳良\s*老二|张佳良老二/.test(raw)) return STUDENT_ALIASES.张佳良老二;
  const base = (!/\s/.test(raw) && !/私教|体验|课/.test(raw)) ? raw : extractCourseName(raw);
  return STUDENT_ALIASES[base] || base;
}

function buildStudentIndexes(students) {
  const byName = new Map();
  for (const row of students || []) {
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
  for (const row of courts || []) {
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

function findExactCourt(indexes, name) {
  const key = normalizeName(name);
  return { key, matches: indexes.byName.get(key) || [] };
}

function activeEntitlementsForStudent(entitlements, studentId) {
  return (entitlements || [])
    .filter((row) => String(row.studentId || '') === String(studentId || ''))
    .filter((row) => String(row.status || 'active') === 'active')
    .filter((row) => Number(row.remainingLessons) > 0 || Number(row.totalLessons) > 0);
}

function normalizeCourtHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((h) => {
    const amount = money(h.amount);
    const type = h.type || '消费';
    const payMethod = h.payMethod || (type === '消费' && amount < 0 ? '储值扣款' : '');
    const category = h.category || '其他';
    const revenueBucket = category === '订场'
      ? (payMethod === '储值扣款' ? '储值扣款' : (payMethod === '代用户订场' ? '代用户订场' : '现场收款'))
      : '';
    return {
      ...h,
      type,
      payMethod,
      category,
      amount: Math.abs(amount),
      bonusAmount: money(h.bonusAmount),
      ...(h.date ? { date: String(h.date).slice(0, 10) } : {}),
      ...(h.occurredDate ? { occurredDate: String(h.occurredDate).slice(0, 10) } : {}),
      ...(h.recordedAt ? { recordedAt: String(h.recordedAt) } : {}),
      ...(revenueBucket ? { revenueBucket } : {})
    };
  });
}

function computeCourtFinance(input) {
  const history = normalizeCourtHistory(input.history);
  if (!history.length) {
    return {
      balance: money(input.balance),
      totalDeposit: money(input.totalDeposit),
      spentAmount: money(input.spentAmount),
      receivedAmount: money(input.receivedAmount != null ? input.receivedAmount : input.totalDeposit),
      storedValueSpent: money(input.storedValueSpent),
      directPaidSpent: money(input.directPaidSpent)
    };
  }
  const totals = { balance: 0, totalDeposit: 0, spentAmount: 0, receivedAmount: 0, storedValueSpent: 0, directPaidSpent: 0 };
  for (const h of history) {
    const amount = money(h.amount);
    const bonus = money(h.bonusAmount);
    if (h.type === '充值') {
      totals.totalDeposit += amount;
      totals.receivedAmount += amount;
      totals.balance += amount + bonus;
      continue;
    }
    if (h.type === '消费') {
      totals.spentAmount += amount;
      if (h.payMethod === '储值扣款') {
        totals.storedValueSpent += amount;
        totals.balance -= amount;
      } else {
        totals.directPaidSpent += amount;
        totals.receivedAmount += amount;
      }
      continue;
    }
    if (h.type === '退款') {
      totals.receivedAmount -= amount;
      if (h.payMethod === '储值退款') totals.balance -= amount;
      continue;
    }
    if (h.type === '冲正') {
      totals.spentAmount -= amount;
      if (h.payMethod === '储值扣款') {
        totals.storedValueSpent -= amount;
        totals.balance += amount;
      } else {
        totals.directPaidSpent -= amount;
        totals.receivedAmount -= amount;
      }
      continue;
    }
  }
  Object.keys(totals).forEach((k) => {
    totals[k] = Math.round(totals[k] * 100) / 100;
  });
  return totals;
}

function summarizeCourtFinanceRevenue(input) {
  const history = normalizeCourtHistory(input?.history || []);
  const summary = {
    storedValueBooking: 0,
    onsiteBooking: 0,
    proxyBooking: 0,
    matchBooking: 0,
    internalOccupancyCount: 0,
    internalOccupancyAmount: 0,
    cashReceived: 0,
    confirmedRevenue: 0,
    pendingRevenue: 0,
    bookingUsageAmount: 0,
    paidBookingCount: 0
  };
  for (const h of history) {
    if (!['消费', '退款', '冲正'].includes(h.type)) continue;
    const amount = money(h.amount);
    if (h.category === '内部占用') {
      if (h.type !== '消费') continue;
      summary.internalOccupancyCount += 1;
      summary.internalOccupancyAmount += amount;
      continue;
    }
    if (h.category !== '订场') continue;
    const direction = h.type === '消费' ? 1 : -1;
    const bucket = h.revenueBucket || (h.payMethod === '储值扣款' ? '储值扣款' : (h.payMethod === '代用户订场' ? '代用户订场' : '现场收款'));
    const signedAmount = amount * direction;
    if (h.type === '消费') summary.paidBookingCount += 1;
    if (h.sourceCategory === '约球订场') summary.matchBooking += signedAmount;
    if (bucket === '储值扣款') summary.storedValueBooking += signedAmount;
    else if (bucket === '代用户订场') summary.proxyBooking += signedAmount;
    else summary.onsiteBooking += signedAmount;
  }
  summary.cashReceived = summary.onsiteBooking + summary.proxyBooking;
  summary.confirmedRevenue = summary.storedValueBooking + summary.onsiteBooking;
  summary.pendingRevenue = summary.proxyBooking;
  summary.bookingUsageAmount = summary.storedValueBooking + summary.onsiteBooking + summary.proxyBooking;
  Object.keys(summary).forEach((k) => {
    summary[k] = Math.round(summary[k] * 100) / 100;
  });
  return summary;
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

function buildSchedulePlan(rows, data, indexes) {
  return rows.map((row, idx) => {
    const student = findStudent(indexes.students, row['学员']);
    const start = `${row['日期']} ${String(row['开始'] || '').slice(0, 5)}`;
    const end = `${row['日期']} ${String(row['结束'] || '').slice(0, 5)}`;
    const dups = (data.schedule || []).filter((item) => {
      const sameStudent = parseArr(item.studentIds).some((id) => student.matches.some((s) => String(s.id) === String(id))) ||
        normalizeName(item.studentName || '') === normalizeName(row['学员']);
      if (!sameStudent) return false;
      const sameCoach = !row['教练'] || normalizeName(item.coach || item.coachName || '') === normalizeName(row['教练']);
      const sameVenue = normalizeName(`${item.externalVenueName || item.campusName || item.campus || ''}${item.venue || item.externalCourtName || ''}`)
        .includes(normalizeName(`${row['场馆'] || ''}${row['场地'] || ''}`));
      return sameCoach && sameVenue && overlaps(start, end, item.startTime, item.endTime);
    });
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

function buildEntitlementPlan(rows, data, indexes) {
  return rows.map((row, idx) => {
    const resolvedName = lessonStudentName(row['学员']);
    const student = findStudent(indexes.students, resolvedName);
    const activeEnts = student.matches.flatMap((item) => activeEntitlementsForStudent(data.entitlements, item.id));
    const existing = (data.entitlementLedger || []).filter((item) => {
      const itemDate = String(item.relatedDate || item.sourceDate || item.createdAt || '').slice(0, 10);
      return itemDate === row['日期'] && normalizeName(item.studentName || item.student || '') === normalizeName(row['学员']);
    });
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
      student: resolvedName,
      originalStudentText: row['学员'],
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

function buildIncomePlan(rows, data, indexes) {
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
      ? (data.schedule || []).filter((item) => overlaps(start, end, item.startTime, item.endTime) &&
        normalizeName(item.coach || '').includes(normalizeName(String(customer).split(/\s+/)[0] || '')) &&
        (student.matches.length ? parseArr(item.studentIds).some((id) => student.matches.some((s) => String(s.id) === String(id))) : true))
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

async function buildImportContext(client) {
  const [students, schedule, entitlements, entitlementLedger, courts, purchases, membershipOrders] = await Promise.all([
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.courts),
    scanTable(client, TABLES.purchases).catch(() => []),
    scanTable(client, TABLES.membershipOrders).catch(() => [])
  ]);
  return { students, schedule, entitlements, entitlementLedger, courts, purchases, membershipOrders };
}

function buildImportSummary(plans, target, context) {
  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run-only',
    target,
    sourceFiles: SOURCE_FILES,
    onlineRows: {
      students: context.students.length,
      schedule: context.schedule.length,
      entitlements: context.entitlements.length,
      entitlementLedger: context.entitlementLedger.length,
      courts: context.courts.length,
      purchases: context.purchases.length,
      membershipOrders: context.membershipOrders.length
    },
    plan: {
      schedule: summarize(plans.schedule),
      entitlement: summarize(plans.entitlement),
      income: summarize(plans.income)
    }
  };
}

function makeImportId(kind, rowNo, suffix = '') {
  const tail = suffix ? `-${suffix}` : '';
  return `${IMPORT_PREFIX}-${kind}-${String(rowNo).padStart(3, '0')}${tail}`;
}

function buildStudentRecord(name, now = new Date().toISOString(), extra = {}) {
  return {
    id: extra.id || makeImportId('student', extra.rowNo || randomUUID().slice(0, 8), normalizeName(name) || 'student'),
    name: safeText(name),
    phone: extra.phone || '',
    status: extra.status || 'active',
    campus: extra.campus || 'mabao',
    notes: extra.notes || '',
    createdAt: extra.createdAt || now,
    updatedAt: now
  };
}

function buildPurchaseRecordFromIncome(row, student, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const amount = money(row['实收/核销']);
  const lessonCount = Number(opts.lessonCount || row['课时'] || 1) || 1;
  const coach = safeText(opts.coach || row['教练'] || '');
  const packageName = safeText(opts.packageName || row['收入类型'] || row['客户/学员'] || '马坡导入课包');
  const courseType = safeText(opts.courseType || row['收入类型'] || '私教课');
  return {
    id: opts.id || makeImportId('purchase', row.__no || row['原表行号'] || row['收入原表行号'] || row['no'] || randomUUID().slice(0, 8), normalizeName(student.name || row['客户/学员'] || 'purchase')),
    studentId: student.id,
    studentName: student.name || safeText(row['客户/学员']),
    studentPhone: student.phone || '',
    packageId: opts.packageId || '',
    packageName,
    productId: opts.productId || '',
    productName: opts.productName || courseType,
    courseType,
    packageLessons: lessonCount,
    packagePrice: amount,
    priceSource: 'import',
    priceSourceId: opts.priceSourceId || '',
    priceSourceName: packageName,
    systemAmount: amount,
    finalAmount: amount,
    priceOverridden: false,
    overrideReason: opts.overrideReason || '',
    coachPriceName: coach,
    coachPriceSnapshot: {
      coachName: coach,
      source: '马坡收入记录',
      amountPaid: amount,
      lessonCount
    },
    packageTimeBand: opts.packageTimeBand || '',
    dailyTimeWindows: opts.dailyTimeWindows || [],
    coachIds: opts.coachIds || [],
    coachNames: coach ? [coach] : [],
    ownerCoach: coach,
    allowedCoaches: coach ? [coach] : [],
    campusIds: opts.campusIds || ['mabao'],
    usageStartDate: opts.usageStartDate || row['日期'] || '',
    usageEndDate: opts.usageEndDate || row['日期'] || '',
    purchaseDate: row['日期'] || '',
    amountPaid: amount,
    payMethod: row['支付方式'] || '',
    operator: '系统导入',
    status: 'active',
    sourceType: opts.sourceType || 'lesson_payment',
    sourceSheet: '马坡收入记录',
    importSource: '系统导入',
    seedTag: IMPORT_TAG,
    notes: opts.notes || row['最终备注'] || row['备注'] || '',
    createdAt: now,
    updatedAt: now
  };
}

function buildEntitlementRecordFromPurchase(purchase, student, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const totalLessons = Number(opts.totalLessons || purchase.packageLessons || 1) || 1;
  const packageName = opts.packageName || purchase.packageName || '马坡导入课包';
  const coachNames = purchase.coachNames || [];
  return {
    id: opts.id || makeImportId('entitlement', purchase.id.split('-').slice(-1)[0] || randomUUID().slice(0, 8), normalizeName(student.name || purchase.studentName || 'entitlement')),
    studentId: purchase.studentId,
    studentName: purchase.studentName,
    purchaseId: purchase.id,
    packageId: purchase.packageId || '',
    packageName,
    productId: purchase.productId || '',
    productName: purchase.productName || packageName,
    courseType: purchase.courseType || '私教课',
    totalLessons,
    usedLessons: 0,
    remainingLessons: totalLessons,
    validFrom: purchase.purchaseDate || '',
    validUntil: opts.validUntil || purchase.usageEndDate || purchase.purchaseDate || '',
    usageStartDate: purchase.purchaseDate || '',
    usageEndDate: opts.validUntil || purchase.usageEndDate || purchase.purchaseDate || '',
    dailyTimeWindows: purchase.dailyTimeWindows || [],
    timeBand: purchase.packageTimeBand || '',
    coachIds: purchase.coachIds || [],
    coachNames,
    ownerCoach: purchase.ownerCoach || '',
    allowedCoaches: purchase.allowedCoaches || [],
    campusIds: purchase.campusIds || ['mabao'],
    maxStudents: opts.maxStudents || 1,
    status: 'active',
    sourceSheet: '马坡收入记录',
    importSource: '系统导入',
    seedTag: IMPORT_TAG,
    createdAt: now,
    updatedAt: now
  };
}

function buildScheduleRecord(row, student, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return {
    id: opts.id || makeImportId('schedule', row['收入原表行号'] || row['原表行号'] || row['no'] || randomUUID().slice(0, 8), normalizeName(student.name || row['学员'] || 'schedule')),
    startTime: `${row['日期']} ${String(row['开始'] || '').slice(0, 5)}`,
    endTime: `${row['日期']} ${String(row['结束'] || '').slice(0, 5)}`,
    studentIds: [student.id],
    expectedStudentIds: [student.id],
    absentStudentIds: [],
    studentName: student.name || safeText(row['学员']),
    courseType: row['课程类型'] || '私教课',
    coach: row['教练'] || '',
    coachId: row['教练'] || '',
    campus: 'mabao',
    venue: row['场地'] || row['场馆'] || '',
    locationType: 'campus',
    lessonCount: Number(row['课时'] || 1) || 1,
    status: '已排课',
    confirmStatus: '待确认',
    notifyStatus: '未通知',
    scheduleSource: '排课表',
    sourceSheet: '马坡排课表',
    importSource: '系统导入',
    purchaseId: opts.purchaseId || '',
    entitlementId: opts.entitlementId || '',
    entitlementIds: opts.entitlementId ? [opts.entitlementId] : [],
    packageName: opts.packageName || '',
    notes: row['备注'] || '',
    createdBy: '系统导入',
    createdAt: now,
    updatedAt: now
  };
}

function buildEntitlementLedgerRecordFromSchedule(scheduleRow, entitlement, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const lessonDelta = Number(opts.lessonDelta || scheduleRow.lessonCount || 1) * -1;
  return {
    id: opts.id || makeImportId('ledger', scheduleRow.id.split('-').slice(-1)[0] || randomUUID().slice(0, 8), normalizeName(scheduleRow.studentName || 'ledger')),
    entitlementId: entitlement.id,
    purchaseId: entitlement.purchaseId || '',
    scheduleId: scheduleRow.id,
    studentId: entitlement.studentId,
    studentName: entitlement.studentName,
    lessonDelta,
    action: 'consume',
    reason: '排课消课',
    notes: opts.notes || scheduleRow.notes || '',
    operator: '系统导入',
    createdAt: now,
    relatedDate: scheduleRow.startTime.slice(0, 10),
    sourceDate: scheduleRow.startTime.slice(0, 10),
    sourceTimeBand: `${scheduleRow.startTime.slice(11, 16)}-${scheduleRow.endTime.slice(11, 16)}`,
    sourceLocation: '顺义马坡',
    sourceVenue: scheduleRow.venue || '',
    sourceSheet: '马坡排课表',
    importSource: '系统导入',
    coach: scheduleRow.coach || '',
    courseType: scheduleRow.courseType || '',
    seedTag: IMPORT_TAG
  };
}

function buildCourtHistoryRecord(row, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const amount = money(row['实收/核销'] || row.amount);
  const sourceCategory = safeText(opts.sourceCategory || row['收入类型'] || row['客户/学员']);
  const rawPayMethod = row['支付方式'] || opts.payMethod || '';
  const payMethod = /储值卡|储值扣款/.test(rawPayMethod) ? '储值扣款' : rawPayMethod;
  return {
    id: opts.id || makeImportId('court', row['原表行号'] || row['收入原表行号'] || row['no'] || randomUUID().slice(0, 8), normalizeName(row['客户/学员'] || 'court')),
    date: row['日期'] || row.date || '',
    type: opts.type || '消费',
    category: opts.category || '订场',
    payMethod,
    amount,
    bonusAmount: 0,
    note: opts.note || row['最终备注'] || row['备注'] || '',
    source: 'import',
    sourceCategory,
    sourceSheet: '马坡收入记录',
    importSource: '系统导入',
    sourceDate: row['日期'] || row.date || '',
    sourceTimeBand: row['时间'] || opts.sourceTimeBand || '',
    sourceLocation: '顺义马坡',
    sourceVenue: opts.sourceVenue || row['客户/学员'] || '',
    coach: opts.coach || row['教练'] || '',
    courseType: opts.courseType || row['收入类型'] || '',
    createdAt: now,
    recordedAt: now,
    updatedAt: now,
    operator: '系统导入',
    seedTag: IMPORT_TAG
  };
}

function applyCourtHistoryToCourt(baseCourt, historyRow, now = new Date().toISOString()) {
  const history = normalizeCourtHistory(baseCourt?.history);
  const duplicate = history.some((row) => {
    return String(row.date || row.occurredDate || '') === String(historyRow.date || historyRow.occurredDate || '')
      && String(row.type || '') === String(historyRow.type || '')
      && String(row.category || '') === String(historyRow.category || '')
      && String(row.payMethod || '') === String(historyRow.payMethod || '')
      && String(row.amount || '') === String(historyRow.amount || '')
      && String(row.sourceTimeBand || row.time || '') === String(historyRow.sourceTimeBand || '');
  });
  if (duplicate) return baseCourt;
  const nextHistory = [...history, historyRow];
  const finance = computeCourtFinance({ ...baseCourt, history: nextHistory });
  const revenue = summarizeCourtFinanceRevenue({ history: nextHistory });
  return {
    ...baseCourt,
    history: nextHistory,
    ...finance,
    ...revenue,
    updatedAt: now
  };
}

function buildCourtHistoryWriteRows(rows, courts, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const indexes = buildCourtIndexes(courts);
  const byCourtId = new Map();
  for (const row of rows || []) {
    const courtName = extractCourseName(row['客户/学员'] || row['收入类型'] || '');
    const existingCourt = findExactCourt(indexes, courtName).matches[0] || null;
    const courtId = existingCourt ? existingCourt.id : makeImportId('court', row.__rowNo || row['原表行号'] || row['收入原表行号'] || row.no || normalizeName(courtName || 'court'), normalizeName(courtName || 'court'));
    const baseCourt = byCourtId.get(courtId) || existingCourt || {
      id: courtId,
      name: courtName,
      campus: 'mabao',
      status: 'active',
      history: [],
      createdAt: now
    };
    const historyRow = buildCourtHistoryRecord(row, {
      sourceCategory: row['收入类型'] || row['客户/学员'] || '',
      sourceVenue: row['客户/学员'] || courtName,
      sourceTimeBand: row['时间'] || '',
      coach: row['教练'] || '',
      courseType: row['收入类型'] || '',
      note: row['最终备注'] || row['备注'] || '',
      now
    });
    byCourtId.set(courtId, applyCourtHistoryToCourt(baseCourt, historyRow, now));
  }
  return [...byCourtId.values()];
}

function courtHistoryImportKey(row) {
  return [
    row.date || row.occurredDate || '',
    row.type || '',
    row.category || '',
    row.payMethod || '',
    String(row.amount || ''),
    row.sourceTimeBand || row.time || ''
  ].join('|');
}

function buildMissingCourtHistoryWriteRows(rows, courts, opts = {}) {
  const existingKeys = new Set((courts || []).flatMap((court) => normalizeCourtHistory(court.history).map(courtHistoryImportKey)));
  const missingRows = [];
  for (const row of rows || []) {
    const historyRow = buildCourtHistoryRecord(row, {
      sourceCategory: row['收入类型'] || row['客户/学员'] || '',
      sourceVenue: row['客户/学员'] || extractCourseName(row['客户/学员'] || row['收入类型'] || ''),
      sourceTimeBand: row['时间'] || '',
      coach: row['教练'] || '',
      courseType: row['收入类型'] || '',
      note: row['最终备注'] || row['备注'] || '',
      now: opts.now
    });
    if (!existingKeys.has(courtHistoryImportKey(historyRow))) missingRows.push(row);
  }
  return buildCourtHistoryWriteRows(missingRows, courts, opts);
}

async function scanImportTables(client) {
  const [students, schedule, entitlements, entitlementLedger, courts, purchases, membershipOrders] = await Promise.all([
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.courts),
    scanTable(client, TABLES.purchases).catch(() => []),
    scanTable(client, TABLES.membershipOrders).catch(() => [])
  ]);
  return { students, schedule, entitlements, entitlementLedger, courts, purchases, membershipOrders };
}

function buildImportPlans(sourceRows, data, indexes) {
  return {
    schedule: buildSchedulePlan(sourceRows.schedule, data, indexes),
    entitlement: buildEntitlementPlan(sourceRows.entitlement, data, indexes),
    income: buildIncomePlan(sourceRows.income, data, indexes)
  };
}

module.exports = {
  ROOT,
  REPORT_DIR,
  SOURCE_FILES,
  TABLES,
  PROD_DIAG_URL,
  IMPORT_TAG,
  IMPORT_PREFIX,
  loadEnv,
  assertProductionTarget,
  readText,
  parseCsv,
  csvRows,
  csvEscape,
  writeCsv,
  normalizeName,
  parseArr,
  money,
  safeText,
  timeRangeFromIncome,
  overlaps,
  likelyCourse,
  extractCourseName,
  lessonStudentName,
  buildStudentIndexes,
  findStudent,
  buildCourtIndexes,
  findCourt,
  findExactCourt,
  activeEntitlementsForStudent,
  normalizeCourtHistory,
  computeCourtFinance,
  summarizeCourtFinanceRevenue,
  summarize,
  buildSchedulePlan,
  buildEntitlementPlan,
  buildIncomePlan,
  buildImportContext,
  buildImportSummary,
  makeImportId,
  buildStudentRecord,
  buildPurchaseRecordFromIncome,
  buildEntitlementRecordFromPurchase,
  buildScheduleRecord,
  buildEntitlementLedgerRecordFromSchedule,
  buildCourtHistoryRecord,
  applyCourtHistoryToCourt,
  buildCourtHistoryWriteRows,
  buildMissingCourtHistoryWriteRows,
  courtHistoryImportKey,
  scanImportTables,
  buildImportPlans,
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow
};
