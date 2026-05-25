#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  putRow
} = require('./lib/staging-data-store');

const ROOT = path.join(__dirname, '..');
const DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const T_LEADS = 'ft_leads';

function parseArgs(argv) {
  return {
    write: argv.includes('--write')
  };
}

function normalizeCampus(value) {
  const raw = String(value || '').trim();
  if (raw === 'mabao' || raw === '顺义马坡' || raw === '马坡') return 'mabao';
  return raw;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 超时`)), ms))
  ]);
}

async function putRowWithRetry(client, row, index, total) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await withTimeout(putRow(client, T_LEADS, row), 12000, `写入 ${row.id}`);
      if (index % 20 === 0 || index === total) console.log(`已写入 ${index}/${total}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`写入重试 ${attempt}/3：${row.id} ${error.message || error}`);
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}

async function assertProductionTarget() {
  const res = await fetch(DIAG_URL, { headers: { 'Cache-Control': 'no-cache' } });
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

async function main() {
  dotenv.config({ path: path.join(ROOT, '.env') });
  const args = parseArgs(process.argv.slice(2));
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const leads = await scanTable(client, T_LEADS);
  const updates = leads
    .filter((lead) => normalizeCampus(lead.campus) !== 'mabao')
    .map((lead) => ({ ...lead, campus: 'mabao', updatedAt: new Date().toISOString() }));

  if (args.write) {
    for (let i = 0; i < updates.length; i += 1) {
      await putRowWithRetry(client, updates[i], i + 1, updates.length);
    }
  }

  const after = args.write ? await scanTable(client, T_LEADS) : leads;
  const campusOk = after.filter((lead) => normalizeCampus(lead.campus) === 'mabao').length;
  const missingCampus = after.length - campusOk;

  console.log(JSON.stringify({
    write: args.write,
    localTarget: { endpoint: target.localEndpoint, instance: target.localInstance },
    onlineTarget: { endpoint: target.onlineEndpoint, instance: target.onlineInstance },
    totalLeads: leads.length,
    plannedUpdates: updates.length,
    campusMabaoAfter: campusOk,
    missingCampusAfter: missingCampus
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
