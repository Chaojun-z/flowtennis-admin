const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildLeadPoolRows } = require('../server/read-models/platform-metrics.js');

const repoRoot = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const routesSource = fs.readFileSync(path.join(repoRoot, 'server/leads-routes.js'), 'utf8');
const metricsSource = fs.readFileSync(path.join(repoRoot, 'server/read-models/platform-metrics.js'), 'utf8');

function testIsInNpmTest(file) {
  assert.match(
    packageJson.scripts.test,
    new RegExp(`node ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `${file} 必须进入 npm test，不能只登记为专项测试`
  );
}

testIsInNpmTest('tests/leads-pool-regression-hard-gate.test.js');
testIsInNpmTest('tests/leads-pool-summary-dedupe.test.js');
testIsInNpmTest('tests/repair-lead-pool-visible-dirty-names-20260826.test.js');

assert.match(
  routesSource,
  /buildLeadPoolRows\(\{leads:mergedLeads,customerLifecycleRows,lifecycleScope,mergeDuplicates:true\}\)/,
  '/leads 必须启用 buildLeadPoolRows 的合并口径'
);
assert.doesNotMatch(
  routesSource,
  /buildLeadPoolRows\(\{[^}]*mergeDuplicates:false/,
  '/leads 不能关闭线索池去重合并'
);
assert.match(
  metricsSource,
  /function leadCanonicalNameKey\(row = \{\}\)[\s\S]*if \(phone\) return `phone:\$\{phone\}`;[\s\S]*return name \? `name:\$\{name\}` : `id:\$\{rowId\(row\)\}`;/,
  '线索池去重键必须跨真实线索和摘要虚拟线索统一按 phone/name/id 合并，不能再按来源 carrier 拆开'
);
assert.doesNotMatch(
  metricsSource,
  /const carrier = row\.isLifecycleSynthetic|`\$\{carrier\}\|/,
  '线索池去重键不能重新引入 lead/student/court/membership carrier 分桶'
);
assert.match(
  metricsSource,
  /Number\(\!\!a\.isLifecycleSynthetic\) - Number\(\!\!b\.isLifecycleSynthetic\)/,
  '同一身份合并时必须优先保留真实线索，不能让摘要虚拟线索抢主记录'
);

const manualRows = buildLeadPoolRows({
  leads: [{
    id: 'lead-manual-one1',
    displayName: 'one1',
    wechatName: 'one1',
    phone: '13800138000',
    leadDate: '2026-05-10',
    leadDateSource: 'manual',
    createdAt: '2026-05-10 09:00:00',
    updatedAt: '2026-09-01T10:00:00.000Z'
  }],
  customerLifecycleRows: [{
    customerKey: 'teaching-summary:student-one1',
    studentId: 'student-one1',
    displayName: 'one1（体验）、陈鹭',
    phone: '13800138000',
    sourceLeadId: '',
    leadDate: '2026-09-01',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    summaryUpdatedAt: '2026-09-01T10:00:00.000Z',
    trialAttendedAt: '2026-06-01',
    hasTrialAttended: true,
    studentStage: 'trial'
  }]
});
assert.strictEqual(manualRows.length, 1, '一条真实线索加一条摘要虚拟线索只能展示一条');
assert.strictEqual(manualRows[0].id, 'lead-manual-one1', '合并后必须保留真实线索 id');
assert.strictEqual(manualRows[0].displayName, 'one1', '摘要复合脏名字不能覆盖真实线索姓名');
assert.strictEqual(manualRows[0].leadDate, '2026-05-10', '人工录入线索时间不能被摘要时间或业务时间覆盖');
assert.strictEqual(manualRows[0].leadDateSource, 'manual', '人工录入线索时间来源必须保留为 manual');

const businessRows = buildLeadPoolRows({
  leads: [{
    id: 'lead-business-fact',
    displayName: '业务事实用户',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  }],
  customerLifecycleRows: [{
    customerKey: 'student-business-fact',
    sourceLeadId: 'lead-business-fact',
    displayName: '业务事实用户',
    firstTouchAt: '2026-04-15',
    trialBookedAt: '2026-04-20',
    trialAttendedAt: '2026-04-21',
    courseFirstPurchaseAt: '2026-05-01',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  }]
});
assert.strictEqual(businessRows[0].leadDate, '2026-04-15', '无人工线索时间时必须取最早业务事实时间');
assert.notStrictEqual(businessRows[0].leadDate, '2026-09-01T10:00:00.000Z', '系统修复时间不能冒充线索时间');

const summaryFactRows = buildLeadPoolRows({
  leads: [{
    id: 'lead-summary-fact',
    displayName: '摘要事实用户',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
  }],
  customerLifecycleRows: [{
    customerKey: 'teaching-summary:summary-fact',
    studentId: 'summary-fact',
    displayName: '摘要事实用户',
    trialAttendedAt: '2026-08-20',
    lastFormalLessonAt: '2026-08-30',
    summaryUpdatedAt: '2026-09-01T10:00:00.000Z',
    hasTrialAttended: true,
    hasFormalAttended: true,
    studentStage: 'formal'
  }]
});
assert.strictEqual(summaryFactRows[0].leadDate, '2026-08-20', '摘要虚拟线索必须优先展示真实业务事实，不能用摘要更新时间或更晚的修复时间');

const syntheticRows = buildLeadPoolRows({
  leads: [],
  customerLifecycleRows: [{
    customerKey: 'teaching-summary:synthetic-only',
    studentId: 'synthetic-only',
    displayName: '摘要用户',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    summaryUpdatedAt: '2026-09-01T10:00:00.000Z'
  }]
});
assert.strictEqual(syntheticRows[0].leadDate, '', '没有人工时间和业务事实时必须为空，不能使用摘要生成/修复时间');

console.log('leads pool regression hard gate tests passed');
