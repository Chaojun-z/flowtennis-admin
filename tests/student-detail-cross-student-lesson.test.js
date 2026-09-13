const assert = require('assert');
const { sanitizeStudentDetailTeachingSummary } = require('../server/page-data/core-pages.js');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');

const studentId = 'student-dada';
const scheduleId = 'schedule-eleven-package';

const summary = {
  studentId,
  teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
  completedLessons: 1,
  detailLessonRecordRows: [{
    kind: 'ledger',
    scheduleId,
    packageOwnerStudentId: 'student-eleven',
    actualStudentIds: ['student-eleven', studentId],
    lessonDelta: -1,
    countAsCompletedLesson: true,
    time: '2026-08-06 13:00-14:00'
  }]
};

sanitizeStudentDetailTeachingSummary(summary, studentId, {
  T_SCHEDULE: 'schedule',
  getCachedRow: async (_table, id) => id === scheduleId
    ? { id, studentIds: ['student-eleven'], status: '已排课' }
    : null
}).then(result => {
  assert.strictEqual(result.detailLessonRecordRows.length, 1, '实际学员明确出现在记录中时不能被排课主表的课包所有人过滤掉');
  assert.strictEqual(result.detailLessonRecordRows[0].scheduleId, scheduleId);
  console.log('student detail cross-student lesson tests passed');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
