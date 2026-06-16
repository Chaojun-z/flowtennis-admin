#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ALLOWLIST_PATH = path.join(ROOT, 'config', 'dependency-audit-allowlist.json');
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function advisoryKey(via) {
  if (typeof via === 'string') return via;
  return String(via.url || via.source || via.name || '').trim();
}

function blockingViaKeys(vulnerability) {
  return (vulnerability.via || [])
    .filter((item) => typeof item === 'string' || BLOCKING_SEVERITIES.has(String(item.severity || '').toLowerCase()))
    .map(advisoryKey)
    .filter(Boolean);
}

function isExpired(expiresOn, today) {
  return String(expiresOn || '') < String(today || '').slice(0, 10);
}

function findAllowEntry(vulnerability, allowlist) {
  return (allowlist.allow || []).find((item) => item.package === vulnerability.name) || null;
}

function isAllowed(vulnerability, allowlist, { today } = {}) {
  const entry = findAllowEntry(vulnerability, allowlist);
  if (!entry) return { ok: false, reason: '未在白名单中' };
  if (isExpired(entry.expiresOn, today)) return { ok: false, reason: `白名单已过期：${entry.expiresOn}` };

  const actualVia = blockingViaKeys(vulnerability);
  const allowedVia = new Set([...(entry.advisories || []), ...(entry.via || [])]);
  const missing = actualVia.filter((item) => !allowedVia.has(item));
  if (missing.length) return { ok: false, reason: `出现未登记公告：${missing.join(', ')}` };

  return { ok: true, reason: entry.reason || '已登记例外' };
}

function evaluateAuditReport(auditReport, allowlist, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const vulnerabilities = Object.values(auditReport.vulnerabilities || {});
  const blocking = [];
  const allowed = [];
  const ignoredModerateOrLower = [];

  for (const vulnerability of vulnerabilities) {
    const severity = String(vulnerability.severity || '').toLowerCase();
    if (!BLOCKING_SEVERITIES.has(severity)) {
      ignoredModerateOrLower.push(vulnerability.name);
      continue;
    }
    const decision = isAllowed(vulnerability, allowlist, { today });
    const label = `${vulnerability.name}(${severity})`;
    if (decision.ok) allowed.push(`${label}: ${decision.reason}`);
    else blocking.push(`${label}: ${decision.reason}`);
  }

  return {
    ok: blocking.length === 0,
    blocking,
    allowed,
    ignoredModerateOrLower,
    metadata: auditReport.metadata || {}
  };
}

function runNpmAuditJson() {
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--json'], { cwd: ROOT, encoding: 'utf8' }));
  } catch (error) {
    const stdout = String(error.stdout || '').trim();
    if (!stdout) throw error;
    return JSON.parse(stdout);
  }
}

function main() {
  const allowlist = readJson(DEFAULT_ALLOWLIST_PATH);
  const auditReport = runNpmAuditJson();
  const result = evaluateAuditReport(auditReport, allowlist);
  const summary = auditReport.metadata?.vulnerabilities || {};

  console.log(JSON.stringify({
    ok: result.ok,
    vulnerabilities: summary,
    allowed: result.allowed,
    blocking: result.blocking
  }, null, 2));

  if (!result.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  BLOCKING_SEVERITIES,
  advisoryKey,
  blockingViaKeys,
  isAllowed,
  evaluateAuditReport,
  runNpmAuditJson
};
