#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..');
const DEFAULT_CONFIG = path.join(DEFAULT_ROOT, 'config', 'test-inventory.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listTestFiles(root) {
  return fs.readdirSync(path.join(root, 'tests'))
    .filter((file) => file.endsWith('.test.js'))
    .map((file) => `tests/${file}`)
    .sort();
}

function extractScriptTestRefs(npmScripts = {}) {
  const refs = new Map();
  for (const [scriptName, command] of Object.entries(npmScripts || {})) {
    for (const match of String(command || '').matchAll(/tests\/[^\s&;|]+?\.test\.js/g)) {
      const file = match[0];
      if (!refs.has(file)) refs.set(file, []);
      refs.get(file).push(scriptName);
    }
  }
  return refs;
}

function normalizeKnownEntries(config = {}) {
  return (config.knownUnreferencedTests || []).map((entry) => {
    if (typeof entry === 'string') {
      return { file: entry, category: 'legacy', reason: '历史未分类测试' };
    }
    return {
      file: String(entry.file || '').trim(),
      category: String(entry.category || '').trim(),
      reason: String(entry.reason || '').trim()
    };
  }).filter((entry) => entry.file);
}

function evaluateTestInventory({ testFiles = [], npmScripts = {}, config = {} } = {}) {
  const refs = extractScriptTestRefs(npmScripts);
  const tests = [...new Set(testFiles)].sort();
  const testSet = new Set(tests);
  const knownEntries = normalizeKnownEntries(config);
  const knownMap = new Map(knownEntries.map((entry) => [entry.file, entry]));
  const unreferenced = tests.filter((file) => !refs.has(file));
  const unregistered = unreferenced.filter((file) => !knownMap.has(file));
  const staleKnown = knownEntries
    .filter((entry) => !testSet.has(entry.file) || refs.has(entry.file))
    .map((entry) => entry.file);
  const incompleteKnown = knownEntries
    .filter((entry) => !entry.category || !entry.reason)
    .map((entry) => entry.file);
  const errors = [];

  if (unregistered.length) {
    errors.push(`以下测试未进入任何 npm 脚本，也未在 config/test-inventory.json 登记原因：${unregistered.join(', ')}`);
  }
  if (staleKnown.length) {
    errors.push(`以下已登记未接入测试已经不存在或已进入脚本，需要清理登记：${staleKnown.join(', ')}`);
  }
  if (incompleteKnown.length) {
    errors.push(`以下未接入测试缺少 category 或 reason：${incompleteKnown.join(', ')}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    totalTests: tests.length,
    referencedTests: tests.length - unreferenced.length,
    knownUnreferencedTests: unreferenced.length - unregistered.length,
    unregisteredTests: unregistered,
    staleKnownTests: staleKnown
  };
}

function resolveArgs(argv = []) {
  const args = { root: DEFAULT_ROOT, config: DEFAULT_CONFIG };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') args.root = path.resolve(argv[i + 1]);
    if (argv[i] === '--config') args.config = path.resolve(argv[i + 1]);
  }
  return args;
}

function runInventoryGuard({ root = DEFAULT_ROOT, configPath = DEFAULT_CONFIG } = {}) {
  const packageJson = readJson(path.join(root, 'package.json'));
  const config = readJson(configPath);
  return evaluateTestInventory({
    testFiles: listTestFiles(root),
    npmScripts: packageJson.scripts || {},
    config
  });
}

function main() {
  const args = resolveArgs(process.argv.slice(2));
  try {
    const result = runInventoryGuard({ root: args.root, configPath: args.config });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      console.error(result.errors.join('\n'));
      process.exit(1);
    }
    console.log('test inventory guard passed');
  } catch (error) {
    console.error(`test inventory guard failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  listTestFiles,
  extractScriptTestRefs,
  normalizeKnownEntries,
  evaluateTestInventory,
  runInventoryGuard
};
