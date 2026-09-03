const assert = require('assert');
const { buildPlatformMetrics } = require('../server/read-models/platform-metrics');

const result = buildPlatformMetrics({
  leads: [],
  students: [
    { id: 'student-auth-owner', name: '课包主人' },
    { id: 'student-auth-user', name: '授权学员' }
  ],
  purchases: [
    { id: 'purchase-auth-package', studentId: 'student-auth-owner', packageName: '授权正式课包', courseType: '私教课', packageLessons: 10, amountPaid: 4500, status: 'active', purchaseDate: '2026-07-01' }
  ],
  entitlements: [
    { id: 'ent-auth-package', studentId: 'student-auth-owner', purchaseId: 'purchase-auth-package', packageName: '授权正式课包', courseType: '私教课', totalLessons: 10, remainingLessons: 9, usedLessons: 1, status: 'active' }
  ],
  entitlementLedger: [
    {
      id: 'ledger-auth-package',
      studentId: 'student-auth-user',
      usedByStudentId: 'student-auth-user',
      packageOwnerStudentId: 'student-auth-owner',
      entitlementId: 'ent-auth-package',
      purchaseId: 'purchase-auth-package',
      scheduleId: 'schedule-auth-package',
      lessonDelta: -1,
      relatedDate: '2026-08-03',
      reason: '授权使用'
    }
  ],
  schedule: [
    { id: 'schedule-auth-package', studentId: 'student-auth-user', studentIds: ['student-auth-user'], startTime: '2026-08-03 10:00:00', endTime: '2026-08-03 11:00:00', status: '已结束', courseType: '私教课', coach: '王教练', lessonCount: 1 }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});

const rows = [
  ...result.teachingStudentViews.historicalStudents,
  ...result.teachingStudentViews.activeStudents
];
const owner = rows.find(row => row.studentId === 'student-auth-owner');
const user = rows.find(row => row.studentId === 'student-auth-user');

assert.strictEqual(user?.completedLessons, 1, '授权使用人应计入本人的上课记录');
assert.strictEqual(owner?.completedLessons, 0, '课包主人未上课时不能被计入上课');
assert.deepStrictEqual(
  owner?.detailLessonRecordRows.map(row => [row.lessonRelationText, row.countAsCompletedLesson]),
  [['授权学员 使用了 课包主人 的课包', false]],
  '课包主人只能看到扣自己课包的审计记录，不能被算成实际上课人'
);

const pendingSectionResult = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-pending-section', name: '待上课编号学员' }],
  purchases: [
    { id: 'purchase-pending-section', studentId: 'student-pending-section', packageName: '1v1私教课 · 10课时 · 黄金', courseType: '私教课', packageLessons: 10, amountPaid: 4500, status: 'active', purchaseDate: '2026-08-01' }
  ],
  entitlements: [
    { id: 'ent-pending-section', studentId: 'student-pending-section', purchaseId: 'purchase-pending-section', packageName: '1v1私教课 · 10课时 · 黄金', courseType: '私教课', totalLessons: 10, remainingLessons: 9, usedLessons: 1, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'ledger-pending-section-1', studentId: 'student-pending-section', entitlementId: 'ent-pending-section', purchaseId: 'purchase-pending-section', scheduleId: 'schedule-pending-section-1', lessonDelta: -1, relatedDate: '2026-08-03' }
  ],
  schedule: [
    { id: 'schedule-pending-section-1', studentId: 'student-pending-section', studentIds: ['student-pending-section'], startTime: '2026-08-03 10:00:00', endTime: '2026-08-03 11:00:00', status: '已结束', courseType: '私教课', coach: '王教练', lessonCount: 1, entitlementId: 'ent-pending-section', purchaseId: 'purchase-pending-section' },
    { id: 'schedule-pending-section-2', studentId: 'student-pending-section', studentIds: ['student-pending-section'], startTime: '2026-08-12 10:00:00', endTime: '2026-08-12 11:00:00', status: '已排课', courseType: '私教课', coach: '王教练', lessonCount: 1, entitlementId: 'ent-pending-section', purchaseId: 'purchase-pending-section' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const pendingStudent = [
  ...pendingSectionResult.teachingStudentViews.historicalStudents,
  ...pendingSectionResult.teachingStudentViews.activeStudents
].find(row => row.studentId === 'student-pending-section');
const pendingRow = pendingStudent?.detailLessonRecordRows.find(row => row.scheduleId === 'schedule-pending-section-2');
assert.strictEqual(pendingRow?.lessonSectionText, '[第02节]', '待上课排课应显示预计第几节');
assert.strictEqual(pendingRow?.countAsCompletedLesson, false, '待上课排课显示预计编号时不能计入累计上课');
assert.strictEqual(pendingRow?.studentLessonSequenceText, '[累计第02节]', '待上课排课应显示预计累计第几节');

const multiPackageResult = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-multi-package', name: '跨课包学员' }],
  purchases: [
    { id: 'purchase-multi-a', studentId: 'student-multi-package', packageName: 'A课包', courseType: '私教课', packageLessons: 10, amountPaid: 4500, status: 'active', purchaseDate: '2026-07-01' },
    { id: 'purchase-multi-b', studentId: 'student-multi-package', packageName: 'B课包', courseType: '私教课', packageLessons: 10, amountPaid: 4500, status: 'active', purchaseDate: '2026-08-01' }
  ],
  entitlements: [
    { id: 'ent-multi-a', studentId: 'student-multi-package', purchaseId: 'purchase-multi-a', packageName: 'A课包', courseType: '私教课', totalLessons: 10, remainingLessons: 8, usedLessons: 2, status: 'active' },
    { id: 'ent-multi-b', studentId: 'student-multi-package', purchaseId: 'purchase-multi-b', packageName: 'B课包', courseType: '私教课', totalLessons: 10, remainingLessons: 8, usedLessons: 2, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'ledger-multi-a-1', studentId: 'student-multi-package', entitlementId: 'ent-multi-a', purchaseId: 'purchase-multi-a', scheduleId: 'schedule-multi-a-1', lessonDelta: -1, relatedDate: '2026-08-01' },
    { id: 'ledger-multi-b-1', studentId: 'student-multi-package', entitlementId: 'ent-multi-b', purchaseId: 'purchase-multi-b', scheduleId: 'schedule-multi-b-1', lessonDelta: -1, relatedDate: '2026-08-02' },
    { id: 'ledger-multi-a-2', studentId: 'student-multi-package', entitlementId: 'ent-multi-a', purchaseId: 'purchase-multi-a', scheduleId: 'schedule-multi-a-2', lessonDelta: -1, relatedDate: '2026-08-03' },
    { id: 'ledger-multi-b-2', studentId: 'student-multi-package', entitlementId: 'ent-multi-b', purchaseId: 'purchase-multi-b', scheduleId: 'schedule-multi-b-2', lessonDelta: -1, relatedDate: '2026-08-04' }
  ],
  schedule: [
    { id: 'schedule-multi-a-1', studentId: 'student-multi-package', studentIds: ['student-multi-package'], startTime: '2026-08-01 10:00:00', status: '已结束', courseType: '私教课', lessonCount: 1 },
    { id: 'schedule-multi-b-1', studentId: 'student-multi-package', studentIds: ['student-multi-package'], startTime: '2026-08-02 10:00:00', status: '已结束', courseType: '私教课', lessonCount: 1 },
    { id: 'schedule-multi-a-2', studentId: 'student-multi-package', studentIds: ['student-multi-package'], startTime: '2026-08-03 10:00:00', status: '已结束', courseType: '私教课', lessonCount: 1 },
    { id: 'schedule-multi-b-2', studentId: 'student-multi-package', studentIds: ['student-multi-package'], startTime: '2026-08-04 10:00:00', status: '已结束', courseType: '私教课', lessonCount: 1 }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const multiPackageStudent = [
  ...multiPackageResult.teachingStudentViews.historicalStudents,
  ...multiPackageResult.teachingStudentViews.activeStudents
].find(row => row.studentId === 'student-multi-package');
assert.deepStrictEqual(
  [...(multiPackageStudent?.detailLessonRecordRows || [])]
    .sort((a, b) => String(a.sortTime || '').localeCompare(String(b.sortTime || '')))
    .map(row => [row.lessonSectionText, row.studentLessonSequenceText]),
  [
    ['[第01节]', '[累计第01节]'],
    ['[第01节]', '[累计第02节]'],
    ['[第02节]', '[累计第03节]'],
    ['[第02节]', '[累计第04节]']
  ],
  '跨课包学员应保留课包内第几节，同时给出连续的学员累计第几节'
);

console.log('authorized package owner attendance tests passed');
