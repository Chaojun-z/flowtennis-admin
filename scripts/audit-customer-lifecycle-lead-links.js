#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { createClientFromEnv, scanTable } = require('./lib/staging-data-store');
const { buildCustomerLifecycleRows, sourceLeadId } = require('../server/read-models/customer-lifecycle.js');
const { buildLeadPoolRows } = require('../server/read-models/platform-metrics.js');

const ROOT = path.join(__dirname, '..');
const TABLES = {
  leads: 'ft_leads',
  students: 'ft_students',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  schedule: 'ft_schedule',
  courts: 'ft_courts',
  membershipAccounts: 'ft_membership_accounts',
  membershipOrders: 'ft_membership_orders'
};

function id(row = {}) {
  return String(row.id || row.leadId || '').trim();
}

function rowKind(row = {}) {
  if (row.studentId) return 'student';
  if (row.membershipAccountId) return 'membership';
  if (row.courtId) return 'court';
  return 'lead';
}

function missingSourceRows(rows = []) {
  return (rows || []).filter(row => !sourceLeadId(row)).map(row => ({ id: id(row), name: row.name || row.displayName || row.courtName || '', phone: row.phone || '', kind: rowKind(row) }));
}

function brokenSourceRows(rows = [], leadIds = new Set()) {
  return (rows || [])
    .filter(row => sourceLeadId(row) && !leadIds.has(sourceLeadId(row)))
    .map(row => ({ id: id(row), sourceLeadId: sourceLeadId(row), name: row.name || row.displayName || row.courtName || '', kind: rowKind(row) }));
}

function buildLifecycleLeadLinkAudit(source = {}) {
  const leads = source.leads || [];
  const leadIds = new Set(leads.map(id).filter(Boolean));
  const customerLifecycleRows = buildCustomerLifecycleRows(source);
  const leadPoolRows = buildLeadPoolRows({ leads, customerLifecycleRows });
  const syntheticLeadRows = leadPoolRows.filter(row => row.isLifecycleSynthetic);
  const syntheticByKind = syntheticLeadRows.reduce((acc, row) => {
    const kind = rowKind(row);
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});

  return {
    write: false,
    counts: {
      rawLeads: leads.length,
      lifecycleCustomers: customerLifecycleRows.length,
      leadPoolRows: leadPoolRows.length,
      syntheticLeadRows: syntheticLeadRows.length,
      syntheticStudents: syntheticByKind.student || 0,
      syntheticCourts: syntheticByKind.court || 0,
      syntheticMemberships: syntheticByKind.membership || 0
    },
    missingSourceLeadId: {
      students: missingSourceRows(source.students || []),
      courts: missingSourceRows(source.courts || []),
      membershipAccounts: missingSourceRows(source.membershipAccounts || []),
      membershipOrders: missingSourceRows(source.membershipOrders || [])
    },
    brokenSourceLeadId: {
      students: brokenSourceRows(source.students || [], leadIds),
      courts: brokenSourceRows(source.courts || [], leadIds),
      membershipAccounts: brokenSourceRows(source.membershipAccounts || [], leadIds),
      membershipOrders: brokenSourceRows(source.membershipOrders || [], leadIds)
    },
    plannedLeadCreates: syntheticLeadRows.map(row => ({
      customerKey: row.customerKey || row.id,
      kind: rowKind(row),
      displayName: row.displayName || row.name || '',
      phone: row.phone || '',
      source: row.source || '未知',
      campus: row.campus || row.campusName || '',
      owner: row.owner || '',
      studentId: row.studentId || '',
      courtId: row.courtId || '',
      membershipAccountId: row.membershipAccountId || ''
    }))
  };
}

async function readSource(client) {
  const entries = await Promise.all(Object.entries(TABLES).map(async ([key, table]) => [key, await scanTable(client, table).catch(() => [])]));
  return Object.fromEntries(entries);
}

async function main() {
  dotenv.config({ path: path.join(ROOT, '.env') });
  const client = createClientFromEnv();
  const source = await readSource(client);
  const audit = buildLifecycleLeadLinkAudit(source);
  console.log(JSON.stringify(audit, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  buildLifecycleLeadLinkAudit
};
