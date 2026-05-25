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

console.log('notification center export tests passed');
