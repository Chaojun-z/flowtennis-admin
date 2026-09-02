const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/students.js'), 'utf8');

const elements = {
  stuSearch: { value: '' },
  stuTypeFilter: { value: '' },
  stuSourceFilter: { value: '' },
  stuCoachFilter: { value: '' }
};

const context = {
  console,
  currentPage: 'package-students',
  campus: 'all',
  students: [],
  coaches: [],
  teachingStudentViews: {
    activeStudents: [
      { id: 'active-real-mira', studentId: 'active-real-mira', name: 'Mira Chen', displayName: 'Mira Chen', phone: '13800000001', isActiveStudentRoster: true },
      { id: 'active-alice', studentId: 'active-alice', name: 'Alice', displayName: 'Alice', phone: '13800000002', isActiveStudentRoster: true }
    ],
    historicalStudents: [
      { id: 'active-real-mira', studentId: 'active-real-mira', name: 'Mira Chen', displayName: 'Mira Chen', phone: '13800000001', isActiveStudentRoster: true, isHistoricalStudentRoster: true },
      { id: 'ended-owner-mira', studentId: 'ended-owner-mira', name: 'Bob', displayName: 'Bob', phone: '13800000003', primaryCoach: 'Mira', searchText: 'Bob Mira', isHistoricalStudentRoster: true, isActiveStudentRoster: false }
    ],
    searchableStudents: [
      { id: 'active-real-mira', studentId: 'active-real-mira', name: 'Mira Chen', displayName: 'Mira Chen', phone: '13800000001', primaryCoach: 'Other', searchText: 'Mira Chen Other', isActiveStudentRoster: true },
      { id: 'ended-owner-mira', studentId: 'ended-owner-mira', name: 'Bob', displayName: 'Bob', phone: '13800000003', primaryCoach: 'Mira', searchText: 'Bob Mira', isHistoricalStudentRoster: true, isActiveStudentRoster: false }
    ],
    summary: {}
  },
  document: { getElementById: id => elements[id] || null },
  FlowTennisBusinessTaxonomy: { normalizeLeadSource: value => String(value || '').trim() },
  customerLifecycleText: value => String(value || '').trim(),
  customerLifecycleStudentStage: () => '',
  customerLifecycleByStudentId: () => null,
  teachingStudentViewRows: mode => mode === 'trial' ? context.teachingStudentViews.historicalStudents : context.teachingStudentViews.activeStudents,
  isHiddenStudentProfile: () => false,
  parseArr: value => Array.isArray(value) ? value : [],
  sameCampusValue: (a, b) => String(a || '') === String(b || ''),
  cn: value => String(value || ''),
  courtsForStudent: () => [],
  globalDateWithinRange: () => true,
  studentTagFilterMatches: () => true,
  studentPaymentModeText: row => String(row.paymentModeLabel || ''),
  studentPackageStatusText: row => String(row.packageStatusLabel || ''),
  studentActivityStatusText: row => String(row.activityStatusLabel || ''),
  studentLessonVolumeText: row => String(row.lessonVolumeLabel || ''),
  studentLifecycleStatusText: row => String(row.studentStatusLabel || ''),
  studentPrimaryCoachText: row => String(row.primaryCoach || ''),
  searchHit: (q, ...values) => {
    const keyword = String(q || '').trim().toLowerCase();
    return !keyword || values.some(value => String(value || '').toLowerCase().includes(keyword));
  }
};

vm.createContext(context);
vm.runInContext(source, context, { filename: 'public/assets/scripts/pages/students.js' });

context.students = [
  { id: 'profile-only-hu', name: '胡振浩', phone: '', campus: 'shunyi_mapo' }
];

elements.stuSearch.value = 'Mira';
const activeResults = JSON.parse(vm.runInContext('JSON.stringify(getFilteredStudents().map(row => row.id))', context));
assert.deepStrictEqual(
  activeResults,
  ['active-real-mira'],
  '在期学员搜 Mira 只能命中姓名/手机号，不能命中负责教练为 Mira 的历史学员'
);
assert.ok(
  activeResults.length <= context.teachingStudentViews.activeStudents.length,
  '在期学员搜索结果数量不能大于在期学员当前集合'
);

context.currentPage = 'trial-students';
const historicalResults = JSON.parse(vm.runInContext('JSON.stringify(getFilteredStudents().map(row => row.id))', context));
assert.deepStrictEqual(
  historicalResults,
  ['active-real-mira'],
  '历史学员搜 Mira 不能命中负责教练/隐藏搜索字段里的 Mira'
);

elements.stuSearch.value = '胡振浩';
const historicalProfileOnlyResults = JSON.parse(vm.runInContext('JSON.stringify(getFilteredStudents().map(row => row.id))', context));
assert.deepStrictEqual(
  historicalProfileOnlyResults,
  ['profile-only-hu'],
  '历史学员应能搜到已建档且可排课、但尚未上课未买课的学员'
);

context.currentPage = 'package-students';
const activeProfileOnlyResults = JSON.parse(vm.runInContext('JSON.stringify(getFilteredStudents().map(row => row.id))', context));
assert.deepStrictEqual(
  activeProfileOnlyResults,
  [],
  '在期学员不应展示未上课未买课的新建档学员'
);

console.log('student search scope tests passed');
