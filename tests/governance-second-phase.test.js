const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const riskMatrixPath = path.join(root, 'docs', 'governance', '风险分级与门禁矩阵.md');
const releaseFlowPath = path.join(root, 'docs', 'governance', '测试与发布流程.md');
const dataChangePath = path.join(root, 'docs', 'governance', '生产数据变更与回滚流程.md');
const statusListPath = path.join(root, 'docs', 'governance', '文档状态清单.md');

for (const file of [riskMatrixPath, releaseFlowPath, dataChangePath]) {
  assert.ok(fs.existsSync(file), `${path.basename(file)} 必须存在`);
}

const riskMatrix = fs.readFileSync(riskMatrixPath, 'utf8');
for (const level of ['L1', 'L2', 'L3', 'L4', 'L5']) {
  assert.match(riskMatrix, new RegExp(`\\|\\s*${level}\\s*\\|`), `风险矩阵必须定义 ${level}`);
}
assert.match(riskMatrix, /guard:finance/, '风险矩阵必须明确财务门禁');
assert.match(riskMatrix, /guard:release/, '风险矩阵必须明确发布门禁');
assert.match(riskMatrix, /guard:api-smoke/, '风险矩阵必须明确接口冒烟门禁');

const releaseFlow = fs.readFileSync(releaseFlowPath, 'utf8');
assert.match(releaseFlow, /guard:test-inventory/, '测试与发布流程必须包含测试清单同步');
assert.match(releaseFlow, /guard:api-smoke/, '测试与发布流程必须包含接口冒烟');
assert.match(releaseFlow, /未配置/, '测试与发布流程必须说明接口冒烟未配置时不能冒充线上验收');

const dataChange = fs.readFileSync(dataChangePath, 'utf8');
for (const word of ['dry-run', 'operationId', 'batchId', '快照', '回滚', '/api/diag']) {
  assert.match(dataChange, new RegExp(word), `生产数据流程必须包含 ${word}`);
}

const statusList = fs.readFileSync(statusListPath, 'utf8');
for (const name of ['风险分级与门禁矩阵', '测试与发布流程', '生产数据变更与回滚流程']) {
  assert.match(statusList, new RegExp(name), `文档状态清单必须登记 ${name}`);
}

console.log('governance second phase tests passed');
