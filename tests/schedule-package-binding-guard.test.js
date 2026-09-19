const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api/index.js');

const rules = api._test;
const scheduleSource = fs.readFileSync(
  path.join(__dirname, '..', 'public/assets/scripts/pages/schedule.js'),
  'utf8'
);

assert.ok(
  rules.assertScheduleEntitlementDeltasRequired,
  'schedule save should expose the package-binding guard'
);

assert.throws(
  () => rules.assertScheduleEntitlementDeltasRequired(
    {
      id: 'sch-yang-zitian',
      status: '已排课',
      settlementType: 'package',
      courseType: '私教课',
      lessonCount: 1,
      studentIds: ['stu-yang-zitian']
    },
    []
  ),
  /课包结算必须关联可用课包/,
  'package schedules must not save without a consumption entitlement'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementDeltasRequired(
    {
      id: 'sch-direct',
      status: '已排课',
      settlementType: 'direct',
      courseType: '私教课',
      lessonCount: 1,
      studentIds: ['stu-direct']
    },
    []
  ),
  'direct-paid schedules must not require a package'
);

assert.doesNotThrow(
  () => rules.assertScheduleEntitlementDeltasRequired(
    {
      id: 'sch-package-ok',
      status: '已排课',
      settlementType: 'package',
      courseType: '私教课',
      lessonCount: 1,
      studentIds: ['stu-yang-zitian']
    },
    [{ studentId: 'stu-yang-zitian', entitlementId: 'ent-baohong', delta: 1 }]
  ),
  'package schedules with a matching entitlement must remain valid'
);

assert.throws(
  () => rules.assertScheduleEntitlementDeltasRequired(
    {
      id: 'sch-wrong-student-package',
      status: '已排课',
      settlementType: 'package',
      courseType: '私教课',
      lessonCount: 1,
      studentIds: ['stu-yang-zitian']
    },
    [{ studentId: 'stu-other', entitlementId: 'ent-other', delta: 1 }]
  ),
  /课包结算必须关联实际上课学员的课包/,
  'a package for another student must not satisfy the current schedule'
);

assert.throws(
  () => rules.assertScheduleEntitlementDeltasRequired(
    {
      id: 'sch-multi-package',
      status: '已排课',
      settlementType: 'package',
      courseType: '小班课',
      lessonCount: 1,
      studentIds: ['stu-a', 'stu-b']
    },
    [{ studentId: 'stu-a', entitlementId: 'ent-a', delta: 1 }]
  ),
  /课包结算必须为每位实际上课学员关联课包/,
  'multi-student package schedules must not silently leave one student uncharged'
);

assert.match(
  scheduleSource,
  /课包结算必须选择课包，未保存/,
  'schedule editor must block an empty package selection before submitting'
);

console.log('schedule package binding guard tests passed');
