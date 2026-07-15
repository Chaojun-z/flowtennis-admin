const assert = require('assert');

const {
  buildCustomerLifecycleRows,
  buildLeadConversionSetsFromLifecycle
} = require('../server/read-models/customer-lifecycle.js');
const { buildLeadPoolRows, buildTeachingStudentViews } = require('../server/read-models/platform-metrics.js');

const rows = buildCustomerLifecycleRows({
  leads: [
    {
      id: 'lead-1',
      displayName: '小王',
      phone: '15000000000',
      source: '朋友转介绍',
      campus: 'shunyi_mapo',
      owner: '张教练',
      leadDate: '2026-06-01'
    }
  ],
  students: [
    {
      id: 'student-1',
      name: '小王',
      sourceLeadId: 'lead-1'
    }
  ],
  purchases: [
    {
      id: 'purchase-trial',
      studentId: 'student-1',
      courseType: '体验课',
      status: 'active',
      purchaseDate: '2026-06-02'
    },
    {
      id: 'purchase-formal',
      studentId: 'student-1',
      packageName: '成人私教课 10 节',
      status: 'active',
      purchaseDate: '2026-06-05'
    }
  ],
  courts: [
    {
      id: 'court-1',
      name: '小王',
      phone: '15000000000',
      sourceLeadId: 'lead-1',
      status: 'active'
    }
  ],
  membershipAccounts: [
    {
      id: 'membership-account-1',
      courtId: 'court-1',
      status: 'active',
      memberLabel: '黄金卡'
    }
  ],
  membershipOrders: [
    {
      id: 'membership-order-1',
      courtId: 'court-1',
      membershipAccountId: 'membership-account-1',
      rechargeAmount: 5000,
      status: 'active',
      purchaseDate: '2026-06-06'
    }
  ]
});

assert.strictEqual(rows.length, 1, 'same lead/student/court/member should collapse into one lifecycle row');

const row = rows[0];
assert.strictEqual(row.customerKey, 'lead:lead-1');
assert.strictEqual(row.sourceLeadId, 'lead-1');
assert.strictEqual(row.displayName, '小王');
assert.strictEqual(row.source, '转介绍', 'source should use the global source taxonomy');
assert.strictEqual(row.studentStage, 'formal', 'formal purchase should move the student out of trial stage');
assert.strictEqual(row.hasTrialExperience, true, 'formal students should keep the trial experience fact after conversion');
assert.strictEqual(row.courseDealPath, '体验转化', 'course deal path should be owned by the lifecycle read model');
assert.strictEqual(row.trialStatus, '已成交', 'trial status should be owned by the lifecycle read model');
assert.strictEqual(row.coursePurchaseCount, 1, 'formal course purchase count should be owned by the lifecycle read model');
assert.strictEqual(row.hasCourseRepeatPurchase, false, 'one formal course purchase is not course repeat');
assert.strictEqual(row.hasTrialToCourseConversion, true, 'trial to course conversion should be an explicit lifecycle fact');
assert.strictEqual(row.trialBookedAt, '2026-06-02');
assert.strictEqual(row.courtStage, 'member', 'membership account should make the court user a member view row');
assert.strictEqual(row.hasCourseConversion, true);
assert.strictEqual(row.hasBookingConversion, true);
assert.strictEqual(row.hasMembershipConversion, true, 'membership conversion should be derived from court-linked membership account');
assert.strictEqual(row.membershipAccountId, 'membership-account-1');

const sets = buildLeadConversionSetsFromLifecycle(rows);
assert.ok(sets.course.has('lead-1'), 'course conversion set should use lifecycle sourceLeadId');
assert.ok(sets.booking.has('lead-1'), 'booking conversion set should use lifecycle sourceLeadId');
assert.ok(sets.membership.has('lead-1'), 'membership conversion set should use lifecycle sourceLeadId');

const freePrivateRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-free-private',
      name: '小鹿',
      type: '成人',
      campus: 'shunyi_mapo',
      createdAt: '2026-05-20 00:00:00',
      notes: '未参加标准体验课，跟随朝军上免费私教课'
    }
  ],
  schedule: [
    {
      id: 'schedule-free-private',
      studentId: 'student-free-private',
      courseType: '私教课',
      coach: '朝军',
      status: '已结束',
      startTime: '2026-03-18 10:00:00',
      actualAmount: 0,
      paidAmount: 0,
      notes: '免费私教跟进'
    }
  ]
});

const freePrivate = freePrivateRows[0];
assert.strictEqual(freePrivate.leadDate, '', 'student-only synthetic lifecycle rows should not backfill lead time from later business behavior');
assert.strictEqual(freePrivate.firstTouchAt, '2026-03-18 10:00:00', 'first touch should keep the earliest known business behavior');
assert.strictEqual(freePrivate.source, '未知');
assert.strictEqual(freePrivate.customerType, '成人');
assert.strictEqual(freePrivate.demandProduct, '私教课');
assert.strictEqual(freePrivate.owner, 'Mira', 'shunyi_mapo synthetic leads without an owner should default to Mira');
assert.strictEqual(freePrivate.formalCoach, '', 'free private follow-up should not fill the paid deal coach field');
assert.strictEqual(freePrivate.hasCourseConversion, false, 'free classes without paid purchase should not count as course conversion');
assert.strictEqual(freePrivate.hasTrialExperience, false, 'free private classes should not be treated as standard trial lessons');

const freePrivateLeadRows = buildLeadPoolRows({ customerLifecycleRows: freePrivateRows, lifecycleScope: 'course' });
assert.strictEqual(freePrivateLeadRows[0].leadStage, '跟进中', 'free class follow-up should not become 已约体验 or 已成交');
assert.strictEqual(freePrivateLeadRows[0].demandProduct, '私教课');

const trialFeedbackRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-trial-feedback',
      name: '体验反馈学员',
      sourceLeadId: 'lead-trial-feedback'
    }
  ],
  feedbacks: [
    {
      id: 'feedback-trial',
      studentId: 'student-trial-feedback',
      courseType: '体验课',
      status: '已完成',
      createdAt: '2026-06-10 10:00:00'
    }
  ]
});
const trialFeedback = trialFeedbackRows[0];
assert.strictEqual(trialFeedback.studentStage, 'trial', '有体验课反馈记录的人必须进入普通学员');
assert.strictEqual(trialFeedback.hasTrialExperience, true, '体验课反馈记录必须算体验行为');
assert.strictEqual(trialFeedback.trialBookedAt, '2026-06-10 10:00:00');
assert.strictEqual(trialFeedback.trialStatus, '已体验待成交');

const staleMaterializedFreeRows = buildCustomerLifecycleRows({
  leads: [
    {
      id: 'lead-from-student-student-free-private',
      displayName: '小鹿',
      studentId: 'student-free-private',
      leadDate: '2026-03-01',
      leadStage: '已成交',
      systemStatus: '已成交',
      rawStatus: '已报名-私教',
      dealType: '课程',
      conversionType: '课程',
      isCourseConverted: true,
      createdAt: '2026-06-26 03:37:16'
    }
  ],
  students: [
    {
      id: 'student-free-private',
      name: '小鹿',
      campus: 'shunyi_mapo'
    }
  ],
  schedule: [
    {
      id: 'schedule-free-private',
      studentId: 'student-free-private',
      courseType: '私教课',
      status: '已结束',
      startTime: '2026-03-18 10:00:00',
      actualAmount: 0,
      paidAmount: 0
    }
  ]
});
const staleMaterializedFreeLeadRows = buildLeadPoolRows({ customerLifecycleRows: staleMaterializedFreeRows, lifecycleScope: 'course' });
assert.strictEqual(staleMaterializedFreeLeadRows[0].leadDate, '2026-03-01', 'manual corrected lead date should be preserved when it exists');
assert.strictEqual(staleMaterializedFreeLeadRows[0].leadStage, '跟进中', 'stale materialized deal fields must not override lifecycle facts for free course follow-up');
assert.strictEqual(staleMaterializedFreeLeadRows[0].dealType, '', 'free course follow-up should not keep stale course deal type');
const staleMaterializedFreeLeadRowsWithRawLead = buildLeadPoolRows({
  leads: [{
    id: 'lead-from-student-student-free-private',
    displayName: '小鹿',
    studentId: 'student-free-private',
    leadDate: '2026-03-01',
    leadStage: '已成交',
    systemStatus: '已成交',
    rawStatus: '已报名-私教',
    dealType: '课程',
    conversionType: '课程',
    isCourseConverted: true
  }],
  customerLifecycleRows: staleMaterializedFreeRows,
  lifecycleScope: 'course'
});
assert.strictEqual(staleMaterializedFreeLeadRowsWithRawLead[0].leadStage, '跟进中', 'raw lead stage must not override lifecycle facts when the student has no paid purchase');
assert.strictEqual(staleMaterializedFreeLeadRowsWithRawLead[0].dealType, '', 'raw lead deal type must not override lifecycle facts when the student has no paid purchase');

const linkedStudentDisplayRows = buildCustomerLifecycleRows({
  leads: [
    {
      id: 'lead-lian',
      displayName: '莲儿',
      wechatName: '莲儿',
      studentName: '莲儿（连女士）',
      studentId: 'student-lian',
      source: '大众点评',
      campus: 'shunyi_mapo',
      isCourseConverted: true
    }
  ],
  students: [
    {
      id: 'student-lian',
      name: '莲儿（连女士）',
      source: '大众点评',
      campus: 'shunyi_mapo'
    }
  ],
  purchases: [
    {
      id: 'purchase-lian',
      studentId: 'student-lian',
      studentName: '莲儿（连女士）',
      packageName: '成人1v1 黄金时间10课时',
      status: 'active',
      purchaseDate: '2026-04-23',
      amountPaid: 4000
    }
  ]
});
assert.strictEqual(linkedStudentDisplayRows[0].displayName, '莲儿（连女士）', 'student roster display name should prefer the real linked student name over the shorter lead display name');
const linkedStudentViews = buildTeachingStudentViews(linkedStudentDisplayRows, {
  students: [{ id: 'student-lian', name: '莲儿（连女士）', source: '大众点评', campus: 'shunyi_mapo' }],
  purchases: [{ id: 'purchase-lian', studentId: 'student-lian', studentName: '莲儿（连女士）', packageName: '成人1v1 黄金时间10课时', status: 'active', purchaseDate: '2026-04-23', amountPaid: 4000 }],
  entitlements: [{ id: 'entitlement-lian', studentId: 'student-lian', studentName: '莲儿（连女士）', totalLessons: 10, remainingLessons: 5, status: 'active' }],
  schedule: [{ id: 'schedule-lian', studentIds: ['student-lian'], studentName: '莲儿（连女士）', courseType: '私教课', status: '已结束', startTime: '2026-06-22 17:30' }]
});
assert.strictEqual(linkedStudentViews.activeStudents[0].name, '莲儿（连女士）', 'active student list should display the backend unified real student name');

const depletedRecentScheduledRows = buildCustomerLifecycleRows({
  students: [{ id: 'student-dede', name: '德德', campus: 'campus-main' }],
  purchases: [{
    id: 'purchase-dede',
    studentId: 'student-dede',
    studentName: '德德',
    courseType: '私教课',
    packageName: '1v1私教课 · 10课时 · 非黄金',
    status: 'active',
    purchaseDate: '2026-06-10',
    amountPaid: 6800
  }],
  entitlements: [{
    id: 'entitlement-dede',
    studentId: 'student-dede',
    studentName: '德德',
    courseType: '私教课',
    packageName: '1v1私教课 · 10课时 · 非黄金',
    totalLessons: 10,
    remainingLessons: 0,
    status: 'depleted'
  }],
  schedule: [{
    id: 'schedule-dede',
    studentIds: ['student-dede'],
    studentName: '德德',
    courseType: '私教课',
    status: '已排课',
    startTime: '2026-07-14 11:00'
  }]
});
const depletedRecentScheduledViews = buildTeachingStudentViews(depletedRecentScheduledRows, {
  students: [{ id: 'student-dede', name: '德德', campus: 'campus-main' }],
  purchases: [{ id: 'purchase-dede', studentId: 'student-dede', studentName: '德德', courseType: '私教课', packageName: '1v1私教课 · 10课时 · 非黄金', status: 'active', purchaseDate: '2026-06-10', amountPaid: 6800 }],
  entitlements: [{ id: 'entitlement-dede', studentId: 'student-dede', studentName: '德德', courseType: '私教课', packageName: '1v1私教课 · 10课时 · 非黄金', totalLessons: 10, remainingLessons: 0, status: 'depleted' }],
  schedule: [{ id: 'schedule-dede', studentIds: ['student-dede'], studentName: '德德', courseType: '私教课', status: '已排课', startTime: '2026-07-14 11:00' }],
  now: new Date(Date.UTC(2026,6,14,7,30,0))
});
assert.ok(
  depletedRecentScheduledViews.historicalStudents.some(row => row.studentId === 'student-dede'),
  '课包已用完但有过去已排课正式课的学员必须保留在历史学员'
);
assert.ok(
  depletedRecentScheduledViews.activeStudents.some(row => row.studentId === 'student-dede'),
  '课包已用完但近90天有过去已排课正式课的学员必须保留在在期学员'
);
assert.strictEqual(
  depletedRecentScheduledViews.activeStudents.find(row => row.studentId === 'student-dede').lastFormalLessonAt,
  '2026-07-14',
  '过去已排课正式课必须进入最近正式课日期'
);

const directPrivateRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-direct-private',
      name: '私教直转',
      type: '成人',
      campus: 'shunyi_mapo',
      createdAt: '2026-05-20 00:00:00'
    }
  ],
  purchases: [
    {
      id: 'purchase-direct-private',
      studentId: 'student-direct-private',
      packageName: '成人私教课 10 节',
      courseType: '私教课',
      status: 'active',
      actualAmount: 6800,
      purchaseDate: '2026-04-02'
    }
  ]
});

const directPrivate = directPrivateRows[0];
assert.strictEqual(directPrivate.leadDate, '', 'direct conversion without a raw lead should keep lead time empty');
assert.strictEqual(directPrivate.firstTouchAt, '2026-04-02', 'first touch should preserve the first paid business date');
assert.strictEqual(directPrivate.courseFirstPurchaseAt, '2026-04-02');
assert.strictEqual(directPrivate.conversionAt, '2026-04-02');
assert.strictEqual(directPrivate.demandProduct, '私教课');
assert.strictEqual(directPrivate.hasCourseConversion, true, 'paid private purchase should count as course conversion');
assert.strictEqual(directPrivate.courseDealPath, '直接成交');
assert.strictEqual(directPrivate.trialStatus, '', 'direct formal deals should not be mixed into trial-path closed status');
assert.strictEqual(directPrivate.coursePurchaseCount, 1);
assert.strictEqual(directPrivate.hasCourseRepeatPurchase, false);
assert.strictEqual(directPrivate.hasTrialToCourseConversion, false);

const formalPurchaseWithTrialNoteRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-formal-note',
      name: '备注含体验的正式成交',
      sourceLeadId: 'lead-formal-note'
    }
  ],
  purchases: [
    {
      id: 'purchase-formal-note',
      studentId: 'student-formal-note',
      packageName: '成人私教课 10 节',
      courseType: '私教课',
      status: 'active',
      actualAmount: 6800,
      purchaseDate: '2026-04-03',
      notes: '体验后直接购买，备注仅作跟进记录'
    }
  ]
});
const formalPurchaseWithTrialNote = formalPurchaseWithTrialNoteRows[0];
assert.strictEqual(formalPurchaseWithTrialNote.studentStage, 'formal', '正式课包备注里出现体验二字，不能把正式课包误判为体验课包');
assert.strictEqual(formalPurchaseWithTrialNote.hasTrialExperience, false, '订单备注不是体验路径事实证据');
assert.strictEqual(formalPurchaseWithTrialNote.courseDealPath, '直接成交');
assert.strictEqual(formalPurchaseWithTrialNote.hasTrialToCourseConversion, false);

const repeatRows = buildCustomerLifecycleRows({
  students: [{ id: 'student-repeat', name: '复购学员', sourceLeadId: 'lead-repeat' }],
  purchases: [
    { id: 'purchase-repeat-1', studentId: 'student-repeat', courseType: '私教课', status: 'active', actualAmount: 1000, purchaseDate: '2026-05-01' },
    { id: 'purchase-repeat-2', studentId: 'student-repeat', courseType: '小班课', status: 'active', actualAmount: 800, purchaseDate: '2026-06-01' }
  ],
  entitlements: [
    { id: 'ent-repeat-1', studentId: 'student-repeat', purchaseId: 'purchase-repeat-1', courseType: '私教课', status: 'active', totalLessons: 10 },
    { id: 'ent-repeat-2', studentId: 'student-repeat', purchaseId: 'purchase-repeat-2', courseType: '小班课', status: 'active', totalLessons: 10 }
  ]
});
const repeatStudent = repeatRows[0];
assert.strictEqual(repeatStudent.coursePurchaseCount, 2, 'purchase-linked entitlements must not double count formal purchase count');
assert.strictEqual(repeatStudent.hasCourseRepeatPurchase, true, 'second formal package purchase should mark course repeat');
assert.strictEqual(repeatStudent.courseDealPath, '老客续费');

const directPrivateLeadRows = buildLeadPoolRows({ customerLifecycleRows: directPrivateRows, lifecycleScope: 'course' });
assert.strictEqual(directPrivateLeadRows[0].leadStage, '已成交');
assert.strictEqual(directPrivateLeadRows[0].dealType, '课程');
assert.strictEqual(directPrivateLeadRows[0].enrollAtRaw, '2026-04-02');

console.log('customer lifecycle read model tests passed');
