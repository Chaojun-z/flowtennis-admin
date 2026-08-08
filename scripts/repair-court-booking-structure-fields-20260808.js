#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');
const { enrichCourtBookingStructure, missingCourtBookingStructure } = require('../server/booking-structure-parser.js');

const ROOT = path.join(__dirname, '..');
const TABLES = { courts: 'ft_courts' };
const OPERATION_ID = 'repair-court-booking-structure-fields-20260808';
const BATCH_ID = `batch-${OPERATION_ID}`;

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env'), override: true });
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function text(value) {
  return String(value || '').trim();
}

function isRepairableBookingHistory(row = {}) {
  if (text(row.type || '消费') !== '消费') return false;
  const category = text(row.category || row.businessTypeLevel2);
  if (/内部占用|畅打|穿线|私教课|课程/.test(category)) return false;
  if (/订场|发球机|陪打/.test(category)) return true;
  if (/储值扣款|现场收款|代用户订场/.test(text(row.revenueBucket))) return true;
  return false;
}

function changedFields(before = {}, after = {}) {
  return ['date', 'occurredDate', 'startTime', 'endTime', 'venue']
    .filter(key => text(before[key]) !== text(after[key]));
}

function hasMissingStoredBookingStructure(row = {}) {
  return !text(row.date || row.occurredDate || row.businessDate || row.bookingDate)
    || !text(row.startTime)
    || !text(row.endTime)
    || !text(row.venue);
}

function repairHistoryRow(row = {}, now = new Date().toISOString()) {
  if (!isRepairableBookingHistory(row)) return { row, changed: false, fields: [] };
  if (!hasMissingStoredBookingStructure(row)) return { row, changed: false, fields: [] };
  const enriched = enrichCourtBookingStructure(row);
  if (missingCourtBookingStructure(enriched)) return { row, changed: false, fields: [] };
  const fields = changedFields(row, enriched);
  if (!fields.length) return { row, changed: false, fields: [] };
  return {
    row: {
      ...enriched,
      structureRepairOperationId: OPERATION_ID,
      structureRepairBatchId: BATCH_ID,
      structureRepairAt: now,
      structureRepairFields: fields
    },
    changed: true,
    fields
  };
}

function buildPlan(courts = [], now = new Date().toISOString()) {
  const updates = [];
  const unresolved = [];
  let repairableHistoryCount = 0;
  let missingBefore = 0;
  let repairedHistoryCount = 0;

  for (const court of courts || []) {
    const history = parseArr(court.history);
    let changed = false;
    const repairedHistory = history.map(row => {
      if (!isRepairableBookingHistory(row)) return row;
      repairableHistoryCount += 1;
      if (!hasMissingStoredBookingStructure(row)) return row;
      missingBefore += 1;
      const repaired = repairHistoryRow(row, now);
      if (!repaired.changed) {
        unresolved.push({
          courtId: court.id,
          historyId: row.id || '',
          date: row.date || row.occurredDate || row.businessDate || '',
          category: row.category || '',
          note: text(row.note).slice(0, 160)
        });
        return row;
      }
      repairedHistoryCount += 1;
      changed = true;
      return repaired.row;
    });
    if (changed) {
      updates.push({
        id: court.id,
        before: court,
        after: { ...court, history: repairedHistory, updatedAt: now },
        repairedHistoryCount: repairedHistory.filter(row => text(row.structureRepairOperationId) === OPERATION_ID).length
      });
    }
  }

  return {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    repairableHistoryCount,
    missingBefore,
    repairedHistoryCount,
    unresolvedCount: unresolved.length,
    courtWrites: updates.length,
    updates,
    unresolved
  };
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseWriteFlags(argv);
  const now = deps.now || new Date().toISOString();
  const reportPath = deps.reportPath || path.join(ROOT, 'offline-reports', 'court-booking-structure-repair', `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  const loadEnvironment = deps.loadEnv || loadEnv;
  const assertTarget = deps.assertProductionWriteTarget || assertProductionWriteTarget;
  const createClient = deps.createClientFromEnv || createClientFromEnv;
  const scan = deps.scanTable || scanTable;
  const write = deps.putRow || putRow;

  loadEnvironment();
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertTarget();
  const client = createClient();
  const courts = await scan(client, TABLES.courts);
  const plan = buildPlan(courts, now);
  const report = { mode: args.write ? 'write' : 'dry-run', target, reportPath, ...plan };
  writeReport(report, reportPath);

  if (args.write) {
    for (const update of plan.updates) await write(client, TABLES.courts, update.after);
  }

  const summary = {
    ok: true,
    mode: report.mode,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    reportPath,
    target,
    repairableHistoryCount: plan.repairableHistoryCount,
    missingBefore: plan.missingBefore,
    repairedHistoryCount: plan.repairedHistoryCount,
    unresolvedCount: plan.unresolvedCount,
    courtWrites: plan.courtWrites
  };
  console.log(JSON.stringify(summary, null, 2));
  return { summary, report };
}

if (require.main === module) {
  run().catch(err => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  isRepairableBookingHistory,
  hasMissingStoredBookingStructure,
  repairHistoryRow,
  buildPlan,
  run
};
