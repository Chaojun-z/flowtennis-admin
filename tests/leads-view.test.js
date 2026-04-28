const assert = require('assert');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/bootstrap.js'), 'utf8');
const leadsSourcePath = path.join(publicDir, 'assets/scripts/pages/leads.js');
const leadsSource = fs.existsSync(leadsSourcePath) ? fs.readFileSync(leadsSourcePath, 'utf8') : '';

assert.match(html, /goPage\('leads',this\)[\s\S]*线索池/, 'sidebar should expose a leads entry');
assert.match(html, /id="page-leads"[\s\S]*id="leadSearch"[\s\S]*placeholder="搜索姓名、手机号、微信名"/, 'leads page should provide the agreed search field');
assert.match(html, /id="leadSourceFilterHost"/, 'leads page should provide source filter host');
assert.match(html, /id="leadConsultFilterHost"/, 'leads page should provide consult filter host');
assert.match(html, /id="leadStatusFilterHost"/, 'leads page should provide status filter host');
assert.match(html, /id="leadOwnerFilterHost"/, 'leads page should provide owner filter host');
assert.doesNotMatch(html, /id="leadTodoFilterHost"/, 'leads page should remove the follow-up todo filter host');
assert.doesNotMatch(html, /id="leadDateFilterHost"/, 'leads page should remove the date filter host');
assert.match(html, /导入预览/, 'leads toolbar should expose the import preview entry');
assert.match(html, /新增线索/, 'leads toolbar should expose the create lead entry');
assert.doesNotMatch(html, /id="leadStatsRow"/, 'leads page should remove the top stat cards');
assert.match(html, /<table class="tms-table">[\s\S]*线索时间[\s\S]*微信名[\s\S]*电话[\s\S]*水平[\s\S]*线索渠道[\s\S]*咨询需求[\s\S]*意向类型[\s\S]*基本信息[\s\S]*跟进人[\s\S]*跟进次数[\s\S]*当前状态[\s\S]*最近跟进[\s\S]*转化结果[\s\S]*沟通情况[\s\S]*操作/, 'leads table should expose the agreed columns');
assert.match(html, /id="leadTbody"/, 'leads page should provide the list tbody mount');
assert.match(html, /id="leadPagerInfo"/, 'leads page should provide pager info');
assert.match(html, /id="leadPageSize"/, 'leads page should provide page size selector host');
assert.match(html, /id="leadPagerBtns"/, 'leads page should provide pager buttons');

assert.match(bootstrapSource, /'leads'/, 'bootstrap should register leads routing');
assert.match(bootstrapSource, /leads:'线索池'/, 'bootstrap should map the leads page title');

assert.match(leadsSource, /function renderLeads\(/, 'leads page should expose the list renderer');
assert.match(leadsSource, /function renderLeadTag\(/, 'leads page should render tag-style lead cells');
assert.match(leadsSource, /function leadFollowupCount\(/, 'leads page should expose the follow-up count helper');
assert.match(leadsSource, /function leadCommunicationText\(/, 'leads page should expose the communication summary helper');
assert.match(leadsSource, /function getFilteredLeads\(/, 'leads page should centralize lead filtering');
assert.match(leadsSource, /function setLeadPageSize\(/, 'leads page should expose page size switching');
assert.match(leadsSource, /function openLeadDetail\(/, 'leads page should expose the lead detail modal');
assert.match(leadsSource, /基础信息[\s\S]*当前跟进[\s\S]*跟进时间线[\s\S]*转化关系/, 'lead detail should expose the updated four required sections');
assert.match(leadsSource, /function openLeadFollowupModal\(/, 'leads page should expose the follow-up modal');
assert.match(leadsSource, /跟进时间[\s\S]*跟进人[\s\S]*跟进方式[\s\S]*沟通内容[\s\S]*用户顾虑[\s\S]*本次结论[\s\S]*当前状态[\s\S]*下次跟进时间[\s\S]*下次动作/, 'follow-up modal should expose the required fields');
assert.match(leadsSource, /type="datetime-local"/, 'follow-up modal should use a proper datetime-local input');
assert.match(leadsSource, /function openLeadImportPreviewModal\(/, 'leads page should expose the import preview modal');
assert.match(leadsSource, /识别到的字段[\s\S]*缺失字段提醒[\s\S]*总行数[\s\S]*状态归类统计[\s\S]*自动匹配统计[\s\S]*疑似匹配列表[\s\S]*未匹配列表/, 'import preview modal should expose the required sections');
assert.match(leadsSource, /查看[\s\S]*跟进[\s\S]*转化/, 'lead rows should only expose the three compact actions');

console.log('leads view tests passed');
