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
assert.strictEqual(owner?.detailPackageBalanceText, '9/10', '授权使用后课包主人余额应读取课包事实余额');

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
assert.strictEqual(pendingRow?.studentLessonSequenceText, '', '待上课排课不能占用累计上课编号，避免列表和抽屉记录累计数不一致');

const overdueScheduledResult = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-overdue-scheduled', name: '已排课未扣课学员' }],
  purchases: [
    { id: 'purchase-overdue-scheduled', studentId: 'student-overdue-scheduled', packageName: '1v1私教课 · 10课时 · 黄金', courseType: '私教课', packageLessons: 10, amountPaid: 4500, status: 'active', purchaseDate: '2026-08-01' }
  ],
  entitlements: [
    { id: 'ent-overdue-scheduled', studentId: 'student-overdue-scheduled', purchaseId: 'purchase-overdue-scheduled', packageName: '1v1私教课 · 10课时 · 黄金', courseType: '私教课', totalLessons: 10, remainingLessons: 10, usedLessons: 0, status: 'active' }
  ],
  entitlementLedger: [],
  schedule: [
    { id: 'schedule-overdue-scheduled', studentId: 'student-overdue-scheduled', studentIds: ['student-overdue-scheduled'], startTime: '2026-08-09 10:00:00', endTime: '2026-08-09 11:00:00', status: '已排课', courseType: '私教课', coach: '王教练', lessonCount: 1, entitlementId: 'ent-overdue-scheduled', purchaseId: 'purchase-overdue-scheduled' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const overdueScheduledStudent = [
  ...overdueScheduledResult.teachingStudentViews.historicalStudents,
  ...overdueScheduledResult.teachingStudentViews.activeStudents
].find(row => row.studentId === 'student-overdue-scheduled');
const overdueScheduledRow = overdueScheduledStudent?.detailLessonRecordRows.find(row => row.scheduleId === 'schedule-overdue-scheduled');
assert.strictEqual(overdueScheduledStudent?.completedLessons, 0, '已排课但未完成/未扣课的历史排课不能计入累计上课');
assert.strictEqual(overdueScheduledRow?.countAsCompletedLesson, false, '已排课未扣课记录只能作为占用/待核对展示');
assert.strictEqual(overdueScheduledRow?.studentLessonSequenceText, '', '已排课未扣课记录不能显示累计第几节');

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

const authorizedSharedPackageResult = buildPlatformMetrics({
  leads: [],
  students: [
    { id: 'student-shared-owner', name: '十一' },
    { id: 'student-shared-user', name: '达达' }
  ],
  purchases: [
    { id: 'purchase-shared-package', studentId: 'student-shared-owner', packageName: '1v1私教课 · 10课时 · 非黄金', courseType: '私教课', packageLessons: 10, amountPaid: 4000, status: 'active', purchaseDate: '2026-07-31' }
  ],
  entitlements: [
    { id: 'ent-shared-package', studentId: 'student-shared-owner', purchaseId: 'purchase-shared-package', packageName: '1v1私教课 · 10课时 · 非黄金', courseType: '私教课', totalLessons: 10, remainingLessons: 0, usedLessons: 10, status: 'depleted' }
  ],
  entitlementLedger: [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `ledger-shared-owner-${index + 1}`,
      studentId: 'student-shared-owner',
      usedByStudentId: 'student-shared-owner',
      packageOwnerStudentId: 'student-shared-owner',
      entitlementId: 'ent-shared-package',
      purchaseId: 'purchase-shared-package',
      scheduleId: `schedule-shared-owner-${index + 1}`,
      lessonDelta: -1,
      relatedDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
      reason: '排课消课'
    })),
    {
      id: 'ledger-shared-authorized',
      studentId: 'student-shared-user',
      usedByStudentId: 'student-shared-user',
      packageOwnerStudentId: 'student-shared-owner',
      entitlementId: 'ent-shared-package',
      purchaseId: 'purchase-shared-package',
      scheduleId: 'schedule-shared-authorized',
      lessonDelta: -1,
      relatedDate: '2026-08-18',
      reason: '排课消课（达达 使用 十一 的课包）'
    }
  ],
  schedule: [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `schedule-shared-owner-${index + 1}`,
      studentId: 'student-shared-owner',
      studentIds: ['student-shared-owner'],
      startTime: `2026-08-${String(index + 1).padStart(2, '0')} 10:00:00`,
      endTime: `2026-08-${String(index + 1).padStart(2, '0')} 11:00:00`,
      status: '已结束',
      courseType: '私教课',
      coach: '林铭教练',
      lessonCount: 1,
      entitlementId: 'ent-shared-package',
      purchaseId: 'purchase-shared-package'
    })),
    {
      id: 'schedule-shared-authorized',
      studentId: 'student-shared-owner',
      studentIds: ['student-shared-owner'],
      startTime: '2026-08-18 10:00:00',
      endTime: '2026-08-18 11:00:00',
      status: '已结束',
      courseType: '私教课',
      coach: '林铭教练',
      lessonCount: 1,
      entitlementId: 'ent-shared-package',
      purchaseId: 'purchase-shared-package'
    }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-09-16 00:00:00')
});
const sharedRows = [
  ...authorizedSharedPackageResult.teachingStudentViews.historicalStudents,
  ...authorizedSharedPackageResult.teachingStudentViews.activeStudents
];
const sharedOwner = sharedRows.find(row => row.studentId === 'student-shared-owner');
const sharedUser = sharedRows.find(row => row.studentId === 'student-shared-user');
assert.strictEqual(sharedOwner?.detailPackageBalanceText, '0/10', '授权使用课包后，课包主人余额必须按课包事实余额显示为 0/10');
assert.strictEqual(sharedOwner?.completedLessons, 9, '授权学员上课不能增加课包主人的累计上课');
assert.strictEqual(sharedUser?.completedLessons, 1, '授权学员上课必须计入实际使用人的累计上课');
assert.ok(
  sharedOwner?.detailLessonRecordRows.some(row => row.lessonRelationText === '达达 使用了 十一 的课包' && row.countAsCompletedLesson === false),
  '课包主人应看到授权扣课审计记录，但不能被算成本人上课'
);
const sharedOwnerAuditRow = sharedOwner?.detailLessonRecordRows.find(row => row.lessonRelationText === '达达 使用了 十一 的课包');
assert.strictEqual(sharedOwnerAuditRow?.packageLessonProgressText, '第10/10节', '课包主人审计记录仍应按课包整体进度展示第 10/10 节');
assert.strictEqual(sharedOwnerAuditRow?.packageRemainingAfterText, '剩0节', '课包主人审计记录应显示已扣课后的真实剩余，而不是预计剩余');

const switchedPackageStudentId = 'student-switched-package';
const switchedPackageOwnerId = 'student-switched-package-owner';
const switchedPackageSchedules = [
  ...Array.from({ length: 7 }, (_, index) => ({
    id: `schedule-switched-own-${index + 1}`,
    studentId: switchedPackageStudentId,
    studentIds: [switchedPackageStudentId],
    startTime: `2026-09-${String(index + 1).padStart(2, '0')} 10:00`,
    status: '已结束',
    courseType: '私教课',
    lessonCount: 1,
    entitlementId: 'ent-switched-own',
    purchaseId: 'purchase-switched-own'
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `schedule-switched-authorized-${index + 1}`,
    studentId: switchedPackageStudentId,
    studentIds: [switchedPackageStudentId],
    startTime: `2026-09-${String(index + 10).padStart(2, '0')} 10:00`,
    status: '已结束',
    courseType: '私教课',
    lessonCount: 1,
    entitlementId: 'ent-switched-owner',
    purchaseId: 'purchase-switched-owner',
    packageOwnerStudentId: switchedPackageOwnerId,
    usedByStudentId: switchedPackageStudentId
  }))
];
const switchedPackageResult = buildPlatformMetrics({
  leads: [],
  students: [
    { id: switchedPackageStudentId, name: '切换课包学员' },
    { id: switchedPackageOwnerId, name: '切换课包主人' }
  ],
  purchases: [
    { id: 'purchase-switched-own', studentId: switchedPackageStudentId, packageName: '非黄金10课时', courseType: '私教课', packageLessons: 10, amountPaid: 3500, purchaseDate: '2026-05-19', status: 'active' },
    { id: 'purchase-switched-owner', studentId: switchedPackageOwnerId, packageName: '黄金10课时', courseType: '私教课', packageLessons: 10, amountPaid: 4000, purchaseDate: '2026-05-19', status: 'active' }
  ],
  entitlements: [
    { id: 'ent-switched-own', studentId: switchedPackageStudentId, purchaseId: 'purchase-switched-own', packageName: '非黄金10课时', courseType: '私教课', totalLessons: 10, remainingLessons: 3, usedLessons: 7, status: 'active' },
    { id: 'ent-switched-owner', studentId: switchedPackageOwnerId, purchaseId: 'purchase-switched-owner', packageName: '黄金10课时', courseType: '私教课', totalLessons: 10, remainingLessons: 2, usedLessons: 8, status: 'active' }
  ],
  entitlementLedger: switchedPackageSchedules.map(schedule => ({
    id: `ledger-${schedule.id}`,
    scheduleId: schedule.id,
    studentId: switchedPackageStudentId,
    usedByStudentId: switchedPackageStudentId,
    packageOwnerStudentId: schedule.packageOwnerStudentId || switchedPackageStudentId,
    entitlementId: schedule.entitlementId,
    purchaseId: schedule.purchaseId,
    lessonDelta: -1,
    relatedDate: schedule.startTime.slice(0, 10),
    reason: schedule.packageOwnerStudentId ? '编辑排课消课（切换课包学员 使用 切换课包主人 的课包）' : '排课消课'
  })),
  schedule: switchedPackageSchedules,
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-09-20 00:00:00')
});
const switchedPackageRow = switchedPackageResult.teachingStudentViews.historicalStudents
  .find(row => row.studentId === switchedPackageStudentId);
assert.strictEqual(
  switchedPackageRow?.detailPackageBalanceText,
  '3/10',
  '授权借用的3节课不能覆盖本人事实课包余额3/10'
);

const groupData = {
  students: ['owner-a', 'owner-b', 'gift-user'].map(id => ({ id, name: id })),
  purchases: ['owner-a', 'owner-b'].map(id => ({ id: `p-${id}`, studentId: id, packageName: '10课时私教课', courseType: '私教课', packageLessons: 10, amountPaid: 4000 })),
  entitlements: ['owner-a', 'owner-b'].map(id => ({ id: `e-${id}`, purchaseId: `p-${id}`, studentId: id, packageName: '10课时私教课', courseType: '私教课', totalLessons: 10, remainingLessons: 9 })),
  entitlementLedger: ['owner-a', 'owner-b'].map(id => ({ id: `l-${id}`, studentId: id, entitlementId: `e-${id}`, scheduleId: 'group', lessonDelta: -1, relatedDate: '2026-09-01', reason: '排课消课' })),
  schedule: [{ id: 'group', studentIds: ['owner-a', 'owner-b', 'gift-user'], courseType: '私教课', startTime: '2026-09-01 10:00', endTime: '2026-09-01 11:00', status: '已排课', lessonCount: 1, settlementType: 'package', entitlementId: 'e-owner-a',
    studentSettlementRows: [
      { studentId: 'owner-a', settlementType: 'package', entitlementId: 'e-owner-a' },
      { studentId: 'owner-b', settlementType: 'package', entitlementId: 'e-owner-b' },
      { studentId: 'gift-user', settlementType: 'gift', amount: 0, entitlementId: 'unused-legacy-entitlement' }
    ] }],
  now: new Date('2026-09-18T00:00:00+08:00')
};
const groupRows = buildPlatformMetrics(groupData).teachingStudentViews.historicalStudents;
for (const id of ['owner-a', 'owner-b', 'gift-user']) {
  const row = groupRows.find(item => item.studentId === id);
  assert.strictEqual(row?.completedLessons, 1, '同课多人分别结算，每人仅计算本人的一次上课');
  assert.notStrictEqual(row?.packageStatusLabel, '使用他人课包', '同课并不代表借用其他人的课包');
  assert.ok(row.detailLessonRecordRows.every(item => !item.packageOwnerStudentId || item.packageOwnerStudentId === id));
}
const giftUser = groupRows.find(row => row.studentId === 'gift-user');
assert.strictEqual(giftUser.paymentModeLabel, '单次付费学员', '0元赠送课沿用单次标签');
assert.strictEqual(giftUser.detailLessonRecordRows[0].entitlementId, '', '赠送课不能继承整节课或历史残留的权益ID');

const mixedData = {
  ...groupData,
  entitlementLedger: [{ ...groupData.entitlementLedger[0], studentId: 'gift-user', usedByStudentId: 'gift-user', packageOwnerStudentId: 'owner-a' }],
  schedule: [
    { ...groupData.schedule[0], studentIds: ['gift-user'], studentSettlementRows: [{ studentId: 'gift-user', settlementType: 'package', entitlementId: 'e-owner-a' }], status: '已结束' },
    { id: 'direct', studentIds: ['gift-user'], courseType: '私教课', startTime: '2026-09-02 10:00', endTime: '2026-09-02 11:00', status: '已结束', lessonCount: 1, settlementType: 'direct', paidAmount: 200 }
  ]
};
const mixedUser = buildPlatformMetrics(mixedData).teachingStudentViews.historicalStudents.find(row => row.studentId === 'gift-user');
assert.strictEqual(mixedUser.packageStatusLabel, '使用他人课包', '真实授权使用仍保留借用标签');
assert.strictEqual(mixedUser.paymentModeLabel, '单次付费学员', '借用课包不能遮蔽独立的单次付费记录');
assert.strictEqual(mixedUser.completedLessons, 2);

const trialOnly = buildPlatformMetrics({ students: [{id:'trial-only',name:'体验学员'}], schedule:[{
  id:'trial-only-schedule',studentId:'trial-only',courseType:'体验课',status:'已结束',startTime:'2026-09-01 10:00',endTime:'2026-09-01 11:00'
}], now:groupData.now }).teachingStudentViews.historicalStudents.find(row=>row.studentId==='trial-only');
assert.strictEqual(trialOnly.paymentModeLabel,'体验课','只有体验记录且没有购买记录时仍保留体验标签');

console.log('authorized package owner attendance tests passed');
