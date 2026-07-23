#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow
} = require('./lib/staging-data-store');
const {
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');

dotenv.config();

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const OPERATION_ID = 'repair-confirmed-schedule-field-gaps-20260723';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_PATH = path.join(
  __dirname,
  '..',
  'offline-reports',
  `${OPERATION_ID}-${process.argv.includes('--write') ? 'write' : 'dry-run'}.json`
);

const TABLES = {
  schedule: 'ft_schedule',
  ledger: 'ft_entitlement_ledger',
  entitlements: 'ft_entitlements'
};

const COACHES = {
  liuruyang: { coach: '刘润扬教练', coachId: 'c69e1bae-1d14-4be3-bb61-64755e4ccd55' },
  yang: { coach: '杨教练', coachId: 'c1eda306-b188-43cb-8800-aa1fbb45b97f' },
  chaojun: { coach: '朝珺教练', coachId: 'ac664799-5944-48ce-b1cc-1e60bf0982de' },
  xiaozhe: { coach: '晓哲教练', coachId: 'f3d2f47c-3658-49b8-8057-62978efb382e' },
  wu: { coach: '吴教练', coachId: '628e3b01-820e-4bbe-892c-3683876cc630' },
  linming: { coach: '林铭教练', coachId: '0778a6ed-4f8a-4b6e-b2f3-5494a4f3f0ba' },
  yuekezhou: { coach: '岳克舟教练', coachId: 'ab068ad7-58db-4eb3-909a-692b04662ffc' }
};

const CAMPUS_MAPO = 'mabao';

const DEFERRED_SCHEDULE_IDS = new Set([
  'cxe-thirdparty-202606-schedule-472cf8f55217',
  'cxe-thirdparty-202606-schedule-2528ffc3d0e1'
]);

const SCHEDULE_UPDATES = [
  { id: 'repair-schedule-aisi-20260409-1900', patch: { campus: CAMPUS_MAPO } },
  { id: 'repair-smallclass-20260507-1900', patch: { campus: CAMPUS_MAPO } },
  { id: 'repair-smallclass-20260514-1900', patch: { campus: CAMPUS_MAPO } },
  { id: 'repair-smallclass-20260521-1900', patch: { campus: CAMPUS_MAPO } },
  { id: 'repair-smallclass-20260604-1900', patch: { campus: CAMPUS_MAPO } },
  {
    id: 'repair-smallclass-20260416-1900',
    patch: {
      ...COACHES.xiaozhe,
      campus: CAMPUS_MAPO,
      venue: '4号场',
      notes: '按用户确认：随到随学小班课；樊先生临时取消，不退款'
    }
  },
  {
    id: 'cxe-thirdparty-202606-schedule-53514df52744',
    patch: {
      ...COACHES.wu,
      campus: CAMPUS_MAPO,
      venue: '3号场',
      studentName: '袁冶',
      studentIds: ['seed-student-033'],
      expectedStudentIds: ['seed-student-033'],
      courseType: '私教课',
      standardCourseType: '私教课'
    }
  },
  {
    id: 'cxe-thirdparty-202606-schedule-b68d48d67456',
    patch: { ...COACHES.chaojun, campus: CAMPUS_MAPO }
  },
  {
    id: 'repair-yangziyi-20260612-1100',
    patch: { ...COACHES.linming, campus: CAMPUS_MAPO }
  },
  {
    id: 'repair-yangziyi-20260616-0900',
    patch: { ...COACHES.linming, campus: CAMPUS_MAPO }
  },
  {
    id: 'repair-smallclass-20260709-1900',
    patch: { ...COACHES.yuekezhou, campus: CAMPUS_MAPO }
  },
  {
    id: 'cxe-thirdparty-schedule-107-286eb50c0fc4',
    patch: { ...COACHES.chaojun, campus: CAMPUS_MAPO }
  },
  {
    id: 'repair-smallclass-20260719-1000',
    patch: { ...COACHES.liuruyang, campus: CAMPUS_MAPO }
  },
  {
    id: 'repair-zijie-20260723-0830',
    patch: { ...COACHES.liuruyang, campus: CAMPUS_MAPO, venue: '2号场' }
  },
  {
    id: 'repair-zhanghaoran-20260723-1730',
    patch: {
      ...COACHES.yang,
      campus: CAMPUS_MAPO,
      venue: '3号场',
      startTime: '2026-07-22 17:30',
      endTime: '2026-07-22 19:30'
    }
  },
  {
    id: 'repair-schedule-ai-20260724-1500',
    patch: { campus: CAMPUS_MAPO }
  }
];

const LEDGER_UPDATES = [
  {
    id: 'repair-ledger-zhanghaoran-20260723',
    patch: {
      relatedDate: '2026-07-22',
      sourceDate: '2026-07-22',
      notes: '按用户确认：真实上课日期为2026-07-22，扣第8和第9节'
    }
  }
];

const DELETE_SCHEDULE_IDS = ['repair-mmjuan-20260724-2000'];
const DELETE_LEDGER_IDS = ['repair-ledger-mmjuan-20260724'];
const MMJUAN_ENTITLEMENT_ID = '85620ad1-9d85-45ca-bbb9-eedd31a5bba8';

function parseArgs(argv = process.argv.slice(2)) {
  return { write: argv.includes('--write') };
}

function byId(rows) {
  return new Map(rows.map(row => [String(row.id || ''), row]));
}

function mustGet(map, id, label) {
  const row = map.get(id);
  if (!row) throw new Error(`找不到${label}: ${id}`);
  return row;
}

function withTrace(row, now, repairReason) {
  return {
    ...row,
    updatedAt: now,
    operationAt: now,
    operationBy: 'Codex',
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: 'confirmed-schedule-field-gap-repair',
    repairReason
  };
}

function buildPlan(data, now = new Date().toISOString()) {
  const schedules = byId(data.schedules);
  const ledgers = byId(data.ledgers);
  const entitlements = byId(data.entitlements);
  const blockers = [];

  for (const item of SCHEDULE_UPDATES) {
    if (DEFERRED_SCHEDULE_IDS.has(item.id)) blockers.push({ id: item.id, reason: '暂缓项不允许进入本批次' });
  }
  for (const id of DELETE_SCHEDULE_IDS) {
    if (DEFERRED_SCHEDULE_IDS.has(id)) blockers.push({ id, reason: '暂缓项不允许进入本批次' });
  }

  const putSchedules = SCHEDULE_UPDATES.map(item => {
    const before = mustGet(schedules, item.id, '排课');
    const after = withTrace(
      { ...before, ...item.patch },
      now,
      '按用户确认修正排课校区/教练/场地/日期字段'
    );
    return { id: item.id, before, after };
  });

  const putLedgers = LEDGER_UPDATES.map(item => {
    const before = mustGet(ledgers, item.id, '扣课流水');
    const after = withTrace(
      { ...before, ...item.patch },
      now,
      '按用户确认修正扣课流水日期'
    );
    return { id: item.id, before, after };
  });

  const deleteSchedules = DELETE_SCHEDULE_IDS.map(id => ({ id, before: mustGet(schedules, id, '待删除排课') }));
  const deleteLedgers = DELETE_LEDGER_IDS.map(id => ({ id, before: mustGet(ledgers, id, '待删除扣课流水') }));

  const mmjuanBefore = mustGet(entitlements, MMJUAN_ENTITLEMENT_ID, 'MMJUAN课包权益');
  if (Number(mmjuanBefore.usedLessons) !== 2 || Number(mmjuanBefore.remainingLessons) !== 8) {
    blockers.push({
      id: MMJUAN_ENTITLEMENT_ID,
      reason: 'MMJUAN课包当前余额与预期不一致，停止写入',
      actual: { usedLessons: mmjuanBefore.usedLessons, remainingLessons: mmjuanBefore.remainingLessons },
      expected: { usedLessons: 2, remainingLessons: 8 }
    });
  }
  const putEntitlements = [{
    id: MMJUAN_ENTITLEMENT_ID,
    before: mmjuanBefore,
    after: withTrace(
      {
        ...mmjuanBefore,
        usedLessons: 1,
        remainingLessons: 9,
        status: 'active'
      },
      now,
      '按用户确认删除2026-07-24误补课程后恢复1节课包余额'
    )
  }];

  return {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    blockers,
    summary: {
      putSchedules: putSchedules.length,
      putLedgers: putLedgers.length,
      deleteSchedules: deleteSchedules.length,
      deleteLedgers: deleteLedgers.length,
      putEntitlements: putEntitlements.length,
      deferredScheduleIds: [...DEFERRED_SCHEDULE_IDS]
    },
    putSchedules,
    putLedgers,
    deleteSchedules,
    deleteLedgers,
    putEntitlements
  };
}

function serializePlan(plan, target, write) {
  return {
    operationId: plan.operationId,
    batchId: plan.batchId,
    generatedAt: plan.generatedAt,
    write,
    target,
    summary: plan.summary,
    blockers: plan.blockers,
    putSchedules: plan.putSchedules.map(item => ({
      id: item.id,
      before: item.before,
      after: item.after
    })),
    putLedgers: plan.putLedgers.map(item => ({
      id: item.id,
      before: item.before,
      after: item.after
    })),
    deleteSchedules: plan.deleteSchedules,
    deleteLedgers: plan.deleteLedgers,
    putEntitlements: plan.putEntitlements.map(item => ({
      id: item.id,
      before: item.before,
      after: item.after
    }))
  };
}

async function main() {
  const args = parseArgs();
  const target = await assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: REPORT_PATH });

  const client = createClientFromEnv();
  const [schedules, ledgers, entitlements] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.ledger),
    scanTable(client, TABLES.entitlements)
  ]);
  const plan = buildPlan({ schedules, ledgers, entitlements });
  const report = serializePlan(plan, target, args.write);

  if (plan.blockers.length) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    throw new Error(`存在阻断项，已写报告: ${REPORT_PATH}`);
  }

  if (args.write) {
    for (const item of plan.putSchedules) await putRow(client, TABLES.schedule, item.after);
    for (const item of plan.putLedgers) await putRow(client, TABLES.ledger, item.after);
    for (const item of plan.deleteSchedules) await deleteRow(client, TABLES.schedule, item.id);
    for (const item of plan.deleteLedgers) await deleteRow(client, TABLES.ledger, item.id);
    for (const item of plan.putEntitlements) await putRow(client, TABLES.entitlements, item.after);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    write: args.write,
    reportPath: REPORT_PATH,
    summary: plan.summary,
    target
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
