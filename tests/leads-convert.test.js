const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules.createLeadConversionService, 'api._test should expose createLeadConversionService');

function createMemoryStorage() {
  const tables = new Map();
  return {
    async scan(table) {
      return [...(tables.get(table) || new Map()).values()].map((row) => ({ ...row }));
    },
    async get(table, id) {
      const row = (tables.get(table) || new Map()).get(String(id));
      return row ? { ...row } : null;
    },
    async put(table, id, row) {
      if (!tables.has(table)) tables.set(table, new Map());
      tables.get(table).set(String(id), { ...row, id: String(id) });
      return { ...row, id: String(id) };
    },
    async del(table, id) {
      const tableMap = tables.get(table);
      if (tableMap) tableMap.delete(String(id));
    }
  };
}

function createIdFactory() {
  let seq = 0;
  return () => `convert-id-${++seq}`;
}

(async () => {
  const storage = createMemoryStorage();
  const lead = rules.normalizeLeadRecord({
    id: 'lead-1',
    displayName: '王女士',
    phone: '13811112222',
    wechatName: '王女士',
    source: '大众点评',
    consultType: '成人私教',
    owner: 'Lucy'
  }, { id: 'lead-1', now: '2026-04-27T10:00:00.000Z' });
  await storage.put('ft_leads', lead.id, lead);
  await storage.put('ft_students', 'stu-existing', { id: 'stu-existing', name: '已存在学员', phone: '13899990000' });
  await storage.put('ft_courts', 'court-existing', { id: 'court-existing', name: '已存在订场', phone: '13900001111', studentId: '', studentIds: [], history: [] });
  await storage.put('ft_membership_accounts', 'ma-1', { id: 'ma-1', courtId: 'court-existing', status: 'active' });

  const service = rules.createLeadConversionService({
    storage,
    idFactory: createIdFactory(),
    now: () => '2026-04-27T10:00:00.000Z'
  });

  const studentConverted = await service.convertStudent('lead-1');
  assert.equal(studentConverted.created, true);
  assert.equal(studentConverted.lead.studentId, studentConverted.student.id);
  assert.equal(studentConverted.lead.isCourseConverted, true);
  assert.equal(studentConverted.lead.systemStatus, '已转课程');

  const studentConvertedAgain = await service.convertStudent('lead-1');
  assert.equal(studentConvertedAgain.created, false);
  assert.equal((await storage.scan('ft_students')).length, 2);

  const courtLinked = await service.linkCourt('lead-1', 'court-existing');
  assert.equal(courtLinked.lead.courtId, 'court-existing');
  assert.equal(courtLinked.lead.membershipAccountId, 'ma-1');
  assert.equal(courtLinked.lead.isMembershipConverted, true);
  assert.equal(courtLinked.lead.systemStatus, '已转课程+订场');

  const relinkStudent = await service.linkStudent('lead-1', 'stu-existing');
  assert.equal(relinkStudent.lead.studentId, 'stu-existing');
  assert.equal(relinkStudent.lead.systemStatus, '已转课程+订场');

  const lead2 = rules.normalizeLeadRecord({
    id: 'lead-2',
    displayName: '赵先生',
    phone: '13822223333',
    wechatName: '赵先生',
    consultType: '订场'
  }, { id: 'lead-2', now: '2026-04-27T10:00:00.000Z' });
  await storage.put('ft_leads', lead2.id, lead2);

  const courtConverted = await service.convertCourt('lead-2');
  assert.equal(courtConverted.created, true);
  assert.equal(courtConverted.lead.courtId, courtConverted.court.id);
  assert.equal(courtConverted.lead.isCourtConverted, true);
  assert.equal(courtConverted.lead.systemStatus, '已转订场');

  console.log('leads convert tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
