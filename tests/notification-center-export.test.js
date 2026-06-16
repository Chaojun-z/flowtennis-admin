const assert = require('assert');
const path = require('path');

const { buildNotificationCenterSnapshot } = require(path.join(__dirname, '..', 'scripts', 'lib', 'notification-center-export'));

const snapshot = buildNotificationCenterSnapshot({
  targetDate: '2026-05-25',
  now: new Date('2026-05-25T01:22:00Z'),
  scheduleRows: [
    { id: 's1', startTime: '2026-05-25 12:00', endTime: '2026-05-25 14:00', coach: 'Siren', campus: 'mabao', courseType: '私教课', studentName: '马晨', status: '已排课' },
    { id: 's2', startTime: '2026-05-25 16:30', endTime: '2026-05-25 17:30', coach: 'Siren', campus: 'mabao', courseType: '私教课', studentName: '丫丫', status: '已排课' },
    { id: 's3', startTime: '2026-05-25 17:30', endTime: '2026-05-25 18:30', coach: 'Siren', campus: 'mabao', courseType: '私教课', studentName: '是锤锤呀', status: '已排课' },
    { id: 's4', startTime: '2026-05-25 18:30', endTime: '2026-05-25 19:30', coach: 'Siren', campus: 'mabao', courseType: '私教课', studentName: '莲儿', status: '已排课' }
  ],
  campuses: [{ code: 'mabao', name: '顺义马坡' }]
});

assert.strictEqual(snapshot.todayStats.totalLessons, 4, '北京时间 2026-05-25 的 4 节课应全部算入今日');
assert.strictEqual(snapshot.tomorrowStats.totalLessons, 0, '北京时间 2026-05-26 不应混入 2026-05-25 下午课');
assert.deepStrictEqual(snapshot.todayLessonDetails.map((row) => row.id), ['s1', 's2', 's3', 's4']);
assert.deepStrictEqual(snapshot.todayLessonDetails[0].studentNames, ['马晨'], '日报快照应保留学员名用于飞书排课明细');

const completedSnapshot = buildNotificationCenterSnapshot({
  targetDate: '2026-05-25',
  now: new Date('2026-05-25T13:22:00Z'),
  scheduleRows: [
    { id: 'done-1', startTime: '2026-05-25 19:00', endTime: '2026-05-25 20:00', coach: 'Siren', campus: 'mabao', courseType: '私教课', studentName: '马晨', status: '已排课' },
    { id: 'cancel-1', startTime: '2026-05-25 19:00', endTime: '2026-05-25 20:00', coach: '朝珺', campus: 'mabao', courseType: '私教课', studentName: '丫丫', status: '已取消' }
  ],
  campuses: [{ code: 'mabao', name: '顺义马坡' }]
});

assert.strictEqual(completedSnapshot.todayStats.completedLessons, 1, '已经过了下课时间的未取消排课应计入实际完成');
assert.strictEqual(completedSnapshot.todayStats.cancelledLessons, 1, '已取消排课应计入取消课程');
assert.deepStrictEqual(completedSnapshot.todayLessonDetails.map((row) => row.status), ['已结束', '已取消']);

const fallbackEndSnapshot = buildNotificationCenterSnapshot({
  targetDate: '2026-06-16',
  now: new Date('2026-06-16T13:00:00Z'),
  scheduleRows: [
    { id: 'fallback-end', startTime: '2026-06-16 07:00', coach: '朝珺', campus: 'mabao', courseType: '私教课', studentName: '马晨', status: '已排课', lessonCount: 1 }
  ],
  campuses: [{ code: 'mabao', name: '顺义马坡' }]
});

assert.strictEqual(fallbackEndSnapshot.todayStats.completedLessons, 1, '缺少 endTime 的历史排课应按开课时间和课时推算实际完成');

const externalSnapshot = buildNotificationCenterSnapshot({
  targetDate: '2026-06-16',
  now: new Date('2026-06-16T13:00:00Z'),
  scheduleRows: [
    { id: 'external-1', startTime: '2026-06-17 07:00', endTime: '2026-06-17 09:00', coach: '朝珺', campus: 'external', locationType: 'external', externalVenueName: '国家网球中心', externalCourtName: 'C1', venue: '国家网球中心 · C1', courseType: '私教课', studentName: '有知有行团课', status: '已排课' }
  ],
  campuses: [{ code: 'mabao', name: '顺义马坡' }]
});

assert.strictEqual(externalSnapshot.tomorrowLessonDetails[0].campusName, '国家网球中心', '外部场馆日报不应把 external 当校区展示');
assert.strictEqual(externalSnapshot.tomorrowLessonDetails[0].venue, 'C1', '外部场馆日报应把外部场地号单独展示');

console.log('notification center export tests passed');
