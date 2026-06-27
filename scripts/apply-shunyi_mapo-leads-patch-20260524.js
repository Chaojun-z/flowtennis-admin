#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  putRow
} = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const PATCH_ROWS_FILE = path.join(ROOT, 'docs/reports/shunyi_mapo-leads-patch-2026-05-24/final-patch-rows.json');
const REPORT_FILE = path.join(ROOT, 'docs/reports/shunyi_mapo-leads-patch-2026-05-24/apply-report.json');
const IMPORT_BATCH = 'shunyi_mapo_leads_patch_20260524';
const T_LEADS = 'ft_leads';
const T_LEAD_FOLLOWUPS = 'ft_lead_followups';
const CONVERTED_STATUSES = new Set(['已转课程', '已转订场', '已转课程+订场']);
const RETRYABLE_ERROR_RE = /(socket|timeout|timed out|ECONNRESET|ETIMEDOUT|TLS|network)/i;

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--write')
  };
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env') });
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: DIAG_URL });
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeName(value) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·.。_\-]/g, '')
    .trim();
}

function phoneFrom(value) {
  const match = text(value).match(/1[3-9]\d{9}/);
  return match ? match[0] : '';
}

function stripPhone(value) {
  const phone = phoneFrom(value);
  return text(value).replace(phone, '').replace(/[\/|｜，,;；]+/g, ' ').trim();
}

function boolFrom(value) {
  return /^(是|已转化|已报名|true|1|yes)$/i.test(text(value));
}

function deriveSystemStatus(row) {
  const rawStatus = text(row.rawStatus);
  if (text(row.studentId) && text(row.courtId)) return '已转课程+订场';
  if (text(row.studentId)) return '已转课程';
  if (text(row.courtId)) return '已转订场';
  if (rawStatus.includes('已报名')) return '已转课程';
  if (rawStatus === '已定场' || rawStatus.includes('定场')) return '已转订场';
  if (rawStatus === '已流失' || rawStatus === '无意向') return '已流失';
  if (rawStatus === '体验课预约' || rawStatus === '已约体验') return '已约体验';
  return '跟进中';
}

function makeNewLeadId(row) {
  const hash = crypto
    .createHash('sha1')
    .update([row['原表序号'], row['姓名/电话'], row['线索时间']].map(text).join('|'))
    .digest('hex')
    .slice(0, 10);
  return `shunyi_mapo-lead-xlsx-20260524-${text(row['原表序号'])}-${hash}`;
}

function makeFollowupId(leadId, seq) {
  return `${IMPORT_BATCH}-followup-${seq}-${crypto.createHash('sha1').update(leadId).digest('hex').slice(0, 10)}`;
}

function leadFromPatchRow(row, existing = {}, now = new Date().toISOString()) {
  const rawName = text(row['姓名/电话']);
  const phone = phoneFrom(rawName) || text(existing.phone);
  const wechatName = stripPhone(rawName) || rawName || text(existing.wechatName);
  const base = {
    ...existing,
    id: text(existing.id) || makeNewLeadId(row),
    leadDate: text(row['线索时间']) || text(existing.leadDate),
    displayName: rawName || text(existing.displayName) || wechatName,
    phone,
    wechatName,
    level: text(existing.level),
    profileNote: text(existing.profileNote),
    source: text(row['线索渠道']) || text(existing.source),
    consultType: text(row['需求产品']) || text(existing.consultType),
    intentLevel: text(row['意向等级']) || text(existing.intentLevel),
    owner: text(row['跟进人']) || text(existing.owner),
    rawStatus: text(row['表内跟进状态']) || text(existing.rawStatus),
    trialAtRaw: text(row['体验课时间']) || text(existing.trialAtRaw),
    enrollAtRaw: text(row['正式课报名时间']) || text(existing.enrollAtRaw),
    convertedFlag: boolFrom(row['是否转化']) || existing.convertedFlag === true,
    formalCoach: text(row['正式课教练']) || text(existing.formalCoach),
    lostReason: text(row['未成交原因']) || text(existing.lostReason),
    latestConcern: text(row['用户顾虑点']) || text(existing.latestConcern),
    latestConclusion: text(row['沟通情况和方案建议']) || text(existing.latestConclusion),
    nextAction: text(existing.nextAction),
    lastFollowupAt: text(row['线索时间']) || text(existing.lastFollowupAt),
    nextFollowupAt: text(existing.nextFollowupAt),
    studentId: text(existing.studentId),
    courtId: text(existing.courtId),
    membershipAccountId: text(existing.membershipAccountId),
    isCourseConverted: existing.isCourseConverted === true || !!text(existing.studentId),
    isCourtConverted: existing.isCourtConverted === true || !!text(existing.courtId),
    isMembershipConverted: existing.isMembershipConverted === true || !!text(existing.membershipAccountId),
    closedAt: text(existing.closedAt),
    importBatch: IMPORT_BATCH,
    sourceRowNo: text(row['原表序号']),
    createdAt: text(existing.createdAt) || now,
    updatedAt: now
  };
  base.systemStatus = deriveSystemStatus(base);
  if (text(row['状态保护']) === '是' && CONVERTED_STATUSES.has(text(existing.systemStatus))) {
    base.systemStatus = text(existing.systemStatus);
  }
  return base;
}

function followupFromPatchRow(row, lead, now = new Date().toISOString()) {
  return {
    id: makeFollowupId(lead.id, text(row['原表序号'])),
    leadId: lead.id,
    followupAt: text(row['线索时间']) || now,
    followupBy: text(row['跟进人']) || text(lead.owner),
    followupType: 'import',
    concern: text(row['用户顾虑点']),
    communicationNote: text(row['沟通情况和方案建议']),
    statusAfter: text(row['表内跟进状态']) || text(lead.rawStatus),
    conclusion: text(row['沟通情况和方案建议']),
    nextFollowupAt: text(lead.nextFollowupAt),
    nextAction: text(lead.nextAction),
    importBatch: IMPORT_BATCH,
    sourceRowNo: text(row['原表序号']),
    createdAt: now,
    updatedAt: now
  };
}

function buildIndexes(leads) {
  const byId = new Map(leads.map((row) => [String(row.id), row]));
  const byName = new Map();
  const byPhone = new Map();
  for (const row of leads) {
    for (const name of [row.displayName, row.wechatName]) {
      const key = normalizeName(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(row);
    }
    const phone = text(row.phone);
    if (phone) byPhone.set(phone, row);
  }
  return { byId, byName, byPhone };
}

function readPatchRows() {
  const rows = JSON.parse(fs.readFileSync(PATCH_ROWS_FILE, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('补数据清单格式错误');
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, attempts = 4) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || '');
      if (i >= attempts || !RETRYABLE_ERROR_RE.test(message)) throw error;
      console.warn(`${label} 网络抖动，重试 ${i}/${attempts - 1}`);
      await sleep(500 * i);
    }
  }
  throw lastError;
}

function validatePlan(rows, leads) {
  const indexes = buildIndexes(leads);
  const updateRows = rows.filter((row) => text(row['动作']) === '更新已有线索');
  const createRows = rows.filter((row) => text(row['动作']) === '新增线索');
  const protectedRows = rows.filter((row) => text(row['状态保护']) === '是');
  const errors = [];
  if (rows.length !== 76) errors.push(`补数据总数应为 76，实际 ${rows.length}`);
  if (updateRows.length !== 62) errors.push(`更新应为 62，实际 ${updateRows.length}`);
  if (createRows.length !== 14) errors.push(`新增应为 14，实际 ${createRows.length}`);
  if (protectedRows.length !== 19) errors.push(`状态保护应为 19，实际 ${protectedRows.length}`);

  for (const row of updateRows) {
    const id = text(row['线上匹配ID']);
    if (!id || !indexes.byId.has(id)) errors.push(`更新行找不到线上 ID：序号 ${row['原表序号']} ${row['姓名/电话']} ${id}`);
  }
  for (const row of createRows) {
    const nameKey = normalizeName(row['姓名/电话']);
    const phone = phoneFrom(row['姓名/电话']);
    const nameMatches = nameKey ? indexes.byName.get(nameKey) || [] : [];
    const phoneMatch = phone ? indexes.byPhone.get(phone) : null;
    const deterministicId = makeNewLeadId(row);
    const idMatch = indexes.byId.get(deterministicId);
    if ((nameMatches.length || phoneMatch) && !idMatch) {
      errors.push(`新增行当前已撞到线上人员：序号 ${row['原表序号']} ${row['姓名/电话']}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { updateRows, createRows, protectedRows, indexes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const beforeLeads = await scanTable(client, T_LEADS);
  const beforeFollowups = await scanTable(client, T_LEAD_FOLLOWUPS);
  const rows = readPatchRows();
  const plan = validatePlan(rows, beforeLeads);
  const now = new Date().toISOString();

  const leadWrites = [];
  const followupWrites = [];
  for (const row of rows) {
    const action = text(row['动作']);
    const existing = action === '更新已有线索' ? plan.indexes.byId.get(text(row['线上匹配ID'])) : {};
    const lead = leadFromPatchRow(row, existing, now);
    leadWrites.push(lead);
    followupWrites.push(followupFromPatchRow(row, lead, now));
  }

  if (args.write) {
    for (const lead of leadWrites) await withRetry(`写线索 ${lead.id}`, () => putRow(client, T_LEADS, lead));
    for (const followup of followupWrites) await withRetry(`写跟进 ${followup.id}`, () => putRow(client, T_LEAD_FOLLOWUPS, followup));
  }

  const afterLeads = args.write ? await scanTable(client, T_LEADS) : beforeLeads;
  const afterFollowups = args.write ? await scanTable(client, T_LEAD_FOLLOWUPS) : beforeFollowups;
  const afterIndexes = buildIndexes(afterLeads);
  const missingLeadIds = leadWrites.filter((row) => !afterIndexes.byId.has(row.id)).map((row) => row.id);
  const afterFollowupIds = new Set(afterFollowups.map((row) => String(row.id)));
  const missingFollowupIds = followupWrites.filter((row) => !afterFollowupIds.has(row.id)).map((row) => row.id);
  if (args.write && (missingLeadIds.length || missingFollowupIds.length)) {
    throw new Error(`写后核对失败：缺 lead ${missingLeadIds.join(',')}；缺 followup ${missingFollowupIds.join(',')}`);
  }

  const report = {
    mode: args.write ? 'write' : 'dry-run',
    importBatch: IMPORT_BATCH,
    target,
    before: { leads: beforeLeads.length, followups: beforeFollowups.length },
    plan: {
      total: rows.length,
      update: plan.updateRows.length,
      create: plan.createRows.length,
      protect: plan.protectedRows.length,
      leadWrites: leadWrites.length,
      followupWrites: followupWrites.length
    },
    after: { leads: afterLeads.length, followups: afterFollowups.length },
    addedLeads: afterLeads.length - beforeLeads.length,
    addedFollowups: afterFollowups.length - beforeFollowups.length,
    protectedKept: leadWrites.filter((row) => {
      const old = plan.indexes.byId.get(row.id);
      return old && CONVERTED_STATUSES.has(text(old.systemStatus)) && row.systemStatus === old.systemStatus;
    }).length,
    createdNames: plan.createRows.map((row) => text(row['姓名/电话'])),
    missingLeadIds,
    missingFollowupIds,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
