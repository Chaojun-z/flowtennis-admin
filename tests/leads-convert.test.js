const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

const lead = rules.normalizeLeadRecord({
  displayName: 'Sandy',
  wechatName: 'Sandy',
  phone: '13800138000',
  source: '大众点评',
  consultType: '定场',
  profileNote: '周末想订场',
  owner: 'Mira'
}, { id: 'lead-1', now: '2026-05-08 00:00:00' });

const student = rules.buildLeadStudentRecord(lead, { id: 'stu-1', now: '2026-05-08 00:00:00' });
assert.strictEqual(student.name, 'Sandy');
assert.strictEqual(student.phone, '13800138000');
assert.strictEqual(student.source, '大众点评');

const court = rules.buildLeadCourtRecord(lead, { id: 'court-1', studentId: 'stu-1', now: '2026-05-08 00:00:00' });
assert.strictEqual(court.name, 'Sandy');
assert.strictEqual(court.studentId, 'stu-1');
assert.deepStrictEqual(court.studentIds, ['stu-1']);
assert.strictEqual(court.owner, 'Mira');

console.log('leads convert tests passed');
