const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let i = source.indexOf('(', start); i < source.length; i += 1) {
    if (source[i] === '(') parenDepth += 1;
    if (source[i] === ')') parenDepth -= 1;
    if (parenDepth === 0 && source[i] === '{') {
      braceStart = i;
      break;
    }
  }
  assert.notStrictEqual(braceStart, -1, `${name} body should exist`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Cannot extract ${name}`);
}

const context = {
  document: { createElement: () => ({ textContent: '', innerHTML: '' }) },
  campuses: [],
  coaches: [],
  packages: [],
  entitlements: [],
  renderStandardEmptyText: value => {
    const text = String(value || '').trim();
    return text || '-';
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(read('public/assets/scripts/core/business-taxonomy.js'), context, { filename: 'business-taxonomy.js' });
vm.runInContext(read('public/assets/scripts/core/constants.js'), context, { filename: 'constants.js' });
vm.runInContext(read('public/assets/scripts/core/utils.js'), context, { filename: 'utils.js' });
vm.runInContext(extractFunction(read('public/assets/scripts/pages/packages.js'), 'packageDisplayTitle'), context, { filename: 'packages.js' });
vm.runInContext(extractFunction(read('public/assets/scripts/pages/packages.js'), 'packageListSubtitle'), context, { filename: 'packages.js' });
vm.runInContext(extractFunction(read('public/assets/scripts/pages/purchases.js'), 'purchaseDisplayPackageMeta'), context, { filename: 'purchases.js' });
vm.runInContext(extractFunction(read('public/assets/scripts/pages/purchases.js'), 'purchasePackageListLabel'), context, { filename: 'purchases.js' });

const smallTrialPackage = {
  id: 'pkg-small-trial',
  courseType: '体验课',
  experienceType: '小班体验课',
  audience: '成人',
  lessons: 2,
  packageLessons: 2,
  timeBand: '全天',
  packageName: '小班体验课 成人 · 2课时 · 全天'
};

assert.strictEqual(
  context.standardPackageLabel(smallTrialPackage),
  '小班体验课 · 成人 · 2次 · 全天',
  'small group trial package should use count unit'
);
assert.strictEqual(
  context.packageDisplayTitle(smallTrialPackage),
  '小班体验课 · 2次 · 全天',
  'small group trial package card title should use count unit'
);
assert.strictEqual(
  context.packageListSubtitle(smallTrialPackage),
  '成人 · 2次',
  'small group trial package card subtitle should use count unit'
);

const staleDropinPackage = {
  id: 'pkg-stale-dropin',
  courseType: '小班课',
  smallClassType: 'single',
  name: '小班单次课 · 12次 · 全天',
  audience: '成人',
  price: 1499,
  lessons: 12,
  timeBand: '全天'
};

assert.strictEqual(
  context.normalizeCourseTypeForForm(staleDropinPackage).smallClassType,
  'dropin',
  '1499 stale small group package should reopen as dropin instead of single'
);
assert.strictEqual(
  context.packageDisplayTitle(staleDropinPackage),
  '小班随到随学 · 12次 · 全天',
  '1499 stale small group package title should show dropin instead of single'
);

context.packages = [smallTrialPackage];
context.entitlements = [];
assert.strictEqual(
  context.purchasePackageListLabel({
    id: 'pur-small-trial',
    packageId: 'pkg-small-trial',
    courseType: '体验课',
    experienceType: '私教体验课',
    packageLessons: 2,
    packageTimeBand: '全天',
    packageName: '私教体验课 2课时 · 全天'
  }),
  '小班体验课 · 成人 · 2次 · 全天',
  'purchase list should prefer package metadata over stale purchase snapshot type'
);

console.log('package label display tests passed');
