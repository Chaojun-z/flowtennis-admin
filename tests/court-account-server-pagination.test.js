const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');
const residualSource = fs.readFileSync(path.join(__dirname, '../server/page-data/residual-pages.js'), 'utf8');
const readModelSource = fs.readFileSync(path.join(__dirname, '../server/page-data/court-account-read-model.js'), 'utf8');

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

const listUrlBody = fnBody(stateSource, 'courtAccountListViewPageDataUrl');
const listQueryBody = fnBody(stateSource, 'courtAccountListViewQueryParams');
const detailUrlBody = fnBody(stateSource, 'courtAccountDetailPageDataUrl');
const datasetKeyBody = fnBody(stateSource, 'datasetRequestKey');
const renderCourtBody = fnBody(courtsSource, 'renderCourtAccountListView');
const renderCourtsBody = fnBody(courtsSource, 'renderCourts');
const renderMembershipBody = fnBody(courtsSource, 'renderMemberships');
const loadGuardBody = fnBody(stateSource, 'loadCourtReadModelGuardData');

assert.match(listUrlBody, /appendPageDataQuery\(scopedPageDataUrl\('\/page-data\/court-account-list-view',\{dateRange:'court'\}\),courtAccountListViewQueryParams\(\)\)/, '首屏列表请求应带后端分页和筛选参数');
assert.match(listQueryBody, /page:courtPage[\s\S]*pageSize:courtPageSize[\s\S]*q:document\.getElementById\('courtSearch'\)\?\.value\|\|''[\s\S]*owner:courtOwnerFilterValue[\s\S]*accountType:courtAccountTypeFilterValue[\s\S]*sortKey:courtSortKey[\s\S]*sortDir:courtSortDir/, '订场用户页应把 page/pageSize/搜索/筛选/排序传给后端');
assert.match(listQueryBody, /currentPage==='memberships'[\s\S]*page:membershipPage[\s\S]*pageSize:membershipPageSize[\s\S]*q:document\.getElementById\('membershipSearch'\)\?\.value\|\|''[\s\S]*accountType:'会员账户'[\s\S]*membershipTier:membershipTierFilterValue[\s\S]*sortKey:membershipSortKey[\s\S]*sortDir:membershipSortDir/, '会员管理页应把 page/pageSize/搜索/会员类型/排序传给后端');
assert.match(datasetKeyBody, /courtAccountListViewPageDataUrl\(\)/, '分页和筛选参数应进入缓存 key');
assert.match(datasetKeyBody, /courtAccountListViewPageDataUrl\(\)/, '排序参数应随列表 URL 一起进入缓存 key');

assert.match(detailUrlBody, /ids:courtId/, '详情应继续通过 ids 按需加载完整订场用户数据');
assert.doesNotMatch(detailUrlBody, /page:|pageSize:|courtAccountListViewQueryParams/, '详情请求不应被列表分页参数裁剪');
assert.doesNotMatch(detailUrlBody, /scopedPageDataUrl|dateRange:'court'/, '详情请求不应被当前列表校区或日期范围裁剪');

assert.match(renderCourtBody, /const slice=sortedList;/, '订场用户列表不应再首屏全量后本地 slice 分页');
assert.doesNotMatch(renderCourtBody, /sortedList\.slice\(\(courtPage-1\)\*courtPageSize/, '订场用户列表不应继续本地分页');
assert.match(renderMembershipBody, /const slice=sortedRows;/, '会员管理列表不应再首屏全量后本地 slice 分页');
assert.doesNotMatch(renderMembershipBody, /sortedRows\.slice\(\(membershipPage-1\)\*membershipPageSize/, '会员管理列表不应继续本地分页');
assert.doesNotMatch(renderCourtsBody, /loadCourtReadModelGuardData\(\{force:true\}\)/, '订场用户渲染兜底不应绕过后端热缓存重复强刷');
assert.doesNotMatch(renderMembershipBody, /loadCourtReadModelGuardData\(\{force:true\}\)/, '会员管理渲染兜底不应绕过后端热缓存重复强刷');
assert.match(loadGuardBody, /courtAccountListViewLoadPromises\.has\(loadKey\)/, '订场用户和会员管理列表请求应按完整缓存 key 去重');

assert.match(residualSource, /page:query\?\.get\('page'\)\|\|''[\s\S]*pageSize:query\?\.get\('pageSize'\)\|\|''[\s\S]*q:query\?\.get\('q'\)\|\|''[\s\S]*owner:query\?\.get\('owner'\)\|\|''[\s\S]*accountType:query\?\.get\('accountType'\)\|\|''[\s\S]*membershipTier:query\?\.get\('membershipTier'\)\|\|''[\s\S]*sortKey:query\?\.get\('sortKey'\)\|\|''[\s\S]*sortDir:query\?\.get\('sortDir'\)\|\|''/, '后端路由应接收分页、搜索、筛选和排序参数');
assert.match(readModelSource, /function applyCourtAccountScope/, '读模型应在后端处理校区和日期范围');
assert.match(readModelSource, /membershipTier[\s\S]*membershipTierLabel/, '读模型应支持会员类型筛选');
assert.match(readModelSource, /scanRows\(tables\.courts, '订场用户表', \{ pageLimit: 100 \}\)/, '订场用户首屏读取 ft_courts 应降低单页 history 拉取量，避免超时后假空数据');

const guardedSources = [listUrlBody, detailUrlBody, renderCourtBody, renderMembershipBody].join('\n');
assert.doesNotMatch(guardedSources, /\/load-all/, '订场用户和会员管理首屏链路不应调用 /load-all');

console.log('court account server pagination tests passed');
