const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'governance-automation-guard.js');
const configPath = path.join(repoRoot, 'config', 'governance-automation.json');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

assert.ok(fs.existsSync(scriptPath), '必须提供统一治理自动化门禁脚本');
assert.ok(fs.existsSync(configPath), '必须提供治理自动化配置');
assert.ok(packageJson.scripts['guard:governance-automation'], 'package.json 必须提供 guard:governance-automation');
assert.ok(
  packageJson.scripts['guard:release'].includes('npm run guard:governance-automation'),
  'guard:release 必须包含治理自动化门禁'
);
assert.ok(packageJson.scripts['governance:record'], 'package.json 必须提供变更记录生成命令');
assert.ok(packageJson.scripts['guard:post-release'], 'package.json 必须提供发布后核验命令');

const guard = require(scriptPath);
for (const exportName of [
  'parseDocMetadata',
  'evaluateDocumentGovernance',
  'evaluateRepoRootPlacement',
  'evaluateDocsPlacement',
  'classifyChangedFiles',
  'evaluateChangeRecordCoverage',
  'evaluatePostReleaseCoverage',
  'evaluateDecisionSyncCoverage',
  'evaluateExceptionApprovalCoverage',
  'evaluateIncidentClosureCoverage',
  'generateChangeRecord',
  'updateDecisionSyncTarget'
]) {
  assert.ok(guard[exportName], `治理门禁必须导出 ${exportName}`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const rootPlacementResult = guard.evaluateRepoRootPlacement({
  root: repoRoot,
  config
});
assert.strictEqual(rootPlacementResult.ok, true, rootPlacementResult.errors.join('\n'));

const currentDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'governance', '治理总览.md'), 'utf8');
const docResult = guard.evaluateDocumentGovernance({
  docs: [{ file: 'docs/governance/治理总览.md', content: currentDoc }],
  config
});
assert.strictEqual(docResult.ok, true, docResult.errors.join('\n'));

const brokenDocResult = guard.evaluateDocumentGovernance({
  docs: [{ file: 'docs/governance/坏文档.md', content: '# 坏文档\n\n没有状态头。\n' }],
  config: {
    ...config,
    governedDocGlobs: ['docs/governance/*.md']
  }
});
assert.strictEqual(brokenDocResult.ok, false, '正式治理文档缺少状态头时必须失败');
assert.match(brokenDocResult.errors.join('\n'), /文档类型|状态|版本|维护人/);

const placementResult = guard.evaluateDocsPlacement({
  files: [
    'docs/README.md',
    'docs/business-rules/FlowTennis全平台数据口径总表.md',
    'docs/operations/finance/财务每日快照与可回溯治理方案.md'
  ],
  config
});
assert.strictEqual(placementResult.ok, true, placementResult.errors.join('\n'));

const brokenPlacementResult = guard.evaluateDocsPlacement({
  files: ['docs/临时方案.md'],
  config
});
assert.strictEqual(brokenPlacementResult.ok, false, 'docs 根目录新增正式文档时必须失败');
assert.match(brokenPlacementResult.errors.join('\n'), /docs 根目录/);

const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flowtennis-root-placement-'));
fs.writeFileSync(path.join(tempRepoRoot, '.env.local'), 'TOKEN=1\n');
const ignoredRootResult = guard.evaluateRepoRootPlacement({
  root: tempRepoRoot,
  config
});
assert.strictEqual(ignoredRootResult.ok, true, ignoredRootResult.errors.join('\n'));

fs.writeFileSync(path.join(tempRepoRoot, 'notes.md'), '# notes\n');
const brokenRootResult = guard.evaluateRepoRootPlacement({
  root: tempRepoRoot,
  config
});
assert.strictEqual(brokenRootResult.ok, false, '仓库根目录新增未登记文件时必须失败');
assert.match(brokenRootResult.errors.join('\n'), /notes\.md/);

const riskResult = guard.classifyChangedFiles({
  changedFiles: [
    'server/read-models/customer-lifecycle.js',
    'scripts/repair-sample.js',
    'docs/governance/测试与发布流程.md'
  ],
  config
});
assert.strictEqual(riskResult.maxLevel, 'L5', '修数脚本必须自动升级为 L5');
assert.ok(riskResult.requiredChecks.includes('npm run guard:finance'), '高风险改动必须要求财务门禁');
assert.ok(riskResult.requiredChecks.includes('npm run guard:post-release'), '高风险改动必须要求发布后核验');

const missingRecordResult = guard.evaluateChangeRecordCoverage({
  changedFiles: ['server/read-models/customer-lifecycle.js'],
  records: [],
  config
});
assert.strictEqual(missingRecordResult.ok, false, '触达核心读模型时必须有变更记录');
assert.match(missingRecordResult.errors.join('\n'), /需求变更记录/);

const validRecord = `# 2026-08-24 治理自动化门禁

> 文档类型：需求变更记录
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-24
> 维护人：FlowTennis 项目负责人
> 唯一依据：记录本次变更影响面，不替代 PRD 和口径正本。
> 替代文档：无

## 风险等级

L3

## 变更文件

- server/read-models/customer-lifecycle.js

## 影响页面

- 管理后台：客户中心

## 影响接口

- /server/page-data/workbench

## 影响表

- 无直接写表

## 影响指标

- 客户生命周期指标

## 测试映射

- npm test

## 决策同步

- 同步目标：\`docs/prd/source/14-变更记录与决策记录.md\`
- 同步标记：\`AUTO-SYNC-PRD-DECISIONS\`
- 同步方式：\`npm run governance:record\` 自动更新 PRD 决策记录

## 异常豁免

- 无

## 事故反馈闭环

- 本次非线上事故修复

## 发布后核验

- npm run guard:post-release
`;
const coveredRecordResult = guard.evaluateChangeRecordCoverage({
  changedFiles: ['server/read-models/customer-lifecycle.js'],
  records: [{ file: 'docs/governance/change-records/2026-08-24-sample.md', content: validRecord }],
  config
});
assert.strictEqual(coveredRecordResult.ok, true, coveredRecordResult.errors.join('\n'));

const decisionDoc = fs.readFileSync(path.join(repoRoot, 'docs', 'prd', 'source', '14-变更记录与决策记录.md'), 'utf8');
const governanceRecord = fs.readFileSync(path.join(repoRoot, 'docs', 'governance', 'change-records', '2026-08-27-数据问题快检与修复机制.md'), 'utf8');
const decisionSyncResult = guard.evaluateDecisionSyncCoverage({
  changedFiles: [
    'AGENTS.md',
    'docs/governance/治理总览.md',
    'docs/governance/生产数据变更与回滚流程.md',
    'docs/governance/数据问题快检与修复流程.md',
    'docs/governance/文档状态清单.md',
    'docs/governance/change-records/2026-08-27-数据问题快检与修复机制.md',
    'docs/prd/source/14-变更记录与决策记录.md'
  ],
  records: [{ file: 'docs/governance/change-records/2026-08-27-数据问题快检与修复机制.md', content: governanceRecord }],
  config,
  decisionDoc
});
assert.strictEqual(decisionSyncResult.ok, true, decisionSyncResult.errors.join('\n'));

const exceptionApprovalResult = guard.evaluateExceptionApprovalCoverage({
  records: [{
    file: 'docs/governance/change-records/2026-08-24-sample.md',
    content: validRecord.replace(
      '## 异常豁免\n\n- 无',
      '## 异常豁免\n\n- 审批人：张三\n- 审批单号：EX-001\n- 补验时间：2026-08-25\n- 风险说明：临时豁免'
    )
  }],
  config
});
assert.strictEqual(exceptionApprovalResult.ok, true, exceptionApprovalResult.errors.join('\n'));

const incidentClosureResult = guard.evaluateIncidentClosureCoverage({
  changedFiles: ['scripts/repair-sample.js'],
  records: [{
    file: 'docs/governance/change-records/2026-08-24-sample.md',
    content: `# 2026-08-24 事故修复样例

> 文档类型：需求变更记录
> 状态：生效
> 版本：2026-08-24
> 生效日期：2026-08-24
> 最后审查日期：2026-08-24
> 维护人：FlowTennis 项目负责人
> 唯一依据：样例。
> 替代文档：无

## 风险等级

L5

## 变更文件

- scripts/repair-sample.js

## 事故反馈闭环

- 新增反例测试
- 新增规则
`
  }],
  config
});
assert.strictEqual(incidentClosureResult.ok, true, incidentClosureResult.errors.join('\n'));

const unrelatedOldRecord = validRecord.replace('server/read-models/customer-lifecycle.js', 'public/assets/scripts/old-page.js');
const coveredWithOldRecordResult = guard.evaluateChangeRecordCoverage({
  changedFiles: ['server/read-models/customer-lifecycle.js'],
  records: [
    { file: 'docs/governance/change-records/old.md', content: unrelatedOldRecord },
    { file: 'docs/governance/change-records/2026-08-24-sample.md', content: validRecord }
  ],
  config
});
assert.strictEqual(coveredWithOldRecordResult.ok, true, '旧变更记录不应要求覆盖本次改动');

const partialOldRecord = validRecord.replace('## 变更文件\n\n- server/read-models/customer-lifecycle.js', '## 变更文件\n\n- server/read-models/customer-lifecycle.js');
const coveredWithPartialOldRecordResult = guard.evaluateChangeRecordCoverage({
  changedFiles: ['server/read-models/customer-lifecycle.js', 'tests/sample.test.js'],
  records: [
    { file: 'docs/governance/change-records/partial-old.md', content: partialOldRecord },
    {
      file: 'docs/governance/change-records/2026-08-24-complete.md',
      content: validRecord.replace(
        '- server/read-models/customer-lifecycle.js',
        '- server/read-models/customer-lifecycle.js\n- tests/sample.test.js'
      )
    }
  ],
  config
});
assert.strictEqual(coveredWithPartialOldRecordResult.ok, true, '完整的新记录存在时，部分命中的旧记录不应拖失败');

const postReleaseResult = guard.evaluatePostReleaseCoverage({
  config,
  apiSmokeChecks: [
    '/api/diag',
    '/server/page-data/finance',
    '/server/page-data/workbench',
    '/server/page-data/courts',
    '/server/page-data/memberships',
    '/server/page-data/purchases',
    '/server/page-data/plans',
    '/server/page-data/coaches'
  ]
});
assert.strictEqual(postReleaseResult.ok, true, postReleaseResult.errors.join('\n'));

const generated = guard.generateChangeRecord({
  title: '测试变更',
  changedFiles: ['public/assets/scripts/app.js'],
  config
});
assert.match(generated, /## 影响页面/);
assert.match(generated, /## 测试映射/);
assert.match(generated, /## 决策同步/);
assert.match(generated, /## 发布后核验/);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flowtennis-governance-'));
const tempDecisionPath = path.join(tempRoot, 'docs', 'prd', 'source', '14-变更记录与决策记录.md');
fs.mkdirSync(path.dirname(tempDecisionPath), { recursive: true });
fs.writeFileSync(
  tempDecisionPath,
  '# temp\n\n<!-- AUTO-SYNC-PRD-DECISIONS:START -->\n| 字段 | 内容 |\n| --- | --- |\n| 同步日期 | 2026-08-23 |\n| 同步目标 | `docs/prd/source/14-变更记录与决策记录.md` |\n| 关联变更记录 | `docs/governance/change-records/old.md` |\n| 触发文件 | `old.js` |\n| 决策摘要 | 旧记录 |\n| 同步标记 | `AUTO-SYNC-PRD-DECISIONS` |\n<!-- AUTO-SYNC-PRD-DECISIONS:END -->\n'
);
const syncResult = guard.updateDecisionSyncTarget(tempRoot, {
  decisionSyncTarget: 'docs/prd/source/14-变更记录与决策记录.md',
  decisionSyncMarker: 'AUTO-SYNC-PRD-DECISIONS'
}, {
  date: '2026-08-24',
  recordFile: 'docs/governance/change-records/2026-08-24-sample.md',
  changedFiles: ['config/governance-automation.json', 'scripts/governance-automation-guard.js'],
  title: '治理自动化'
});
assert.strictEqual(syncResult.ok, true, syncResult.errors?.join('\n') || '');
assert.match(
  fs.readFileSync(tempDecisionPath, 'utf8'),
  /docs\/governance\/change-records\/2026-08-24-sample\.md/
);

console.log('governance automation guard tests passed');
