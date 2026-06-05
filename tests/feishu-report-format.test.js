const assert = require('assert');
const path = require('path');

const { generateReport } = require(path.join(__dirname, '..', 'standalone-services', 'feishu-report'));

const report = generateReport({
  today: '2026-05-25',
  tomorrow: '2026-05-26',
  todayStats: { totalLessons: 0, cancelledLessons: 0, completedLessons: 0 },
  todayLessonDetails: [],
  tomorrowLessonDetails: [
    {
      startTime: '2026-05-26 12:00',
      endTime: '2026-05-26 14:00',
      coachName: 'Siren',
      campusName: '顺义马坡',
      venue: '3号场',
      studentNames: ['马晨'],
      courseType: '私教课',
      studentCount: 1,
      status: '已排课'
    },
    {
      startTime: '2026-05-26 16:30',
      endTime: '2026-05-26 17:30',
      coachName: 'Siren',
      campusName: '顺义马坡',
      venue: '3号场',
      studentNames: ['丫丫'],
      courseType: '私教课',
      studentCount: 1,
      status: '已排课'
    }
  ]
});

assert.strictEqual(
  report.tomorrowScheduleStr,
  [
    '**Siren教练（共2节 · 3小时）**',
    '**12:00 - 14:00** · [顺义马坡 · 3号场] · [马晨 · 私教课] · 1人',
    '**16:30 - 17:30** · [顺义马坡 · 3号场] · [丫丫 · 私教课] · 1人'
  ].join('\n'),
  '飞书明日排课应按教练汇总，并加粗教练行和时间'
);

console.log('feishu report format tests passed');
