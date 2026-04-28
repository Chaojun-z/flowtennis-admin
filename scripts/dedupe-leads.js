const TableStore = require('tablestore');
const api = require('../api/index.js');

const { buildLeadDedupKey, deriveLeadSystemStatus } = api._test;

const TS_ENDPOINT = process.env.TS_ENDPOINT;
const TS_INSTANCE = process.env.TS_INSTANCE || 'flowtennis';
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

const T_LEADS = 'ft_leads';
const T_LEAD_FOLLOWUPS = 'ft_lead_followups';
const T_LEAD_IMPORT_BATCHES = 'ft_lead_import_batches';

let client;
function gc() {
  if (!client) {
    client = new TableStore.Client({
      accessKeyId: TS_KEY_ID,
      secretAccessKey: TS_KEY_SEC,
      endpoint: TS_ENDPOINT,
      instancename: TS_INSTANCE,
      maxRetries: 3
    });
  }
  return client;
}
function put(table, id, attrs) {
  return new Promise((res, rej) => {
    gc().putRow({
      tableName: table,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }],
      attributeColumns: Object.entries(attrs)
        .filter(([k]) => k !== 'id')
        .map(([k, v]) => ({ [k]: typeof v === 'object' ? JSON.stringify(v) : String(v ?? '') }))
    }, (e, d) => e ? rej(e) : res(d));
  });
}
function del(table, id) {
  return new Promise((res, rej) => {
    gc().deleteRow({
      tableName: table,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }]
    }, (e, d) => e ? rej(e) : res(d));
  });
}
function scan(table) {
  return new Promise((res, rej) => {
    const rows = [];
    function next(startKey) {
      gc().getRange({
        tableName: table,
        direction: TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey: startKey || [{ id: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
        maxVersions: 1,
        limit: 500
      }, (e, d) => {
        if (e) return rej(e);
        (d.rows || []).forEach((r) => {
          if (!r.primaryKey) return;
          const obj = { id: r.primaryKey[0].value };
          (r.attributes || []).forEach((a) => {
            try { obj[a.columnName] = JSON.parse(a.columnValue); }
            catch { obj[a.columnName] = a.columnValue; }
          });
          rows.push(obj);
        });
        if (d.nextStartPrimaryKey) return next(d.nextStartPrimaryKey);
        res(rows);
      });
    }
    next();
  });
}

function leadScore(lead = {}, followups = []) {
  return [
    lead.studentId ? 100 : 0,
    lead.courtId ? 80 : 0,
    lead.membershipAccountId ? 60 : 0,
    followups.length * 10,
    String(lead.updatedAt || lead.createdAt || '').length ? 1 : 0
  ].reduce((a, b) => a + b, 0);
}
function pickKeepLead(group, followupMap) {
  return group.slice().sort((a, b) => leadScore(b, followupMap.get(b.id) || []) - leadScore(a, followupMap.get(a.id) || []))[0];
}
function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === true) return true;
    if (String(value || '').trim()) return value;
  }
  return '';
}
function mergeLeadRows(group, keep, followupMap) {
  const merged = { ...keep };
  const sorted = group.slice().sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  merged.displayName = firstNonEmpty(...sorted.map(x => x.displayName));
  merged.phone = firstNonEmpty(...sorted.map(x => x.phone));
  merged.wechatName = firstNonEmpty(...sorted.map(x => x.wechatName));
  merged.level = firstNonEmpty(...sorted.map(x => x.level));
  merged.profileNote = firstNonEmpty(...sorted.map(x => x.profileNote));
  merged.source = firstNonEmpty(...sorted.map(x => x.source));
  merged.consultType = firstNonEmpty(...sorted.map(x => x.consultType));
  merged.intentLevel = firstNonEmpty(...sorted.map(x => x.intentLevel));
  merged.owner = firstNonEmpty(...sorted.map(x => x.owner));
  merged.rawStatus = firstNonEmpty(...sorted.map(x => x.rawStatus));
  merged.trialAtRaw = firstNonEmpty(...sorted.map(x => x.trialAtRaw));
  merged.enrollAtRaw = firstNonEmpty(...sorted.map(x => x.enrollAtRaw));
  merged.latestConcern = firstNonEmpty(...sorted.map(x => x.latestConcern));
  merged.latestConclusion = firstNonEmpty(...sorted.map(x => x.latestConclusion));
  merged.nextAction = firstNonEmpty(...sorted.map(x => x.nextAction));
  merged.nextFollowupAt = firstNonEmpty(...sorted.map(x => x.nextFollowupAt));
  merged.lastFollowupAt = firstNonEmpty(...sorted.map(x => x.lastFollowupAt));
  merged.formalCoach = firstNonEmpty(...sorted.map(x => x.formalCoach));
  merged.lostReason = firstNonEmpty(...sorted.map(x => x.lostReason));
  merged.studentId = firstNonEmpty(...sorted.map(x => x.studentId));
  merged.courtId = firstNonEmpty(...sorted.map(x => x.courtId));
  merged.membershipAccountId = firstNonEmpty(...sorted.map(x => x.membershipAccountId));
  merged.convertedFlag = sorted.some(x => x.convertedFlag === true);
  merged.isCourseConverted = sorted.some(x => x.isCourseConverted === true || String(x.studentId || '').trim());
  merged.isCourtConverted = sorted.some(x => x.isCourtConverted === true || String(x.courtId || '').trim());
  merged.isMembershipConverted = sorted.some(x => x.isMembershipConverted === true || String(x.membershipAccountId || '').trim());
  merged.systemStatus = deriveLeadSystemStatus(merged);
  const followups = (followupMap.get(keep.id) || []).slice().sort((a, b) => String(b.followupAt || b.createdAt || '').localeCompare(String(a.followupAt || a.createdAt || '')));
  if (followups[0]) {
    merged.lastFollowupAt = firstNonEmpty(merged.lastFollowupAt, followups[0].followupAt);
    merged.latestConcern = firstNonEmpty(merged.latestConcern, followups[0].concern);
    merged.latestConclusion = firstNonEmpty(merged.latestConclusion, followups[0].conclusion, followups[0].communicationNote);
    merged.nextFollowupAt = firstNonEmpty(merged.nextFollowupAt, followups[0].nextFollowupAt);
    merged.nextAction = firstNonEmpty(merged.nextAction, followups[0].nextAction);
    merged.rawStatus = firstNonEmpty(merged.rawStatus, followups[0].statusAfter);
    merged.systemStatus = deriveLeadSystemStatus(merged);
  }
  merged.updatedAt = new Date().toISOString();
  return merged;
}
function followupDedupKey(row = {}) {
  return [
    row.followupAt || '',
    row.followupBy || '',
    row.followupType || '',
    row.concern || '',
    row.communicationNote || '',
    row.statusAfter || '',
    row.conclusion || '',
    row.nextFollowupAt || '',
    row.nextAction || ''
  ].join('|');
}

async function main() {
  const [leads, followups] = await Promise.all([scan(T_LEADS), scan(T_LEAD_FOLLOWUPS)]);
  const followupMap = new Map();
  followups.forEach((row) => {
    const arr = followupMap.get(row.leadId) || [];
    arr.push({ ...row });
    followupMap.set(row.leadId, arr);
  });
  const groups = new Map();
  leads.forEach((lead) => {
    const key = buildLeadDedupKey(lead);
    const arr = groups.get(key) || [];
    arr.push(lead);
    groups.set(key, arr);
  });

  let duplicateLeadCount = 0;
  let deletedLeadCount = 0;
  let deletedFollowupCount = 0;
  let rewrittenFollowupCount = 0;

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    duplicateLeadCount += group.length - 1;
    const keep = pickKeepLead(group, followupMap);
    const drop = group.filter((row) => row.id !== keep.id);
    const allFollowups = [];
    group.forEach((lead) => {
      (followupMap.get(lead.id) || []).forEach((item) => allFollowups.push({ ...item }));
    });
    const uniqueFollowups = [];
    const seenFollowups = new Set();
    for (const row of allFollowups.sort((a, b) => String(a.followupAt || a.createdAt || '').localeCompare(String(b.followupAt || b.createdAt || '')))) {
      const key = followupDedupKey(row);
      if (seenFollowups.has(key)) {
        await del(T_LEAD_FOLLOWUPS, row.id);
        deletedFollowupCount += 1;
        continue;
      }
      seenFollowups.add(key);
      uniqueFollowups.push(row);
    }
    for (const row of uniqueFollowups) {
      if (row.leadId !== keep.id) {
        row.leadId = keep.id;
        row.updatedAt = new Date().toISOString();
        await put(T_LEAD_FOLLOWUPS, row.id, row);
        rewrittenFollowupCount += 1;
      }
    }
    followupMap.set(keep.id, uniqueFollowups.map((row) => ({ ...row, leadId: keep.id })));
    const merged = mergeLeadRows(group, keep, followupMap);
    await put(T_LEADS, keep.id, merged);
    for (const row of drop) {
      await del(T_LEADS, row.id);
      deletedLeadCount += 1;
    }
  }

  const batches = await scan(T_LEAD_IMPORT_BATCHES);
  for (const row of batches) await del(T_LEAD_IMPORT_BATCHES, row.id);

  console.log(JSON.stringify({
    duplicateLeadCount,
    deletedLeadCount,
    deletedFollowupCount,
    rewrittenFollowupCount,
    clearedImportBatchCount: batches.length
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
