const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/leads.js'), 'utf8');
const context = {
  console,
  leads: [],
  leadFollowups: [],
  purchases: [],
  students: [],
  courts: [],
  campuses: [],
  campus: 'all',
  currentUser: null,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  window: {},
  esc: value => String(value ?? ''),
  setTimeout: () => null,
  Date
};
vm.createContext(context);
vm.runInContext(source, context);

context.leadFollowups = [
  {
    id: 'old-short',
    leadId: 'lead-1',
    followupAt: '2026-05-07',
    followupBy: '@Mira',
    statusAfter: '体验课预约',
    communicationNote: '天昊上课'
  },
  {
    id: 'new-long',
    leadId: 'lead-1',
    followupAt: '2026/5/7',
    followupBy: '@Mira',
    statusAfter: '无意向',
    communicationNote: '天昊上课；课后跟进学员上课体验，对方想找单反，还要再考虑；第二次安排刘润扬教练上课，还是要考虑，感觉是白嫖'
  },
  {
    id: 'same-day-longer',
    leadId: 'lead-1',
    followupAt: '2026/5/6',
    followupBy: '@Mira',
    statusAfter: '已沟通',
    communicationNote: '觉得体验课价格高，有点犹豫；5月8日预约下周二的体验课；5月12日，宋教练回学校答辩，无教练上课，改到其他日期'
  },
  {
    id: 'same-day-shorter',
    leadId: 'lead-1',
    followupAt: '2026-05-06',
    followupBy: '@Mira',
    statusAfter: '已沟通',
    communicationNote: '觉得体验课价格高，有点犹豫；5月8日预约下周二的体验课'
  },
  {
    id: 'missing-owner',
    leadId: 'lead-1',
    followupAt: '2026-05-05',
    followupBy: '',
    statusAfter: '',
    communicationNote: '未通过好友申请'
  },
  {
    id: 'named-owner',
    leadId: 'lead-1',
    followupAt: '2026/5/5',
    followupBy: '@Mira',
    statusAfter: '',
    communicationNote: '未通过好友申请'
  },
  {
    id: 'converted-long',
    leadId: 'lead-1',
    followupAt: '2026-04-29',
    followupBy: '@Mira',
    statusAfter: '已报名-私教',
    communicationNote: '介绍了教练和价格后未回复；约了siren体验课'
  },
  {
    id: 'unconverted-short',
    leadId: 'lead-1',
    followupAt: '2026/4/29',
    followupBy: '@Mira',
    statusAfter: '已沟通',
    communicationNote: '介绍了教练和价格后未回复'
  }
];

const rows = context.leadFollowupRows('lead-1');
assert.strictEqual(rows.length, 8, 'each followup should remain editable as its own row');
assert.strictEqual(context.leadFollowupCount({ id: 'lead-1' }), 8, 'followup count should use real editable rows');
assert.match(context.leadTimelineHtml({ id: 'lead-1' }), /openLeadFollowupModal\('lead-1','old-short'\)/, 'timeline should expose edit action for each followup');
assert.strictEqual(
  context.leadTimelineLineText(rows[0]),
  '2026-05-07 · [Mira跟进 · 未转化]：天昊上课'
);
assert.strictEqual(
  context.leadTimelineLineText(rows[1]),
  '2026-05-07 · [Mira跟进 · 未转化] · 天昊上课：课后跟进学员上课体验，对方想找单反，还要再考虑；第二次安排刘润扬教练上课，还是要考虑，感觉是白嫖'
);
assert.strictEqual(
  context.leadTimelineLineText(rows[2]),
  '2026-05-06 · [Mira跟进 · 未转化]：觉得体验课价格高，有点犹豫；5月8日预约下周二的体验课'
);
assert.strictEqual(
  context.leadTimelineLineText(rows[3]),
  '2026-05-06 · [Mira跟进 · 未转化]：觉得体验课价格高，有点犹豫；5月8日预约下周二的体验课；5月12日，宋教练回学校答辩，无教练上课，改到其他日期'
);
assert.strictEqual(
  context.leadTimelineLineText(rows[6]),
  '2026-04-29 · [Mira跟进 · 未转化]：介绍了教练和价格后未回复'
);

console.log('leads followup structure tests passed');
