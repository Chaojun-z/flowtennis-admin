const assert = require('assert');
const { buildCoachOpsUnifiedView } = require('../server/read-models/unified-page-views');

const view = buildCoachOpsUnifiedView({
  coaches: [
    { id: 'coach-siren', name: 'Siren 教练', status: 'active', sortOrder: 20 }
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
    }
  ],
  feedbacks: [],
  campuses: [{ code: 'shunyi_mapo', name: '顺义马坡' }]
});

const sirenRows = view.rows.filter(row => row.name === 'Siren 教练');
const aliasRows = view.rows.filter(row => row.name === 'Siren');

assert.strictEqual(aliasRows.length, 0, 'Siren alias must not create a separate coach calendar column');
assert.strictEqual(sirenRows.length, 1, 'Siren alias and standard name must share one coach calendar column');
assert.deepStrictEqual(
  sirenRows[0].rows.map(row => row.id).sort(),
  ['sch-siren-alias', 'sch-siren-standard'],
  'coach calendar should keep both schedules under the standard coach name'
);

console.log('coach ops coach name normalization tests passed');
