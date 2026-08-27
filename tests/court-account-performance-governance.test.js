const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const agentsSource = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
const postmortemPath = path.join(
  repoRoot,
  'docs/performance-governance/archive/18-2026-08-09-订场会员列表索引失败复盘.md'
);
const snapshotPlanPath = path.join(
  repoRoot,
  'docs/performance-governance/archive/19-2026-08-09-订场会员列表快照包方案评审.md'
);
const performanceReadmePath = path.join(repoRoot, 'docs/performance-governance/README.md');
const performanceArchiveReadmePath = path.join(repoRoot, 'docs/performance-governance/archive/README.md');
const postmortem = fs.readFileSync(postmortemPath, 'utf8');
const snapshotPlan = fs.readFileSync(snapshotPlanPath, 'utf8');
const performanceReadme = fs.readFileSync(performanceReadmePath, 'utf8');
const performanceArchiveReadme = fs.readFileSync(performanceArchiveReadmePath, 'utf8');

assert.match(agentsSource, /高敏感列表性能改造反面案例硬规则/, 'AGENTS must expose the failed list-index performance rule');
assert.match(agentsSource, /禁止用“每次请求远程扫描整张行级索引表/, 'AGENTS must forbid full remote scans of row-level indexes for 1s goals');
assert.match(agentsSource, /默认首屏、校区筛选、日期筛选、搜索、翻页/, 'AGENTS must require the five hard-test scenarios');
assert.match(agentsSource, /数据正确但性能未达标/, 'AGENTS must force honest reporting when performance misses the target');
assert.match(agentsSource, /docs\/performance-governance\/README\.md/, 'AGENTS must point to the performance-governance entry file');
assert.match(agentsSource, /docs\/performance-governance\/archive\//, 'AGENTS must point to the performance-governance archive boundary');

assert.match(performanceReadme, /当前生效文档/, 'performance-governance README must define the active layer');
assert.match(performanceReadme, /历史归档文档/, 'performance-governance README must define the archive layer');
assert.match(performanceReadme, /01-问题总述与目标\.md/, 'performance-governance README must list the current docs');
assert.match(performanceReadme, /archive\/18-2026-08-09-订场会员列表索引失败复盘\.md/, 'performance-governance README must list archived docs');
assert.match(performanceArchiveReadme, /状态：历史记录/, 'archive README must be marked historical');
assert.match(performanceArchiveReadme, /只保留历史复盘和方案评审/, 'archive README must describe the archive boundary');

assert.match(postmortem, /在性能目标上失败/, 'postmortem must record that the attempt failed the performance goal');
assert.match(postmortem, /ft_court_account_list_index/, 'postmortem must name the row-level index table');
assert.match(postmortem, /ft_court_account_list_index_tasks/, 'postmortem must name the task marker table');
assert.match(postmortem, /远程扫描全部 776 条索引行/, 'postmortem must capture the concrete failure mode');
assert.match(postmortem, /禁止每次请求远程扫描整张 `ft_court_account_list_index`/, 'postmortem must forbid repeating the failed approach');
assert.match(postmortem, /快照包/, 'postmortem must point future work toward snapshot-style read models');
assert.match(postmortem, /未经明确确认，不要删除生产表/, 'postmortem must forbid unsafe cleanup of production experiment tables');

assert.match(snapshotPlan, /事实表 -> 行级读模型 -> 快照包 -> 页面列表接口/, 'snapshot plan must define the safe read-model chain');
assert.match(snapshotPlan, /请求时不扫 `ft_courts`/, 'snapshot plan must forbid fact-table scans on request');
assert.match(snapshotPlan, /请求时不扫 `ft_court_account_list_index` 全表/, 'snapshot plan must forbid row-index full scans on request');
assert.match(snapshotPlan, /active:delta/, 'snapshot plan must define a delta path for daily new or changed records');
assert.match(snapshotPlan, /筛选、排序、统计发生在分页前/, 'snapshot plan must preserve filter-sort-total-before-pagination order');
assert.match(snapshotPlan, /详情抽屉不走快照包/, 'snapshot plan must keep drawer details sourced from facts');
assert.match(snapshotPlan, /不建议直接写业务代码/, 'snapshot plan must require review before implementation');

console.log('court account performance governance tests passed');
