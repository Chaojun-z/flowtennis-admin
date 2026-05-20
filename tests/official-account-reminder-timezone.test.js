const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.deepStrictEqual(
  rules.collectCourseReminderCandidates([
    { id: 'bj-1730', coach: '小鹿', startTime: '2026-05-20 17:30', endTime: '2026-05-20 18:00', campus: 'chaojun', status: '已排课' }
  ], new Date('2026-05-20T15:05:00+08:00')).map(x => x.schedule.id),
  ['bj-1730'],
  'official account reminders should interpret schedule timestamps as Beijing local time on UTC servers'
);

console.log('official account reminder timezone tests passed');
