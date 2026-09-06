const {
  resolveWeeklyBusinessReportPeriod,
  generateWeeklyBusinessReport,
  listWeeklyBusinessReports,
  findWeeklyBusinessReportByToken,
  updateWeeklyBusinessReportRemark,
  updateWeeklyBusinessReportPublicEdits,
  renderWeeklyBusinessReportHtml,
  buildWeeklyBusinessReportFeishuText,
  sendWeeklyBusinessReportFeishuText
} = require('./weekly-business-report.js');

function createWeeklyBusinessReportRoutes({
  init,
  sendJson,
  scan,
  get,
  put,
  mkTable,
  buildOperationsPayload,
  loadOperationsSnapshot,
  table,
  webhook = '',
  publicBaseUrl = '',
  isProductionRuntime = () => false
} = {}) {
  function baseUrl(req) {
    return String(publicBaseUrl || process.env.PUBLIC_BASE_URL || 'https://www.flowtennis.cn').replace(/\/+$/, '');
  }

  function addUtcDays(day, offset) {
    const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(ms + offset * 86400000).toISOString().slice(0, 10);
  }

  function periodFromRequest(body = {}, now = new Date()) {
    const requested = body?.period || {};
    const reportId = String(body?.reportId || '').trim();
    const match = reportId.match(/^weekly:[^:]+:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
    const startDate = String(requested.startDate || match?.[1] || '').slice(0, 10);
    const endDate = String(requested.endDate || match?.[2] || '').slice(0, 10);
    if (!startDate || !endDate) return resolveWeeklyBusinessReportPeriod(now);
    const previousEndDate = addUtcDays(startDate, -1);
    return {
      startDate,
      endDate,
      previousEndDate,
      previousStartDate: addUtcDays(previousEndDate, -7),
      timezone: 'Asia/Shanghai'
    };
  }

  async function runReport({ req, mode = 'auto', now = new Date(), period = null } = {}) {
    const targetPeriod = period || resolveWeeklyBusinessReportPeriod(now);
    const snapshot = await generateWeeklyBusinessReport({
      loadOperationsPayload: buildOperationsPayload,
      loadOperationsSnapshot,
      get,
      put,
      mkTable,
      period: targetPeriod,
      baseUrl: baseUrl(req || { headers: {} }),
      generationMode: mode,
      table
    });
    const text = buildWeeklyBusinessReportFeishuText({ snapshot, status: 'success' });
    const notification = await sendWeeklyBusinessReportFeishuText({ text, webhook }).catch(err => ({ sent: false, error: String(err?.message || err) }));
    return { success: true, report: snapshot, notification };
  }

  async function handlePublic({ path, method, body, res } = {}) {
    if (!(path.startsWith('/public/weekly-business-reports/') && (method === 'GET' || method === 'POST'))) return false;
    await init();
    const isEditSave = path.endsWith('/edits') && method === 'POST';
    const parts = path.split('/').filter(Boolean);
    const shareToken = decodeURIComponent(parts[2] || '');
    if (isEditSave) {
      try {
        const result = await updateWeeklyBusinessReportPublicEdits({ scan, put, token: shareToken, edits: body?.edits || {}, table });
        return sendJson(res, result);
      } catch (err) {
        return sendJson(res, { error: String(err?.message || err) }, err.statusCode || 500);
      }
    }
    if (method !== 'GET') return false;
    const report = await findWeeklyBusinessReportByToken({ scan, token: shareToken, table });
    if (!report) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><meta charset="utf-8"><title>周报不存在</title><p>周报不存在或链接无效</p>');
      return true;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(renderWeeklyBusinessReportHtml(report, { remark: report.remark || '' }));
    return true;
  }

  async function handleCron({ path, method, req, res } = {}) {
    if (!(path === '/cron/weekly-business-report' && method === 'GET')) return false;
    const auth = req.headers.authorization || '';
    if (process.env.CRON_SECRET) {
      if (auth !== `Bearer ${process.env.CRON_SECRET}`) return sendJson(res, { error: '无权限' }, 403);
    } else if (isProductionRuntime()) {
      return sendJson(res, { error: '无权限' }, 403);
    }
    await init();
    try {
      return sendJson(res, await runReport({ req, mode: 'auto' }));
    } catch (err) {
      const period = resolveWeeklyBusinessReportPeriod();
      const text = buildWeeklyBusinessReportFeishuText({ period, status: 'failure', error: String(err?.message || err) });
      const notification = await sendWeeklyBusinessReportFeishuText({ text, webhook }).catch(notifyErr => ({ sent: false, error: String(notifyErr?.message || notifyErr) }));
      return sendJson(res, { success: false, error: String(err?.message || err), notification }, 500);
    }
  }

  async function handleAdmin({ path, method, body, req, res, user } = {}) {
    if (path === '/weekly-business-reports' && method === 'GET') {
      if (user.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
      await init();
      return sendJson(res, { reports: await listWeeklyBusinessReports({ scan, table }) });
    }
    if (path === '/admin/weekly-business-reports/regenerate' && method === 'POST') {
      if (user.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
      await init();
      return sendJson(res, await runReport({ req, mode: 'manual', period: periodFromRequest(body) }));
    }
    if (path.startsWith('/admin/weekly-business-reports/') && path.endsWith('/remark') && method === 'POST') {
      if (user.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
      await init();
      const id = decodeURIComponent(path.slice('/admin/weekly-business-reports/'.length, -'/remark'.length));
      return sendJson(res, await updateWeeklyBusinessReportRemark({ get, put, id, remark: body?.remark || '', user, table }));
    }
    return false;
  }

  return { handlePublic, handleCron, handleAdmin };
}

module.exports = { createWeeklyBusinessReportRoutes };
