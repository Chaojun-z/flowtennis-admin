const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function walk(dir, matcher, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(repoRoot, full);
    if (rel.startsWith('_exports') || rel.includes('node_modules') || rel.includes(`${path.sep}seeds${path.sep}`)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, matcher, out);
    else if (matcher(rel)) out.push(rel);
  }
  return out;
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function assertNoMatch(rel, pattern, message) {
  assert.doesNotMatch(read(rel), pattern, `${rel}: ${message}`);
}

const pageFiles = [
  ...walk(path.join(repoRoot, 'public/assets/scripts/pages'), rel => rel.endsWith('.js')),
  ...walk(path.join(repoRoot, 'wechat-miniprogram/miniprogram/pages'), rel => /\.(js|wxml)$/.test(rel))
];

pageFiles.forEach(rel => {
  assertNoMatch(rel, /意向类型|咨询需求|学员姓名|系统录入时间/, '运行页面不得展示旧字段名或系统录入字段');
  assertNoMatch(rel, /data-rate|data-heat|data-minutes/, '运行页面不得输出热力图调试属性');
  assertNoMatch(rel, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/, '运行页面不得硬编码或直接展示原始 ISO 时间样例');
  assertNoMatch(rel, /['"]mabao['"]/, '运行页面不得硬编码单一校区代码');
});

const legacyRuntimeFiles = [
  ...walk(path.join(repoRoot, 'public/assets/scripts'), rel => rel.endsWith('.js')),
  'api/index.js',
  ...walk(path.join(repoRoot, 'server'), rel => rel.endsWith('.js'))
].filter(rel => /意向类型|咨询需求|学员姓名|用户名/.test(read(rel)));

assert.deepStrictEqual(
  legacyRuntimeFiles,
  ['public/assets/scripts/core/business-taxonomy.js'],
  '旧字段名只能出现在统一兼容别名表里'
);

const courtsSource = read('public/assets/scripts/pages/courts.js');
assert.doesNotMatch(
  courtsSource,
  /renderStandardCellText\(\s*(?:l|row)\.membershipOrderId/,
  '会员权益页面不得直接展示原始 membershipOrderId'
);
assert.doesNotMatch(
  courtsSource,
  /\$\{\s*(?:l|row|data)\.membershipOrderId\s*\}/,
  '会员权益页面不得把原始 membershipOrderId 拼进页面'
);

console.log('platform zero residual guard tests passed');
