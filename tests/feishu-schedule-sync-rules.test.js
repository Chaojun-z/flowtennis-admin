const assert = require('assert');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const sync = require('../server/feishu-schedule-sync-routes');

const RealDate = Date;
async function withFixedDate(iso, fn) {
  const fixedTime = new RealDate(iso).getTime();
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime]));
    }
    static now() {
      return fixedTime;
    }
  }
  global.Date = FixedDate;
  try {
    return await fn();
  } finally {
    global.Date = RealDate;
  }
}

const values = [
  ['时间', null, null, '马坡室内', null, null, null, '晓哲教练', null, null, null],
  ['日期', '星期', '时段', '1号', '2号', '3号', '4号', '课程', '场馆', '场地号', '学员'],
  [46223, '一', ' 12:00–12:30 ', null, null, '晓哲', null, '成人私教【正式】', '马坡室内', '3号', 'wjing（11）'],
  [null, null, ' 12:30–13:00 ', null, null, null, null, null, null, null, null],
  [null, null, ' 13:00–13:30 ', null, null, null, null, null, null, null, null],
  [null, null, ' 13:30–14:00 ', null, null, null, null, '青少年私教【体验】', '马坡室内', '2号', '杜一诺']
];

const merges = [
  { start_row_index: 2, end_row_index: 4, start_column_index: 7, end_column_index: 7 },
  { start_row_index: 2, end_row_index: 4, start_column_index: 8, end_column_index: 8 },
  { start_row_index: 2, end_row_index: 4, start_column_index: 9, end_column_index: 9 },
  { start_row_index: 2, end_row_index: 4, start_column_index: 10, end_column_index: 10 }
];

const courses = sync.parseFeishuScheduleRows({ values, merges, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });

assert.strictEqual(courses.length, 2, 'merged 1.5h course should be one course, not three 30-minute courses');
assert.strictEqual(courses[0].startTime, '2026-07-20 12:00', 'excel date should be converted to the schedule date');
assert.strictEqual(courses[0].endTime, '2026-07-20 13:30', 'merged rows should extend end time to the last merged slot');
assert.strictEqual(courses[0].durationMinutes, 90, 'merged 3 slots should be 90 minutes');
assert.strictEqual(courses[0].lessonCount, 1.5, 'merged 90 minutes should be 1.5 lesson hours');
assert.deepStrictEqual(courses[0].studentNames, ['wjing'], 'student parser should remove bracket lesson index');
assert.strictEqual(courses[0].lessonIndex, 11, 'student parser should keep bracket lesson index as metadata');
assert.strictEqual(sync.normalizeNameKey('W.Jing'), sync.normalizeNameKey('wjing（11）'), 'student aliases should ignore case, dot, spaces and bracket text');
assert.deepStrictEqual(sync.parseStudentCell('晨曦、朋友（2）').names, ['晨曦'], '晨曦、朋友 should only schedule the package owner');
assert.strictEqual(sync.parseStudentCell('晨曦、朋友（2）').lessonIndex, 2, '晨曦、朋友 should keep the package lesson index');
assert.deepStrictEqual(sync.parseStudentCell('德德（使用小林课包 2）').names, ['小林'], 'shared package note should schedule the package owner');
assert.strictEqual(sync.parseStudentCell('德德（使用小林课包 2）').lessonIndex, 2, 'shared package note should keep the package lesson index');
assert.strictEqual(sync.parseStudentCell('德德（使用小林课包 2）').sharedPackageNote, '德德使用小林课包 2', 'shared package note should be preserved for schedule notes');
assert.strictEqual(sync.parseStudentCell('德德（使用小林课包 2）').sharedPackageAttendeeName, '德德', 'shared package note should keep the actual learner');
assert.strictEqual(sync.parseStudentCell('德德（使用小林课包 2）').sharedPackageOwnerName, '小林', 'shared package note should keep the package owner');
assert.deepStrictEqual(sync.parseStudentCell('王老板、王老板孩子').names, ['王老板'], 'Wang boss family course should use one canonical student record');
assert.strictEqual(sync.isFutureCourse({ startTime: '2026-07-20 12:00' }, '2026-07-20 12:01'), false, 'courses already started before baseline should be ignored');
assert.strictEqual(sync.isFutureCourse({ startTime: '2026-07-20 12:30' }, '2026-07-20 12:01'), true, 'future courses after baseline should be sync candidates');
assert.strictEqual(sync.validDateKey('2026-07-01'), '2026-07-01', 'valid history date query should be accepted');
assert.strictEqual(sync.validDateKey('2026/07/01'), '', 'invalid history date query should be ignored');
assert.strictEqual(sync.courseInDateRange({ startTime: '2026-07-01 09:00' }, '2026-07-01', '2026-07-26'), true, 'history range should include the first day');
assert.strictEqual(sync.courseInDateRange({ startTime: '2026-07-26 18:00' }, '2026-07-01', '2026-07-26'), true, 'history range should include the last day');
assert.strictEqual(sync.courseInDateRange({ startTime: '2026-07-27 09:00' }, '2026-07-01', '2026-07-26'), false, 'history range should exclude dates after the end');
assert.deepStrictEqual(sync.sheetTitleDateRange('7.27-8.2（当前周）', '2026-07-30'), { start: '2026-07-27', end: '2026-08-02' }, 'weekly sheet title should parse month rollover ranges');
assert.strictEqual(sync.selectFeishuScheduleSheet([
  { sheet_id: 'GrbZdi', title: '7.20-7.26' },
  { sheet_id: 'CurrentWeek', title: '7.27-8.2（当前周）' }
], 'GrbZdi', '2026-07-30').sheet_id, 'CurrentWeek', 'cron sync should automatically move from stale configured sheet to the current weekly sheet');
assert.deepStrictEqual(sync.selectFeishuScheduleSheets([
  { sheet_id: 'OldWeek', title: '7.20-7.26' },
  { sheet_id: 'CurrentWeek', title: '7.27-8.2（当前周）' },
  { sheet_id: 'NextWeek', title: '8.3-8.9' },
  { sheet_id: 'LaterWeek', title: '8.10-8.16' }
], 'OldWeek', '2026-08-01').map(row => row.sheet_id), ['CurrentWeek', 'NextWeek'], 'regular sync should always read current week and next week');

const interleavedValues = [
  ['时间', null, null, 'Siren', null, null, null, '杨教练', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '10:00-10:30', '成人私教【正式】', '马坡室内', '3号', '连女士（3）', '青少年团课', '马坡室内', '2号', '笑逐'],
  [null, null, '10:30-11:00', '成人私教【正式】', '马坡室内', '3号', '连女士（3）', '青少年团课', '马坡室内', '2号', '笑逐']
];
const interleavedCourses = sync.parseFeishuScheduleRows({ values: interleavedValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(interleavedCourses.length, 2, 'same coach block course should merge across rows even when other coach blocks are interleaved');
assert.strictEqual(interleavedCourses[0].endTime, '2026-07-20 11:00', 'interleaved private lesson should become one 60-minute course');
assert.strictEqual(interleavedCourses[1].course.courseType, '小班课', '青少年团课 should map to the system small class course type');
assert.strictEqual(interleavedCourses[1].course.smallClassType, 'bootcamp', '青少年团课 should use small class bootcamp entitlements');
assert.strictEqual(interleavedCourses[1].lessonCount, 1, 'interleaved group lesson should also merge to one hour');

const specialValues = [
  ['时间', null, null, 'Siren', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '18:00-18:30', '【2.5～3.0】发接发与实战练习', '马坡室内', '1号', '锤锤（2）'],
  [null, null, '18:30-19:00', '【2.5～3.0】发接发与实战练习', '马坡室内', '1号', '锤锤（2）']
];
const specialCourses = sync.parseFeishuScheduleRows({ values: specialValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(specialCourses.length, 1, 'merged special course should still be one course');
assert.strictEqual(specialCourses[0].course.courseType, '专项课', 'bracketed special course should map to special course type');
assert.strictEqual(specialCourses[0].course.skillLevelMin, '2.5', 'special course should parse min skill level');
assert.strictEqual(specialCourses[0].course.skillLevelMax, '3.0', 'special course should parse max skill level');
assert.strictEqual(specialCourses[0].course.specialTopic, '发接发与实战练习', 'special course should parse free-form topic');

const beginnerSpecialValues = [
  ['时间', null, null, '杨教练', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '10:00-11:30', '初阶训练课体验课/正式课', '马坡室内', '1号', '王有理、艾斯、李鹏昊']
];
const beginnerSpecialCourses = sync.parseFeishuScheduleRows({ values: beginnerSpecialValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(beginnerSpecialCourses[0].course.courseType, '专项课', 'beginner mixed training should map to special course');
assert.strictEqual(beginnerSpecialCourses[0].course.skillLevelMin, '零基础', 'beginner special course should use zero-basics level');
assert.strictEqual(beginnerSpecialCourses[0].course.specialTopic, '初阶专项课', 'beginner special course should use the standard topic');

const blankContinuationValues = [
  ['时间', null, null, '杨教练', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '10:00-11:30', '初阶训练课体验课/正式课', '马坡室内', '1号', '王有理、艾斯、李鹏昊'],
  [null, null, '11:30-12:00', '', '', '', '王有理、艾斯、李鹏昊']
];
const blankContinuationCourses = sync.parseFeishuScheduleRows({ values: blankContinuationValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(blankContinuationCourses.length, 1, 'blank continuation rows with the same student should merge into the previous course');
assert.strictEqual(blankContinuationCourses[0].endTime, '2026-07-20 12:00', 'blank continuation should extend the course end time');
assert.strictEqual(blankContinuationCourses[0].course.courseType, '专项课', 'blank continuation should keep the inherited course type');

const noiseValues = [
  ['时间', null, null, '外部场地', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '12:00-12:30', '蓝色港湾', '蓝色港湾', '蓝色港湾', '蓝色港湾']
];
const noiseCourses = sync.parseFeishuScheduleRows({ values: noiseValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(noiseCourses.length, 0, 'blue harbor section cells should not be imported as 10-hour schedules');

const companionValues = [
  ['时间', null, null, 'Siren', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员'],
  [46223, '一', '20:00-21:00', '陪打', '马坡室内', '1号', 'W.Jing']
];
const companionCourses = sync.parseFeishuScheduleRows({ values: companionValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(companionCourses[0].course.courseType, '陪打', 'companion course should be recognized by feishu sync');

const chenxiCorrectionValues = [
  ['时间', null, null, '岳克舟教练', null, null, null],
  ['日期', '星期', '时段', '课程', '场馆', '场地号', '学员'],
  [46227, '五', '12:00-13:00', '亲子小班正式课', '马坡室内', '4号', '晨曦、朋友（3）']
];
const chenxiCorrectionCourses = sync.parseFeishuScheduleRows({ values: chenxiCorrectionValues, sheetId: 'GrbZdi', sheetTitle: '7.20-7.26' });
assert.strictEqual(chenxiCorrectionCourses[0].course.courseType, '私教课', 'confirmed Chenxi copy-paste mistake should sync as private lesson');
assert.deepStrictEqual(chenxiCorrectionCourses[0].studentNames, ['晨曦'], 'confirmed Chenxi friend lesson should still use the package owner only');

const venueColumnCoachValues = [
  ['时间', null, null, '马坡室内', null, null, null],
  ['日期', '星期', '时段', '1号', '2号', '3号', '4号'],
  [46235, '六', '10:00-10:30', '朝珺 小萌', '', '林铭', ''],
  [null, null, '10:30-11:00', '朝珺 小萌', '', 'siren', ''],
  [null, null, '15:30-16:00', '朝珺 胡之超', '', 'siren', ''],
  [null, null, '16:00-16:30', '朝珺 胡之超', '', '', ''],
  [null, null, '17:30-18:00', '朝珺 yx', '', '', ''],
  [null, null, '18:00-18:30', '朝珺 yx', '', '', '']
];
const venueColumnCoachCourses = sync.parseFeishuScheduleRows({ values: venueColumnCoachValues, sheetId: 'CurrentWeek', sheetTitle: '7.27-8.2' });
assert.strictEqual(venueColumnCoachCourses.length, 3, 'venue columns should import cells written as coach plus student');
assert.deepStrictEqual(venueColumnCoachCourses.map(item => item.coachName), ['朝珺教练', '朝珺教练', '朝珺教练'], 'venue column coach aliases should be standardized');
assert.deepStrictEqual(venueColumnCoachCourses.map(item => item.studentNames[0]), ['小萌', '胡之超', 'yx'], 'venue column should keep the student text after the coach name');
assert.deepStrictEqual(venueColumnCoachCourses.map(item => item.startTime), ['2026-08-01 10:00', '2026-08-01 15:30', '2026-08-01 17:30'], 'venue column courses should keep their start times');
assert.deepStrictEqual(venueColumnCoachCourses.map(item => item.endTime), ['2026-08-01 11:00', '2026-08-01 16:30', '2026-08-01 18:30'], 'venue column 30-minute rows should merge into 1-hour courses');
assert.strictEqual(venueColumnCoachCourses[0].venue, '1号场', 'venue column number should become the schedule court');
assert.strictEqual(venueColumnCoachCourses[0].course.courseType, '私教课', 'venue column coach plus student should default to formal private lesson');

const plan = sync.buildDryRunPlan({
  feishuCourses: courses.slice(0, 1),
  syncRows: [],
  schedules: [{
    id: 'sch-1',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: []
});

assert.strictEqual(plan.summary.bindExisting, 1, 'first baseline should bind exact existing future schedule instead of creating duplicate');
assert.strictEqual(plan.summary.create, 0, 'exact existing future schedule should not be recreated');

const coachSuffixPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'coach-suffix-key',
    coachName: 'Siren',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{
    id: 'sch-siren-suffix',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: 'Siren 教练',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: []
});
assert.strictEqual(coachSuffixPlan.summary.bindExisting, 1, 'coach suffix should not block binding an existing schedule');

const feishuSirenBody = sync.buildScheduleBody({
  startTime: '2026-08-02 10:00',
  endTime: '2026-08-02 11:00',
  coachName: 'Siren',
  resolvedCoach: { id: 'coach-siren', name: 'Siren 教练' },
  resolvedStudents: [{ id: 'stu-zhao', name: '赵新阳' }],
  studentNames: ['赵新阳'],
  campus: 'shunyi_mapo',
  venue: '3号场',
  course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false },
  lessonCount: 1,
  sourceKey: 'siren-standard-name'
}, { existingSchedule: null, entitlements: [], recommendEntitlements: () => [] });
assert.strictEqual(feishuSirenBody.coach, 'Siren 教练', 'Feishu sync should persist the standard coach name, not the raw sheet alias');
assert.strictEqual(feishuSirenBody.coachId, 'coach-siren', 'Feishu sync should persist the matched coach id');

const contiguousSchedulePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'contiguous-schedule-key',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [
    { id: 'sch-split-1', startTime: '2026-07-20 12:00', endTime: '2026-07-20 13:00', coach: '晓哲', campus: 'shunyi_mapo', venue: '3号场', courseType: '私教课', experienceType: '', studentIds: ['stu-1'], status: '已排课' },
    { id: 'sch-split-2', startTime: '2026-07-20 13:00', endTime: '2026-07-20 13:30', coach: '晓哲', campus: 'shunyi_mapo', venue: '3号场', courseType: '私教课', experienceType: '', studentIds: ['stu-1'], status: '已排课' }
  ],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: []
});
assert.strictEqual(contiguousSchedulePlan.summary.bindExisting, 1, 'one Feishu course should bind to split contiguous system schedules instead of staying as an exception');
assert.deepStrictEqual(contiguousSchedulePlan.actions[0].scheduleIds, ['sch-split-1', 'sch-split-2'], 'split schedule binding should keep all related schedule ids');

const historicalSameDayTimeMismatchPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'same-day-time-mismatch-key',
    startTime: '2026-07-20 17:00',
    endTime: '2026-07-20 18:00',
    date: '2026-07-20',
    startClock: '17:00',
    endClock: '18:00',
    coachName: '杨',
    studentNames: ['张先生'],
    studentText: '张先生（2）',
    lessonIndex: 2,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{
    id: 'sch-zhang-package-2',
    startTime: '2026-07-20 15:00',
    endTime: '2026-07-20 16:00',
    coach: '杨教练',
    campus: 'shunyi_mapo',
    venue: '2号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-zhang'],
    status: '已排课'
  }],
  students: [{ id: 'stu-zhang', name: '张先生（张昊然）' }],
  coaches: [],
  users: [],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(historicalSameDayTimeMismatchPlan.summary.bindExisting, 1, 'historical Feishu rows should bind the unique same-day system schedule when the system time is authoritative');

const companionDirectPayPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'companion-direct-pay-key',
    startTime: '2026-07-21 14:00',
    endTime: '2026-07-21 15:00',
    date: '2026-07-21',
    coachName: '岳克舟',
    studentNames: ['林姐'],
    studentText: '林姐',
    course: { ok: true, courseType: '陪打', experienceType: '', audience: '', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-lin', name: '林姐' }],
  coaches: [{ id: 'coach-yue', name: '岳克舟' }],
  users: [],
  entitlements: [],
  nowKey: '2026-07-20 00:00'
});
assert.strictEqual(companionDirectPayPlan.summary.create, 1, 'future companion lessons should not require package entitlement');
assert.strictEqual(sync.buildScheduleBody(companionDirectPayPlan.actions[0].candidate).settlementType, 'direct', 'companion lesson should use direct payment settlement');
assert.strictEqual(sync.buildScheduleBody(companionDirectPayPlan.actions[0].candidate).paidAmount, 300, 'companion lesson should default to 200 yuan per hour direct payment');

const confirmedGiftPrivatePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'xiaolu-gift-private-key',
    startTime: '2026-08-05 14:00',
    endTime: '2026-08-05 16:00',
    date: '2026-08-05',
    coachName: '朝珺',
    studentNames: ['小鹿'],
    studentText: '小鹿',
    lessonCount: 2,
    durationMinutes: 120,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xiaolu', name: '小鹿' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [],
  nowKey: '2026-08-05 13:00'
});
assert.strictEqual(confirmedGiftPrivatePlan.summary.create, 1, 'confirmed gift private lessons should not require package entitlement');
assert.strictEqual(sync.buildScheduleBody(confirmedGiftPrivatePlan.actions[0].candidate).payMethod, '赠送', 'Xiaolu private lessons should be free gift lessons');
assert.strictEqual(sync.buildScheduleBody(confirmedGiftPrivatePlan.actions[0].candidate).paidAmount, 0, 'gift private lessons should not collect payment');

const confirmedDirectPrivatePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'xiaomeng-direct-private-key',
    startTime: '2026-08-08 10:00',
    endTime: '2026-08-08 12:00',
    date: '2026-08-08',
    coachName: '朝珺',
    studentNames: ['小萌'],
    studentText: '小萌',
    lessonCount: 2,
    durationMinutes: 120,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-sun-xiaomeng', name: '孙小萌' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [],
  nowKey: '2026-08-08 09:00'
});
assert.strictEqual(confirmedDirectPrivatePlan.summary.create, 1, 'confirmed direct private lessons should not require package entitlement');
assert.strictEqual(confirmedDirectPrivatePlan.actions[0].candidate.resolvedStudents[0].name, '孙小萌', '小萌 should resolve to 孙小萌');
const confirmedDirectPrivateBody = sync.buildScheduleBody(confirmedDirectPrivatePlan.actions[0].candidate);
assert.strictEqual(confirmedDirectPrivateBody.settlementType, 'direct', 'Sun Xiaomeng private lessons should be direct paid');
assert.strictEqual(confirmedDirectPrivateBody.paidAmount, 800, 'Sun Xiaomeng two-hour lesson fee should be 800');
assert.strictEqual(confirmedDirectPrivateBody.fieldFeeAmount, 440, 'Sun Xiaomeng two-hour Mapo field fee should be 440');
assert.strictEqual(confirmedDirectPrivateBody.fieldFeePayMethod, '微信', 'Sun Xiaomeng field fee should be paid by WeChat');

const yxDirectPrivatePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...confirmedDirectPrivatePlan.actions[0].candidate,
    sourceKey: 'yx-direct-private-key',
    studentNames: ['yx'],
    studentText: 'yx'
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-yx', name: 'YX' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [],
  nowKey: '2026-08-08 09:00'
});
assert.strictEqual(yxDirectPrivatePlan.summary.create, 1, 'YX direct private lessons should not require package entitlement');
assert.strictEqual(sync.buildScheduleBody(yxDirectPrivatePlan.actions[0].candidate).paidAmount, 600, 'YX two-hour lesson fee should be 600');

const huZhichaoDirectPrivatePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...confirmedDirectPrivatePlan.actions[0].candidate,
    sourceKey: 'huzhichao-direct-private-key',
    studentNames: ['胡之超'],
    studentText: '胡之超'
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-huzhichao', name: '胡之超' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [],
  nowKey: '2026-08-08 09:00'
});
const huZhichaoDirectBody = sync.buildScheduleBody(huZhichaoDirectPrivatePlan.actions[0].candidate);
assert.strictEqual(huZhichaoDirectPrivatePlan.summary.create, 1, 'Hu Zhichao direct private lessons should not require package entitlement');
assert.strictEqual(huZhichaoDirectBody.paidAmount, 600, 'Hu Zhichao two-hour lesson fee should be 600');
assert.strictEqual(huZhichaoDirectBody.fieldFeeAmount, 0, 'Hu Zhichao schedule sync should not duplicate stored-value venue fee ledger');
assert.match(huZhichaoDirectBody.notes, /场地费由三方订场/, 'Hu Zhichao direct private notes should explain the venue fee source');

const dongfanxuanDirectPrivatePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...confirmedDirectPrivatePlan.actions[0].candidate,
    sourceKey: 'dongfanxuan-direct-private-key',
    startTime: '2026-08-07 17:00',
    endTime: '2026-08-07 18:00',
    studentNames: ['董凡轩'],
    studentText: '董凡轩',
    lessonCount: 1
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-dongfanxuan', name: '董凡轩' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [],
  nowKey: '2026-08-07 16:00'
});
const dongfanxuanDirectBody = sync.buildScheduleBody(dongfanxuanDirectPrivatePlan.actions[0].candidate);
assert.strictEqual(dongfanxuanDirectPrivatePlan.summary.create, 1, 'Dong Fanxuan direct private lessons should not require package entitlement');
assert.strictEqual(dongfanxuanDirectBody.settlementType, 'direct', 'Dong Fanxuan private lessons should be direct paid');
assert.strictEqual(dongfanxuanDirectBody.paidAmount, 300, 'Dong Fanxuan lesson fee should be 300 yuan per hour');
assert.strictEqual(dongfanxuanDirectBody.fieldFeeAmount, 220, 'Dong Fanxuan Mapo field fee should be calculated at standard rate');

const chenMubaiDirectPrivatePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...dongfanxuanDirectPrivatePlan.actions[0].candidate,
    sourceKey: 'chenmubai-direct-private-key',
    startTime: '2026-08-07 18:00',
    endTime: '2026-08-07 19:00',
    studentNames: ['陈沐白'],
    studentText: '陈沐白'
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-chenmubai', name: '陈沐白', notes: '董凡轩的朋友，单节私教课付费' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [],
  nowKey: '2026-08-07 16:00'
});
const chenMubaiDirectBody = sync.buildScheduleBody(chenMubaiDirectPrivatePlan.actions[0].candidate);
assert.strictEqual(chenMubaiDirectPrivatePlan.summary.create, 1, 'Chen Mubai direct private lessons should not require package entitlement');
assert.strictEqual(chenMubaiDirectBody.settlementType, 'direct', 'Chen Mubai private lessons should be direct paid');
assert.strictEqual(chenMubaiDirectBody.paidAmount, 400, 'Chen Mubai lesson fee should be 400 yuan per hour');
assert.strictEqual(chenMubaiDirectBody.fieldFeeAmount, 220, 'Chen Mubai Mapo field fee should be calculated at standard rate');

const historicalPackageBackfillPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'historical-package-backfill-key',
    startTime: '2026-08-06 10:00',
    endTime: '2026-08-06 11:00',
    date: '2026-08-06',
    coachName: '林铭教练',
    studentNames: ['杜一诺'],
    studentText: '杜一诺（4）',
    lessonIndex: 4,
    lessonCount: 1,
    durationMinutes: 60,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-duyinuo', name: '杜一诺' }],
  coaches: [{ id: 'coach-linming', name: '林铭教练' }],
  users: [],
  entitlements: [{ id: 'ent-duyinuo', studentId: 'stu-duyinuo', courseType: '私教课', totalLessons: 10, usedLessons: 3, remainingLessons: 7, status: 'active' }],
  nowKey: '2026-08-08 12:00'
});
assert.strictEqual(historicalPackageBackfillPlan.summary.create, 1, 'confirmed historical formal lessons with selectable entitlement should be auto backfilled');

const reorderedPairStudentPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'huangqing-lv-yu-key',
    startTime: '2026-08-08 09:00',
    endTime: '2026-08-08 10:00',
    date: '2026-08-08',
    coachName: '朝珺',
    studentNames: ['黄晴 吕瑜'],
    studentText: '黄晴 吕瑜（9）',
    lessonIndex: 9,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-pair', name: '吕瑜 黄晴' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  entitlements: [{ id: 'ent-pair', studentId: 'stu-pair', courseType: '私教课', totalLessons: 10, usedLessons: 8, remainingLessons: 2, status: 'active' }],
  nowKey: '2026-08-08 08:00'
});
assert.strictEqual(reorderedPairStudentPlan.summary.create, 1, 'confirmed reordered pair name should use the existing package');
assert.strictEqual(reorderedPairStudentPlan.actions[0].candidate.resolvedStudents[0].name, '吕瑜 黄晴', '黄晴 吕瑜 should resolve to 吕瑜 黄晴');

const emptyRecruitingCoursePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'empty-recruiting-course-key',
    startTime: '2026-08-08 14:00',
    endTime: '2026-08-08 16:00',
    date: '2026-08-08',
    coachName: '杨',
    studentNames: [],
    studentText: '',
    courseText: '初阶训练课体验课/正式课',
    course: { ok: true, courseType: '专项课', experienceType: '', audience: '', isTrial: false, specialTopic: '初阶专项课' }
  }],
  syncRows: [],
  schedules: [],
  students: [],
  coaches: [{ id: 'coach-yang', name: '杨教练' }],
  users: []
});
assert.strictEqual(emptyRecruitingCoursePlan.summary.noop, 1, 'empty recruiting courses should be ignored instead of notifying operations every run');

const xiaozhuSingleSmallClassPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'xiaozhu-single-small-class-key',
    coachName: '杨',
    studentNames: ['笑逐'],
    studentText: '笑逐',
    course: { ok: true, courseType: '小班课', smallClassType: 'bootcamp', experienceType: '', audience: '青少年', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xiaozhu', name: '笑逐' }],
  coaches: [{ id: 'coach-yang', name: '杨教练' }],
  users: [],
  entitlements: [{ id: 'ent-xiaozhu', studentId: 'stu-xiaozhu', courseType: '小班课', totalLessons: 20, usedLessons: 8, remainingLessons: 12, status: 'active' }]
});
assert.notStrictEqual(xiaozhuSingleSmallClassPlan.actions[0].reason, '小班课至少 2 人到场才能开课，需要运营确认', 'Xiaozhu should be allowed to schedule one-person small class');

const specialEntitlementSelectionPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...beginnerSpecialCourses[0],
    sourceKey: 'beginner-special-entitlement-key'
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-wang', name: '王有理' },
    { id: 'stu-ace', name: '艾斯' },
    { id: 'stu-li', name: '李鹏昊' }
  ],
  coaches: [{ id: 'coach-yang', name: '杨教练' }],
  users: [],
  entitlements: [
    { id: 'ent-wang-other', studentId: 'stu-wang', courseType: '专项课', skillLevelMin: '2.5', skillLevelMax: '3.0', specialTopic: '发接发与实战练习', totalLessons: 1, usedLessons: 0, remainingLessons: 1, status: 'active' },
    { id: 'ent-wang-beginner', studentId: 'stu-wang', courseType: '专项课', skillLevelMin: '零基础', skillLevelMax: '零基础', specialTopic: '初阶专项课', totalLessons: 1, usedLessons: 0, remainingLessons: 1, status: 'active' },
    { id: 'ent-ace-beginner', studentId: 'stu-ace', courseType: '专项课', skillLevelMin: '零基础', skillLevelMax: '零基础', specialTopic: '初阶专项课', totalLessons: 1, usedLessons: 0, remainingLessons: 1, status: 'active' },
    { id: 'ent-li-beginner', studentId: 'stu-li', courseType: '专项课', skillLevelMin: '零基础', skillLevelMax: '零基础', specialTopic: '初阶专项课', totalLessons: 1, usedLessons: 0, remainingLessons: 1, status: 'active' }
  ],
  nowKey: '2026-07-20 00:00'
});
assert.strictEqual(specialEntitlementSelectionPlan.summary.create, 1, 'beginner special course should become schedulable when each student has matching special entitlement');
assert.deepStrictEqual(sync.buildScheduleBody(specialEntitlementSelectionPlan.actions[0].candidate).entitlementIds, ['ent-wang-beginner', 'ent-ace-beginner', 'ent-li-beginner'], 'special course schedule should use matching topic entitlements only');

const beginnerSpecialAutoPurchasePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...beginnerSpecialCourses[0],
    sourceKey: 'beginner-special-auto-purchase-key',
    studentNames: ['Jerry', 'Zoe'],
    studentText: 'Jerry、Zoe'
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-jerry', name: 'Jerry' },
    { id: 'stu-zoe', name: 'Zoe' }
  ],
  coaches: [{ id: 'coach-yang', name: '杨教练' }],
  users: [],
  packages: [{ id: 'pkg-beginner-special', name: '专项课 · 零基础 · 初阶专项课 · 1次 · 199元', courseType: '专项课', specialTopic: '初阶专项课', skillLevelMin: '零基础', skillLevelMax: '零基础', price: 199 }],
  nowKey: '2026-08-08 00:00'
});
assert.strictEqual(beginnerSpecialAutoPurchasePlan.summary.create, 1, 'beginner special course should auto-create when matching single-use package can be bought');
assert.strictEqual(beginnerSpecialAutoPurchasePlan.actions[0].candidate.requiresPackagePurchase, true, 'beginner special course without entitlements should mark package purchase before scheduling');
assert.deepStrictEqual(beginnerSpecialAutoPurchasePlan.actions[0].candidate.scheduleStudents.map(row=>row.name), ['Jerry', 'Zoe'], 'auto-purchased special course should keep all students in the schedule');

const ignoredSourcePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...beginnerSpecialCourses[0],
    sourceKey: 'ignored-source-key',
    studentNames: ['3人'],
    studentText: '3人'
  }],
  syncRows: [{ id: 'ignore-row', sourceKey: 'ignored-source-key', status: 'ignored' }],
  schedules: [],
  students: [],
  coaches: [],
  users: []
});
assert.strictEqual(ignoredSourcePlan.summary.notifyError, 0, 'ignored Feishu source rows should not keep notifying operations');
assert.strictEqual(ignoredSourcePlan.summary.noop, 1, 'ignored Feishu source rows should count as noop');

const confirmedIgnoredSourcePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...beginnerSpecialCourses[0],
    sourceKey: 'GrbZdi|2026-07-25|16:00|17:30|杨|🐰🐰🐰🐰🐰、🌞艾薇、朋友|零基础训练营体验课|马坡室内|1号',
    studentNames: ['🐰🐰🐰🐰🐰', '🌞艾薇', '朋友'],
    studentText: '🐰🐰🐰🐰🐰、🌞艾薇、朋友',
    courseText: '零基础训练营体验课'
  }],
  syncRows: [],
  schedules: [],
  students: [],
  coaches: [],
  users: []
});
assert.strictEqual(confirmedIgnoredSourcePlan.summary.notifyError, 0, 'confirmed non-imported source row should not require a sync-table write to stay quiet');
assert.strictEqual(confirmedIgnoredSourcePlan.summary.noop, 1, 'confirmed non-imported source row should be treated as noop');

const legacyCampusExistingPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'legacy-campus-existing-key',
    campus: 'shunyi_mapo',
    venue: '3号场',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{
    id: 'sch-legacy-campus',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'mabao',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: []
});
assert.strictEqual(legacyCampusExistingPlan.summary.bindExisting, 1, 'legacy mabao campus schedules should still bind to shunyi_mapo Feishu rows');

const blankCampusExistingPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'blank-campus-existing-key',
    startTime: '2026-08-05 14:00',
    endTime: '2026-08-05 16:00',
    date: '2026-08-05',
    campus: 'shunyi_mapo',
    venue: '2号场',
    coachName: '杨',
    studentNames: ['小鹿'],
    studentText: '小鹿',
    lessonCount: 2,
    durationMinutes: 120,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{
    id: 'third-party-xiaolu',
    startTime: '2026-08-05 14:00:00',
    endTime: '2026-08-05 16:00:00',
    coach: '杨教练',
    coachId: 'coach-yang',
    campus: '',
    venue: '2号场',
    courseType: '私教课',
    studentIds: ['stu-xiaolu'],
    studentName: '小鹿',
    status: '已排课',
    scheduleSource: '第三方同步排课',
    lessonCount: 0
  }],
  students: [{ id: 'stu-xiaolu', name: '小鹿' }],
  coaches: [{ id: 'coach-yang', name: '杨教练' }],
  users: [],
  nowKey: '2026-08-08 00:00'
});
assert.strictEqual(blankCampusExistingPlan.summary.bindExisting, 1, 'historical existing schedule with blank campus should bind when time coach venue and student are unique');
assert.strictEqual(blankCampusExistingPlan.actions[0].backfillExistingFields, true, 'blank campus existing schedule should be marked for field backfill');

const orphanFeishuSchedulePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [],
  schedules: [{
    id: 'orphan-feishu-schedule',
    startTime: '2026-08-12 14:00:00',
    endTime: '2026-08-12 16:00:00',
    coach: '朝珺教练',
    campus: 'shunyi_mapo',
    venue: '1号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-xiaolu'],
    studentName: '小鹿',
    status: '已排课',
    scheduleSource: 'feishu-sheet',
    notes: '飞书排课表同步 8.10-8.16 R12C4'
  }],
  students: [{ id: 'stu-xiaolu', name: '小鹿' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  nowKey: '2026-08-12 12:00',
  scannedDateRanges: [{ start: '2026-08-10', end: '2026-08-16' }]
});
assert.strictEqual(orphanFeishuSchedulePlan.summary.pendingDelete, 1, 'Feishu-created schedules without sync rows should still ask delete confirmation when missing from the scanned sheet');
assert.strictEqual(orphanFeishuSchedulePlan.actions[0].schedule.id, 'orphan-feishu-schedule', 'orphan Feishu schedule should be attached to the pending delete action');

const orphanWithoutSheetScopePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [],
  schedules: [orphanFeishuSchedulePlan.actions[0].schedule],
  students: [{ id: 'stu-xiaolu', name: '小鹿' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  nowKey: '2026-08-12 12:00'
});
assert.strictEqual(orphanWithoutSheetScopePlan.summary.pendingDelete, 0, 'orphan deletion detection should require an explicit scanned sheet date range');

const changedFeishuSourceSchedulePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'changed-feishu-row-key',
    startTime: '2026-08-12 16:00',
    endTime: '2026-08-12 18:00',
    date: '2026-08-12',
    coachName: '朝珺',
    campus: 'shunyi_mapo',
    venue: '2号场',
    studentNames: ['小鹿'],
    studentText: '小鹿',
    lessonCount: 2,
    durationMinutes: 120,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{
    id: 'changed-feishu-schedule',
    startTime: '2026-08-12 16:00:00',
    endTime: '2026-08-12 18:00:00',
    coach: '朝珺教练',
    campus: 'shunyi_mapo',
    venue: '2号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-xiaolu'],
    studentName: '小鹿',
    status: '已排课',
    scheduleSource: 'feishu-sheet',
    notes: '飞书排课表同步 8.10-8.16 R12C5'
  }],
  students: [{ id: 'stu-xiaolu', name: '小鹿' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  nowKey: '2026-08-12 12:00',
  scannedDateRanges: [{ start: '2026-08-10', end: '2026-08-16' }]
});
assert.strictEqual(changedFeishuSourceSchedulePlan.summary.bindExisting, 1, 'changed Feishu rows should bind the existing Feishu-source schedule');
assert.strictEqual(changedFeishuSourceSchedulePlan.summary.pendingDelete, 0, 'changed Feishu rows should not also report the same schedule as deleted');

const orphanPendingDeletePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [{ id: 'sync-orphan-pending', sourceKey: 'old-orphan-key', scheduleId: 'orphan-feishu-schedule', status: 'pending_delete' }],
  schedules: orphanFeishuSchedulePlan.actions[0].schedule ? [orphanFeishuSchedulePlan.actions[0].schedule] : [],
  students: [{ id: 'stu-xiaolu', name: '小鹿' }],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练' }],
  users: [],
  nowKey: '2026-08-12 12:00'
});
assert.strictEqual(orphanPendingDeletePlan.summary.pendingDelete, 0, 'orphan schedules already awaiting delete confirmation should not be reported again');

const pastUnboundPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-unbound-key',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing', primaryCoach: '晓哲' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastUnboundPlan.summary.create, 1, 'document-scope sync should auto-create historical schedules when a matching entitlement is selectable');
assert.strictEqual(pastUnboundPlan.summary.notifyError, 0, 'safe historical schedules with selectable entitlement should not ask operations again');

const futureUnboundPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'future-unbound-key',
    startTime: '2026-07-21 12:00',
    endTime: '2026-07-21 13:30',
    date: '2026-07-21',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing', primaryCoach: '晓哲' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 11:00'
});
assert.strictEqual(futureUnboundPlan.summary.create, 1, 'future document rows should still auto-create when safely resolvable');

const pastBoundModifiedPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-bound-key',
    fingerprint: 'new-fingerprint',
    startTime: '2026-07-20 13:00',
    endTime: '2026-07-20 14:30',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [{ id: 'sync-past', sourceKey: 'past-bound-key', scheduleId: 'sch-past', lastFingerprint: 'old-fingerprint', status: 'active' }],
  schedules: [{
    id: 'sch-past',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastBoundModifiedPlan.summary.update, 1, 'bound historical time changes should auto-update when venue, coach and student have no conflicts');
assert.strictEqual(pastBoundModifiedPlan.summary.notifyError, 0, 'safe historical time changes should not ask operations to confirm');
assert.deepStrictEqual(pastBoundModifiedPlan.actions[0].diffs.map(item => item.field), ['time'], 'safe historical time update should keep exact diffs for audit');

const pastBoundTimeConflictPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-bound-time-conflict-key',
    fingerprint: 'new-time-conflict-fingerprint',
    startTime: '2026-07-20 13:00',
    endTime: '2026-07-20 14:30',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [{ id: 'sync-past-time-conflict', sourceKey: 'past-bound-time-conflict-key', scheduleId: 'sch-past-time-conflict', lastFingerprint: 'old-fingerprint', status: 'active' }],
  schedules: [
    {
      id: 'sch-past-time-conflict',
      startTime: '2026-07-20 12:00',
      endTime: '2026-07-20 13:30',
      coach: '晓哲',
      campus: 'shunyi_mapo',
      venue: '3号场',
      courseType: '私教课',
      experienceType: '',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    {
      id: 'sch-target-time-conflict',
      startTime: '2026-07-20 13:00',
      endTime: '2026-07-20 14:30',
      coach: '其他教练',
      campus: 'shunyi_mapo',
      venue: '3号场',
      courseType: '私教课',
      experienceType: '',
      studentIds: ['stu-other'],
      status: '已排课'
    }
  ],
  students: [{ id: 'stu-1', name: 'W.Jing' }, { id: 'stu-other', name: '其他学员' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastBoundTimeConflictPlan.summary.update, 0, 'historical time changes should not auto-update into an occupied court');
assert.strictEqual(pastBoundTimeConflictPlan.summary.notifyError, 1, 'conflicting historical time changes should ask operations to confirm');
assert.match(pastBoundTimeConflictPlan.actions[0].reason, /目标时间或场地已有排课/, 'time conflict should be visible in the operator notification');

const pastBoundCoachOnlyPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-bound-coach-only-key',
    fingerprint: 'new-coach-fingerprint',
    coachName: 'Siren',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [{ id: 'sync-past-coach-only', sourceKey: 'past-bound-coach-only-key', scheduleId: 'sch-past-coach-only', lastFingerprint: 'old-fingerprint', status: 'active' }],
  schedules: [{
    id: 'sch-past-coach-only',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }, { id: 'coach-siren', name: 'Siren' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastBoundCoachOnlyPlan.summary.update, 1, 'bound historical coach changes should auto-update when the new coach has no conflict');
assert.deepStrictEqual(pastBoundCoachOnlyPlan.actions[0].diffs.map(item => item.field), ['coach'], 'coach-only auto update should keep exact diffs for audit');

const pastBoundFingerprintOnlyPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-bound-fingerprint-only-key',
    fingerprint: 'new-format-only-fingerprint',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [{ id: 'sync-past-format-only', sourceKey: 'past-bound-fingerprint-only-key', scheduleId: 'sch-past-format-only', lastFingerprint: 'old-fingerprint', status: 'active' }],
  schedules: [{
    id: 'sch-past-format-only',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastBoundFingerprintOnlyPlan.summary.notifyError, 0, 'historical rows with only fingerprint/text changes should not ask operations to confirm');
assert.strictEqual(pastBoundFingerprintOnlyPlan.actions[0].type, 'refresh_sync', 'historical rows with no material field change should only refresh the sync marker');

const pastBoundVenueOnlyPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-bound-venue-only-key',
    fingerprint: 'new-venue-fingerprint',
    venue: '4号场',
    courtText: '4号',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [{ id: 'sync-past-venue-only', sourceKey: 'past-bound-venue-only-key', scheduleId: 'sch-past-venue-only', lastFingerprint: 'old-fingerprint', status: 'active' }],
  schedules: [{
    id: 'sch-past-venue-only',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '3号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastBoundVenueOnlyPlan.summary.update, 1, 'historical venue-only changes should auto-update when there is no court conflict');
assert.deepStrictEqual(pastBoundVenueOnlyPlan.actions[0].diffs.map(item => item.field), ['venue'], 'venue-only auto update should keep the exact diff for audit');

const pastBoundVenueConflictPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'past-bound-venue-conflict-key',
    fingerprint: 'new-venue-conflict-fingerprint',
    venue: '4号场',
    courtText: '4号',
    coachName: '晓哲',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [{ id: 'sync-past-venue-conflict', sourceKey: 'past-bound-venue-conflict-key', scheduleId: 'sch-past-venue-conflict', lastFingerprint: 'old-fingerprint', status: 'active' }],
  schedules: [
    {
      id: 'sch-past-venue-conflict',
      startTime: '2026-07-20 12:00',
      endTime: '2026-07-20 13:30',
      coach: '晓哲',
      campus: 'shunyi_mapo',
      venue: '3号场',
      courseType: '私教课',
      experienceType: '',
      studentIds: ['stu-1'],
      status: '已排课'
    },
    {
      id: 'sch-other-on-target-court',
      startTime: '2026-07-20 12:00',
      endTime: '2026-07-20 13:30',
      coach: '其他教练',
      campus: 'shunyi_mapo',
      venue: '4号场',
      courseType: '私教课',
      experienceType: '',
      studentIds: ['stu-other'],
      status: '已排课'
    }
  ],
  students: [{ id: 'stu-1', name: 'W.Jing' }, { id: 'stu-other', name: '其他学员' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }],
  nowKey: '2026-07-21 00:00'
});
assert.strictEqual(pastBoundVenueConflictPlan.summary.update, 0, 'historical venue changes should not auto-update into an occupied court');
assert.match(pastBoundVenueConflictPlan.actions[0].reason, /目标时间或场地已有排课/, 'venue conflict should be visible in the operator notification');

const systemVenuePlan = sync.buildDryRunPlan({
  feishuCourses: courses.slice(0, 1),
  syncRows: [],
  schedules: [{
    id: 'sch-system-venue',
    startTime: '2026-07-20 12:00',
    endTime: '2026-07-20 13:30',
    coach: '晓哲',
    campus: 'shunyi_mapo',
    venue: '4号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-1'],
    status: '已排课'
  }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [{ id: 'coach-xz', name: '晓哲' }],
  users: []
});
assert.strictEqual(systemVenuePlan.summary.bindExisting, 1, 'existing system schedule should bind even when Feishu venue differs');
assert.strictEqual(systemVenuePlan.actions[0].schedule.venue, '4号场', 'system venue should remain the source of truth for bound schedules');

const coachAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'coach-alias-key',
    coachName: 'Siren',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: [{ id: 'user-siren', role: 'coach', coachId: 'coach-siren', coachName: 'Siren 教练' }],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(coachAliasPlan.summary.create, 1, 'coach role user alias should match Siren to Siren 教练');
assert.strictEqual(coachAliasPlan.actions[0].candidate.resolvedCoach.name, 'Siren 教练', 'resolved coach should use canonical coach name');

const bootcampPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...interleavedCourses[1],
    sourceKey: 'bootcamp-key',
    coachName: '杨教练',
    studentNames: ['笑逐', '同伴'],
    studentText: '笑逐、同伴'
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-xiaozhu', name: '笑逐', primaryCoach: '杨教练' },
    { id: 'stu-peer', name: '同伴', primaryCoach: '杨教练' }
  ],
  coaches: [],
  users: [],
  entitlements: [
    { id: 'ent-bootcamp', studentId: 'stu-xiaozhu', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' },
    { id: 'ent-bootcamp-peer', studentId: 'stu-peer', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }
  ]
});
assert.strictEqual(bootcampPlan.summary.create, 1, '青少年团课 should create when student has a bootcamp entitlement');
const bootcampBody = sync.buildScheduleBody(bootcampPlan.actions[0].candidate);
assert.strictEqual(bootcampBody.smallClassType, 'bootcamp', 'bootcamp schedule body should keep the small class subtype');
assert.strictEqual(bootcampBody.courseTypeLevel2, '训练营', 'bootcamp schedule body should use training-camp level2 label');

const singleBootcampPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...interleavedCourses[1],
    sourceKey: 'single-bootcamp-key',
    coachName: '杨教练',
    studentNames: ['笑逐'],
    studentText: '笑逐'
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xiaozhu', name: '笑逐', primaryCoach: '杨教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-bootcamp', studentId: 'stu-xiaozhu', courseType: '小班课', smallClassType: 'bootcamp', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(singleBootcampPlan.summary.create, 1, 'Xiaozhu single-student bootcamp should be allowed by the confirmed operations rule');

const wangBossFamilyPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...interleavedCourses[1],
    sourceKey: 'wang-boss-family-key',
    coachName: '杨教练',
    studentNames: ['王老板'],
    studentText: '王老板',
    course: { ok: true, courseType: '小班课', experienceType: '', audience: '青少年', smallClassType: 'family', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-wang', name: '王老板', primaryCoach: '杨教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-wang-family', studentId: 'stu-wang', courseType: '小班课', smallClassType: 'family', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(wangBossFamilyPlan.summary.create, 1, '王老板 family class should allow one canonical family student record');

const regularFamilySinglePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...interleavedCourses[1],
    sourceKey: 'regular-family-single-key',
    coachName: '刘润扬',
    studentNames: ['亲子代表'],
    studentText: '亲子代表',
    course: { ok: true, courseType: '小班课', experienceType: '', audience: '青少年', smallClassType: 'family', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-family', name: '亲子代表', primaryCoach: '刘润扬' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-family', studentId: 'stu-family', courseType: '小班课', smallClassType: 'family', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(regularFamilySinglePlan.summary.create, 1, 'family small class should allow one representative student record');

const chenxiFriendFamilyPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...interleavedCourses[1],
    sourceKey: 'chenxi-friend-family-key',
    coachName: '岳克舟教练',
    studentNames: ['晨曦'],
    studentText: '晨曦、朋友（3）',
    lessonIndex: 3,
    course: { ok: true, courseType: '小班课', experienceType: '', audience: '青少年', smallClassType: 'family', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xixi', name: '曦曦🐳', primaryCoach: '岳克舟教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-xixi-family', studentId: 'stu-xixi', courseType: '小班课', smallClassType: 'family', totalLessons: 10, usedLessons: 2, remainingLessons: 8, status: 'active' }]
});
assert.strictEqual(chenxiFriendFamilyPlan.summary.create, 1, '晨曦、朋友 family class should use 曦曦 as the confirmed package owner');

const coachScheduleFallbackPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'coach-schedule-fallback-key',
    coachName: '岳克舟教练',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{ id: 'sch-yue', coach: '岳克舟', startTime: '2026-07-19 12:00', endTime: '2026-07-19 13:00', status: '已排课' }],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(coachScheduleFallbackPlan.summary.create, 1, 'existing schedule coach names should be allowed as a conservative fallback');
assert.strictEqual(coachScheduleFallbackPlan.actions[0].candidate.resolvedCoach.name, '岳克舟', 'schedule fallback should keep the existing system coach name');

const primaryCoachPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'student-primary-coach-key',
    coachName: 'Siren',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(primaryCoachPlan.summary.create, 1, 'student primaryCoach should resolve sheet coach aliases when no coach directory exists');
assert.strictEqual(primaryCoachPlan.actions[0].candidate.resolvedCoach.name, 'Siren 教练', 'student primaryCoach should provide the canonical coach name');

const globalPrimaryCoachAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'global-primary-coach-key',
    coachName: 'Siren',
    studentNames: ['不存在的学员'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-known', name: '已知学员', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: []
});
assert.ok(!/无法唯一识别教练/.test(globalPrimaryCoachAliasPlan.actions[0].reason), 'global student primaryCoach aliases should prevent noisy coach errors');
assert.match(globalPrimaryCoachAliasPlan.actions[0].reason, /无法唯一识别正式课学员/, 'unresolved student should remain a real blocking error');

const fullCoachNamePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'full-coach-name-key',
    coachName: '刘润扬',
    studentNames: ['W.Jing'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', courseType: '私教课', totalLessons: 20, usedLessons: 10, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(fullCoachNamePlan.summary.create, 1, 'sheet coach names should be accepted when coach directory data is missing');
assert.strictEqual(fullCoachNamePlan.actions[0].candidate.resolvedCoach.name, '刘润扬', 'coach name fallback should keep the sheet coach name');

const uniqueContainsStudentPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'unique-contains-student-key',
    coachName: 'Siren',
    studentNames: ['李俊泽'],
    lessonIndex: 9,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-ljz', name: '李先生（李俊泽）', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-ljz', studentId: 'stu-ljz', courseType: '私教课', totalLessons: 10, usedLessons: 8, remainingLessons: 2, status: 'active' }]
});
assert.strictEqual(uniqueContainsStudentPlan.summary.create, 1, 'unique contains match should resolve 李俊泽 to 李先生（李俊泽）');
assert.strictEqual(uniqueContainsStudentPlan.actions[0].candidate.resolvedStudents[0].name, '李先生（李俊泽）', 'student contains match should keep the canonical system student name');

const confirmedAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...specialCourses[0],
    sourceKey: 'confirmed-alias-key',
    coachName: 'Siren',
    studentNames: ['锤锤'],
    course: { ...specialCourses[0].course, ok: true, isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-chuichui', name: '是锤锤呀', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-special', studentId: 'stu-chuichui', courseType: '专项课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(confirmedAliasPlan.summary.create, 1, 'confirmed student alias should resolve 锤锤 to 是锤锤呀');
assert.strictEqual(confirmedAliasPlan.actions[0].candidate.resolvedStudents[0].name, '是锤锤呀', 'confirmed alias should keep canonical student record');
assert.strictEqual(sync.buildScheduleBody(confirmedAliasPlan.actions[0].candidate).standardCourseType, '专项课', 'special schedule body should persist standard special course type');

const chenxiFriendPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'chenxi-friend-key',
    coachName: 'Siren',
    studentText: '晨曦、朋友（2）',
    studentNames: ['晨曦'],
    lessonIndex: 2,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-xixi', name: '曦曦🐳', primaryCoach: 'Siren 教练' },
    { id: 'stu-boyfriend', name: '暴躁壹壹男朋友', primaryCoach: 'Siren 教练' }
  ],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-xixi', studentId: 'stu-xixi', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(chenxiFriendPlan.summary.create, 1, '晨曦、朋友 should create only for 曦曦 package owner');
assert.deepStrictEqual(chenxiFriendPlan.actions[0].candidate.resolvedStudents.map(row=>row.name), ['曦曦🐳'], '晨曦、朋友 should not resolve the generic friend token');

const sharedPackagePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'shared-package-key',
    coachName: 'Siren',
    studentText: '德德（使用小林课包 2）',
    studentNames: ['小林'],
    lessonIndex: 2,
    sharedPackageNote: '德德使用小林课包 2',
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xiaolin', name: '小林', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-xiaolin', studentId: 'stu-xiaolin', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(sharedPackagePlan.summary.create, 1, '德德 using 小林 package should create a schedule under 小林');
assert.deepStrictEqual(sharedPackagePlan.actions[0].candidate.resolvedStudents.map(row=>row.name), ['小林'], 'shared package schedule should use the package owner as the system student');
assert.match(sync.buildScheduleBody(sharedPackagePlan.actions[0].candidate).notes, /德德使用小林课包 2/, 'shared package schedule should keep the attendee note');

const authorizedSharedPackagePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'authorized-shared-package-key',
    coachName: '刘润扬',
    studentText: '达达（使用十一课包 2）',
    studentNames: ['十一'],
    lessonIndex: 2,
    sharedPackageNote: '达达使用十一课包 2',
    sharedPackageAttendeeName: '达达',
    sharedPackageOwnerName: '十一',
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-shiyi', name: '十一', primaryCoach: '刘润扬教练' },
    { id: 'stu-dada', name: '达达', primaryCoach: '刘润扬教练' }
  ],
  coaches: [{ id: 'coach-liu', name: '刘润扬教练' }],
  users: [],
  entitlements: [{ id: 'ent-shiyi', studentId: 'stu-shiyi', studentName: '十一', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(authorizedSharedPackagePlan.summary.create, 1, 'shared package should be schedulable after resolving owner and actual learner');
assert.deepStrictEqual(authorizedSharedPackagePlan.actions[0].candidate.scheduleStudents.map(row=>row.name), ['达达'], 'shared package schedule should be created for the actual learner');
assert.deepStrictEqual(sync.buildScheduleBody(authorizedSharedPackagePlan.actions[0].candidate).entitlementIds, ['ent-shiyi'], 'shared package schedule should consume the owner package');

const annotatedAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'annotated-alias-key',
    coachName: 'Siren',
    studentNames: ['锤锤（非黄5.5）'],
    lessonIndex: null,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-chuichui', name: '是锤锤呀', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-private', studentId: 'stu-chuichui', courseType: '私教课', totalLessons: 10, usedLessons: 5, remainingLessons: 5, status: 'active' }]
});
assert.strictEqual(annotatedAliasPlan.summary.create, 1, 'student aliases should ignore non-numeric bracket notes');
assert.strictEqual(annotatedAliasPlan.actions[0].candidate.resolvedStudents[0].name, '是锤锤呀', 'annotated alias should keep canonical student record');

const entitlementDisambiguationPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'entitlement-disambiguation-key',
    coachName: 'Siren',
    studentNames: ['william'],
    lessonIndex: null,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-william-1', name: 'william', primaryCoach: 'Siren 教练' },
    { id: 'stu-william-2', name: 'William（时节）', primaryCoach: 'Siren 教练' }
  ],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-william-2', studentId: 'stu-william-2', courseType: '私教课', experienceType: '青少年', totalLessons: 10, usedLessons: 4, remainingLessons: 6, status: 'active' }]
});
assert.strictEqual(entitlementDisambiguationPlan.summary.create, 1, 'multiple similar students should resolve when only one has matching entitlement');
assert.strictEqual(entitlementDisambiguationPlan.actions[0].candidate.resolvedStudents[0].name, 'William（时节）', 'entitlement match should keep the canonical student name');

const xiaotudouFriendAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'xiaotudou-friend-alias-key',
    coachName: 'Siren',
    startTime: '2026-07-24 15:00',
    endTime: '2026-07-24 16:00',
    startClock: '15:00',
    endClock: '16:00',
    durationMinutes: 60,
    lessonCount: 1,
    studentNames: ['小土豆的姐姐朋友'],
    lessonIndex: 10,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [
    { id: 'stu-sister', name: '小土豆的姐姐', primaryCoach: 'Siren 教练' },
    { id: 'stu-sister-friend', name: '小土豆的姐姐的朋友', primaryCoach: 'Siren 教练' }
  ],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-sister-friend', studentId: 'stu-sister-friend', courseType: '私教课', totalLessons: 10, usedLessons: 9, remainingLessons: 1, status: 'active' }]
});
assert.strictEqual(xiaotudouFriendAliasPlan.summary.create, 1, 'confirmed friend alias should resolve to the friend student record');
assert.strictEqual(xiaotudouFriendAliasPlan.actions[0].candidate.resolvedStudents[0].name, '小土豆的姐姐的朋友', 'friend alias should not resolve to 小土豆的姐姐');

const companionPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...companionCourses[0],
    sourceKey: 'companion-key',
    coachName: 'Siren'
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-1', name: 'W.Jing', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: []
});
assert.strictEqual(companionPlan.summary.create, 1, 'companion courses should not require package entitlement');
assert.strictEqual(sync.buildScheduleBody(companionPlan.actions[0].candidate).settlementType, 'direct', 'companion course should use direct payment settlement');
assert.strictEqual(sync.buildScheduleBody(companionPlan.actions[0].candidate).paidAmount, 200, 'companion course should default to 200 yuan per hour direct payment');
assert.strictEqual(sync.buildScheduleBody({ ...companionCourses[0], resolvedCoach: { name: 'Siren 教练' }, scheduleStudents: [{ id: 'stu-1', name: 'W.Jing' }] }).standardCourseType, '陪打', 'companion schedule body should persist companion type');

const tangguoCompanionCorrection = sync.parseFeishuScheduleRows({ values: [
  ['时间', null, null, '马坡室内', null, null, null, '杨教练', null, null, null],
  ['日期', '星期', '时段', '1号', '2号', '3号', '4号', '课程', '场馆', '场地号', '学员'],
  ['2026-07-20', '一', '15:00-17:00', null, '杨教练', null, null, '成人私教【正式】', '马坡室内', '2号', '唐果']
], sheetId: 'GrbZdi', sheetTitle: '7.20-7.26（当前周）' });
assert.strictEqual(tangguoCompanionCorrection[0].course.courseType, '陪打', 'confirmed Tangguo private lesson typo should import as companion');
assert.strictEqual(tangguoCompanionCorrection[0].course.payMethod, '储值卡', 'Tangguo companion correction should use stored value payment');
assert.strictEqual(sync.buildScheduleBody({ ...tangguoCompanionCorrection[0], resolvedCoach: { name: '杨教练' }, scheduleStudents: [{ id: 'stu-tangguo', name: '唐果' }] }).paidAmount, 400, 'Tangguo companion correction should use confirmed 400 yuan amount');

const tangguoBossAliasPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...companionCourses[0],
    sourceKey: 'tangguo-boss-alias-key',
    coachName: '岳克舟教练',
    studentNames: ['唐总'],
    course: { ok: true, courseType: '陪打', experienceType: '', audience: '', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-tangguo', name: '唐果', primaryCoach: '岳克舟教练' }],
  coaches: [],
  users: [],
  entitlements: []
});
assert.strictEqual(tangguoBossAliasPlan.summary.create, 1, '唐总 should resolve to 唐果 and create companion schedule automatically');
assert.strictEqual(tangguoBossAliasPlan.summary.notifyError, 0, '唐总 alias should not require operations confirmation');
assert.strictEqual(tangguoBossAliasPlan.actions[0].candidate.resolvedStudents[0].name, '唐果', '唐总 alias should bind to Tangguo student profile');

const lessonIndexMismatchPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'lesson-index-mismatch-key',
    coachName: 'Siren',
    studentNames: ['李俊泽'],
    lessonIndex: 9,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-ljz', name: '李先生（李俊泽）', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-ljz', studentId: 'stu-ljz', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(lessonIndexMismatchPlan.summary.notifyError, 1, 'lesson index mismatch should block automatic import');
assert.match(lessonIndexMismatchPlan.actions[0].reason, /括号课时编号和系统课包进度不一致/, 'lesson index mismatch should ask operations to confirm');
assert.match(lessonIndexMismatchPlan.actions[0].reason, /飞书第9节，系统下一节第2节/, 'lesson index mismatch should include the Feishu and system lesson numbers');

const multiHourEndingLessonIndexPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'multi-hour-ending-lesson-index-key',
    startTime: '2026-08-07 09:00',
    endTime: '2026-08-07 11:00',
    coachName: '杨教练',
    studentNames: ['张先生'],
    lessonIndex: 9,
    lessonCount: 2,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-zhang', name: '张先生（张昊然）', primaryCoach: '杨教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-zhang', studentId: 'stu-zhang', courseType: '私教课', totalLessons: 10, usedLessons: 7, remainingLessons: 3, status: 'active' }]
});
assert.strictEqual(multiHourEndingLessonIndexPlan.summary.create, 1, 'two-hour lessons may use the ending lesson number in Feishu brackets');

const packageCycleLessonIndexPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'package-cycle-lesson-index-key',
    coachName: '杨教练',
    studentNames: ['丫丫'],
    lessonIndex: 8,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-yaya', name: '丫丫', primaryCoach: '杨教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-yaya-20', studentId: 'stu-yaya', courseType: '私教课', totalLessons: 20, usedLessons: 17, remainingLessons: 3, status: 'active' }]
});
assert.strictEqual(packageCycleLessonIndexPlan.summary.create, 1, '20-lesson packages should allow Feishu numbering to restart every 10 lessons');

const splitPackageCycleLessonIndexPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'split-package-cycle-lesson-index-key',
    startTime: '2026-08-05 16:30',
    endTime: '2026-08-05 17:30',
    coachName: 'Siren',
    studentNames: ['丫丫'],
    lessonIndex: 11,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
  }],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-yaya', name: '丫丫', primaryCoach: 'Siren 教练' }],
  coaches: [],
  users: [],
  entitlements: [
    { id: 'ent-yaya-gold', studentId: 'stu-yaya', courseType: '私教课', totalLessons: 20, usedLessons: 19, remainingLessons: 1, status: 'active', validFrom: '2026-04-27', ownerCoach: 'Siren 教练' },
    { id: 'ent-yaya-nonprime', studentId: 'stu-yaya', courseType: '私教课', totalLessons: 20, usedLessons: 11, remainingLessons: 9, status: 'active', validFrom: '2026-04-27', ownerCoach: 'Siren 教练' }
  ],
  recommendEntitlements: rows => ({ recommended: { entitlementId: rows[0]?.id }, options: rows.map(row => ({ entitlementId: row.id, selectable: true })) })
});
assert.strictEqual(splitPackageCycleLessonIndexPlan.summary.create, 1, 'split gold/non-prime 20-lesson packages should match Feishu current-package numbering');

const historicalEarlierLessonAfterLaterImportedPlan = sync.buildDryRunPlan({
  feishuCourses: [{
    ...courses[0],
    sourceKey: 'historical-earlier-after-later-imported-key',
    startTime: '2026-08-06 14:00',
    endTime: '2026-08-06 15:00',
    coachName: '林铭教练',
    studentNames: ['海姐'],
    lessonIndex: 1,
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false }
  }],
  syncRows: [],
  schedules: [{
    id: 'sch-haijie-later',
    startTime: '2026-08-07 14:00',
    endTime: '2026-08-07 15:00',
    coach: '林铭教练',
    campus: 'shunyi_mapo',
    venue: '2号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-haijie'],
    entitlementId: 'ent-haijie',
    entitlementIds: ['ent-haijie'],
    lessonCount: 1,
    status: '已排课'
  }],
  students: [{ id: 'stu-haijie', name: '海姐', primaryCoach: '林铭教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-haijie', studentId: 'stu-haijie', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }]
});
assert.strictEqual(historicalEarlierLessonAfterLaterImportedPlan.summary.create, 1, 'later imported schedules should not make an earlier Feishu lesson look like a lesson-index mismatch');

const outOfOrderLessonIndexPlan = sync.buildDryRunPlan({
  feishuCourses: [
    {
      ...courses[0],
      sourceKey: 'out-of-order-lesson-index-2',
      startTime: '2026-08-07 15:00',
      endTime: '2026-08-07 16:00',
      coachName: '刘润扬教练',
      studentNames: ['小活宝'],
      lessonIndex: 2,
      course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
    },
    {
      ...courses[0],
      sourceKey: 'out-of-order-lesson-index-1',
      startTime: '2026-08-06 14:00',
      endTime: '2026-08-06 15:00',
      coachName: '刘润扬教练',
      studentNames: ['小活宝'],
      lessonIndex: 1,
      course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
    }
  ],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xhb', name: '小活宝', primaryCoach: '刘润扬教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-xhb-out-of-order', studentId: 'stu-xhb', courseType: '私教课', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(outOfOrderLessonIndexPlan.summary.create, 2, 'sync should evaluate lesson indexes by class time even when Feishu rows are read out of order');

const consecutiveFutureLessonIndexPlan = sync.buildDryRunPlan({
  feishuCourses: [
    {
      ...courses[0],
      sourceKey: 'consecutive-future-lesson-index-1',
      startTime: '2026-08-06 14:00',
      endTime: '2026-08-06 15:00',
      coachName: '刘润扬教练',
      studentNames: ['小活宝'],
      lessonIndex: 1,
      course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
    },
    {
      ...courses[0],
      sourceKey: 'consecutive-future-lesson-index-2',
      startTime: '2026-08-07 15:00',
      endTime: '2026-08-07 16:00',
      coachName: '刘润扬教练',
      studentNames: ['小活宝'],
      lessonIndex: 2,
      course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false }
    }
  ],
  syncRows: [],
  schedules: [],
  students: [{ id: 'stu-xhb', name: '小活宝', primaryCoach: '刘润扬教练' }],
  coaches: [],
  users: [],
  entitlements: [{ id: 'ent-xhb', studentId: 'stu-xhb', courseType: '私教课', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }]
});
assert.strictEqual(consecutiveFutureLessonIndexPlan.summary.create, 2, 'same sync run should count earlier planned schedules before checking the next lesson index');

const deletePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [{ id: 'sync-1', sourceKey: 'old-key', scheduleId: 'sch-old', status: 'active' }],
  schedules: [],
  students: [],
  coaches: [],
  users: []
});

assert.strictEqual(deletePlan.summary.pendingDelete, 1, 'delete detection should only create a pending delete action for bound sync rows');

const canceledScheduleDeletePlan = sync.buildDryRunPlan({
  feishuCourses: [],
  syncRows: [{ id: 'sync-canceled', sourceKey: 'old-canceled-key', scheduleId: 'sch-canceled', status: 'active' }],
  schedules: [{
    id: 'sch-canceled',
    startTime: '2026-08-08 10:00',
    endTime: '2026-08-08 12:00',
    coach: '朝珺教练',
    campus: 'shunyi_mapo',
    venue: '1号场',
    studentName: '孙小萌',
    studentIds: ['stu-sun-xiaomeng'],
    courseType: '私教课',
    status: '已取消'
  }],
  students: [],
  coaches: [],
  users: []
});
assert.strictEqual(canceledScheduleDeletePlan.summary.pendingDelete, 0, 'already canceled schedules should not repeatedly ask for delete confirmation');

const replacedSourceKeyDeletePlan = sync.buildDryRunPlan({
  feishuCourses: [{
    sourceKey: 'new-venue-key',
    startTime: '2026-08-06 12:00',
    endTime: '2026-08-06 13:00',
    date: '2026-08-06',
    coachName: '林铭教练',
    studentNames: ['Deadia'],
    course: { ok: true, courseType: '私教课', experienceType: '', audience: '成人', isTrial: false },
    campus: 'shunyi_mapo',
    venue: '3号场',
    lessonCount: 1,
    fingerprint: 'new-fingerprint'
  }],
  syncRows: [{ id: 'old-venue-sync', sourceKey: 'old-venue-key', scheduleId: 'sch-deadia', status: 'active' }],
  schedules: [{
    id: 'sch-deadia',
    startTime: '2026-08-06 12:00',
    endTime: '2026-08-06 13:00',
    coach: '林铭教练',
    campus: 'shunyi_mapo',
    venue: '2号场',
    courseType: '私教课',
    experienceType: '',
    studentIds: ['stu-deadia'],
    status: '已排课'
  }],
  students: [{ id: 'stu-deadia', name: 'Deadia' }],
  coaches: [{ id: 'coach-lm', name: '林铭教练' }],
  users: []
});
assert.strictEqual(replacedSourceKeyDeletePlan.summary.bindExisting, 1, 'changed venue should bind the current Feishu row to the existing system schedule');
assert.strictEqual(replacedSourceKeyDeletePlan.summary.pendingDelete, 0, 'old source key should not trigger delete when the same schedule is represented by a new Feishu row');
assert.deepStrictEqual(replacedSourceKeyDeletePlan.actions[0].supersededSyncRows.map(row => row.id), ['old-venue-sync'], 'new binding should carry old sync rows for superseding');

const safeHistoryPlan = sync.safeHistoryApplyPlan({
  actions: [
    { type: 'bind_existing', sourceKey: 'bind' },
    { type: 'create_schedule', sourceKey: 'create' },
    { type: 'create_trial_schedule', sourceKey: 'trial' },
    { type: 'notify_error', sourceKey: 'error' },
    { type: 'pending_delete', sourceKey: 'delete' },
    { type: 'update_schedule', sourceKey: 'update' }
  ]
});
assert.deepStrictEqual(safeHistoryPlan.summary, {
  total: 2,
  noop: 0,
  bindExisting: 1,
  create: 1,
  createTrial: 0,
  update: 0,
  pendingDelete: 0,
  notifyError: 0
}, 'history safe apply should only execute confirmed bind/formal-create actions by default');

const trialConfirmedHistoryPlan = sync.safeHistoryApplyPlan({
  actions: [
    { type: 'bind_existing', sourceKey: 'bind' },
    { type: 'create_schedule', sourceKey: 'create' },
    { type: 'create_trial_schedule', sourceKey: 'trial' }
  ]
}, { includeTrial: true });
assert.deepStrictEqual(trialConfirmedHistoryPlan.summary, {
  total: 3,
  noop: 0,
  bindExisting: 1,
  create: 1,
  createTrial: 1,
  update: 0,
  pendingDelete: 0,
  notifyError: 0
}, 'history safe apply should include trial creation only after explicit trial confirmation');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'feishu-schedule-sync.yml'), 'utf8');
assert.match(workflow, /cron:\s*'0 0,10 \* \* \*'/, 'workflow should run twice daily at Beijing 08:00 and 18:00');
assert.match(workflow, /\/api\/cron\/feishu-schedule-sync/, 'workflow should call the feishu schedule sync cron endpoint');
assert.match(workflow, /CRON_SECRET:\s*\$\{\{\s*secrets\.CRON_SECRET\s*\|\|\s*secrets\.FLOWTENNIS_ADMIN_TOKEN\s*\}\}/, 'workflow should reuse FLOWTENNIS_ADMIN_TOKEN when CRON_SECRET is not configured');
assert.match(workflow, /notification sent=/, 'workflow log should expose whether Feishu group notification was sent or skipped');
assert.match(workflow, /notify:\s*\n\s*description: 'dry-run 是否发群通知'/, 'manual dry-run should expose an explicit notify switch');

(async () => {
  const candidate = {
    sourceKey: 'trial-key',
    sheetId: 'GrbZdi',
    fingerprint: 'fp-trial',
    sheetTitle: '7.20-7.26',
    sourceCell: 'R6C8',
    date: '2026-07-20',
    startClock: '13:30',
    endClock: '14:30',
    startTime: '2026-07-20 13:30',
    endTime: '2026-07-20 14:30',
    lessonCount: 1,
    coachName: '晓哲',
    resolvedCoach: { id: 'coach-xz', name: '晓哲' },
    course: { ok: true, courseType: '体验课', experienceType: '青少年', isTrial: true, audience: '青少年' },
    studentNames: ['杜一诺'],
    resolvedStudents: [{ id: 'stu-trial', name: '杜一诺' }],
    scheduleStudents: [{ id: 'stu-trial', name: '杜一诺' }],
    campus: 'shunyi_mapo',
    locationType: 'own',
    venue: '2号场',
    venueText: '马坡室内',
    courtText: '2号'
  };

  let purchased = false;
  let createdBody = null;
  const writes = [];
  const appliedTrial = await sync.applySyncPlan({
    actions: [{ type: 'create_trial_schedule', sourceKey: candidate.sourceKey, candidate }]
  }, {
    put: async (table, id, row) => writes.push({ table, id, row }),
    uuidv4: () => 'uuid-fixed',
    createSchedule: async (body) => { createdBody = body; return { schedule: { id: 'sch-trial' } }; },
    purchasePackage: async () => { purchased = true; return {}; },
    convertLeadToStudent: async () => { throw new Error('should not convert existing student'); },
    packages: [],
    entitlements: [{ id: 'ent-trial', studentId: 'stu-trial', courseType: '体验课', experienceType: '青少年', remainingLessons: 1, status: 'active' }],
    leads: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(purchased, false, 'trial sync should reuse existing available trial entitlement before buying another package');
  assert.strictEqual(createdBody.payMethod, '', 'trial schedule should consume a package, not direct-pay through schedule');
  assert.strictEqual(createdBody.settlementType, 'package', 'trial schedule should follow package settlement');
  assert.strictEqual(createdBody.entitlementId, 'ent-trial', 'trial schedule should explicitly carry the matched entitlement id');
  assert.strictEqual(appliedTrial[0].scheduleId, 'sch-trial', 'trial schedule creation should persist sync relation after schedule creation');
  assert.strictEqual(writes[0].table, 'ft_feishu_schedule_sync', 'created schedule should write sync relation');
  assert.strictEqual(writes[0].row.sheetId, 'GrbZdi', 'sync relation should record source sheet id for future deletion scope');
  assert.strictEqual(writes[0].row.startTime, '2026-07-20 13:30', 'sync relation should record source start time for baseline audits');

  const newTrialCandidate = {
    ...candidate,
    sourceKey: 'new-trial-student-key',
    course: { ok: true, courseType: '体验课', experienceType: '成人', isTrial: true, audience: '成人' },
    studentNames: ['宜歆'],
    resolvedStudents: [],
    scheduleStudents: []
  };
  const createdLeadBodies = [];
  const convertedLeadIds = [];
  const purchasedBodies = [];
  const appliedNewTrial = await sync.applySyncPlan({
    actions: [{ type: 'create_trial_schedule', sourceKey: newTrialCandidate.sourceKey, candidate: newTrialCandidate }]
  }, {
    put: async () => {},
    uuidv4: () => 'uuid-fixed',
    createLead: async (body) => { createdLeadBodies.push(body); return { lead: { id: 'lead-new', ...body } }; },
    convertLeadToStudent: async (leadId) => { convertedLeadIds.push(leadId); return { student: { id: 'stu-new', name: '宜歆' } }; },
    purchasePackage: async (body) => { purchasedBodies.push(body); return { purchase: { id: 'pur-new', packageName: '体验课 · 1课时 · 全天' }, entitlement: { id: 'ent-new', packageName: '体验课 · 1课时 · 全天', purchaseId: 'pur-new' } }; },
    createSchedule: async (body) => {
      assert.strictEqual(body.entitlementId, 'ent-new', 'new trial schedule should explicitly consume the purchased entitlement');
      return { schedule: { id: 'sch-new-trial', ...body } };
    },
    packages: [{ id: 'pkg-trial-adult', name: '1v1 · 全天 · 1 课时', courseType: '体验课', experienceType: '私教体验课', price: 239, status: 'active' }],
    entitlements: [],
    leads: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.strictEqual(createdLeadBodies[0].displayName, '宜歆', 'new trial student should create a formal lead first');
  assert.strictEqual(createdLeadBodies[0].rawStatus, '已约体验', 'new trial lead should enter the normal lead lifecycle');
  assert.deepStrictEqual(convertedLeadIds, ['lead-new'], 'created trial lead should be converted to a student through the existing conversion route');
  assert.strictEqual(purchasedBodies[0].packageId, 'pkg-trial-adult', 'trial package lookup should accept active 239 adult trial packages without exact name matching');
  assert.strictEqual(purchasedBodies[0].payMethod, '大众点评券码', 'trial package purchase should use Dianping coupon write-off payment method');
  assert.strictEqual(appliedNewTrial[0].scheduleId, 'sch-new-trial', 'new trial student flow should still create the schedule');

  const specialPurchaseBodies = [];
  let specialCreatedBody = null;
  await sync.applySyncPlan({
    actions: [beginnerSpecialAutoPurchasePlan.actions[0]]
  }, {
    put: async () => {},
    uuidv4: () => 'uuid-special',
    purchasePackage: async (body) => {
      specialPurchaseBodies.push(body);
      return { purchase: { id: `pur-${body.studentId}`, packageName: '专项课 · 零基础 · 初阶专项课 · 1次 · 199元' }, entitlement: { id: `ent-${body.studentId}`, studentId: body.studentId, courseType: '专项课', specialTopic: '初阶专项课', skillLevelMin: '零基础', skillLevelMax: '零基础', remainingLessons: 1, status: 'active' } };
    },
    createSchedule: async (body) => { specialCreatedBody = body; return { schedule: { id: 'sch-special' } }; },
    entitlements: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.deepStrictEqual(specialPurchaseBodies.map(row => row.studentId), ['stu-jerry', 'stu-zoe'], 'special course sync should buy one package for each missing student');
  assert.strictEqual(specialPurchaseBodies[0].amountPaid, 199, 'beginner special package should use the confirmed 199 amount');
  assert.deepStrictEqual(specialCreatedBody.entitlementIds.sort(), ['ent-stu-jerry', 'ent-stu-zoe'].sort(), 'special course schedule should consume purchased entitlements');

  const authWrites = [];
  let sharedCreatedBody = null;
  await sync.applySyncPlan({
    actions: [authorizedSharedPackagePlan.actions[0]]
  }, {
    put: async (table, id, row) => authWrites.push({ table, id, row }),
    mkTable: async () => {},
    uuidv4: () => 'uuid-shared',
    createSchedule: async (body) => { sharedCreatedBody = body; return { schedule: { id: 'sch-shared' } }; },
    authorizations: [],
    T_ENTITLEMENT_AUTHORIZATIONS: 'ft_entitlement_authorizations',
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.ok(authWrites.some(item => item.table === 'ft_entitlement_authorizations' && item.row.ownerStudentId === 'stu-shiyi' && item.row.authorizedStudentId === 'stu-dada'), 'shared package sync should create entitlement authorization before scheduling');
  assert.deepStrictEqual(sharedCreatedBody.studentIds, ['stu-dada'], 'shared package schedule should use the actual learner as student');
  assert.deepStrictEqual(sharedCreatedBody.entitlementIds, ['ent-shiyi'], 'shared package schedule should consume package owner entitlement');
  assert.strictEqual(sharedCreatedBody.packageOwnerStudentId, 'stu-shiyi', 'shared package schedule should keep owner metadata for ledger display');

  const ambiguousTrial = await sync.applySyncPlan({
    actions: [{ type: 'create_trial_schedule', sourceKey: 'multi-trial-key', candidate: { ...newTrialCandidate, studentNames: ['麦迪', '朋友'] } }]
  }, {
    createLead: async () => { throw new Error('should not create ambiguous multi-student lead'); },
    convertLeadToStudent: async () => ({}),
    purchasePackage: async () => ({}),
    createSchedule: async () => ({}),
    packages: [{ id: 'pkg-trial-adult', courseType: '体验课', price: 239, status: 'active' }],
    entitlements: [],
    leads: [],
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.strictEqual(ambiguousTrial[0].type, 'error', 'multi-student trial text should remain manual confirmation instead of creating a wrong student');
  assert.match(ambiguousTrial[0].error, /多人或模糊学员/, 'ambiguous trial error should explain why it was not auto-created');

  let updateCalled = false;
  const appliedUpdate = await sync.applySyncPlan({
    actions: [{
      type: 'update_schedule',
      sourceKey: 'update-key',
      sync: { id: 'sync-update', sourceKey: 'update-key', scheduleId: 'sch-old', lastFingerprint: 'old', status: 'active' },
      schedule: { id: 'sch-old', courseType: '私教课', experienceType: '', studentIds: ['stu-trial'], startTime: candidate.startTime, endTime: candidate.endTime },
      candidate
    }]
  }, {
    put: async () => {},
    updateSchedule: async () => { updateCalled = true; },
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(updateCalled, false, 'high-risk course type change should not auto-update schedule');
  assert.strictEqual(appliedUpdate[0].type, 'notify_error', 'high-risk update should be converted into operator notification');

  const updateTaskWrites = [];
  const appliedPendingUpdate = await sync.applySyncPlan({
    actions: [{
      type: 'notify_error',
      sourceKey: 'pending-update-key',
      confirmableUpdate: true,
      reason: '历史排课修改需要运营确认：时间：系统「15:00-16:00」，飞书「14:00-15:00」',
      sync: { id: 'sync-pending-update', sourceKey: 'pending-update-key', scheduleId: 'sch-pending-update', lastFingerprint: 'old', status: 'active' },
      schedule: {
        id: 'sch-pending-update',
        startTime: '2026-08-05 15:00',
        endTime: '2026-08-05 16:00',
        studentName: '张佳良 老二',
        courseType: '私教课',
        coach: 'Siren',
        venue: '4号场'
      },
      candidate: {
        sourceKey: 'pending-update-key',
        sheetId: 'EGRknT',
        sheetTitle: '8.3-8.9',
        startTime: '2026-08-05 14:00',
        endTime: '2026-08-05 15:00',
        fingerprint: 'new-update-fingerprint',
        studentNames: ['张佳良 老二'],
        studentText: '张佳良 老二（8）',
        coachName: 'Siren',
        resolvedCoach: { id: 'coach-siren', name: 'Siren' },
        campus: 'shunyi_mapo',
        venue: '3号场',
        venueText: '马坡室内',
        courtText: '3号',
        lessonCount: 1,
        courseText: '青少年私教【正式】',
        course: { ok: true, courseType: '私教课', experienceType: '', audience: '青少年', isTrial: false },
        resolvedStudents: [{ id: 'stu-zjl2', name: '张佳良 老二' }],
        scheduleStudents: [{ id: 'stu-zjl2', name: '张佳良 老二' }]
      }
    }]
  }, {
    put: async (table, id, row) => updateTaskWrites.push({ table, id, row }),
    uuidv4: () => 'uuid-update',
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });
  assert.strictEqual(appliedPendingUpdate[0].type, 'pending_update', 'confirmable historical update should create a pending confirmation task');
  assert.match(appliedPendingUpdate[0].confirmUrl, /\/api\/feishu-schedule-sync\/confirm-update\?taskId=/, 'pending update should include a mobile confirmation link');
  assert.ok(updateTaskWrites.some(item => item.table === 'ft_feishu_schedule_tasks' && item.row.type === 'update_confirm' && item.row.status === 'pending'), 'pending update task should be stored for mobile confirmation');

  const pendingUpdateCard = sync.buildNotificationCard({
    at: '2026-08-07T10:00:00.000Z',
    sheetTitle: '8.3-8.9 当前周',
    plan: { summary: { total: 1, noop: 0, bindExisting: 0, create: 0, createTrial: 0, update: 0, pendingDelete: 0, notifyError: 0 }, actions: [] },
    applied: appliedPendingUpdate
  });
  const cardJson = JSON.stringify(pendingUpdateCard);
  assert.match(cardJson, /确认按飞书修改/, 'pending update card should expose an operation button in Feishu');
  assert.match(cardJson, /confirm-update/, 'pending update button should point to the update confirmation endpoint');

  const deleteWrites = [];
  const appliedDelete = await sync.applySyncPlan({
    actions: [{
      type: 'pending_delete',
      sourceKey: 'delete-key',
      sync: { id: 'sync-delete', sourceKey: 'delete-key', scheduleId: 'sch-delete', status: 'active' },
      schedule: {
        id: 'sch-delete',
        startTime: '2026-08-02 10:00',
        endTime: '2026-08-02 11:00',
        studentName: '赵新阳 田秀楠',
        courseType: '私教课',
        coach: 'Siren',
        venue: '马坡室内',
        courtText: '3号场'
      }
    }]
  }, {
    put: async (table, id, row) => deleteWrites.push({ table, id, row }),
    uuidv4: () => 'uuid-delete',
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(appliedDelete[0].type, 'pending_delete', 'delete sync should create a pending confirmation task');
  assert.match(appliedDelete[0].confirmUrl, /\/api\/feishu-schedule-sync\/confirm-delete\?taskId=/, 'pending delete should include a mobile confirmation link');
  assert.deepStrictEqual(appliedDelete[0].scheduleSnapshot.studentName, '赵新阳 田秀楠', 'pending delete should keep readable schedule information');
  assert.ok(deleteWrites.some(item => item.table === 'ft_feishu_schedule_tasks' && item.row.status === 'pending'), 'delete sync should not cancel immediately, only create pending task');
  assert.ok(deleteWrites.some(item => item.table === 'ft_feishu_schedule_tasks' && item.row.scheduleSnapshot?.studentName === '赵新阳 田秀楠'), 'delete confirmation task should save readable schedule information');
  assert.ok(deleteWrites.some(item => item.table === 'ft_feishu_schedule_sync' && item.row.status === 'pending_delete'), 'delete sync should mark relation as pending_delete');

  const supersedeWrites = [];
  const appliedSupersede = await sync.applySyncPlan({
    actions: [{
      type: 'bind_existing',
      sourceKey: 'new-venue-key',
      candidate: {
        sheetId: 'EGRknT',
        sheetTitle: '8.3-8.9',
        startTime: '2026-08-06 12:00',
        endTime: '2026-08-06 13:00',
        fingerprint: 'new-fingerprint'
      },
      schedule: { id: 'sch-deadia' },
      supersededSyncRows: [{ id: 'old-venue-sync', sourceKey: 'old-venue-key', scheduleId: 'sch-deadia', status: 'active' }]
    }]
  }, {
    put: async (table, id, row) => supersedeWrites.push({ table, id, row }),
    T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
    T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
  });

  assert.strictEqual(appliedSupersede[0].type, 'bind_existing', 'new source key should still bind the existing schedule');
  assert.ok(supersedeWrites.some(item => item.id === 'old-venue-sync' && item.row.status === 'superseded' && item.row.supersededBySourceKey === 'new-venue-key'), 'old sync row for the same schedule should be marked superseded');

  const originalAxiosPost = axios.post;
  const originalAxiosGet = axios.get;
  const originalEnv = {
    FEISHU_SCHEDULE_APP_ID: process.env.FEISHU_SCHEDULE_APP_ID,
    FEISHU_SCHEDULE_APP_SECRET: process.env.FEISHU_SCHEDULE_APP_SECRET,
    FEISHU_SCHEDULE_SPREADSHEET_TOKEN: process.env.FEISHU_SCHEDULE_SPREADSHEET_TOKEN,
    FEISHU_SCHEDULE_SHEET_ID: process.env.FEISHU_SCHEDULE_SHEET_ID,
    FEISHU_SCHEDULE_NOTIFY_WEBHOOK: process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK,
    FEISHU_SCHEDULE_SYNC_WRITE_ENABLED: process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED,
    CRON_SECRET: process.env.CRON_SECRET
  };
  try {
    process.env.FEISHU_SCHEDULE_APP_ID = 'app-id';
    process.env.FEISHU_SCHEDULE_APP_SECRET = 'app-secret';
    process.env.FEISHU_SCHEDULE_SPREADSHEET_TOKEN = 'spreadsheet-token';
    process.env.FEISHU_SCHEDULE_SHEET_ID = 'GrbZdi';
    process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED = 'false';
    delete process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK;
    delete process.env.CRON_SECRET;
    axios.post = async (url) => {
      assert.match(url, /tenant_access_token/, 'cron sync should only post to Feishu auth when webhook is not configured');
      return { data: { code: 0, tenant_access_token: 'tenant-token' } };
    };
    const nextWeekValues = values.map(row => row.slice());
    nextWeekValues[2][0] = 46237;
    nextWeekValues[3][0] = null;
    nextWeekValues[4][0] = null;
    nextWeekValues[5][0] = null;
    const oldWeekValues = values.map(row => row.slice());
    oldWeekValues[2][0] = 46223;
    oldWeekValues[3][0] = null;
    oldWeekValues[4][0] = null;
    oldWeekValues[5][0] = null;
    const sheetMeta = [
      { sheet_id: 'OldWeek', title: '7.20-7.26', merges },
      { sheet_id: 'GrbZdi', title: '7.27-8.2', merges },
      { sheet_id: 'NextWeek', title: '8.3-8.9', merges }
    ];
    axios.get = async (url) => {
      if (/\/values\//.test(url)) {
        if (url.includes('OldWeek')) return { data: { code: 0, data: { valueRange: { values: oldWeekValues } } } };
        if (url.includes('NextWeek')) return { data: { code: 0, data: { valueRange: { values: nextWeekValues } } } };
        return { data: { code: 0, data: { valueRange: { values } } } };
      }
      if (/\/sheets\/query/.test(url)) return { data: { code: 0, data: { sheets: sheetMeta } } };
      throw new Error(`unexpected axios.get ${url}`);
    };
    let jsonPayload = null;
    let mockedSyncRows = [];
    const route = sync.createFeishuScheduleSyncRoutes({
      init: async () => {},
      mkTable: async () => {},
      sendJson: (res, payload, status = 200) => { jsonPayload = payload; return { status, payload }; },
      sendPlainText: () => {},
      getCachedScan: async (table) => {
        if (table === 'ft_feishu_schedule_sync') return mockedSyncRows;
        return [];
      },
      put: async () => {},
      uuidv4: () => 'uuid',
      T_SCHEDULE: 'schedules',
      T_STUDENTS: 'students',
      T_COACHES: 'coaches',
      T_USERS: 'users',
      T_PACKAGES: 'packages',
      T_ENTITLEMENTS: 'entitlements',
      T_LEADS: 'leads',
      T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
      T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
    });
    await route({
      path: '/cron/feishu-schedule-sync',
      method: 'GET',
      req: { headers: { 'user-agent': 'vercel-cron' } },
      res: {},
      query: new URLSearchParams('dryRun=true&history=true&startDate=2026-07-20&endDate=2026-07-20')
    });
    assert.deepStrictEqual(jsonPayload.notification, { skipped: true, reason: 'dry-run 默认不发群' }, 'dry-run should not spam the group by default');

    process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED = 'true';
    process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/test';
    let suppressedWebhookCalled = false;
    axios.post = async (url) => {
      if (/tenant_access_token/.test(url)) return { data: { code: 0, tenant_access_token: 'tenant-token' } };
      if (/\/bot\/v2\/hook\//.test(url)) {
        suppressedWebhookCalled = true;
        return { data: { code: 0 } };
      }
      throw new Error(`unexpected axios.post ${url}`);
    };
    await route({
      path: '/cron/feishu-schedule-sync',
      method: 'GET',
      req: { headers: { 'user-agent': 'vercel-cron' } },
      res: {},
      query: new URLSearchParams('notify=false')
    });
    assert.deepStrictEqual(jsonPayload.notification, { skipped: true, reason: '本次执行已按参数关闭群通知' }, 'manual write sync should allow suppressing group notification');
    assert.strictEqual(suppressedWebhookCalled, false, 'notify=false should not call Feishu webhook');
    process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED = 'false';
    delete process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK;

    await withFixedDate('2026-08-01T01:00:00.000Z', () => route({
      path: '/cron/feishu-schedule-sync',
      method: 'GET',
      req: { headers: { 'user-agent': 'vercel-cron' } },
      res: {},
      query: new URLSearchParams('dryRun=true')
    }));
    assert.strictEqual(jsonPayload.mode, 'sheet', 'regular cron sync should compare the whole Feishu document instead of future rows only');
    assert.strictEqual(jsonPayload.courseCount, 4, 'regular cron sync should include current week and next week rows');
    assert.deepStrictEqual(jsonPayload.sheetIds, ['GrbZdi', 'NextWeek'], 'regular cron sync should not scan old sheets during the non-8am run');

    const baselineWrites = [];
    const baselineRoute = sync.createFeishuScheduleSyncRoutes({
      init: async () => {},
      mkTable: async () => {},
      sendJson: (res, payload, status = 200) => { jsonPayload = payload; return { status, payload }; },
      sendPlainText: () => {},
      getCachedScan: async (table) => {
        if (table === 'ft_feishu_schedule_sync') return mockedSyncRows;
        return [];
      },
      put: async (table, id, row) => baselineWrites.push({ table, id, row }),
      uuidv4: () => 'uuid',
      T_SCHEDULE: 'schedules',
      T_STUDENTS: 'students',
      T_COACHES: 'coaches',
      T_USERS: 'users',
      T_PACKAGES: 'packages',
      T_ENTITLEMENTS: 'entitlements',
      T_LEADS: 'leads',
      T_FEISHU_SCHEDULE_SYNC: 'ft_feishu_schedule_sync',
      T_FEISHU_SCHEDULE_TASKS: 'ft_feishu_schedule_tasks'
    });
    process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED = 'true';
    await withFixedDate('2026-08-01T00:00:00.000Z', () => baselineRoute({
      path: '/cron/feishu-schedule-sync',
      method: 'GET',
      req: { headers: { 'user-agent': 'vercel-cron' } },
      res: {},
      query: new URLSearchParams('notify=false&scanAllSheets=true')
    }));
    assert.strictEqual(jsonPayload.courseCount, 4, 'first all-sheet scan should baseline old sheets without processing them');
    assert.ok(baselineWrites.some(item => item.row.source === 'feishu-sheet-fingerprint' && item.row.sheetId === 'OldWeek'), 'first all-sheet scan should store old sheet fingerprint baseline');

    const changedOldWeekValues = oldWeekValues.map(row => row.slice());
    changedOldWeekValues[2][10] = '历史修改学员';
    const changedOldFingerprint = sync.sheetFingerprint(changedOldWeekValues, sheetMeta[0]);
    const oldFingerprintRows = sheetMeta.map(sheet => ({
      id: `fp-${sheet.sheet_id}`,
      source: 'feishu-sheet-fingerprint',
      status: 'fingerprint',
      sheetId: sheet.sheet_id,
      sheetTitle: sheet.title,
      sheetFingerprint: sheet.sheet_id === 'OldWeek' ? 'previous-fingerprint' : sync.sheetFingerprint(sheet.sheet_id === 'NextWeek' ? nextWeekValues : values, sheet)
    }));
    mockedSyncRows = oldFingerprintRows;
    axios.get = async (url) => {
      if (/\/values\//.test(url)) {
        if (url.includes('OldWeek')) return { data: { code: 0, data: { valueRange: { values: changedOldWeekValues } } } };
        if (url.includes('NextWeek')) return { data: { code: 0, data: { valueRange: { values: nextWeekValues } } } };
        return { data: { code: 0, data: { valueRange: { values } } } };
      }
      if (/\/sheets\/query/.test(url)) return { data: { code: 0, data: { sheets: sheetMeta } } };
      throw new Error(`unexpected axios.get ${url}`);
    };
    process.env.FEISHU_SCHEDULE_SYNC_WRITE_ENABLED = 'false';
    await baselineRoute({
      path: '/cron/feishu-schedule-sync',
      method: 'GET',
      req: { headers: { 'user-agent': 'vercel-cron' } },
      res: {},
      query: new URLSearchParams('dryRun=true&scanAllSheets=true')
    });
    assert.strictEqual(changedOldFingerprint.length, 64, 'sheet fingerprint should be a stable hash');
    assert.deepStrictEqual(jsonPayload.changedSheetIds, ['OldWeek'], 'changed historical sheet should be detected by fingerprint');
    assert.ok(jsonPayload.sheetIds.includes('OldWeek'), 'changed historical sheet should be included in detailed comparison');

    process.env.FEISHU_SCHEDULE_NOTIFY_WEBHOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/test';
    let webhookCardJson = '';
    axios.post = async (url, body) => {
      if (/tenant_access_token/.test(url)) return { data: { code: 0, tenant_access_token: 'tenant-token' } };
      if (/\/bot\/v2\/hook\//.test(url)) {
        assert.strictEqual(body.msg_type, 'interactive', 'Feishu webhook notification should use an interactive card');
        webhookCardJson = JSON.stringify(body.card);
        assert.match(body.card.header.title.content, /【网球兄弟】排课自动同步/, 'Feishu card should use the business title');
        return { data: { code: 9499, msg: 'bad webhook' } };
      }
      throw new Error(`unexpected axios.post ${url}`);
    };
    await route({
      path: '/cron/feishu-schedule-sync',
      method: 'GET',
      req: { headers: { 'user-agent': 'vercel-cron' } },
      res: {},
      query: new URLSearchParams('dryRun=true&notify=true&history=true&startDate=2026-07-20&endDate=2026-07-20')
    });
    assert.strictEqual(jsonPayload.notification.sent, false, 'cron response should mark Feishu webhook non-zero code as notification failure');
    assert.match(jsonPayload.notification.error, /bad webhook/, 'notification failure should keep the Feishu error message');
    assert.match(webhookCardJson, /本次结果/, 'group notification should show this run result');
    assert.match(webhookCardJson, /需要确认/, 'group notification should tell operations what needs confirmation');
    assert.doesNotMatch(webhookCardJson, /bind_existing|create_trial_schedule|create_schedule/, 'group notification should not expose backend action names');
    assert.doesNotMatch(webhookCardJson, /同步结果报告/, 'group notification should not point to an invisible report');
    assert.doesNotMatch(webhookCardJson, /读取文档排课/, 'group notification should not keep reporting the historical document total');
    assert.doesNotMatch(webhookCardJson, /R\d+C\d+/, 'group notification should not expose spreadsheet cell coordinates');
  } finally {
    axios.post = originalAxiosPost;
    axios.get = originalAxiosGet;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }

  console.log('feishu schedule sync rules tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
