const fs = require('fs');
const TableStore = require('tablestore');
const { v4: uuidv4 } = require('uuid');

const TS_ENDPOINT = process.env.TS_ENDPOINT;
const TS_INSTANCE = process.env.TS_INSTANCE || 'flowtennis';
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

const CSV_PATH = process.argv[2] || '/Users/shaobaolu/Downloads/网球兄弟·马坡「线索-转化表」 - 线索跟进.csv';

const T_LEADS = 'ft_leads';
const T_LEAD_FOLLOWUPS = 'ft_lead_followups';
const T_LEAD_IMPORT_BATCHES = 'ft_lead_import_batches';
const T_STUDENTS = 'ft_students';
const T_COURTS = 'ft_courts';

const REQUIRED_COLUMNS = [
  '线索时间',
  '微信名/电话',
  '水平',
  '其他信息（包含年纪等）',
  '线索渠道',
  '咨询需求',
  '意向类型',
  '跟进人',
  '跟进状态',
  '体验课时间',
  '正式课报名时间',
  '用户顾虑点',
  '沟通情况和方案建议',
  '是否转化',
  '正式课教练',
  '未成交原因'
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err) {
  return /ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|Client network socket disconnected/i.test(String(err?.message || err || ''));
}

async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || i === attempts) throw err;
      await sleep(i * 400);
    }
  }
  throw lastErr;
}

function parseCellValue(value) {
  const text = String(value ?? '');
  try { return JSON.parse(text); } catch { return text; }
}

function scan(table) {
  return withRetry(() => new Promise((resolve, reject) => {
    gc().getRange({
      tableName: table,
      direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: [{ id: TableStore.INF_MIN }],
      exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
      maxVersions: 1,
      limit: 1000
    }, (err, data) => {
      if (err) return reject(err);
      const rows = [];
      (data.rows || []).forEach((row) => {
        if (!row.primaryKey) return;
        const obj = { id: row.primaryKey[0].value };
        (row.attributes || []).forEach((attr) => {
          obj[attr.columnName] = parseCellValue(attr.columnValue);
        });
        rows.push(obj);
      });
      resolve(rows);
    });
  }));
}

function put(table, id, attrs) {
  return withRetry(() => new Promise((resolve, reject) => {
    gc().putRow({
      tableName: table,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }],
      attributeColumns: Object.entries(attrs)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err, data) => (err ? reject(err) : resolve(data)));
  }));
}

function del(table, id) {
  return withRetry(() => new Promise((resolve, reject) => {
    gc().deleteRow({
      tableName: table,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }]
    }, (err, data) => (err ? reject(err) : resolve(data)));
  }));
}

async function clearTable(table) {
  const rows = await scan(table);
  console.log(`[clear] ${table} ${rows.length} rows`);
  let index = 0;
  for (const row of rows) {
    await del(table, row.id);
    index += 1;
    if (index % 50 === 0 || index === rows.length) console.log(`[clear] ${table} ${index}/${rows.length}`);
  }
  return rows.length;
}

function cleanText(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim();
}

function normalizePhone(value) {
  const raw = String(value ?? '').replace(/\D+/g, '');
  return /^1[3-9]\d{9}$/.test(raw) ? raw : '';
}

function normalizeBool(value) {
  return /^(是|已转化|已报名|true|1|yes)$/i.test(cleanText(value));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
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
    if (ch === '\n' && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const cells = row.map(cleanText);
    return cells.includes('序号') && cells.includes('线索时间') && cells.includes('微信名/电话');
  });
}

function buildHeader(rows, headerIndex) {
  const main = (rows[headerIndex] || []).map(cleanText);
  const sub = (rows[headerIndex + 1] || []).map(cleanText);
  const twoRow = sub.some((cell) => ['水平', '其他信息（包含年纪等）', '用户顾虑点', '沟通情况和方案建议'].includes(cell));
  if (!twoRow) return { header: main, startIndex: headerIndex + 1 };
  return {
    header: main.map((cell, index) => sub[index] || cell),
    startIndex: headerIndex + 2
  };
}

function extractContactMeta(value) {
  const raw = cleanText(value);
  const matchedPhone = raw.match(/1[3-9]\d{9}/);
  const phone = matchedPhone ? matchedPhone[0] : '';
  const name = cleanText(raw.replace(phone, '').replace(/[\/|｜，,;；]+/g, ' '));
  return { raw, phone, wechatName: name };
}

function deriveSystemStatus(lead) {
  const rawStatus = cleanText(lead.rawStatus);
  if (cleanText(lead.studentId) && cleanText(lead.courtId)) return '已转课程+订场';
  if (cleanText(lead.studentId)) return '已转课程';
  if (cleanText(lead.courtId)) return '已转订场';
  if (rawStatus.includes('已报名')) return '已转课程';
  if (rawStatus === '已定场' || rawStatus.includes('定场')) return '已转订场';
  if (rawStatus === '已流失' || rawStatus === '无意向') return '已流失';
  if (rawStatus === '体验课预约') return '已约体验';
  return '跟进中';
}

function normalizeLead(raw) {
  const now = new Date().toISOString();
  const meta = extractContactMeta(raw['微信名/电话']);
  const lead = {
    id: uuidv4(),
    leadDate: cleanText(raw['线索时间']),
    displayName: cleanText(meta.wechatName || meta.phone || meta.raw),
    phone: normalizePhone(meta.phone),
    wechatName: cleanText(meta.wechatName),
    level: cleanText(raw['水平']),
    profileNote: cleanText(raw['其他信息（包含年纪等）']),
    source: cleanText(raw['线索渠道']),
    consultType: cleanText(raw['咨询需求']),
    intentLevel: cleanText(raw['意向类型']),
    owner: cleanText(raw['跟进人']),
    rawStatus: cleanText(raw['跟进状态']),
    trialAtRaw: cleanText(raw['体验课时间']),
    enrollAtRaw: cleanText(raw['正式课报名时间']),
    convertedFlag: normalizeBool(raw['是否转化']),
    formalCoach: cleanText(raw['正式课教练']),
    lostReason: cleanText(raw['未成交原因']),
    latestConcern: cleanText(raw['用户顾虑点']),
    latestConclusion: cleanText(raw['沟通情况和方案建议']),
    nextAction: '',
    lastFollowupAt: '',
    nextFollowupAt: '',
    studentId: '',
    courtId: '',
    membershipAccountId: '',
    isCourseConverted: false,
    isCourtConverted: false,
    isMembershipConverted: false,
    closedAt: '',
    createdAt: now,
    updatedAt: now
  };
  lead.systemStatus = deriveSystemStatus(lead);
  return lead;
}

function buildDedupKey(lead) {
  return [
    cleanText(lead.leadDate),
    cleanText(lead.displayName),
    normalizePhone(lead.phone),
    cleanText(lead.wechatName),
    cleanText(lead.level),
    cleanText(lead.profileNote),
    cleanText(lead.source),
    cleanText(lead.consultType),
    cleanText(lead.intentLevel),
    cleanText(lead.owner),
    cleanText(lead.rawStatus),
    cleanText(lead.trialAtRaw),
    cleanText(lead.enrollAtRaw),
    cleanText(lead.latestConcern),
    cleanText(lead.latestConclusion),
    lead.convertedFlag ? '1' : '0',
    cleanText(lead.formalCoach),
    cleanText(lead.lostReason)
  ].join('|');
}

function buildInitialFollowup(lead) {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    leadId: lead.id,
    followupAt: lead.leadDate || lead.createdAt || now,
    followupBy: lead.owner,
    followupType: 'import',
    concern: lead.latestConcern,
    communicationNote: lead.latestConclusion,
    statusAfter: lead.rawStatus,
    conclusion: lead.latestConclusion,
    nextFollowupAt: lead.nextFollowupAt,
    nextAction: lead.nextAction,
    createdAt: now,
    updatedAt: now
  };
}

function nameCandidates(lead) {
  return [cleanText(lead.displayName), cleanText(lead.wechatName)].filter(Boolean);
}

function matchStudent(lead, students) {
  if (lead.phone) {
    const found = students.find((row) => normalizePhone(row.phone) === lead.phone);
    if (found) return found.id;
  }
  const names = nameCandidates(lead);
  const found = students.find((row) => names.includes(cleanText(row.name)));
  return found ? found.id : '';
}

function matchCourt(lead, courts) {
  if (lead.phone) {
    const found = courts.find((row) => normalizePhone(row.phone) === lead.phone);
    if (found) return found.id;
  }
  const names = nameCandidates(lead);
  const found = courts.find((row) => names.includes(cleanText(row.name)));
  return found ? found.id : '';
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV 不存在：${CSV_PATH}`);
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csvText);
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) throw new Error('未识别到线索表头');
  const { header, startIndex } = buildHeader(rows, headerIndex);
  const missing = REQUIRED_COLUMNS.filter((col) => !header.includes(col));
  if (missing.length) throw new Error(`缺少字段：${missing.join('、')}`);

  const rawRows = rows
    .slice(startIndex)
    .filter((row) => row.some((cell) => cleanText(cell)))
    .map((row) => {
      const item = {};
      REQUIRED_COLUMNS.forEach((col) => {
        item[col] = row[header.indexOf(col)] || '';
      });
      return item;
    });
  console.log(`[parse] raw rows ${rawRows.length}`);

  const [students, courts] = await Promise.all([scan(T_STUDENTS), scan(T_COURTS)]);

  const normalized = [];
  const seen = new Set();
  for (const raw of rawRows) {
    const lead = normalizeLead(raw);
    lead.studentId = matchStudent(lead, students);
    lead.courtId = matchCourt(lead, courts);
    lead.isCourseConverted = !!lead.studentId;
    lead.isCourtConverted = !!lead.courtId;
    lead.systemStatus = deriveSystemStatus(lead);
    const key = buildDedupKey(lead);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(lead);
  }
  console.log(`[parse] deduped rows ${normalized.length}`);

  const cleared = {
    leads: await clearTable(T_LEADS),
    followups: await clearTable(T_LEAD_FOLLOWUPS),
    batches: await clearTable(T_LEAD_IMPORT_BATCHES)
  };

  let importedFollowups = 0;
  let importedLeads = 0;
  for (const lead of normalized) {
    await put(T_LEADS, lead.id, lead);
    const followup = buildInitialFollowup(lead);
    await put(T_LEAD_FOLLOWUPS, followup.id, followup);
    importedFollowups += 1;
    importedLeads += 1;
    if (importedLeads % 25 === 0 || importedLeads === normalized.length) console.log(`[import] ${importedLeads}/${normalized.length}`);
  }

  const batchRecord = {
    id: 'standalone-reimport-' + Date.now(),
    importedAt: new Date().toISOString(),
    sourceFile: CSV_PATH,
    leadCount: normalized.length,
    followupCount: importedFollowups,
    summary: {
      rawRows: rawRows.length,
      dedupedRows: normalized.length
    }
  };
  await put(T_LEAD_IMPORT_BATCHES, batchRecord.id, batchRecord);

  const [finalLeads, finalFollowups, finalBatches] = await Promise.all([
    scan(T_LEADS),
    scan(T_LEAD_FOLLOWUPS),
    scan(T_LEAD_IMPORT_BATCHES)
  ]);

  console.log(JSON.stringify({
    sourceFile: CSV_PATH,
    rawRows: rawRows.length,
    importedRows: normalized.length,
    autoLinkedStudents: normalized.filter((row) => row.studentId).length,
    autoLinkedCourts: normalized.filter((row) => row.courtId).length,
    cleared,
    final: {
      leads: finalLeads.length,
      followups: finalFollowups.length,
      batches: finalBatches.length
    }
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
