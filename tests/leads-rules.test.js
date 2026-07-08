const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules.extractLeadPhoneMeta, 'should expose lead helpers');
assert.deepStrictEqual(
  rules.extractLeadPhoneMeta('Mira/13800138000'),
  { raw: 'Mira/13800138000', phone: '13800138000', wechatName: 'Mira' }
);

assert.strictEqual(rules.deriveLeadSystemStatus({ rawStatus: '已报名-私教' }), '已成交');
assert.strictEqual(rules.deriveLeadSystemStatus({ rawStatus: '已定场' }), '已成交');
assert.strictEqual(rules.deriveLeadSystemStatus({ studentId: 'stu-1', courtId: 'court-1' }), '已成交');
assert.strictEqual(rules.deriveLeadDealType({}), '');
assert.strictEqual(rules.deriveLeadDealType({ studentId: 'stu-1' }), '');
assert.strictEqual(rules.deriveLeadDealType({ studentId: 'stu-1', isCourseConverted: true }), '课程');
assert.strictEqual(rules.deriveLeadDealType({ courtId: 'court-1' }), '订场');
assert.strictEqual(rules.deriveLeadDealType({ membershipAccountId: 'member-1' }), '订场会员');
assert.strictEqual(rules.deriveLeadDealType({ dealType: '会员' }), '订场会员');
assert.strictEqual(rules.deriveLeadDealType({ studentId: 'stu-1', isCourseConverted: true, courtId: 'court-1' }), '课程+订场');
assert.strictEqual(rules.deriveLeadDealType({ studentId: 'stu-1', isCourseConverted: true, membershipAccountId: 'member-1' }), '课程+订场会员');
assert.strictEqual(rules.deriveLeadDealType({ courtId: 'court-1', membershipAccountId: 'member-1' }), '订场+订场会员');
assert.strictEqual(rules.deriveLeadDealType({ studentId: 'stu-1', isCourseConverted: true, courtId: 'court-1', membershipAccountId: 'member-1' }), '课程+订场+订场会员');
assert.strictEqual(rules.deriveLeadConversionType({}), '');
assert.strictEqual(rules.deriveLeadConversionType({ studentId: 'stu-1', courtId: 'court-1' }), '订场');
assert.strictEqual(rules.deriveLeadConversionType({ studentId: 'stu-1', isCourseConverted: true, courtId: 'court-1' }), '课程+订场');
assert.strictEqual(rules.deriveLeadConversionType({ studentId: 'stu-1', isCourseConverted: true, membershipAccountId: 'member-1' }), '课程+订场会员');
assert.strictEqual(rules.deriveLeadConversionType({ courtId: 'court-1', membershipAccountId: 'member-1' }), '订场+订场会员');
assert.strictEqual(rules.deriveLeadConversionType({ studentId: 'stu-1', isCourseConverted: true, courtId: 'court-1', membershipAccountId: 'member-1' }), '课程+订场+订场会员');

const lead = rules.normalizeLeadRecord({
  '线索时间': '2026-04-10',
  '微信名/电话': 'Leah 13800138000',
  '水平': '2.5',
  '其他信息（包含年纪等）': '成人',
  '线索渠道': '大众点评',
  '需求产品': '成人私教',
  '意向等级': '高意向',
  '跟进优先级': 'P1',
  '跟进人': 'Mira',
  '跟进状态': '跟进中',
  '用户顾虑点': '价格',
  '沟通情况和方案建议': '继续跟进'
}, { id: 'lead-1', now: '2026-05-08 00:00:00' });

assert.strictEqual(lead.id, 'lead-1');
assert.strictEqual(lead.phone, '13800138000');
assert.strictEqual(lead.wechatName, 'Leah');
assert.strictEqual(rules.normalizeLeadRecord({ level: 0 }, { id: 'lead-zero', now: '2026-06-11 00:00:00' }).level, '0');
assert.strictEqual(lead.followupPriority, 'P1');
assert.strictEqual(rules.normalizeLeadRecord({ followupPriority: 'P9' }, { id: 'lead-bad-priority', now: '2026-06-11 00:00:00' }).followupPriority, '');
assert.strictEqual(lead.systemStatus, '跟进中');
assert.strictEqual(lead.customerType, '成人');
assert.strictEqual(lead.demandProduct, '私教课');
assert.strictEqual(lead.dealType, '');
assert.strictEqual(lead.conversionType, '');
assert.strictEqual(
  rules.normalizeLeadRecord({ '所属校区': '马坡' }, { id: 'lead-campus', now: '2026-05-08 00:00:00' }).campus,
  'shunyi_mapo'
);

const updated = rules.applyLeadFollowupSnapshot(lead, rules.normalizeLeadFollowupRecord({
  leadId: 'lead-1',
  followupAt: '2026-05-09 10:00',
  concern: '时间',
  conclusion: '已约体验',
  statusAfter: '已约体验',
  nextAction: '周末体验'
}, { id: 'fu-1', now: '2026-05-09 02:00:00' }));

assert.strictEqual(updated.lastFollowupAt, '2026-05-09 10:00');
assert.strictEqual(updated.latestConcern, '时间');
assert.strictEqual(updated.systemStatus, '已约体验');
assert.strictEqual(updated.conversionType, '');

const convertedFollowup = rules.normalizeLeadFollowupRecord({
  leadId: 'lead-1',
  followupAt: '2026-05-10',
  statusAfter: '已成交',
  dealType: '课程+会员'
}, { id: 'fu-deal', now: '2026-05-10 00:00:00' });
assert.strictEqual(convertedFollowup.dealType, '课程+订场会员');
const convertedLead = rules.applyLeadFollowupSnapshot(lead, convertedFollowup);
assert.strictEqual(convertedLead.systemStatus, '已成交');
assert.strictEqual(convertedLead.dealType, '课程+订场会员');
assert.throws(() => rules.normalizeLeadFollowupRecord({
  leadId: 'lead-1',
  statusAfter: '已成交'
}), /成交类型/, '已成交跟进必须选择成交类型');

assert.strictEqual(
  rules.buildLeadDedupKey({ displayName: 'Leah 13800138000', leadDate: '2026/4/7', source: '大众点评', consultType: '成人私教' }),
  rules.buildLeadDedupKey({ wechatName: 'Leah', phone: '13800138000', leadDate: '2026-04-07', source: '大众点评 ', consultType: ' 成人私教' })
);

const sameNameMerged = rules.mergeDuplicateLeadRows([
  rules.normalizeLeadRecord({
    displayName: 'MMJUAN',
    wechatName: 'MMJUAN',
    leadDate: '2026-06-03',
    source: '大众点评',
    consultType: '成人私教',
    profileNote: '咨询成人私教课',
    rawStatus: '跟进中'
  }, { id: 'old-lead', now: '2026-06-03 00:00:00' }),
  rules.normalizeLeadRecord({
    displayName: 'MMJUAN',
    wechatName: 'MMJUAN',
    leadDate: '2026-06-05',
    source: '大众点评',
    consultType: '成人私教',
    profileNote: '已经预约6月4日，18-19',
    rawStatus: '已约体验'
  }, { id: 'new-lead', now: '2026-06-05 00:00:00' })
]);
assert.strictEqual(sameNameMerged.length, 1, 'same wechat name leads should merge');
assert.strictEqual(sameNameMerged[0].id, 'old-lead', 'merge should keep the older lead id');
assert.strictEqual(sameNameMerged[0].leadDate, '2026-06-03', 'merge should keep the original lead date');
assert.strictEqual(sameNameMerged[0].profileNote, '已经预约6月4日，18-19', 'merge should keep the newer useful profile');
assert.strictEqual(sameNameMerged[0].systemStatus, '已约体验', 'merge should keep the stronger status');

console.log('leads rules tests passed');
