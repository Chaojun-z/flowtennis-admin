const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules.createLeadImportService, 'api._test should expose createLeadImportService');
assert.ok(rules.buildLeadInitialFollowup, 'api._test should expose buildLeadInitialFollowup');
assert.ok(rules.buildLeadDedupKey, 'api._test should expose buildLeadDedupKey');

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
  return () => `import-id-${++seq}`;
}

const csvText = [
  '网球兄弟线索导出',
  '导入时间,2026-04-27',
  '序号,线索时间,微信名/电话,水平,其他信息（包含年纪等）,线索渠道,咨询需求,意向类型,跟进人,跟进状态,体验课时间,正式课报名时间,用户顾虑点,沟通情况和方案建议,是否转化,正式课教练,未成交原因',
  '1,2026-04-20,小王 13812345678,3.0,9岁,抖音,青少私教,高,Lucy,体验课预约,2026-04-28 19:00,,怕坚持不下来,建议先体验,否,陈教练,',
  '2,2026-04-21,老张,2.5,成人新手,转介绍,订场,中,Amy,已沟通,,,距离远,建议约周末,否,,'
].join('\n');
const csvTextTwoRowHeader = [
  ',,,,,,,,运营人员,说明,填写体验课时间,填写正式课报名时间,,,,,,,,,,,',
  '序号,线索时间,微信名/电话,基本情况,,线索渠道,咨询需求,意向类型,跟进人,跟进状态,体验课时间,正式课报名时间,跟进沟通信息,,是否转化,正式课教练,未成交原因',
  ',,,水平,其他信息（包含年纪等）,,,,,,,,用户顾虑点,沟通情况和方案建议,,,,',
  '1,2026/3/9,张女士,零基础,,大众点评,成人私教,低意向,@岳克舟,无意向,3月9日,,价格,3/18觉得价格贵，暂不考虑，推训练营未回复,,,,'
].join('\n');

assert.throws(() => {
  const service = rules.createLeadImportService({
    storage: createMemoryStorage(),
    idFactory: createIdFactory(),
    now: () => '2026-04-27T10:00:00.000Z'
  });
  service.previewImport({
    csvText: csvText.replace('未成交原因', '原因'),
    students: [],
    courts: [],
    membershipAccounts: []
  });
}, /缺少必需列/);

(async () => {
  const storage = createMemoryStorage();
  const service = rules.createLeadImportService({
    storage,
    idFactory: createIdFactory(),
    now: () => '2026-04-27T10:00:00.000Z'
  });

  const preview = await service.previewImport({
    csvText,
    students: [{ id: 'stu-1', name: '小王同学', phone: '13812345678' }],
    courts: [{ id: 'court-1', name: '老张', phone: '' }],
    membershipAccounts: [{ id: 'ma-1', courtId: 'court-1', status: 'active' }]
  });

  assert.equal(preview.summary.totalRows, 2);
  assert.equal(preview.summary.importableRows, 2);
  assert.equal(preview.summary.errorRows, 0);
  assert.equal(preview.summary.autoLinkedStudents, 1);
  assert.equal(preview.summary.autoLinkedCourts, 0);
  assert.equal(preview.summary.possibleMatches, 1);
  assert.equal(preview.summary.unmatchedRows, 0);
  assert.equal(preview.rows[0].studentMatchType, 'auto');
  assert.equal(preview.rows[1].courtMatchType, 'possible');
  assert.equal(preview.rows[1].membershipAccountId, '');

  const previewTwoRowHeader = await service.previewImport({
    csvText: csvTextTwoRowHeader,
    students: [],
    courts: [],
    membershipAccounts: []
  });
  assert.equal(previewTwoRowHeader.summary.totalRows, 1);
  assert.equal(previewTwoRowHeader.rows[0].level, '零基础');
  assert.equal(previewTwoRowHeader.rows[0].latestConcern, '价格');
  assert.match(previewTwoRowHeader.rows[0].latestConclusion, /3\/18觉得价格贵/);

  const firstFollowup = rules.buildLeadInitialFollowup(preview.rows[0]);
  assert.equal(firstFollowup.concern, '怕坚持不下来');
  assert.equal(firstFollowup.conclusion, '建议先体验');
  assert.equal(firstFollowup.statusAfter, '体验课预约');

  const committed = await service.commitImport({
    batchKey: 'batch-1',
    previewRows: preview.rows
  });

  assert.equal(committed.leadCount, 2);
  assert.equal(committed.followupCount, 2);

  const committedAgain = await service.commitImport({
    batchKey: 'batch-2',
    previewRows: preview.rows
  });

  assert.equal(committedAgain.leadCount, 0);
  assert.equal(committedAgain.skippedDuplicates, 2);
  assert.equal((await storage.scan('ft_leads')).length, 2);
  assert.equal((await storage.scan('ft_lead_followups')).length, 2);
  console.log('leads import tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
