#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const { createClientFromEnv, getRow, putRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const SOURCE_REPORT = path.join(ROOT, 'offline-reports', 'notify-error-trial-audience-mini-write-dry-run-20260822.json');
const WRITE_REPORT = path.join(ROOT, 'offline-reports', 'notify-error-trial-audience-mini-write-20260822-write.json');
const POST_DRY_RUN_REPORT = path.join(ROOT, 'offline-reports', 'notify-error-trial-audience-mini-write-20260822-post-write-dry-run.json');
const OPERATION_ID = 'notify-error-trial-audience-mini-write-20260822';
const REQUIRED_INSTANCE = 'flowtennis-ue';
const REQUIRED_ENDPOINT = 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com';

const TABLES = {
  leads: 'ft_leads',
  students: 'ft_students',
  schedule: 'ft_schedule',
  sync: 'ft_feishu_schedule_sync'
};

const EXISTING = {
  Ethan: { leadId: '05954eae-0601-4b90-ad1f-7b2117f9193a' },
  rzwyyy: { leadId: '95942914-38cb-45d4-b1a8-267b92024f6c', studentId: 'new-student-2d6eb2c4ebe3' },
  '拾柒': { leadId: 'd2397e85-4daa-4162-966d-151ab246f822' },
  '揭静': { leadId: '8d2f8e10-3651-45c9-8d07-650817d908ad' },
  '雯': { leadId: 'db6eb536-0659-447c-a261-129d92c5ccdf' },
  '+++++': { leadId: '1ab4ff8e-d4f9-42df-b1e3-1fd0df62a619' },
  '陈鹭': { leadId: 'lead-from-student-dd33361c-5c42-4f91-92ee-e6138df7d4b5', studentId: 'dd33361c-5c42-4f91-92ee-e6138df7d4b5' },
  'Cc Z': { leadId: 'new-lead-cce87d10b3fa' },
  'Golden.Z™': { leadId: 'lead-from-student-82dde631-d23b-4617-934f-b4aaddf87521', studentId: '82dde631-d23b-4617-934f-b4aaddf87521' },
  'Yee.': { leadId: '9b865b04-c07a-4229-910d-7577fd0b9be6' },
  '吃很多饭': { leadId: '6b1be3d7-d56f-44bc-b8f6-46e9b4baa556' },
  '开心': { leadId: 'new-lead-30a05fc3f3e8' },
  '吃糖的麻花': { leadId: '841fc853-c96e-4a9c-8ed1-fd22e94c7399' },
  '艾斯': { leadId: 'bc32c309-60e3-4600-bae6-0505bfcaf250', studentId: 'new-student-9f2faf5f3ee4' },
  '骅凭': { leadId: 'af7e692d-cd01-404c-ad34-211c1a9ae359', studentId: '4d21b352-9533-4f78-9373-75a3c56f093e' }
};

const SCHEDULE_IDS = {
  1: 'notify-trial-mini-20260406-1700',
  3: 'notify-trial-mini-20260504-1400',
  5: 'notify-trial-mini-20260507-2000',
  6: 'repair-smallclass-20260514-1900',
  11: 'cxe-thirdparty-202606-schedule-abdaf95644b4',
  14: 'cxe-thirdparty-202606-schedule-a24372bbdaa0',
  15: 'cxe-thirdparty-202606-schedule-e44e651c8075',
  17: 'repair-smallclass-20260709-1900',
  18: 'notify-trial-mini-20260718-1300'
};

function text(value) {
  return String(value ?? '').trim();
}

function hash(value, len = 24) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, len);
}

function trace(row, reason) {
  const now = new Date().toISOString();
  return {
    ...row,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: `batch-${OPERATION_ID}`,
    operationType: OPERATION_ID,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: reason
  };
}

function ensureLocalTarget() {
  if (text(process.cwd()) !== ROOT) {
    throw new Error(`停止：当前目录必须是 ${ROOT}`);
  }
  if (text(process.env.TS_INSTANCE) !== REQUIRED_INSTANCE) {
    throw new Error(`停止：TS_INSTANCE 不是 ${REQUIRED_INSTANCE}`);
  }
  if (text(process.env.TS_ENDPOINT) !== REQUIRED_ENDPOINT) {
    throw new Error(`停止：TS_ENDPOINT 不匹配生产实例`);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    write: argv.includes('--write'),
    reportIndex: argv.indexOf('--report')
  };
}

function newLeadId(sourceKey, name) {
  return `notify-trial-mini-lead-${hash([sourceKey, name].join('|'))}`;
}

function newStudentId(sourceKey, name) {
  return `notify-trial-mini-student-${hash([sourceKey, name].join('|'))}`;
}

function scheduleIdFor(sourceNo, sourceKey) {
  return SCHEDULE_IDS[sourceNo] || `notify-trial-mini-schedule-${hash(sourceKey)}`;
}

function syncIdFor(sourceKey) {
  return `notify-trial-mini-sync-${hash(sourceKey)}`;
}

function normalizeRows(sourceRows) {
  return sourceRows.map((item) => {
    const leadStudent = item['飞书学员原文'];
    const sourceNo = item.sourceNo;
    const sourceKey = item.source?.sourceKey || '';
    const scheduleId = scheduleIdFor(sourceNo, sourceKey);
    const syncId = syncIdFor(sourceKey);
    const baseIds = [];

    if (sourceNo === 1) {
      baseIds.push(EXISTING.Ethan.leadId, EXISTING.rzwyyy.studentId);
    } else if (sourceNo === 3) {
      baseIds.push(EXISTING['拾柒'].leadId, EXISTING['揭静'].leadId, EXISTING['雯'].leadId);
    } else if (sourceNo === 5) {
      baseIds.push(EXISTING['+++++'].leadId);
    } else if (sourceNo === 6) {
      baseIds.push(
        newStudentId(sourceKey, 'one1'),
        EXISTING['陈鹭'].studentId,
        EXISTING['Cc Z'].leadId,
        EXISTING['Golden.Z™'].studentId
      );
    } else if (sourceNo === 11) {
      baseIds.push(EXISTING['Yee.'].leadId);
    } else if (sourceNo === 14) {
      baseIds.push(EXISTING['吃很多饭'].leadId, newStudentId(sourceKey, '吃很多饭朋友'));
    } else if (sourceNo === 15) {
      baseIds.push(EXISTING['开心'].leadId, newStudentId(sourceKey, '开心朋友'));
    } else if (sourceNo === 17) {
      baseIds.push(EXISTING['吃糖的麻花'].leadId, EXISTING['艾斯'].studentId);
    } else if (sourceNo === 18) {
      baseIds.push(EXISTING['骅凭'].studentId, newStudentId(sourceKey, '骅凭朋友'));
    }

    const studentIds = [...new Set(baseIds.filter(Boolean))];
    const firstId = studentIds[0] || '';
    const firstLeadName = String(leadStudent || '').split(/[、,，]/)[0] || '';

    return {
      ...item,
      scheduleId,
      syncId,
      studentIds,
      sourceLeadId: sourceNo === 6 ? newLeadId(sourceKey, 'one1') : firstId,
      sourceLeadName: firstLeadName,
      schedule: {
        id: scheduleId,
        sourceKey,
        startTime: `${item['日期']} ${item['时间段'].split('-')[0]}`,
        endTime: `${item['日期']} ${item['时间段'].split('-')[1]}`,
        studentName: item['飞书学员原文'],
        studentIds,
        expectedStudentIds: studentIds,
        absentStudentIds: [],
        courseType: '体验课',
        standardCourseType: item['飞书课程原文'],
        courseDisplayName: item['飞书课程原文'],
        courseTypeLevel2: item['飞书课程原文'],
        experienceType: '成人',
        coach: item['教练'],
        venue: item['场地'],
        campus: 'shunyi_mapo',
        status: '已排课',
        notifyStatus: '未通知',
        confirmStatus: '待确认',
        scheduleSource: 'feishu-sheet',
        sourceLeadId: sourceNo === 6 ? newLeadId(sourceKey, 'one1') : firstId,
        sourceLeadName: firstLeadName,
        actualStudentCount: studentIds.length,
        notes: 'notify-error-trial-audience 最小写入'
      }
    };
  });
}

function buildNewLead(item, name, type = '成人') {
  const leadId = newLeadId(item.sourceKey, name);
  return trace({
    id: leadId,
    name,
    displayName: name,
    wechatName: name,
    phone: '',
    source: '飞书排课表历史修复',
    campus: 'shunyi_mapo',
    customerType: type,
    demandProduct: '私教体验课',
    consultType: '私教体验课',
    rawStatus: '已体验待成交',
    systemStatus: '已体验待成交',
    leadStage: '已体验待成交',
    status: 'active',
    dealType: '课程',
    conversionType: '课程',
    convertedProducts: ['私教体验课'],
    trialAtRaw: item['日期'] + ' 00:00',
    sourceKey: item.sourceKey
  }, `补建${name}线索`);
}

function buildNewStudent(item, name, type = '成人', coach = '') {
  const studentId = newStudentId(item.sourceKey, name);
  const leadId = newLeadId(item.sourceKey, name);
  return trace({
    id: studentId,
    name,
    studentName: name,
    displayName: name,
    phone: '',
    campus: 'shunyi_mapo',
    type,
    primaryCoach: coach,
    source: '飞书排课表历史修复',
    sourceLeadId: leadId,
    status: 'active',
    notes: '最小写入补建学员档案',
    sourceKey: item.sourceKey
  }, `补建${name}学员`);
}

async function readReport() {
  const source = JSON.parse(fs.readFileSync(SOURCE_REPORT, 'utf8'));
  if (!source || !source.summary || Number(source.summary.blockedCount || 0) !== 0) {
    throw new Error('停止：dry-run 报告存在阻断');
  }
  const rows = Array.isArray(source.items) ? source.items : [];
  if (rows.length !== 9) {
    throw new Error(`停止：dry-run 报告条数不对，当前 ${rows.length}`);
  }
  return normalizeRows(rows);
}

async function writePlan(client, plan) {
  const now = new Date().toISOString();
  const writeRows = [];
  for (const item of plan) {
    if (item.sourceNo === 6) {
      writeRows.push({ table: TABLES.leads, row: buildNewLead(item, 'one1') });
      writeRows.push({ table: TABLES.students, row: buildNewStudent(item, 'one1', '成人', item['教练']) });
    } else if (item.sourceNo === 14) {
      writeRows.push({ table: TABLES.leads, row: buildNewLead(item, '吃很多饭朋友') });
      writeRows.push({ table: TABLES.students, row: buildNewStudent(item, '吃很多饭朋友', '成人', item['教练']) });
    } else if (item.sourceNo === 15) {
      writeRows.push({ table: TABLES.leads, row: buildNewLead(item, '开心朋友') });
      writeRows.push({ table: TABLES.students, row: buildNewStudent(item, '开心朋友', '成人', item['教练']) });
    } else if (item.sourceNo === 18) {
      writeRows.push({ table: TABLES.leads, row: buildNewLead(item, '骅凭朋友') });
      writeRows.push({ table: TABLES.students, row: buildNewStudent(item, '骅凭朋友', '成人', item['教练']) });
    }

    writeRows.push({ table: TABLES.schedule, row: trace(item.schedule, '写入排课记录') });
    writeRows.push({
      table: TABLES.sync,
      row: trace({
        id: item.syncId,
        source: 'feishu-sheet',
        sourceKey: item.sourceKey,
        scheduleId: item.scheduleId,
        startTime: item.schedule.startTime,
        endTime: item.schedule.endTime,
        status: 'active',
        createdAt: now,
        lastSyncedAt: now
      }, '写入飞书同步关系')
    });
  }

  for (const entry of writeRows) {
    await putRow(client, entry.table, entry.row);
  }
  return writeRows;
}

async function buildPostDryRun(client, plan) {
  const items = [];
  const blockers = [];
  for (const item of plan) {
    const schedule = await getRow(client, TABLES.schedule, item.scheduleId);
    const sync = await getRow(client, TABLES.sync, item.syncId);
    if (!schedule) blockers.push({ sourceNo: item.sourceNo, reason: '排课未写入' });
    if (!sync) blockers.push({ sourceNo: item.sourceNo, reason: '飞书同步未写入' });
    if (item.sourceNo === 6) {
      if (!(await getRow(client, TABLES.leads, newLeadId(item.sourceKey, 'one1')))) blockers.push({ sourceNo: item.sourceNo, reason: 'one1 线索未写入' });
      if (!(await getRow(client, TABLES.students, newStudentId(item.sourceKey, 'one1')))) blockers.push({ sourceNo: item.sourceNo, reason: 'one1 学员未写入' });
    }
    if (item.sourceNo === 14) {
      if (!(await getRow(client, TABLES.leads, newLeadId(item.sourceKey, '吃很多饭朋友')))) blockers.push({ sourceNo: item.sourceNo, reason: '吃很多饭朋友 线索未写入' });
      if (!(await getRow(client, TABLES.students, newStudentId(item.sourceKey, '吃很多饭朋友')))) blockers.push({ sourceNo: item.sourceNo, reason: '吃很多饭朋友 学员未写入' });
    }
    if (item.sourceNo === 15) {
      if (!(await getRow(client, TABLES.leads, newLeadId(item.sourceKey, '开心朋友')))) blockers.push({ sourceNo: item.sourceNo, reason: '开心朋友 线索未写入' });
      if (!(await getRow(client, TABLES.students, newStudentId(item.sourceKey, '开心朋友')))) blockers.push({ sourceNo: item.sourceNo, reason: '开心朋友 学员未写入' });
    }
    if (item.sourceNo === 18) {
      if (!(await getRow(client, TABLES.leads, newLeadId(item.sourceKey, '骅凭朋友')))) blockers.push({ sourceNo: item.sourceNo, reason: '骅凭朋友 线索未写入' });
      if (!(await getRow(client, TABLES.students, newStudentId(item.sourceKey, '骅凭朋友')))) blockers.push({ sourceNo: item.sourceNo, reason: '骅凭朋友 学员未写入' });
    }
    items.push({
      sourceNo: item.sourceNo,
      日期: item['日期'],
      时间段: item['时间段'],
      场地: item['场地'],
      教练: item['教练'],
      飞书学员原文: item['飞书学员原文'],
      飞书课程原文: item['飞书课程原文'],
      排课: !!schedule,
      同步: !!sync
    });
  }
  return { items, blockers };
}

async function main() {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  ensureLocalTarget();
  const args = parseArgs();
  const plan = await readReport();
  const client = createClientFromEnv();
  const reportPath = args.reportIndex >= 0 && process.argv[args.reportIndex + 1]
    ? path.resolve(process.argv[args.reportIndex + 1])
    : (args.write ? WRITE_REPORT : POST_DRY_RUN_REPORT);
  const now = new Date().toISOString();

  if (args.write) {
    await assertProductionWriteTarget();
    const wrote = await writePlan(client, plan);
    const report = {
      ok: true,
      dryRunOnly: false,
      writePerformed: true,
      operationId: OPERATION_ID,
      generatedAt: now,
      sourceReport: path.relative(ROOT, SOURCE_REPORT),
      summary: {
        sourceCount: plan.length,
        writtenCount: 9,
        skippedCount: 0,
        blockedCount: 0,
        tablesTouched: [...new Set(wrote.map(item => item.table))]
      },
      written: wrote.map(item => ({
        table: item.table,
        id: item.row.id,
        sourceKey: item.row.sourceKey || ''
      })),
      blockers: []
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ reportPath, summary: report.summary }, null, 2));
    return;
  }

  const post = await buildPostDryRun(client, plan);
  const report = {
    ok: true,
    dryRunOnly: true,
    writePerformed: false,
    operationId: OPERATION_ID,
    generatedAt: now,
    sourceReport: path.relative(ROOT, SOURCE_REPORT),
    summary: {
      sourceCount: plan.length,
      canWriteCount: post.blockers.length ? 0 : plan.length,
      blockedCount: post.blockers.length,
      tablesTouched: ['ft_leads', 'ft_students', 'ft_schedule', 'ft_feishu_schedule_sync']
    },
    items: post.items,
    blockers: post.blockers
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath, summary: report.summary }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
