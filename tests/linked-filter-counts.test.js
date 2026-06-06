const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const componentsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'components.js'), 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(componentsSource, context);

assert.strictEqual(typeof context.withLinkedFilterCounts, 'function', 'platform should expose linked filter counting');

const rows = [
  { coach: '晓哲教练', type: '私教课', status: '已结束' },
  { coach: '晓哲教练', type: '体验课', status: '已结束' },
  { coach: '朝珺教练', type: '小班课', status: '已结束' }
];

const linked = context.withLinkedFilterCounts([
  {
    key: 'coach',
    value: '晓哲教练',
    options: [{ value: '', label: '全部', emptyDisplay: '教练' }, { value: '晓哲教练', label: '晓哲教练' }, { value: '朝珺教练', label: '朝珺教练' }],
    match: (row, value) => row.coach === value
  },
  {
    key: 'type',
    value: '',
    options: [{ value: '', label: '全部', emptyDisplay: '课程类型' }, { value: '私教课', label: '私教课' }, { value: '体验课', label: '体验课' }, { value: '小班课', label: '小班课' }],
    match: (row, value) => row.type === value
  }
], rows);

assert.deepStrictEqual(
  linked.type.options.map(item => [item.value, item.count]),
  [['', 2], ['私教课', 1], ['体验课', 1]],
  'course type options should be limited by the selected coach and hide zero-count options'
);

const invalid = context.withLinkedFilterCounts([
  {
    key: 'coach',
    value: '晓哲教练',
    options: [{ value: '', label: '全部', emptyDisplay: '教练' }, { value: '晓哲教练', label: '晓哲教练' }],
    match: (row, value) => row.coach === value
  },
  {
    key: 'type',
    value: '小班课',
    options: [{ value: '', label: '全部', emptyDisplay: '课程类型' }, { value: '小班课', label: '小班课' }],
    match: (row, value) => row.type === value
  }
], rows);

assert.strictEqual(invalid.type.value, '', 'invalid selected option should be cleared');

console.log('linked filter count tests passed');
