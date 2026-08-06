const assert = require('assert');
const { buildCoachOpsUnifiedView } = require('../server/read-models/unified-page-views');

const view = buildCoachOpsUnifiedView({
  coaches: [
    { id: 'coach-siren', name: 'Siren 教练', status: 'active', sortOrder: 20 },
    { id: 'coach-rive', name: 'Rive 天昊教练', status: 'active', sortOrder: 30 }
  ],
  schedule: [
    {
      id: 'sch-siren-alias',
      startTime: '2026-08-02 10:00',
      endTime: '2026-08-02 11:00',
      coach: 'Siren',
      campus: 'shunyi_mapo',
      venue: '3号场',
      status: '已排课',
      studentName: '赵新阳 田秀楠'
    },
    {
      id: 'sch-siren-standard',
      startTime: '2026-08-02 17:00',
      endTime: '2026-08-02 18:00',
      coach: 'Siren 教练',
      campus: 'shunyi_mapo',
      venue: '4号场',
      status: '已排课',
      studentName: '佳琪'
    },
    {
      id: 'sch-rive-alias',
      startTime: '2026-08-02 18:00',
      endTime: '2026-08-02 19:00',
      coach: 'RIVE教练',
      campus: 'shunyi_mapo',
      venue: '4号场',
      status: '已排课',
      studentName: '测试学员'
    }
  ],
  feedbacks: [],
  campuses: [{ code: 'shunyi_mapo', name: '顺义马坡' }]
});

const sirenRows = view.rows.filter(row => row.name === 'Siren 教练');
const aliasRows = view.rows.filter(row => row.name === 'Siren');
const riveRows = view.rows.filter(row => row.name === 'Rive 天昊教练');
const dirtyRiveRows = view.rows.filter(row => row.name === 'RIVE教练');

assert.strictEqual(aliasRows.length, 0, 'Siren alias must not create a separate coach calendar column');
assert.strictEqual(sirenRows.length, 1, 'Siren alias and standard name must share one coach calendar column');
assert.strictEqual(dirtyRiveRows.length, 0, 'RIVE教练 alias must not create a separate coach calendar column');
assert.strictEqual(riveRows.length, 1, 'RIVE教练 must share the standard Rive 天昊 coach calendar column');
assert.deepStrictEqual(
  sirenRows[0].rows.map(row => row.id).sort(),
  ['sch-siren-alias', 'sch-siren-standard'],
  'coach calendar should keep both schedules under the standard coach name'
);
assert.deepStrictEqual(riveRows[0].rows.map(row => row.id), ['sch-rive-alias']);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(sirenRows[0].rows[0], 'startMs'),
  false,
  'coach calendar read model must not expose timezone-shifted startMs'
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(sirenRows[0].rows[0], 'endMs'),
  false,
  'coach calendar read model must not expose timezone-shifted endMs'
);

console.log('coach ops coach name normalization tests passed');
