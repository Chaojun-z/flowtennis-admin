const crypto = require('crypto');

const WEEKLY_REPORT_CAMPUS_NAME = '顺义马坡';
const WEEKLY_REPORT_TIMEZONE = 'Asia/Shanghai';
const WEEKLY_REPORT_TABLE = 'ft_weekly_business_reports';

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

function beijingDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WEEKLY_REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function dayOfWeekUtc(day) {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return 0;
  return new Date(ms).getUTCDay();
}

function resolveWeeklyBusinessReportPeriod(now = new Date()) {
  const today = beijingDateKey(now);
  const weekday = dayOfWeekUtc(today);
  const daysSinceThursday = (weekday - 4 + 7) % 7;
  const endDate = addUtcDays(today, -daysSinceThursday);
  const startDate = addUtcDays(endDate, -7);
  const previousEndDate = addUtcDays(startDate, -1);
  const previousStartDate = addUtcDays(previousEndDate, -7);
  return {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    timezone: WEEKLY_REPORT_TIMEZONE
  };
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function cardValue(payload = {}, path = []) {
  let current = payload?.operations || payload;
  for (const key of path) current = current?.[key];
  return numberValue(current?.value ?? current);
}

function compareMetric(currentValue, previousValue) {
  const current = numberValue(currentValue);
  const previous = numberValue(previousValue);
  const changeValue = numberValue(current - previous);
  return {
    currentValue: current,
    previousValue: previous,
    changeValue,
    changeRate: previous ? numberValue(changeValue * 100 / previous) : null
  };
}

function compareValue(current, previous) {
  return compareMetric(current, previous);
}

function percent(part, total) {
  const base = numberValue(total);
  return base ? numberValue(numberValue(part) * 100 / base) : 0;
}

function fieldNumber(row = {}, keys = []) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return numberValue(row[key]);
  }
  return 0;
}

function cardNumber(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.cards?.[key]?.value ?? source?.[key]?.value ?? source?.[key];
    if (value !== undefined && value !== null && value !== '') return numberValue(value);
  }
  return 0;
}

function comparisonFor(current = {}, previous = {}, currentKeys = [], previousKeys = currentKeys) {
  return compareValue(fieldNumber(current, currentKeys), fieldNumber(previous, previousKeys));
}

function normalizeRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

function findFreeCourtUsage(court = {}) {
  const rows = [
    ...normalizeRows(court.usageMixRows),
    ...normalizeRows(court.rows),
    ...normalizeRows(court.typeRows),
    ...normalizeRows(court.categoryRows)
  ];
  const freeRows = rows.filter(row => /免费/.test(String(row.type || row.category || row.name || row.label || '')));
  return freeRows.reduce((acc, row) => ({
    count: acc.count + numberValue(row.count || row.times || row.bookingCount),
    hours: acc.hours + numberValue(row.hours || row.durationHours || row.bookingHours),
    amount: acc.amount + numberValue(row.amount || row.actualAmount || row.cashAmount),
    receivableAmount: acc.receivableAmount + numberValue(row.receivableAmount || row.originalAmount || row.concessionAmount || row.discountAmount)
  }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
}

function buildReportId(period = {}) {
  return `weekly:${WEEKLY_REPORT_CAMPUS_NAME}:${period.startDate}:${period.endDate}`;
}

function normalizeBaseUrl(baseUrl = '') {
  return String(baseUrl || 'https://www.flowtennis.cn').trim().replace(/\/+$/, '');
}

function buildWeeklyBusinessReportSnapshot({
  period,
  campusName = WEEKLY_REPORT_CAMPUS_NAME,
  operationsPayload = {},
  previousOperationsPayload = {},
  shareToken = '',
  baseUrl = 'https://www.flowtennis.cn',
  generatedAt = new Date().toISOString(),
  generationMode = 'auto'
} = {}) {
  const operations = operationsPayload.operations || {};
  const previous = previousOperationsPayload.operations || {};
  const token = String(shareToken || crypto.randomBytes(16).toString('hex')).trim();
  const totalIncome = cardValue(operations, ['overview', 'cards', 'totalIncome']);
  const previousTotalIncome = cardValue(previous, ['overview', 'cards', 'totalIncome']);
  const utilizationRate = cardValue(operations, ['court', 'cards', 'utilizationRate']);
  const coachHours = cardValue(operations, ['coach', 'cards', 'usedHours']);
  const totalLeads = cardValue(operations, ['conversion', 'cards', 'totalLeads']);
  const reportSections = buildWeeklyReportSections(operations, previous);
  return {
    id: buildReportId(period),
    campusName,
    period,
    generatedAt,
    generationMode,
    shareToken: token,
    shareUrl: `${normalizeBaseUrl(baseUrl)}/weekly-reports/${encodeURIComponent(token)}`,
    summary: {
      totalIncome: { value: totalIncome, compare: compareMetric(totalIncome, previousTotalIncome) },
      recognizedRevenue: { value: cardValue(operations, ['overview', 'cards', 'recognizedRevenue']) },
      courtUtilizationRate: { value: utilizationRate, compare: compareMetric(utilizationRate, cardValue(previous, ['court', 'cards', 'utilizationRate'])) },
      coachHours: { value: coachHours, compare: compareMetric(coachHours, cardValue(previous, ['coach', 'cards', 'usedHours'])) },
      totalLeads: { value: totalLeads, compare: compareMetric(totalLeads, cardValue(previous, ['conversion', 'cards', 'totalLeads'])) }
    },
    sections: {
      ...reportSections,
      detailsMode: 'summary-only'
    }
  };
}

function rowLabel(row = {}, keys = [], fallback = '未记录') {
  for (const key of keys) {
    const value = String(row?.[key] || '').trim();
    if (value) return value;
  }
  return fallback;
}

function courseMixHours(row = {}, names = []) {
  const mix = normalizeRows(row.courseMix);
  return mix
    .filter(item => names.some(name => String(item.type || item.name || item.label || '').includes(name)))
    .reduce((sum, item) => sum + fieldNumber(item, ['hours', 'value', 'count']), 0);
}

function normalizeCoachRows(currentRows = [], previousRows = []) {
  const previousByCoach = new Map(previousRows.map(row => [rowLabel(row, ['coach', 'coachName']), row]));
  return currentRows.map(row => {
    const coach = rowLabel(row, ['coach', 'coachName']);
    const previous = previousByCoach.get(coach) || {};
    const privateHours = fieldNumber(row, ['privateLessons', 'privateHours']) || courseMixHours(row, ['私教']);
    const smallClassHours = fieldNumber(row, ['smallClassLessons', 'smallClassHours', 'smallGroupHours']) || courseMixHours(row, ['小班']);
    const trialHours = fieldNumber(row, ['trialLessons', 'trialHours']) || courseMixHours(row, ['体验']);
    const specialHours = fieldNumber(row, ['specialLessons', 'specialHours']) || courseMixHours(row, ['专项']);
    const sparringHours = fieldNumber(row, ['sparringLessons', 'sparringHours', 'companionHours']) || courseMixHours(row, ['陪打']);
    return {
      coach,
      totalHours: fieldNumber(row, ['usedHours', 'teachingHours', 'hours']),
      scheduledCount: fieldNumber(row, ['lessonCount', 'scheduleCount', 'count']),
      privateHours,
      smallClassHours,
      trialHours,
      specialHours,
      sparringHours,
      compare: compareValue(fieldNumber(row, ['usedHours', 'teachingHours', 'hours']), fieldNumber(previous, ['usedHours', 'teachingHours', 'hours']))
    };
  });
}

function normalizeLeadSourceRows(currentRows = [], previousRows = []) {
  const previousBySource = new Map(previousRows.map(row => [rowLabel(row, ['source', 'channel']), row]));
  return currentRows.map(row => {
    const source = rowLabel(row, ['source', 'channel']);
    const previous = previousBySource.get(source) || {};
    const leads = fieldNumber(row, ['totalLeads', 'leads', 'count']);
    const trial = fieldNumber(row, ['trialAttended', 'trialPathStudents', 'trialCount', 'attendance']);
    const deals = fieldNumber(row, ['trialPathDealCustomers', 'deals', 'converted']);
    return {
      source,
      leads,
      trial,
      deals,
      compare: {
        leads: comparisonFor(row, previous, ['totalLeads', 'leads', 'count']),
        trial: comparisonFor(row, previous, ['trialAttended', 'trialPathStudents', 'trialCount', 'attendance']),
        deals: comparisonFor(row, previous, ['trialPathDealCustomers', 'deals', 'converted'])
      }
    };
  });
}

function normalizeCourtUsageRows(currentCourt = {}, previousCourt = {}) {
  const rows = [
    ...normalizeRows(currentCourt.usageMixRows),
    ...normalizeRows(currentCourt.typeRows),
    ...normalizeRows(currentCourt.categoryRows)
  ];
  const previousRows = [
    ...normalizeRows(previousCourt.usageMixRows),
    ...normalizeRows(previousCourt.typeRows),
    ...normalizeRows(previousCourt.categoryRows)
  ];
  const labels = [
    { key: 'guest', label: '散客场地使用', tests: [/散客/, /非会员/] },
    { key: 'member', label: '会员场地使用', tests: [/会员/] },
    { key: 'course', label: '课程场地使用', tests: [/课程/] },
    { key: 'free', label: '免费场地使用', tests: [/免费/] }
  ];
  const sumBy = (sourceRows, meta) => sourceRows.filter(row => meta.tests.some(test => test.test(rowLabel(row, ['type', 'category', 'name', 'label'], ''))))
    .reduce((acc, row) => ({
      count: acc.count + fieldNumber(row, ['count', 'times', 'bookingCount', 'usageCount']),
      hours: acc.hours + fieldNumber(row, ['hours', 'durationHours', 'bookingHours', 'occupiedHours']),
      amount: acc.amount + fieldNumber(row, ['amount', 'actualAmount', 'cashAmount', 'bookingAmount']),
      receivableAmount: acc.receivableAmount + fieldNumber(row, ['receivableAmount', 'originalAmount', 'concessionAmount', 'discountAmount'])
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  const fallbackHours = cardNumber(currentCourt, ['bookingHours']);
  const fallbackAmount = cardNumber(currentCourt, ['bookingAmount']);
  const result = labels.map(meta => {
    const current = sumBy(rows, meta);
    const previous = sumBy(previousRows, meta);
    if (meta.key === 'guest' && !rows.length && (fallbackHours || fallbackAmount)) {
      current.hours = fallbackHours;
      current.amount = fallbackAmount;
      current.count = cardNumber(currentCourt, ['bookingCount']);
    }
    return {
      ...meta,
      ...current,
      compare: {
        hours: compareValue(current.hours, previous.hours),
        amount: compareValue(current.amount, previous.amount)
      }
    };
  });
  const totalHours = result.reduce((sum, row) => sum + row.hours, 0);
  return result.map(row => ({ ...row, share: percent(row.hours, totalHours) }));
}

function normalizeWeekdayRows(court = {}) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const trends = normalizeRows(court.trends);
  if (!trends.length) return [];
  return trends.map(row => {
    const date = String(row.date || '');
    const weekday = dateKeyUtcMs(date) == null ? date : names[new Date(dateKeyUtcMs(date)).getUTCDay()];
    return { label: weekday, value: fieldNumber(row, ['utilizationRate']) };
  });
}

function buildWeeklyReportSections(operations = {}, previous = {}) {
  const overview = operations.overview || {};
  const prevOverview = previous.overview || {};
  const court = operations.court || {};
  const prevCourt = previous.court || {};
  const coach = operations.coach || {};
  const prevCoach = previous.coach || {};
  const conversion = operations.conversion || {};
  const prevConversion = previous.conversion || {};
  const revenueMix = normalizeRows(overview.revenueMix);
  const storedValueAmount = revenueMix.find(row => String(row.name || '').includes('会员储值'))?.value ?? cardNumber(overview, ['storedValueIncome']);
  const courseAmount = revenueMix.find(row => String(row.name || '').includes('课程'))?.value ?? cardNumber(overview, ['courseIncome']);
  return {
    revenue: {
      total: {
        totalIncome: cardNumber(overview, ['totalIncome']),
        recognizedRevenue: cardNumber(overview, ['recognizedRevenue']),
        pendingRevenue: cardNumber(overview, ['pendingRevenue']),
        tradeCount: cardNumber(overview, ['tradeCount'])
      },
      storedValue: {
        totalMembers: cardNumber(conversion, ['courtChain']) || fieldNumber(conversion.courtChain || {}, ['courtMembers']),
        newMembers: fieldNumber(conversion.courtChain || {}, ['newCourtMembers', 'courtMembers']),
        totalAmount: numberValue(storedValueAmount),
        newAmount: numberValue(storedValueAmount),
        compare: compareValue(storedValueAmount, normalizeRows(prevOverview.revenueMix).find(row => String(row.name || '').includes('会员储值'))?.value || 0),
        typeRows: [{ type: '会员储值', amount: numberValue(storedValueAmount), share: percent(storedValueAmount, cardNumber(overview, ['totalIncome'])) }]
      },
      course: {
        totalPeople: cardNumber(conversion, ['courseDealCustomers', 'courseStudents']),
        totalAmount: numberValue(courseAmount),
        newPeople: cardNumber(conversion, ['courseDealCustomers']),
        newAmount: numberValue(courseAmount),
        consumedAmount: cardNumber(overview, ['recognizedRevenue']),
        renewalPeople: fieldNumber(conversion.renewal || {}, ['renewalCount']),
        renewalAmount: 0,
        expiringPeople: cardNumber(conversion, ['trialPathPendingCustomers']),
        expiringAmount: 0,
        nearlyEmptyPeople: cardNumber(conversion, ['trialPathPendingCustomers']),
        compare: {
          people: compareValue(cardNumber(conversion, ['courseDealCustomers']), cardNumber(prevConversion, ['courseDealCustomers'])),
          amount: compareValue(courseAmount, normalizeRows(prevOverview.revenueMix).find(row => String(row.name || '').includes('课程'))?.value || 0),
          consumedAmount: compareValue(cardNumber(overview, ['recognizedRevenue']), cardNumber(prevOverview, ['recognizedRevenue']))
        }
      },
      mixRows: revenueMix
    },
    court: {
      totalAvailableHours: cardNumber(court, ['activeVenues']) * 15 * 8,
      actualUsedHours: cardNumber(court, ['bookingHours']),
      utilizationRate: cardNumber(court, ['utilizationRate']),
      usageRows: normalizeCourtUsageRows(court, prevCourt),
      weekdayRows: normalizeWeekdayRows(court),
      freeUsage: findFreeCourtUsage(court)
    },
    coach: {
      totalScheduled: normalizeRows(coach.rows).reduce((sum, row) => sum + fieldNumber(row, ['lessonCount', 'scheduleCount', 'count']), 0),
      totalHours: cardNumber(coach, ['usedHours']),
      privateHours: normalizeRows(coach.rows).reduce((sum, row) => sum + (fieldNumber(row, ['privateLessons', 'privateHours']) || courseMixHours(row, ['私教'])), 0),
      smallClassHours: normalizeRows(coach.rows).reduce((sum, row) => sum + (fieldNumber(row, ['smallClassLessons', 'smallClassHours', 'smallGroupHours']) || courseMixHours(row, ['小班'])), 0),
      trialHours: normalizeRows(coach.rows).reduce((sum, row) => sum + (fieldNumber(row, ['trialLessons', 'trialHours']) || courseMixHours(row, ['体验'])), 0),
      specialHours: normalizeRows(coach.rows).reduce((sum, row) => sum + (fieldNumber(row, ['specialLessons', 'specialHours']) || courseMixHours(row, ['专项'])), 0),
      sparringHours: normalizeRows(coach.rows).reduce((sum, row) => sum + (fieldNumber(row, ['sparringLessons', 'sparringHours', 'companionHours']) || courseMixHours(row, ['陪打'])), 0),
      compare: {
        totalHours: compareValue(cardNumber(coach, ['usedHours']), cardNumber(prevCoach, ['usedHours'])),
        totalScheduled: compareValue(normalizeRows(coach.rows).reduce((sum, row) => sum + fieldNumber(row, ['lessonCount', 'scheduleCount', 'count']), 0), normalizeRows(prevCoach.rows).reduce((sum, row) => sum + fieldNumber(row, ['lessonCount', 'scheduleCount', 'count']), 0))
      },
      rows: normalizeCoachRows(normalizeRows(coach.rows), normalizeRows(prevCoach.rows))
    },
    conversion: {
      totalLeads: cardNumber(conversion, ['totalLeads']),
      newLeads: cardNumber(conversion, ['totalLeads']),
      trialLeads: cardNumber(conversion, ['trialPathStudents']),
      trialDeals: cardNumber(conversion, ['trialPathDealCustomers']),
      compare: {
        newLeads: compareValue(cardNumber(conversion, ['totalLeads']), cardNumber(prevConversion, ['totalLeads'])),
        trialLeads: compareValue(cardNumber(conversion, ['trialPathStudents']), cardNumber(prevConversion, ['trialPathStudents'])),
        trialDeals: compareValue(cardNumber(conversion, ['trialPathDealCustomers']), cardNumber(prevConversion, ['trialPathDealCustomers']))
      },
      sourceRows: normalizeLeadSourceRows(normalizeRows(conversion.sourceRows), normalizeRows(prevConversion.sourceRows))
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function metricBlock(label, value, suffix = '') {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}${escapeHtml(suffix)}</strong></section>`;
}

function trendText(compare = {}) {
  if (!compare || compare.changeValue === undefined) return '环比 -';
  const value = numberValue(compare.changeValue);
  const sign = value > 0 ? '+' : '';
  const rate = compare.changeRate == null ? '' : ` / ${sign}${numberValue(compare.changeRate)}%`;
  return `环比 ${sign}${value}${rate}`;
}

function reportMetric(label, value, unit = '', compare = null) {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}${escapeHtml(unit)}</strong>${compare ? `<em>${escapeHtml(trendText(compare))}</em>` : ''}</section>`;
}

function barChart(rows = [], { labelKey = 'name', valueKey = 'value', unit = '' } = {}) {
  const clean = normalizeRows(rows).filter(row => fieldNumber(row, [valueKey]) > 0);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  return `<div class="bars">${clean.map(row => {
    const value = fieldNumber(row, [valueKey]);
    return `<div class="bar-row"><span>${escapeHtml(rowLabel(row, [labelKey, 'label', 'type']))}</span><i><b style="width:${Math.max(4, percent(value, max))}%"></b></i><strong>${escapeHtml(value)}${escapeHtml(unit)}</strong></div>`;
  }).join('')}</div>`;
}

function donutChart(rows = [], { labelKey = 'name', valueKey = 'value' } = {}) {
  const clean = normalizeRows(rows).filter(row => fieldNumber(row, [valueKey]) > 0);
  const total = clean.reduce((sum, row) => sum + fieldNumber(row, [valueKey]), 0);
  if (!total) return '<p class="empty">暂无可绘制数据</p>';
  let acc = 0;
  const colors = ['#2f6f8f', '#d08b45', '#6f8b5f', '#9a6b83', '#667085'];
  const stops = clean.map((row, index) => {
    const start = acc;
    acc += percent(fieldNumber(row, [valueKey]), total);
    return `${colors[index % colors.length]} ${start}% ${acc}%`;
  }).join(',');
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div><div class="legend">${clean.map((row, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(rowLabel(row, [labelKey, 'label', 'type']))} ${percent(fieldNumber(row, [valueKey]), total)}%</span>`).join('')}</div></div>`;
}

function lineChart(rows = [], { valueKey = 'value', unit = '%' } = {}) {
  const clean = normalizeRows(rows).filter(row => row.label || row.date);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  const points = clean.map((row, index) => {
    const x = clean.length === 1 ? 50 : 8 + index * (84 / (clean.length - 1));
    const y = 92 - (fieldNumber(row, [valueKey]) / max) * 76;
    return { x, y, row };
  });
  return `<div class="line-chart"><svg viewBox="0 0 100 100" role="img" aria-label="趋势图"><polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#2f6f8f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#2f6f8f"/>`).join('')}</svg><div class="line-labels">${points.map(p => `<span>${escapeHtml(p.row.label || String(p.row.date || '').slice(5))}<b>${escapeHtml(fieldNumber(p.row, [valueKey]))}${escapeHtml(unit)}</b></span>`).join('')}</div></div>`;
}

function renderRows(rows = [], columns = []) {
  if (!rows.length) return '<p class="empty">暂无数据</p>';
  return `<table><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(typeof col.render === 'function' ? col.render(row) : (row[col.key] ?? '-'))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderWeeklyBusinessReportHtml(snapshot = {}, { remark = '' } = {}) {
  const period = snapshot.period || {};
  const summary = snapshot.summary || {};
  const rawSections = snapshot.sections || {};
  const sections = rawSections.revenue?.storedValue ? rawSections : {
    ...buildWeeklyReportSections({
      overview: rawSections.revenue || {},
      court: rawSections.court || {},
      coach: rawSections.coach || {},
      conversion: rawSections.conversion || {}
    }, {}),
    detailsMode: rawSections.detailsMode || 'summary-only'
  };
  const revenue = sections.revenue || {};
  const court = sections.court || {};
  const coach = sections.coach || {};
  const conversion = sections.conversion || {};
  const coachRows = normalizeRows(coach.rows);
  const sourceRows = normalizeRows(conversion.sourceRows);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</title>
  <style>
    body{margin:0;background:#f4f6f8;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:1180px;margin:0 auto;padding:34px 22px 52px}
    h1{font-size:30px;margin:0 0 8px} h2{font-size:22px;margin:34px 0 14px} h3{font-size:16px;margin:22px 0 12px}
    .muted{color:#667085}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.grid.five{grid-template-columns:repeat(5,minmax(0,1fr))}
    .panel{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:18px;margin-top:14px}
    .split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .metric{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px}
    .metric span{display:block;color:#667085;font-size:13px}.metric strong{display:block;margin-top:8px;font-size:24px}.metric em{display:block;margin-top:8px;color:#667085;font-size:12px;font-style:normal}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eef0f3;font-size:14px}th{color:#475467;background:#fafafa}
    .remark{white-space:pre-wrap;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px}.empty{color:#667085}
    .bars{display:grid;gap:10px}.bar-row{display:grid;grid-template-columns:110px 1fr 84px;gap:10px;align-items:center;font-size:13px}.bar-row i{height:10px;background:#eef2f5;border-radius:999px;overflow:hidden}.bar-row b{display:block;height:100%;background:#2f6f8f;border-radius:999px}
    .donut-wrap{display:flex;align-items:center;gap:18px}.donut{width:150px;height:150px;border-radius:50%;position:relative}.donut:after{content:"";position:absolute;inset:34px;border-radius:50%;background:white}.legend{display:grid;gap:8px;font-size:13px}.legend span{display:flex;align-items:center;gap:8px}.legend i{width:10px;height:10px;border-radius:50%}
    .line-chart svg{width:100%;height:190px;background:#fbfcfd;border:1px solid #edf0f2;border-radius:8px}.line-labels{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px;color:#667085;font-size:12px}.line-labels b{display:block;color:#172033}
    @media(max-width:760px){.grid,.grid.five,.split{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:24px 14px}.metric strong{font-size:19px}.donut-wrap{display:block}.line-labels{grid-template-columns:repeat(2,1fr)}}
  </style>
</head>
<body>
<main>
  <h1>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</h1>
  <p class="muted">${escapeHtml(period.startDate)} 至 ${escapeHtml(period.endDate)}</p>
  <div class="grid five">
    ${metricBlock('总收入', summary.totalIncome?.value || 0, ' 元')}
    ${metricBlock('已入账', summary.recognizedRevenue?.value || 0, ' 元')}
    ${metricBlock('场地利用率', summary.courtUtilizationRate?.value || 0, '%')}
    ${metricBlock('教练课时', summary.coachHours?.value || 0, ' 小时')}
    ${metricBlock('线索数', summary.totalLeads?.value || 0, ' 条')}
  </div>

  <h2>1、收入数据</h2>
  <h3>1.1 储值会员</h3>
  <div class="grid">
    ${reportMetric('储值会员总数', revenue.storedValue?.totalMembers || 0, ' 人')}
    ${reportMetric('本周新增会员', revenue.storedValue?.newMembers || 0, ' 人', revenue.storedValue?.compare)}
    ${reportMetric('总储值金额', revenue.storedValue?.totalAmount || 0, ' 元')}
    ${reportMetric('本周新增储值', revenue.storedValue?.newAmount || 0, ' 元', revenue.storedValue?.compare)}
  </div>
  <div class="panel">${donutChart(revenue.storedValue?.typeRows || [], { labelKey: 'type', valueKey: 'amount' })}</div>
  <h3>1.2 课程收入</h3>
  <div class="grid">
    ${reportMetric('总人数', revenue.course?.totalPeople || 0, ' 人')}
    ${reportMetric('总收入', revenue.course?.totalAmount || 0, ' 元')}
    ${reportMetric('本周新增人数', revenue.course?.newPeople || 0, ' 人', revenue.course?.compare?.people)}
    ${reportMetric('本周新增收入', revenue.course?.newAmount || 0, ' 元', revenue.course?.compare?.amount)}
    ${reportMetric('本周新增消耗', revenue.course?.consumedAmount || 0, ' 元', revenue.course?.compare?.consumedAmount)}
    ${reportMetric('续费人数', revenue.course?.renewalPeople || 0, ' 人')}
    ${reportMetric('续费收入', revenue.course?.renewalAmount || 0, ' 元')}
    ${reportMetric('到期人数', revenue.course?.expiringPeople || 0, ' 人')}
    ${reportMetric('即将耗尽人数', revenue.course?.nearlyEmptyPeople || 0, ' 人')}
  </div>
  <div class="panel">${donutChart(revenue.mixRows || [], { labelKey: 'name', valueKey: 'value' })}</div>

  <h2>2、场地数据</h2>
  <div class="grid">
    ${reportMetric('总可用时长', court.totalAvailableHours || 0, ' 小时')}
    ${reportMetric('实际使用时长', court.actualUsedHours || 0, ' 小时')}
    ${reportMetric('场地利用率', court.utilizationRate || 0, '%')}
    ${reportMetric('免费应收让利', court.freeUsage?.receivableAmount || 0, ' 元')}
  </div>
  <div class="split">
    <div class="panel"><h3>每天利用率</h3>${lineChart(court.weekdayRows || [], { valueKey: 'value', unit: '%' })}</div>
    <div class="panel"><h3>类型占比</h3>${donutChart(court.usageRows || [], { labelKey: 'label', valueKey: 'hours' })}</div>
  </div>
  ${renderRows(court.usageRows || [], [
    { key: 'label', label: '类型' },
    { key: 'count', label: '次数' },
    { key: 'hours', label: '时长' },
    { key: 'amount', label: '金额' },
    { key: 'share', label: '占比', render: row => `${row.share || 0}%` },
    { key: 'compare', label: '环比', render: row => trendText(row.compare?.hours) }
  ])}

  <h2>3、教练课时</h2>
  <div class="grid five">
    ${reportMetric('排课量', coach.totalScheduled || 0, ' 节', coach.compare?.totalScheduled)}
    ${reportMetric('私教课', coach.privateHours || 0, ' 小时')}
    ${reportMetric('小班课', coach.smallClassHours || 0, ' 小时')}
    ${reportMetric('体验课', coach.trialHours || 0, ' 小时')}
    ${reportMetric('陪打', coach.sparringHours || 0, ' 小时')}
  </div>
  <div class="panel">${barChart(coachRows, { labelKey: 'coach', valueKey: 'totalHours', unit: '小时' })}</div>
  ${renderRows(coachRows, [
    { key: 'coach', label: '教练' },
    { key: 'scheduledCount', label: '排课量' },
    { key: 'privateHours', label: '私教课' },
    { key: 'smallClassHours', label: '小班课' },
    { key: 'trialHours', label: '体验课' },
    { key: 'specialHours', label: '专项课' },
    { key: 'sparringHours', label: '陪打' },
    { key: 'compare', label: '环比', render: row => trendText(row.compare) }
  ])}

  <h2>4、线索转化</h2>
  <div class="grid">
    ${reportMetric('总线索数', conversion.totalLeads || 0, ' 条')}
    ${reportMetric('本周新增线索', conversion.newLeads || 0, ' 条', conversion.compare?.newLeads)}
    ${reportMetric('本周体验线索', conversion.trialLeads || 0, ' 条', conversion.compare?.trialLeads)}
    ${reportMetric('体验后报名', conversion.trialDeals || 0, ' 人', conversion.compare?.trialDeals)}
  </div>
  <div class="panel">${barChart(sourceRows.map(row => ({ name: row.source, value: row.leads })), { labelKey: 'name', valueKey: 'value', unit: '条' })}</div>
  ${renderRows(sourceRows, [
    { key: 'source', label: '渠道' },
    { key: 'leads', label: '线索数' },
    { key: 'trial', label: '体验线索' },
    { key: 'deals', label: '体验后报名' },
    { key: 'compare', label: '环比', render: row => trendText(row.compare?.leads) }
  ])}
  <h2>备注</h2>
  <p class="remark">${escapeHtml(remark || '暂无备注')}</p>
</main>
</body>
</html>`;
}

function buildWeeklyBusinessReportFeishuText({ snapshot = null, period = null, status = 'success', error = '' } = {}) {
  const p = snapshot?.period || period || {};
  if (status === 'failure') {
    return `顺义马坡周报生成失败：${p.startDate || '-'} 至 ${p.endDate || '-'}，原因：${String(error || '未知错误').slice(0, 80)}`;
  }
  return `顺义马坡周报已生成：${p.startDate || '-'} 至 ${p.endDate || '-'}，点击查看：${snapshot?.shareUrl || ''}`;
}

async function sendWeeklyBusinessReportFeishuText({ text = '', webhook = '', fetchImpl = fetch } = {}) {
  const targetWebhook = String(webhook || '').trim();
  if (!targetWebhook) return { sent: false, skipped: true, reason: 'missing_webhook' };
  const response = await fetchImpl(targetWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: String(text || '') } })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`飞书接口 HTTP ${response.status}`);
  if (data && data.code !== undefined && data.code !== 0) throw new Error(`飞书接口返回失败：${data.msg || data.message || data.code}`);
  return { sent: true };
}

function reportView(row = {}) {
  return {
    id: row.id,
    campusName: row.campusName || WEEKLY_REPORT_CAMPUS_NAME,
    period: row.period || {},
    generatedAt: row.generatedAt || '',
    generationMode: row.generationMode || '',
    status: row.status || 'success',
    shareUrl: row.shareUrl || '',
    remark: row.remark || '',
    summary: row.summary || {}
  };
}

async function listWeeklyBusinessReports({ scan, table = WEEKLY_REPORT_TABLE } = {}) {
  const rows = await scan(table).catch(() => []);
  return rows
    .filter(row => row && row.status !== 'deleted')
    .sort((a, b) => String(b.period?.endDate || b.generatedAt || '').localeCompare(String(a.period?.endDate || a.generatedAt || '')))
    .map(reportView);
}

async function findWeeklyBusinessReportByToken({ scan, token = '', table = WEEKLY_REPORT_TABLE } = {}) {
  const target = String(token || '').trim();
  if (!target) return null;
  const rows = await scan(table).catch(() => []);
  return rows.find(row => String(row.shareToken || '') === target && row.status !== 'deleted') || null;
}

async function updateWeeklyBusinessReportRemark({ get, put, id = '', remark = '', user = {}, table = WEEKLY_REPORT_TABLE } = {}) {
  const report = await get(table, id);
  if (!report) {
    const err = new Error('周报不存在');
    err.statusCode = 404;
    throw err;
  }
  const next = {
    ...report,
    remark: String(remark || '').slice(0, 2000),
    remarkUpdatedAt: new Date().toISOString(),
    remarkUpdatedBy: user.name || user.id || ''
  };
  await put(table, id, next);
  return reportView(next);
}

async function generateWeeklyBusinessReport({
  loadOperationsPayload,
  get,
  put,
  mkTable = async () => {},
  period = resolveWeeklyBusinessReportPeriod(),
  baseUrl = 'https://www.flowtennis.cn',
  generationMode = 'auto',
  user = { id: 'weekly-report-system', role: 'admin', dataScope: 'all' },
  table = WEEKLY_REPORT_TABLE
} = {}) {
  if (typeof loadOperationsPayload !== 'function') throw new Error('缺少周报数据读取器');
  await mkTable(table).catch(() => null);
  const scope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    dateRange: { startDate: period.startDate, endDate: period.endDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.startDate, endDate: period.endDate }
  };
  const previousScope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    dateRange: { startDate: period.previousStartDate, endDate: period.previousEndDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.previousStartDate, endDate: period.previousEndDate }
  };
  const existing = get ? await get(table, buildReportId(period)).catch(() => null) : null;
  const [operationsPayload, previousOperationsPayload] = await Promise.all([
    loadOperationsPayload({ user, scope }),
    loadOperationsPayload({ user, scope: previousScope })
  ]);
  const snapshot = buildWeeklyBusinessReportSnapshot({
    period,
    operationsPayload,
    previousOperationsPayload,
    shareToken: existing?.shareToken || '',
    baseUrl,
    generationMode
  });
  const row = {
    ...snapshot,
    status: 'success',
    remark: existing?.remark || '',
    html: renderWeeklyBusinessReportHtml(snapshot, { remark: existing?.remark || '' })
  };
  await put(table, row.id, row);
  return row;
}

module.exports = {
  WEEKLY_REPORT_CAMPUS_NAME,
  WEEKLY_REPORT_TABLE,
  resolveWeeklyBusinessReportPeriod,
  buildWeeklyBusinessReportSnapshot,
  renderWeeklyBusinessReportHtml,
  buildWeeklyBusinessReportFeishuText,
  sendWeeklyBusinessReportFeishuText,
  listWeeklyBusinessReports,
  findWeeklyBusinessReportByToken,
  updateWeeklyBusinessReportRemark,
  generateWeeklyBusinessReport
};
