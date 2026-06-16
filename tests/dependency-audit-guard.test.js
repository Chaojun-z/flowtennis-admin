const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const guardPath = path.join(root, 'scripts', 'dependency-audit-guard.js');
const allowlistPath = path.join(root, 'config', 'dependency-audit-allowlist.json');

assert.ok(fs.existsSync(guardPath), '必须提供依赖安全门禁脚本');
assert.ok(fs.existsSync(allowlistPath), '必须提供依赖漏洞白名单配置');

const guard = require(guardPath);
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

function makeAudit(vulnerabilities) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: Object.values(vulnerabilities).filter((item) => item.severity === 'high').length,
        critical: Object.values(vulnerabilities).filter((item) => item.severity === 'critical').length,
        total: Object.keys(vulnerabilities).length
      }
    }
  };
}

const knownTableStoreAudit = makeAudit({
  protobufjs: {
    name: 'protobufjs',
    severity: 'critical',
    via: [{ source: 1117571, url: 'https://github.com/advisories/GHSA-xq3m-2v4x-88gg' }],
    effects: ['tablestore'],
    fixAvailable: false
  },
  tablestore: {
    name: 'tablestore',
    severity: 'high',
    via: ['protobufjs'],
    effects: [],
    fixAvailable: false
  }
});

const knownResult = guard.evaluateAuditReport(knownTableStoreAudit, allowlist, {
  today: '2026-06-16'
});
assert.strictEqual(knownResult.ok, true, '只允许已知 TableStore/protobufjs high/critical 通过');
assert.strictEqual(knownResult.blocking.length, 0);

const newHighAudit = makeAudit({
  ...knownTableStoreAudit.vulnerabilities,
  'form-data': {
    name: 'form-data',
    severity: 'high',
    via: [{ source: 1120743, url: 'https://github.com/advisories/GHSA-hmw2-7cc7-3qxx' }],
    effects: [],
    fixAvailable: true
  }
});

const newHighResult = guard.evaluateAuditReport(newHighAudit, allowlist, {
  today: '2026-06-16'
});
assert.strictEqual(newHighResult.ok, false, '新增 high/critical 不能通过');
assert.match(newHighResult.blocking.join('\n'), /form-data/);

const expiredResult = guard.evaluateAuditReport(knownTableStoreAudit, {
  allow: allowlist.allow.map((item) => ({ ...item, expiresOn: '2026-01-01' }))
}, {
  today: '2026-06-16'
});
assert.strictEqual(expiredResult.ok, false, '白名单过期后必须失败');
assert.match(expiredResult.blocking.join('\n'), /已过期/);

console.log('dependency audit guard tests passed');
