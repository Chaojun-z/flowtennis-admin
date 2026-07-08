const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

const csv = [
  '序号,线索时间,微信名/电话,基本情况,基本情况,线索渠道,需求产品,意向等级,跟进人,跟进状态,体验课时间,正式课报名时间,跟进沟通信息,跟进沟通信息,是否转化,正式课教练,未成交原因',
  ',,,水平,其他信息（包含年纪等）,,,,,,,,用户顾虑点,沟通情况和方案建议,,,',
  '1,2026/4/7,Leah,未知,咨询孙老师私教课,大众点评,成人私教,低意向,Mira,跟进中,,,价格,介绍了孙老师的私教课价格后，用户未回复,否,,',
  '2,2026/4/7,Leah,未知,咨询孙老师私教课,大众点评,成人私教,低意向,Mira,跟进中,,,价格,介绍了孙老师的私教课价格后，用户未回复,否,,'
].join('\n');

const rows = rules.normalizeLeadImportRows({ csvText: csv });
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].displayName, 'Leah');
assert.strictEqual(rows[0].source, '大众点评');
assert.strictEqual(rows[0].customerType, '成人');
assert.strictEqual(rows[0].demandProduct, '私教课');
assert.strictEqual(rows[0].consultType, '私教课');

const normalizedRows = rules.normalizeLeadImportRows({
  rows: [
    { source: '朋友转介绍', consultType: '成人小班课（专项/训练营）' },
    { source: '直接线下到电', consultType: '青少年小班课（训练营）' },
    { source: '播客', consultType: '合作等' }
  ]
});
assert.deepStrictEqual(normalizedRows.map(row => row.source), ['转介绍', '线下到店', '播客']);
assert.deepStrictEqual(normalizedRows.map(row => row.customerType), ['成人', '青少年', '成人']);
assert.deepStrictEqual(normalizedRows.map(row => row.demandProduct), ['小班课', '小班课', '合作']);
assert.deepStrictEqual(normalizedRows.map(row => row.consultType), ['小班课', '小班课', '合作']);

const deduped = rules.dedupeLeadRows(rows);
assert.strictEqual(deduped.length, 1);

const variantDeduped = rules.dedupeLeadRows([
  { displayName: 'Leah 13800138000', leadDate: '2026/4/7', source: '大众点评', consultType: '成人私教' },
  { wechatName: 'Leah', phone: '13800138000', leadDate: '2026-04-07', source: ' 大众点评 ', consultType: '成人私教 ' }
]);
assert.strictEqual(variantDeduped.length, 1);

const preview = rules.buildLeadImportPreviewRows(deduped, {
  students: [{ id: 'stu-1', name: 'Leah', phone: '' }],
  courts: [],
  membershipAccounts: []
});

assert.strictEqual(preview[0].studentMatchType, 'possible');
assert.strictEqual(preview[0].courtMatchType, 'none');

const summary = rules.leadImportPreviewSummary(preview);
assert.strictEqual(summary.totalRows, 1);
assert.strictEqual(summary.possibleMatches, 1);

console.log('leads import tests passed');
