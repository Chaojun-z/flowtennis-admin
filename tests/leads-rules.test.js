const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should exist');
assert.ok(rules.deriveLeadSystemStatus, 'api._test should expose deriveLeadSystemStatus');
assert.ok(rules.normalizeLeadRecord, 'api._test should expose normalizeLeadRecord');
assert.ok(rules.normalizeLeadFollowupRecord, 'api._test should expose normalizeLeadFollowupRecord');
assert.ok(rules.applyLeadFollowupSnapshot, 'api._test should expose applyLeadFollowupSnapshot');

assert.equal(rules.deriveLeadSystemStatus({ rawStatus: '已报名-私教' }), '已转课程');
assert.equal(rules.deriveLeadSystemStatus({ rawStatus: '已定场' }), '已转订场');
assert.equal(rules.deriveLeadSystemStatus({ rawStatus: '无意向' }), '已流失');
assert.equal(rules.deriveLeadSystemStatus({ rawStatus: '体验课预约' }), '已约体验');
assert.equal(rules.deriveLeadSystemStatus({ rawStatus: '已沟通' }), '跟进中');
assert.equal(rules.deriveLeadSystemStatus({ studentId: 'stu-1', courtId: 'court-1', rawStatus: '已报名-私教' }), '已转课程+订场');

const normalizedLead = rules.normalizeLeadRecord({
  id: 'lead-1',
  '线索时间': '2026-04-20',
  '微信名/电话': '小王 13812345678',
  '水平': '3.0',
  '其他信息（包含年纪等）': '9岁，想周末上课',
  '线索渠道': '抖音',
  '咨询需求': '青少私教',
  '意向类型': '高',
  '跟进人': 'Lucy',
  '跟进状态': '体验课预约',
  '体验课时间': '2026-04-28 19:00',
  '正式课报名时间': '',
  '用户顾虑点': '怕孩子坚持不下来',
  '沟通情况和方案建议': '建议先上体验课',
  '是否转化': '否',
  '正式课教练': '陈教练',
  '未成交原因': ''
});

assert.equal(normalizedLead.phone, '13812345678');
assert.equal(normalizedLead.wechatName, '小王');
assert.equal(normalizedLead.systemStatus, '已约体验');
assert.equal(normalizedLead.latestConcern, '怕孩子坚持不下来');
assert.equal(normalizedLead.latestConclusion, '建议先上体验课');

const snapshot = rules.applyLeadFollowupSnapshot(
  normalizedLead,
  rules.normalizeLeadFollowupRecord({
    leadId: 'lead-1',
    followupAt: '2026-04-29T10:00:00.000Z',
    concern: '担心距离远',
    communicationNote: '已发课程表',
    statusAfter: '已沟通',
    conclusion: '继续跟进',
    nextFollowupAt: '2026-05-01T09:00:00.000Z',
    nextAction: '五一前回访'
  })
);

assert.equal(snapshot.lastFollowupAt, '2026-04-29T10:00:00.000Z');
assert.equal(snapshot.latestConcern, '担心距离远');
assert.equal(snapshot.latestConclusion, '继续跟进');
assert.equal(snapshot.nextFollowupAt, '2026-05-01T09:00:00.000Z');
assert.equal(snapshot.nextAction, '五一前回访');
assert.equal(snapshot.rawStatus, '已沟通');
assert.equal(snapshot.systemStatus, '跟进中');

assert.ok(rules.createLeadService, 'api._test should expose createLeadService');

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
  return () => `id-${++seq}`;
}

(async () => {
  const service = rules.createLeadService({
    storage: createMemoryStorage(),
    idFactory: createIdFactory(),
    now: () => '2026-04-27T10:00:00.000Z'
  });

  const created = await service.createLead({
    displayName: '李雷',
    phone: '13800000001',
    wechatName: '李雷',
    source: '大众点评',
    consultType: '成人私教',
    owner: 'Lucy',
    rawStatus: '已沟通',
    firstFollowup: {
      followupAt: '2026-04-27T10:00:00.000Z',
      concern: '价格',
      communicationNote: '先发价目表',
      statusAfter: '已沟通',
      conclusion: '继续跟进',
      nextFollowupAt: '2026-04-29T10:00:00.000Z',
      nextAction: '两天后回访'
    }
  });

  assert.equal(created.lead.displayName, '李雷');
  assert.equal(created.lead.latestConcern, '价格');
  assert.equal(created.followups.length, 1);

  const updated = await service.updateLead(created.lead.id, {
    source: '小红书',
    consultType: '成人双人课'
  });
  assert.equal(updated.source, '小红书');
  assert.equal(updated.consultType, '成人双人课');

  await service.addLeadFollowup(created.lead.id, {
    followupAt: '2026-04-30T09:00:00.000Z',
    concern: '距离远',
    communicationNote: '推荐周末班',
    statusAfter: '体验课预约',
    conclusion: '已约体验',
    nextFollowupAt: '2026-05-02T10:00:00.000Z',
    nextAction: '体验课前确认'
  });

  const followups = await service.listLeadFollowups(created.lead.id);
  assert.deepStrictEqual(
    followups.map((row) => row.followupAt),
    ['2026-04-30T09:00:00.000Z', '2026-04-27T10:00:00.000Z']
  );

  const leadAfterFollowup = await service.getLead(created.lead.id);
  assert.equal(leadAfterFollowup.latestConcern, '距离远');
  assert.equal(leadAfterFollowup.latestConclusion, '已约体验');
  assert.equal(leadAfterFollowup.systemStatus, '已约体验');
  assert.equal(leadAfterFollowup.nextAction, '体验课前确认');

  const pendingList = await service.listLeads({ owner: 'Lucy', systemStatus: '已约体验', pendingOnly: true, today: '2026-05-03' });
  assert.equal(pendingList.length, 1);
  assert.equal(pendingList[0].id, created.lead.id);
  console.log('leads rules tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
