#!/usr/bin/env node

const cookie = process.env.FLOWTENNIS_ADMIN_COOKIE || '';
const token = process.env.FLOWTENNIS_ADMIN_TOKEN || '';

async function main() {
  if (!cookie && !token) throw new Error('缺少 FLOWTENNIS_ADMIN_COOKIE 或 FLOWTENNIS_ADMIN_TOKEN');
  const headers = { 'Cache-Control': 'no-cache' };
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch('https://www.flowtennis.cn/api/page-data/finance', { headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`线上财务接口失败 ${res.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body);
  console.log(JSON.stringify({
    ok: true,
    hasOverview: !!data.financeOverviewData,
    normalizedRowCount: Array.isArray(data.financeNormalizedRows) ? data.financeNormalizedRows.length : 0,
    settlementRowCount: Array.isArray(data.financeSettlementRows) ? data.financeSettlementRows.length : 0,
    overview: data.financeOverviewData?.all || null
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
