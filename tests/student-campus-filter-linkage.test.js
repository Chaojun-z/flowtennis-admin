const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(source, /function studentCampusValuesForList\(/, 'student list should derive campus from the unified student view row');
assert.match(source, /function studentMatchesCampusForList\([\s\S]*studentCampusValuesForList\(stu\)[\s\S]*sameCampusValue/, 'student list should use the unified student campus source for filtering');
assert.match(fnBody('getStudentBaseList'), /studentMatchesCampusForList\(s\)[\s\S]*studentListViewMode\(\)==='trial'\?studentIsHistoricalRosterRow\(s\):studentIsActiveRosterRow\(s\)/, 'student list base rows should use the shared student campus matcher and the new historical/active roster rules');
assert.match(fnBody('renderStudents'), /const filteredStudents=getFilteredStudents\(\);[\s\S]*const stats=studentPageStats\(filteredStudents\)/, 'student renderer should keep the existing render flow');
assert.match(fnBody('studentPageStats'), /studentStandardSummaryForMode\(\)/, 'student top stats should read the backend unified teaching summary');
assert.doesNotMatch(fnBody('studentPageStats'), /FlowTennisPlatformDataStandards\.currentStudentSummary/, 'student top stats must not summarize schedule facts on the frontend');
assert.doesNotMatch(source, /function studentFinanceStatsForBase\(/, 'student page should not keep a local finance stats calculator for top cards');
assert.doesNotMatch(source, /function studentLifecycleStats\(/, 'student page should not keep a second local lifecycle stats calculator');
assert.doesNotMatch(fnBody('studentPageStats'), /studentStatsMatchesPackageCampus/, 'student package stats should not apply a second purchase-campus filter after the list is already filtered');

const root = path.join(__dirname, '..');
const context = {
  console,
  window: {},
  document: { createElement: () => ({ set textContent(value) { this.innerHTML = String(value || ''); } }) },
  localStorage: { getItem: () => null, setItem: () => null, removeItem: () => null },
  currentPage: 'package-students',
  campus: 'chaojun',
  campuses: [{ id: 'chaojun', code: 'chaojun', name: '朝珺私教' }, { id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  CAMPUS: { chaojun: '朝珺私教', shunyi_mapo: '顺义马坡' },
  customerLifecycleText: value => String(value || '').trim(),
  customerLifecycleByStudentId: () => ({ studentStage: 'formal' }),
  customerLifecycleStudentStage: () => 'formal',
  teachingStudentViews: {
    summary: {},
    activeStudents: [
      { studentId: 'stu-17', id: 'stu-17', name: '一七&zzxxyy', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-xd', id: 'stu-xd', name: '铣大象', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-misha', id: 'stu-misha', name: 'misha', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-huang', id: 'stu-huang', name: '黄总', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-putao', id: 'stu-putao', name: '葡萄', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 }
    ],
    formalStudents: [
      { studentId: 'stu-17', id: 'stu-17', name: '一七&zzxxyy', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-xd', id: 'stu-xd', name: '铣大象', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-misha', id: 'stu-misha', name: 'misha', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-huang', id: 'stu-huang', name: '黄总', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
      { studentId: 'stu-putao', id: 'stu-putao', name: '葡萄', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 }
    ]
  },
  teachingStudentViewRows: () => [
    { studentId: 'stu-17', id: 'stu-17', name: '一七&zzxxyy', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
    { studentId: 'stu-xd', id: 'stu-xd', name: '铣大象', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
    { studentId: 'stu-misha', id: 'stu-misha', name: 'misha', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
    { studentId: 'stu-huang', id: 'stu-huang', name: '黄总', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 },
    { studentId: 'stu-putao', id: 'stu-putao', name: '葡萄', campus: 'chaojun', studentStage: 'formal', packageBalanceRemaining: 1 }
  ],
  standardLifecycleMetrics: { metrics: {} },
  FlowTennisBusinessTaxonomy: {
    EXPERIENCE_TYPES: ['私教体验课', '小班体验课'],
    PRODUCT_TYPES: ['私教课', '体验课', '小班课', '专项课', '大师课', '陪打']
  },
  students: [
    { id: 'stu-17', name: '一七&zzxxyy', campus: 'shunyi_mapo' },
    { id: 'stu-xd', name: '铣大象', campus: 'shunyi_mapo' },
    { id: 'stu-misha', name: 'misha', campus: 'shunyi_mapo' },
    { id: 'stu-huang', name: '黄总', campus: 'shunyi_mapo' },
    { id: 'stu-putao', name: '葡萄', campus: 'shunyi_mapo' }
  ],
  purchases: [
    { id: 'pur-17', studentId: 'stu-17', studentName: '一七&zzxxyy', packageId: 'pkg-gold', packageName: '1v1私教课', amountPaid: 5000, status: 'active', campusIds: ['chaojun', 'shunyi_mapo'], courseType: '私教课' },
    { id: 'pur-xd-paid', studentId: 'stu-xd', studentName: '铣大象', packageId: 'pkg-private', packageName: '1v1私教课', amountPaid: 3500, status: 'active', campusIds: ['shunyi_mapo'], courseType: '私教课' },
    { id: 'pur-putao-1', studentId: 'stu-putao', studentName: '葡萄', packageId: 'pkg-private', packageName: '1v1私教课', amountPaid: 4500, status: 'active', campusIds: ['shunyi_mapo'], courseType: '私教课' },
    { id: 'pur-putao-2', studentId: 'stu-putao', studentName: '葡萄', packageId: 'pkg-private', packageName: '成人1v1', amountPaid: 4000, status: 'active', campusIds: ['shunyi_mapo'], courseType: '私教课' },
    { id: 'pur-misha-paid', studentId: 'stu-misha', studentName: 'misha', packageId: 'pkg-private', packageName: '成人1v1', amountPaid: 6000, status: 'active', campusIds: ['shunyi_mapo'], courseType: '私教课' },
    { id: 'pur-huang-paid', studentId: 'stu-huang', studentName: '黄总', packageId: 'pkg-private', packageName: '成人1v1', amountPaid: 6000, status: 'active', campusIds: ['shunyi_mapo'], courseType: '私教课' },
    { id: 'pur-xd-free', studentId: 'stu-xd', studentName: '铣大象', packageId: 'pkg-gold', packageName: '小班训练营', amountPaid: 0, status: 'active', campusIds: ['chaojun', 'shunyi_mapo'], courseType: '小班课' },
    { id: 'pur-misha-free', studentId: 'stu-misha', studentName: 'misha', packageId: 'pkg-gold', packageName: '小班训练营', amountPaid: 0, status: 'active', campusIds: ['chaojun', 'shunyi_mapo'], courseType: '小班课' },
    { id: 'pur-huang-free', studentId: 'stu-huang', studentName: '黄总', packageId: 'pkg-gold', packageName: '小班训练营', amountPaid: 0, status: 'active', campusIds: ['chaojun', 'shunyi_mapo'], courseType: '小班课' },
    { id: 'pur-putao-free', studentId: 'stu-putao', studentName: '葡萄', packageId: 'pkg-gold', packageName: '小班训练营', amountPaid: 0, status: 'active', campusIds: ['chaojun', 'shunyi_mapo'], courseType: '小班课' }
  ],
  entitlements: [],
  entitlementLedger: [],
  packages: [],
  schedules: [],
  classes: [],
  courts: []
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
['public/assets/scripts/core/constants.js', 'public/assets/scripts/core/utils.js', 'public/assets/scripts/core/platform-data-standards.js', 'public/assets/scripts/pages/students.js'].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
});

const base = vm.runInContext('getStudentBaseList()', context);
assert.deepStrictEqual(base.map(s => s.name), ['一七&zzxxyy', '铣大象', 'misha', '黄总', '葡萄'], 'campus-filtered student list should include all five linked students');
assert.strictEqual(
  vm.runInContext('studentPageStats(getStudentBaseList()).total', context),
  5,
  'student top count should use the new active student roster count'
);

console.log('student campus filter linkage tests passed');
