const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, next);
}

const renderStudents = fnBody('renderStudents');
const prewarmParams = fnBody('studentListPrewarmParams');
const prewarmRows = fnBody('prewarmStudentDetailsForRows');
const ensureDetail = fnBody('ensureStudentDetailData');

assert.match(
  source,
  /function ensureStudentDefaultSort\(\)\{[\s\S]*stuSortKey='lastLesson';stuSortDir='desc';/,
  '5 月和 8 月数据混合时，首屏默认必须按最近上课倒序，优先显示 8 月最新学员'
);
assert.match(
  renderStudents,
  /const filteredStudents=getFilteredStudents\(\);[\s\S]*let list=getSortedStudents\(filteredStudents\);[\s\S]*standardListSlice\(list,stuPage,stuPageSize\);/,
  '学员列表必须先完整筛选，再完整排序，最后才切当前页'
);
assert.match(
  renderStudents,
  /const \{total,pages,slice\}=pageState;[\s\S]*renderPagerInfoHtml\(total\);/,
  '搜索或筛选后的 total 必须来自筛选排序后的完整列表，不是当前页数量'
);
assert.match(
  fnBody('setStudentPage'),
  /const total=getFilteredStudents\(\)\.length;[\s\S]*standardListPagination\(total,value,stuPageSize\)/,
  '翻页必须基于完整筛选结果计算页码，避免丢页或跳到旧数据'
);
assert.match(
  renderStudents,
  /prewarmStudentDetailsForRows\(slice\);/,
  '首屏渲染后必须预热当前页学员完整详情，避免把慢转移到抽屉点击'
);
[
  'page:currentPage',
  'pageNo:stuPage',
  'pageSize:stuPageSize',
  "search:document.getElementById('stuSearch')?.value||''",
  "type:document.getElementById('stuTypeFilter')?.value||''",
  "source:document.getElementById('stuSourceFilter')?.value||''",
  "coach:document.getElementById('stuCoachFilter')?.value||''",
  'tags:studentTagFilterState',
  'sortKey:stuSortKey',
  'sortDir:stuSortDir',
  "campus:String(campus||'')",
  "startDate:range?.startDate||''",
  "endDate:range?.endDate||''"
].forEach(part => {
  assert.ok(prewarmParams.includes(part), `预热缓存 key 必须包含 ${part}`);
});
assert.match(
  fnBody('studentDetailPrewarmCacheKey'),
  /JSON\.stringify\(\{\.\.\.studentListPrewarmParams\(\),ids\}\)/,
  '预热缓存 key 必须同时包含当前筛选排序参数和当前页学生 ID'
);
assert.match(
  prewarmRows,
  /ensureStudentDetailData\(id,\{silent:true\}\)/,
  '预热必须走现有单学员详情接口，并且静默写入详情缓存'
);
assert.match(
  ensureDetail,
  /apiCall\('GET',`\/page-data\/student-detail\?id=\$\{encodeURIComponent\(id\)\}\$\{force\?'&fresh=1':''\}`,null,20000\)/,
  '抽屉和预热都必须回源 student-detail 拿完整详情'
);
assert.doesNotMatch(
  [renderStudents, prewarmRows, ensureDetail].join('\n'),
  /\/load-all/,
  '学员首屏、预热和抽屉详情都不能调用 /load-all'
);
assert.doesNotMatch(
  [prewarmRows, ensureDetail].join('\n'),
  /studentTeachingSummary/,
  '预热和抽屉详情不能把 studentTeachingSummary 当事实源'
);

console.log('student list first screen prewarm tests passed');
