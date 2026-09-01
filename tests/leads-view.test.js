const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicDir = path.join(__dirname, '../public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const componentsSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/components.js'), 'utf8');
const standardSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/standard/components.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/bootstrap.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/state.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const leadsRoutesSource = fs.readFileSync(path.join(__dirname, '../server/leads-routes.js'), 'utf8');
const css = [
  'assets/styles/pages.css',
  'assets/styles/components/tables.css',
  'assets/styles/components/modals.css'
].map(file=>fs.readFileSync(path.join(publicDir, file), 'utf8')).join('\n');
const tableCss = fs.readFileSync(path.join(publicDir, 'assets/styles/components/tables.css'), 'utf8');
const leadsSourcePath = path.join(publicDir, 'assets/scripts/pages/leads.js');
const leadsSource = fs.existsSync(leadsSourcePath) ? fs.readFileSync(leadsSourcePath, 'utf8') : '';
const platformDataStandardsSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/platform-data-standards.js'), 'utf8');

function fnBody(name){
  const start = leadsSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = leadsSource.indexOf('\nfunction ', start + 1);
  return leadsSource.slice(start, nextFunction === -1 ? leadsSource.length : nextFunction);
}

assert.match(componentsSource, /goPage\('leads',this\)[\s\S]*线索池/, 'sidebar should expose a leads entry');
assert.match(html, /id="page-leads" data-standard-list-shell="leads"/, 'leads page should mount through the standard list shell');
assert.match(standardSource, /function renderStandardSearchHtml\(\{id='',placeholder='搜索姓名、手机号'[\s\S]*key:'leads'[\s\S]*search:\{id:'leadSearch'/, 'leads page should provide the agreed search field through the standard list shell');
assert.match(standardSource, /leadSourceFilterHost/, 'leads page should provide source filter host');
assert.match(standardSource, /leadCustomerTypeFilterHost/, 'leads page should provide customer type filter host');
assert.match(standardSource, /leadConsultFilterHost/, 'leads page should provide consult filter host');
assert.match(standardSource, /leadStageFilterHost/, 'leads page should provide a single lead stage filter host');
assert.match(standardSource, /leadDealTypeFilterHost/, 'leads page should provide a deal type filter host');
assert.doesNotMatch(standardSource, /leadStatusFilterHost|leadConversionTypeFilterHost/, 'leads page should not keep duplicate status and legacy conversion filters');
assert.doesNotMatch(standardSource, /leadConvertedFilterHost/, 'leads page should not keep the ambiguous converted yes/no filter');
assert.match(standardSource, /leadOwnerFilterHost/, 'leads page should provide owner filter host');
assert.doesNotMatch(html, /id="leadTodoFilterHost"/, 'leads page should remove the follow-up todo filter host');
assert.doesNotMatch(html, /id="leadDateFilterHost"/, 'leads page should remove the date filter host');
assert.match(standardSource, /class="tms-import-action" onclick="openLeadImportPreviewModal\(\)">导入<\/span>/, 'leads toolbar should expose the shared text import entry');
assert.doesNotMatch(standardSource, /onclick="openLeadMergeModal\(\)">合并线索/, 'leads toolbar should not expose low-frequency lead merge entry');
assert.match(html, /assets\/styles\/components\/modals\.css/, 'index should load shared modal styles');
assert.match(standardSource, /新增线索/, 'leads toolbar should expose the create lead entry');
assert.match(standardSource, /onclick="openLeadCreateDrawer\(\)">新增线索/, 'new lead entry should open the right drawer instead of the old modal');
assert.doesNotMatch(html, /id="leadDateScopeBar"[\s\S]*lead-date-scope-label">线索时间/, 'leads page should remove the top lead time scope row');
assert.doesNotMatch(html, /id="leadDateFrom_btn"[\s\S]*toggleGlobalDatePicker\(event,'leadDateFrom','leadDateFrom_btn','开始日期'\)[\s\S]*id="leadDateTo_btn"[\s\S]*toggleGlobalDatePicker\(event,'leadDateTo','leadDateTo_btn','结束日期'\)/, 'leads page should not render custom lead date controls');
assert.doesNotMatch(html, /<input class="lead-date-input" id="leadDateFrom" type="date"/, 'custom lead date controls should not expose native date inputs');
assert.match(standardSource, /statsId:'leadStatsRow'/, 'leads page should expose the top stats row');
assert.match(standardSource, /姓名[\s\S]*线索时间[\s\S]*来源[\s\S]*类型[\s\S]*需求产品[\s\S]*水平[\s\S]*基本信息[\s\S]*线索阶段[\s\S]*意向等级[\s\S]*跟进优先级[\s\S]*跟进人[\s\S]*体验课时间[\s\S]*成交教练[\s\S]*流失原因[\s\S]*操作/, 'leads table should keep deal type inside the lead stage column instead of a duplicate column');
assert.doesNotMatch(standardSource, /label:'转化类型'/, 'leads table should not expose a duplicate deal type column');
assert.doesNotMatch(standardSource, /label:'跟进状态'/, 'leads table should not keep duplicate status columns');
assert.doesNotMatch(standardSource, /label:'是否转化'/, 'leads table should not keep the ambiguous converted yes/no column');
assert.match(standardSource, /bodyId:'leadTbody'/, 'leads page should provide the list tbody mount');
assert.match(standardSource, /infoId:'leadPagerInfo'/, 'leads page should provide pager info');
assert.match(standardSource, /pageSizeId:'leadPageSize'/, 'leads page should provide page size selector host');
assert.match(standardSource, /buttonsId:'leadPagerBtns'/, 'leads page should provide pager buttons');
assert.match(standardSource, /leadSearch[\s\S]*oninput:'applyLeadSearch\(\)'/, 'leads search should update results immediately while typing');
assert.doesNotMatch(html, /leadSearch[\s\S]*onkeydown="if\(event\.key==='Enter'\)applyLeadSearch\(\)"/, 'leads search should not wait for enter');
assert.doesNotMatch(html, /onclick="applyLeadSearch\(\)">查询/, 'leads toolbar should remove the query button');
assert.doesNotMatch(html, /onclick="resetLeadFilters\(\)"[\s\S]*重置/, 'leads toolbar should remove the reset button');
assert.match(standardSource, /label:'姓名'[\s\S]*className:'tms-sticky-l'|className:'tms-sticky-l'[\s\S]*label:'姓名'/, 'leads table should pin the first identity column');
assert.match(standardSource, /data-lead-sort="leadDate"[\s\S]*线索时间/, 'leads table should sort by lead date');
assert.match(standardSource, /data-lead-sort="trialLessonAt"[\s\S]*体验课时间/, 'leads table should sort by trial lesson date');
assert.doesNotMatch(html, /最近跟进|跟进次数|正式课报名时间/, 'leads table should remove columns outside the requested order');

assert.match(bootstrapSource, /'leads'/, 'bootstrap should register leads routing');
assert.match(bootstrapSource, /leads:'线索池'/, 'bootstrap should map the leads page title');
assert.match(bootstrapSource, /globalTopFilterPages\(\)\.includes\(pg\)[\s\S]*\?'flex':'none'/, 'lead page should expose the top campus filter');

assert.match(leadsSource, /function renderLeads\(/, 'leads page should expose the list renderer');
assert.match(leadsSource, /function leadDedupKey\(/, 'leads page should deduplicate repeated lead rows');
assert.match(leadsSource, /function renderLeadTag\(/, 'leads page should render tag-style lead cells');
assert.match(leadsSource, /function leadTrialDateText\(/, 'leads page should format trial lesson date with relative days');
assert.match(leadsSource, /function leadRecentDateText\(/, 'leads page should format recent follow-up date with relative days');
assert.match(leadsSource, /function leadFormalSignupDateText\(/, 'leads page should format formal signup date');
assert.match(leadsSource, /function leadPurchaseSignupDate\(/, 'converted course leads should be able to use package purchase dates for formal signup date');
assert.match(leadsSource, /function leadFormalCoachText\(lead\)/, 'converted course leads should derive deal coach from lifecycle or package purchase owner coach');
assert.match(leadsSource, /function leadFollowupCount\(/, 'leads page should expose the follow-up count helper');
assert.match(leadsSource, /\['merged','voided','deleted'\]\.includes\(String\(row\?\.status\|\|''\)\.trim\(\)\)/, 'leads page should hide manually merged and voided leads');
assert.match(leadsSource, /function leadStatsData\(/, 'leads page should expose summary stats for the filtered lead rows');
assert.match(leadsSource, /线索数[\s\S]*历史学员[\s\S]*在期学员[\s\S]*上过体验课[\s\S]*体验后买正式课/, 'lead stats should expose schedule-fact student metrics from the unified backend model');
assert.match(leadsSource, /历史学员 \/ 线索数[\s\S]*在期学员 \/ 历史学员[\s\S]*上过体验课 \/ 线索数[\s\S]*体验后买正式课 \/ 上过体验课/, 'lead stats should explain the unified historical, active, and trial-attended formulas');
assert.match(leadsSource, /function renderLeadStatsLoading\([\s\S]*renderStandardSkeletonKpiCards\(5\)/, 'lead stats loading should use skeleton KPI cards');
assert.match(fnBody('renderLeadStats'), /statValues\.some\(key=>stats\[key\]==null\)[\s\S]*renderLeadStatsLoading\(\)/, 'lead stats should render skeletons when any top card is still missing');
assert.match(fnBody('reloadLeadsForCurrentPage'), /if\(showLoading\)\{[\s\S]*if\(refreshStats\)renderLeadStatsLoading\(\)[\s\S]*if\(refreshStats&&typeof renderLeadTableLoading==='function'\)renderLeadTableLoading\(\)[\s\S]*renderTableSkeletonLoading\('leadTbody',15,'线索数据加载中\.\.\.'\)/, 'lead reload should support keeping top stats stable during page-only reloads');
assert.doesNotMatch(leadsSource, /tms-stat-loading|<span class="tms-stat-loading">加载中<\/span>/, 'lead top stats should not render text loading');
assert.match(stateSource, /leads:\['campuses','leads'\]/, 'leads page should only wait for the paged lead list and campus filter before first paint');
assert.doesNotMatch(stateSource, /leads:\['campuses','leads','customerCenterPage'\]/, 'leads page should not block first paint on customer center data');
assert.doesNotMatch(stateSource, /leads:\['customerCenterPage'\]/, 'leads page should not background-load customer center data for the top cards');
assert.match(fnBody('leadStatsData'), /leadServerSummaryData\(\)[\s\S]*historicalStudents[\s\S]*activeStudents[\s\S]*trialAttended[\s\S]*trialAttendedToFormalPurchase/, 'lead student stats should come from the paged /api/leads summary');
assert.doesNotMatch(fnBody('leadStatsData'), /leadCustomerCenterSummaryData\(|leadTeachingSummaryValue\(/, 'lead student cards must not read customer center data or lifecycle placeholders');
assert.doesNotMatch(fnBody('leadStatsData'), /leadStandardMetricValue\('validLeads'\)/, 'lead count card must not use lifecycle validLeads when list/filter totals use lead rows');
assert.doesNotMatch(fnBody('leadStatsData'), /leadStandardMetricValue\('courseChainStudents'\)|leadStandardMetricValue\('formalStudents'\)/, 'lead stats must not use old normal/formal student metrics for the top student cards');
assert.doesNotMatch(fnBody('leadStatsData'), /leadStandardMetricValue\('trialPathStudents'\)|leadStandardMetricValue\('trialPathDeals'\)|leadStandardMetricValue\('trialPathPending'\)/, 'lead stats must not use old trial-path metrics for top cards');
assert.match(platformDataStandardsSource, /function currentLeadSummary\(rows = \[\], standard = \{\}\)[\s\S]*const base = rowsArray\(rows\)[\s\S]*views\.historicalStudents[\s\S]*views\.activeStudents[\s\S]*views\.trialAttendedStudents[\s\S]*views\.trialAttendedToFormalPurchase/, 'lead stats should read the backend standard lifecycle views for historical, active, trial attended, and trial-to-formal counts');
assert.match(leadsSource, /function leadDateRangeForPreset\(/, 'leads page should expose date preset range helper');
assert.match(leadsSource, /function setLeadDatePreset\(/, 'leads page should expose lead date preset switching');
assert.match(leadsSource, /function setLeadCustomDateRange\(/, 'leads page should expose custom lead date range switching');
assert.match(leadsSource, /if\(!leadInDateRange\(lead,getLeadDateFilterRange\(\)\)\)return false;/, 'lead filtering should apply the global lead date scope');
assert.match(leadsSource, /function renderLeads\([\s\S]*const list=getSortedLeads\(getFilteredLeads\(\)\)[\s\S]*renderLeadStats\(list\)/, 'lead stats should follow the current lead filters and campus scope');
assert.match(leadsSource, /function leadCommunicationText\(/, 'leads page should expose the communication summary helper');
assert.match(leadsSource, /function leadDealTypeText\(/, 'leads page should expose a deal type helper');
assert.match(leadsSource, /function leadStageText\(/, 'leads page should expose a single lead stage helper');
assert.match(leadsSource, /function leadStandardField\(/, 'leads page should read lifecycle-standard fields before legacy page fields');
assert.match(fnBody('leadDealTypeText'), /leadStandardDealTypeText\(lead\)/, 'lead deal type should prefer unified lifecycle dealType');
assert.doesNotMatch(fnBody('leadDealTypeText'), /rawStatus|systemStatus|hasCourseConversion|isCourseConverted|isCourtConverted|isMembershipConverted|convertedFlag/, 'lead deal type should not be inferred locally from status text or conversion flags');
assert.match(fnBody('leadStageText'), /leadStandardField\(lead,'leadStage'\)/, 'lead stage should prefer unified lifecycle leadStage');
assert.match(fnBody('leadTrialDoneByTime'), /trialAttendedAt/, 'lead stats should use actual attended time instead of treating booked trial time as completed');
assert.match(leadsSource, /leadStageText\(lead\)/, 'leads list and detail should render the lead stage');
assert.match(fnBody('getFilteredLeads'), /const dealTypeValue=document\.getElementById\('leadDealTypeFilter'\)\?\.value\|\|''[\s\S]*if\(dealTypeValue&&leadDealTypeText\(lead\)!==dealTypeValue\)return false;/, 'lead filtering should support the unified deal type');
assert.match(leadsSource, /stageValue&&leadStageText\(lead\)!==stageValue/, 'lead filtering should support lead stage');
assert.match(fnBody('leadConvertedYesNo'), /leadStageText\(lead\)==='已成交'/, 'converted yes/no should align with the unified displayed lead stage');
assert.doesNotMatch(fnBody('leadConvertedYesNo'), /leadDealTypeText\(lead\)/, 'deal type alone should not mark a lead as converted');
assert.match(leadsSource, /function getFilteredLeads\(/, 'leads page should centralize lead filtering');
assert.match(leadsSource, /function setLeadPageSize\(/, 'leads page should expose page size switching');
assert.match(fnBody('setLeadPage'), /reloadLeadsForCurrentPage\(\{refreshStats:false\}\)/, 'lead page navigation should not blank the top stats');
assert.match(fnBody('setLeadPageSize'), /reloadLeadsForCurrentPage\(\{refreshStats:false\}\)/, 'lead page size changes should not blank the top stats');
assert.match(leadsSource, /function applyLeadSearch\(\)[\s\S]*leadPage=standardListFirstPage\(\)[\s\S]*reloadLeadsForCurrentPage\(\)/, 'leads search should reset pagination and reload the current server page');
assert.match(leadsSource, /function cycleLeadSort\([\s\S]*leadSortDir='asc'[\s\S]*leadSortDir='desc'[\s\S]*leadSortKey='';leadSortDir='';/, 'leads sortable headers should cycle asc, desc, and no sort');
assert.match(leadsSource, /function updateLeadSortHeaders\(/, 'leads page should update sortable header state');
assert.match(leadsSource, /function getSortedLeads\(/, 'leads page should sort after filtering and before pagination');
assert.match(fnBody('leadRows'), /leadSortCreatedValue\(b\)-leadSortCreatedValue\(a\)/, 'lead default order should use createdAt descending');
assert.doesNotMatch(fnBody('leadRows'), /leadSortDateValue\(b\?\.leadDate,b\)-leadSortDateValue\(a\?\.leadDate,a\)/, 'lead default order should not use lead time as the primary order');
assert.match(leadsSource, /renderStandardPaginationButtonsHtml\(leadPage,pages,'setLeadPage'\)/, 'leads page should render compact pager numbers through the global standard pager');
assert.match(leadsSource, /function renderLeadPagerControls\(/, 'leads page should render standard pager controls');
assert.match(leadsSource, /function jumpLeadPage\(/, 'leads page should support jump-to-page');
assert.match(leadsSource, /leadPageSize=standardListPageSize\(value,leadPageSize\)/, 'leads page size should be limited by the global 15, 50, and 100 rule');
assert.match(leadsSource, /withLinkedFilterCounts\(\[[\s\S]*key:'source'[\s\S]*key:'customerType'[\s\S]*key:'consult'[\s\S]*key:'stage'/, 'leads toolbar filters should use linked count labels');
assert.match(fnBody('getFilteredLeads'), /const customerTypeValue=document\.getElementById\('leadCustomerTypeFilter'\)\?\.value\|\|''[\s\S]*if\(customerTypeValue&&leadCustomerTypeText\(lead\)!==customerTypeValue\)return false;/, 'lead filtering should support customer type');
assert.match(leadsSource, /function leadNormalizeOwnerName\(/, 'lead owner should have one normalization helper for @ aliases');
assert.match(fnBody('leadNormalizeOwnerName'), /replace\(\/\^@\+\/,''\)/, 'lead owner normalization should strip @ prefixes');
assert.match(leadsSource, /function leadOwnerFilterValues\([\s\S]*lead-owner-filter-cb:checked[\s\S]*leadNormalizeOwnerName/, 'lead owner filter should collect normalized checked owners');
assert.match(leadsSource, /function leadOwnerFilterHtml\([\s\S]*tms-dropdown[\s\S]*leadOwnerFilter_dropdown[\s\S]*type="checkbox"[\s\S]*lead-owner-filter-cb[\s\S]*toggleLeadOwnerFilter/, 'lead owner filter should render as a checkbox dropdown');
assert.match(fnBody('leadOwnerFilterHtml'), /const display=selected\.size\?`跟进人 \$\{selected\.size\}`:'跟进人'/, 'lead owner filter default display should be 跟进人');
assert.doesNotMatch(fnBody('leadOwnerFilterHtml'), /全部跟进人/, 'lead owner filter should not display 全部跟进人 by default');
assert.match(leadsSource, /const LEAD_FIXED_OWNER_NAMES=\['Mira','吴敌','陈丹丹','岳克舟'\]/, 'lead owner options should keep the fixed requested owner order');
assert.match(fnBody('leadOwnerOptionNames'), /LEAD_FIXED_OWNER_NAMES[\s\S]*activeCoachNames\(\)/, 'lead owner options should be fixed owners plus active coaches');
assert.doesNotMatch(fnBody('leadOwnerOptionNames'), /leadRows\(\)/, 'lead owner options should not derive selectable owners from row data');
assert.match(fnBody('renderLeadToolbarFilters'), /leadOwnerFilterHtml\(leadOptionsWithServerCounts\('owner',leadOwnerOptions\(\),leadOwnerOptions\(\)\),ownerValues\)/, 'lead owner filter should use backend full-result counts with the same owner options as the drawers');
assert.match(leadsSource, /function toggleLeadOwnerFilter\([\s\S]*leadPage=standardListFirstPage\(\)[\s\S]*reloadLeadsForCurrentPage\(\)/, 'checking lead owners should reload the server-paged list');
assert.match(fnBody('getFilteredLeads'), /const ownerValues=leadOwnerFilterValues\(\)[\s\S]*if\(ownerValues\.length&&!ownerValues\.includes\(leadOwnerText\(lead\)\)\)return false;/, 'lead filtering should support normalized multiple checked owners');
assert.match(leadsSource, /function leadPriorityOptions\(\)[\s\S]*\['P0','P1','P2','P3','P4'\]/, 'lead page should expose P0-P4 follow-up priority options');
assert.match(leadsSource, /function leadPriorityText\(lead\)[\s\S]*lead\?\.followupPriority/, 'lead page should read follow-up priority from the lead record');
assert.match(leadsSource, /function renderLeadPriorityCell\(/, 'lead list should centralize priority cell rendering');
assert.match(fnBody('renderLeadPriorityCell'), /priority==='-'\?renderStandardCellText\('-',true\):renderLeadTag\(priority,'priority'\)/, 'empty lead priority should render as a plain dash instead of a tag');
assert.match(fnBody('renderLeads'), /renderLeadTag\(leadStageDisplayText\(lead\),'stage'\)[\s\S]*renderStandardCellText\(lead\?\.intentLevel,false\)[\s\S]*renderLeadPriorityCell\(lead\)/, 'lead list should show deal type through lead stage before plain-text intent level');
assert.doesNotMatch(fnBody('renderLeads'), /renderLeadTag\(leadDealTypeText\(lead\)\|\|'-','dealType'\)/, 'lead list rows should not render a separate deal type tag');
assert.doesNotMatch(fnBody('renderLeadMobileCards'), /leadDealTypeText\(lead\)\|\|'-'/, 'lead mobile cards should not render a separate deal type tag');
assert.match(fnBody('renderLeadMobileCards'), /成交教练[\s\S]*leadFormalCoachText\(lead\)/, 'lead mobile cards should show the derived deal coach instead of only raw lead formalCoach');
assert.doesNotMatch(fnBody('renderLeads'), /renderLeadTag\(lead\?\.owner,'owner'\)/, 'lead list rows should render owner as plain text');
assert.match(fnBody('renderLeads'), /renderStandardCellText\(leadFormalCoachText\(lead\),leadFormalCoachText\(lead\)==='-'\)/, 'lead list should show the derived deal coach instead of only raw lead formalCoach');
assert.match(leadsSource, /function leadEmptyStateHtml\([\s\S]*没有匹配的线索[\s\S]*暂无线索[\s\S]*调整搜索或筛选后再试[\s\S]*点击右上角新增线索开始录入/, 'leads empty state should distinguish filtered results from no data');
assert.match(leadsSource, /function leadDetailFieldHtml\(/, 'lead detail should expose readonly field helper');
assert.match(leadsSource, /function leadDetailFieldHtml\([\s\S]*renderDetailDrawerField/, 'lead detail readonly fields should use the shared drawer field helper');
assert.match(leadsSource, /function leadDetailBlockHtml\(/, 'lead detail should expose readonly block helper');
assert.match(leadsSource, /function leadDetailBlockHtml\([\s\S]*renderDetailDrawerBlock/, 'lead detail long readonly blocks should use the shared drawer block helper');
assert.match(leadsSource, /function leadDetailTabsHtml\(/, 'lead detail should expose drawer tabs');
assert.match(leadsSource, /function leadDrawerCardHtml\(/, 'lead detail should expose a shared drawer card helper');
assert.match(leadsSource, /function openLeadDetail\(/, 'leads page should expose the lead detail drawer');
const leadDetailSource=(leadsSource.match(/function openLeadDetail\([\s\S]*?function openLeadModal/)||[''])[0];
assert.match(leadDetailSource, /openStandardDetailDrawer\(/, 'lead detail should use the standard right drawer');
assert.match(leadDetailSource, /leadDetailHeroHtml\(lead\)[\s\S]*leadDetailTabsHtml\(leadDetailActiveTab\)/, 'lead detail drawer should render hero and tabs');
assert.match(leadDetailSource, /leadDetailActiveTab==='basic'[\s\S]*leadDetailBasicTabHtml\(lead\)[\s\S]*leadDetailActiveTab==='followups'[\s\S]*leadDetailFollowupsTabHtml\(lead\)[\s\S]*leadDetailConversionTabHtml\(lead\)/, 'lead detail should route basic, follow-up and conversion tabs');
assert.match(leadDetailSource, /modal-lead-drawer/, 'lead detail should use the scoped lead drawer class');
assert.match(leadsSource, /function leadBasicInfoReadonlyHtml\(lead\)[\s\S]*leadDetailFieldHtml\('姓名',leadWechatText\(lead\)\)[\s\S]*leadDetailFieldHtml\('电话',lead\?\.phone\|\|'-'\)[\s\S]*leadDetailFieldHtml\('水平',leadLevelText\(lead\)\)[\s\S]*leadDetailFieldHtml\('线索时间',leadDateDisplayText\(lead\)\)[\s\S]*leadDetailFieldHtml\('来源',leadSourceText\(lead\)\|\|'-'\)[\s\S]*leadDetailFieldHtml\('所属校区',leadCampusText\(lead\)\)[\s\S]*leadDetailFieldHtml\('类型',leadCustomerTypeText\(lead\)\|\|'-'\)[\s\S]*leadDetailFieldHtml\('需求产品',leadDemandProductText\(lead\)\|\|'-'\)[\s\S]*leadDetailFieldHtml\('意向等级',lead\?\.intentLevel\|\|'-'\)[\s\S]*leadDetailFieldHtml\('跟进优先级',leadPriorityText\(lead\)\)[\s\S]*leadDetailFieldHtml\('跟进人',leadOwnerText\(lead\)\)[\s\S]*leadDetailBlockHtml\('基本信息',esc\(leadProfileText\(lead\)\),\{hideEmpty:true\}\)/, 'lead detail basic tab should keep the current basic fields and normalize labels');
assert.match(leadsSource, /function leadDateDisplayText\(lead\)/, 'lead detail should expose a standard lead date display helper');
assert.match(leadsSource, /function leadBusinessDateValue\(lead=\{\}\)/, 'lead date should have a business-time fallback helper');
assert.match(fnBody('leadDateDisplayText'), /return leadDateOnly\(leadBusinessDateValue\(lead\),lead\)\|\|'-';/, 'lead list and detail should show lead time as date only with business-time fallback');
assert.doesNotMatch(fnBody('leadDateDisplayText'), /\$\{date\} \$\{String\(time\[1\]\)/, 'lead list and detail should not append hour and minute to lead time');
assert.match(fnBody('leadBasicInfoReadonlyHtml'), /leadDetailFieldHtml\('线索时间',leadDateDisplayText\(lead\)\)/, 'lead detail basic tab should format lead time instead of showing raw ISO values');
assert.doesNotMatch(fnBody('leadBasicInfoReadonlyHtml'), /leadDetailFieldHtml\('线索时间',lead\?\.leadDate\|\|'-'\)/, 'lead detail basic tab should not render raw leadDate');
const leadDateHelpersSource = leadsSource.slice(
  leadsSource.indexOf('function leadFallbackYear('),
  leadsSource.indexOf('function leadDateRangeForPreset(')
);
const leadDateHelpersContext = {
  today: () => '2026-08-29',
  customerLifecycleForRecord: record => record?.id === 'lead-manual-date'
    ? { leadDateSource: 'manual', firstTouchAt: '2026-04-15', leadDate: '2026-08-29' }
    : record?.id === 'lead-system-date'
      ? { leadDateSource: 'system', firstTouchAt: '2026-04-15', leadDate: '2026-08-29' }
    : record?.id === 'lead-created-date'
      ? { leadDateSource: 'system', firstTouchAt: '2026-04-15', leadDate: '' }
    : null,
  leadStandardField: (lead, key) => {
    const lifecycle = leadDateHelpersContext.customerLifecycleForRecord(lead);
    return String((lifecycle && lifecycle[key]) || lead?.[key] || '').trim();
  }
};
vm.createContext(leadDateHelpersContext);
vm.runInContext(leadDateHelpersSource, leadDateHelpersContext, { filename: 'leads-date-helpers.js' });
assert.strictEqual(
  leadDateHelpersContext.leadDateDisplayText({ id: 'lead-manual-date', leadDate: '2026-08-29', createdAt: '2026-08-29' }),
  '2026-08-29',
  'lead list and detail should keep a manual lead time even when later business facts exist'
);
assert.strictEqual(
  leadDateHelpersContext.leadDateDisplayText({ id: 'lead-system-date', updatedAt: '2026-08-29' }),
  '2026-04-15',
  'lead list and detail should fall back to the earliest business fact instead of system repair time'
);
assert.strictEqual(
  leadDateHelpersContext.leadDateDisplayText({ id: 'lead-created-date', createdAt: '2026-04-10T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }),
  '2026-04-15',
  'lead list and detail should keep the earliest business fact before later created time'
);
assert.strictEqual(
  leadDateHelpersContext.leadDateDisplayText({ id: 'lead-system-date', leadDate: '2026-08-29', createdAt: '2026-08-29', updatedAt: '2026-08-29' }),
  '2026-04-15',
  'lead list and detail should reject polluted created time when earlier business facts exist'
);
assert.strictEqual(
  leadDateHelpersContext.leadDateDisplayText({ id: 'lead-summary-fact', hasTeachingSummarySnapshot: true, trialAttendedAt: '2026-08-20', lastFormalLessonAt: '2026-08-30', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }),
  '2026-08-20',
  'lead list and detail should prefer the earliest real business fact, not the summary refresh time'
);
assert.strictEqual(
  leadDateHelpersContext.leadDateInputValue({ leadDate: '2026-08-29', firstTouchAt: '2026-04-15' }),
  '2026-08-29',
  'lead edit form should keep the stored lead time value instead of forcing the display fallback'
);
assert.match(fnBody('leadDetailBasicTabHtml'), /openLeadMergeModal\('\$\{lead\.id\}'\)[\s\S]*合并重复线索/, 'lead merge entry should live in the current lead detail drawer');
assert.match(fnBody('leadDetailBasicTabHtml'), /openLeadDeleteConfirm\('\$\{lead\.id\}'\)[\s\S]*删除线索/, 'lead delete entry should live in the lead detail drawer');
assert.match(fnBody('openLeadDeleteConfirm'), /confirmDel\(lead\.id,leadDisplayName\(lead\),'lead'\)/, 'lead delete confirmation should resolve the lead name before opening the shared confirm dialog');
assert.match(leadsSource, /function leadDateInputValue\(lead\)/, 'lead forms should expose a standard lead date input helper');
assert.match(fnBody('leadBasicInfoFormHtml'), /courtDateButtonHtml\('lead_leadDate',leadDateInputValue\(lead\),'线索时间'\)/, 'lead drawer edit form should pass a normalized date value to the date picker');
assert.match(fnBody('openLeadCreateDrawer'), /leadBasicInfoFormHtml\(lead\)/, 'lead create drawer should reuse the same basic-info drawer form');
assert.match(fnBody('openLeadCreateDrawer'), /const lead=\{id:'',displayName:'',wechatName:'',leadDate:today\(\)\}/, 'new lead drawer should only prefill today as lead date');
assert.doesNotMatch(fnBody('openLeadCreateDrawer'), /leadDefaultCampusValue\(\)|currentUser\?\.name/, 'new lead drawer should not prefill campus or owner');
assert.match(leadsSource, /function leadTimelineLineText\(item\)[\s\S]*return `\$\{date\} · \$\{by\} 跟进 · （\$\{status\}）\\n\$\{note\}`/, 'lead timeline should render date, follower, conversion result, then note on the second line');
assert.match(componentsSource, /function renderDetailDrawerTimeline\(/, 'detail drawer timeline should be shared');
assert.match(leadsSource, /function leadTimelineHtml\(lead\)[\s\S]*renderDetailDrawerTimeline\(rows\.map\(item=>leadFollowupTimelineItemHtml\(lead,item\)\),\{emptyText:'暂无跟进时间线',className:'lead-followup-timeline'\}\)/, 'lead timeline should render through the shared drawer timeline component');
assert.match(leadsSource, /function leadFollowupTimelineItemHtml\(lead,item\)[\s\S]*className:'lead-followup-item'[\s\S]*startLeadFollowupDrawerEdit/, 'lead timeline should provide item content for the shared student lesson record style');
assert.match(leadsSource, /function openLeadFollowupModal\(/, 'leads page should expose the follow-up modal');
assert.match(leadsSource, /openLeadFollowupModal\(leadId,followupId=''\)/, 'follow-up modal should support editing existing records');
assert.match(leadsSource, /apiCall\('PUT',`\/lead-followups\/\$\{followupId\}`/, 'follow-up save should update an existing record when editing');
assert.match(leadsSource, /function saveLeadFollowupFromDrawer\(/, 'follow-up save should also work inside the lead drawer');
assert.match(leadsSource, /跟进时间[\s\S]*跟进人[\s\S]*跟进方式[\s\S]*沟通内容[\s\S]*用户顾虑[\s\S]*本次结论[\s\S]*当前状态[\s\S]*下次跟进时间[\s\S]*下次动作/, 'follow-up modal should expose the required fields');
assert.match(fnBody('leadFollowupDrawerFormHtml'), /成交类型[\s\S]*lead_dealType[\s\S]*leadDealTypeOptions\(\)/, 'follow-up drawer should show the existing dealType options for converted leads');
assert.match(fnBody('leadFollowupPayloadFromForm'), /const dealType=leadNormalizeDealType\(document\.getElementById\('lead_dealType'\)\?\.value\|\|''\)/, 'follow-up save should normalize the existing dealType field');
assert.match(fnBody('leadFollowupPayloadFromForm'), /statusAfter,[\s\S]*dealType,[\s\S]*conversionType:dealType/, 'follow-up save payload should send dealType and compatible conversionType');
assert.match(fnBody('leadFollowupPayloadFromForm'), /statusAfter==='已成交'&&!dealType[\s\S]*成交类型/, 'follow-up save should block converted status without a deal type');
assert.match(fnBody('leadNormalizeDealType'), /'陪打'[\s\S]*'订场\+陪打'/, 'lead deal type normalization should support companion and booking plus companion deals');
assert.match(fnBody('leadConversionSummaryHtml'), /leadCompanionScheduleActionHtml\(lead\)/, 'lead conversion summary should expose the companion schedule action');
assert.match(leadsSource, /function leadCompanionScheduleSeed\(lead\)[\s\S]*courseType:'陪打'[\s\S]*standardCourseType:'陪打'[\s\S]*scheduleSource:'线索陪打'[\s\S]*sourceLeadId:lead\?\.id/, 'lead companion schedule seed should mark schedules as lead companion demand');
assert.match(leadsSource, /function openLeadCompanionSchedule\(leadId\)[\s\S]*openScheduleModal\('',leadCompanionScheduleSeed\(lead\)\)/, 'lead companion action should open the normal schedule drawer with a companion seed');
assert.doesNotMatch(leadsSource, /type="datetime-local"/, 'follow-up date should not use native datetime-local');
assert.match(leadsSource, /courtDateButtonHtml\('lead_followupAt'[\s\S]*leadFollowupDateInputValue/, 'follow-up date should use the shared date picker');
assert.match(leadsSource, /function openLeadImportPreviewModal\(/, 'leads page should expose the import preview modal');
assert.match(leadsSource, /function openLeadMergeModal\(/, 'leads page should expose the lead merge modal');
assert.match(leadsSource, /apiCall\('POST','\/leads\/merge-preview'/, 'lead merge modal should call the preview API before writing');
assert.match(leadsSource, /apiCall\('POST','\/leads\/merge'/, 'lead merge confirm should call the merge API');
assert.doesNotMatch(leadsSource, /leadMergeFinalStage|finalLeadStage:document\.getElementById/, 'lead merge should not let users choose or send a final lead stage');
assert.match(fnBody('openLeadMergeModal'), /leadMergeCandidateSearch[\s\S]*搜索姓名 \/ 手机号/, 'lead merge modal should search duplicate leads instead of using a giant default dropdown');
assert.match(fnBody('openLeadMergeModal'), /id="leadMergeConfirmBtn" onclick="runLeadMerge\(\)">确认合并/, 'lead merge confirm should be clickable without requiring preview first');
assert.match(fnBody('leadMergePayload'), /primaryLeadId:leadMergeState\.primaryLeadId[\s\S]*mergeLeadIds:leadMergeState\.selectedDuplicateId\?\[leadMergeState\.selectedDuplicateId\]:\[\]/, 'lead merge payload should keep the drawer lead as primary and only submit the searched duplicate lead');
assert.doesNotMatch(fnBody('runLeadMerge'), /leadMergeState\.preview|请先预览合并影响/, 'lead merge confirm should not require preview state before merging');
assert.match(leadsSource, /function leadMergeFriendlyError\(/, 'lead merge should translate backend errors into user-friendly copy');
assert.match(css, /lead-merge-modal-body\{font-size:13px/, 'lead merge modal body should use 13px body text');
assert.match(css, /lead-merge-search\{font-size:12px/, 'lead merge modal search input should use 12px input text');
assert.match(css, /lead-merge-candidate-meta\{font-size:12px/, 'lead merge candidate details should use 12px text');
assert.match(fnBody('leadMergePreviewRowHtml'), /lead-merge-preview-row[\s\S]*esc\(label\)}：/, 'lead merge preview rows should render field labels and values with colons');
assert.match(fnBody('leadMergePreviewHtml'), /'保留线索'[\s\S]*'隐藏线索'[\s\S]*'跟进迁移'[\s\S]*'学员引用'/, 'lead merge preview should include the key business fields');
assert.doesNotMatch(fnBody('leadMergePreviewHtml'), /<b>|<strong>|font-weight/, 'lead merge preview body should not use bold text');
assert.match(leadsSource, /当前不能合并，请查看预览说明。/, 'blocked lead merge preview should show a short user-friendly toast');
assert.match(leadsSource, /这两条线索已经分别关联到不同学员/, 'blocked lead merge preview should explain the reason in user-facing language');
assert.match(fnBody('leadMergePreviewHtml'), /leadMergePreviewRowHtml\('原因',blocked\.reason\)[\s\S]*leadMergePreviewRowHtml\('下一步',blocked\.next\)/, 'blocked lead merge preview should render reason and next step in the preview area');
assert.match(leadsSource, /识别到的字段[\s\S]*缺失字段提醒[\s\S]*总行数[\s\S]*状态归类统计[\s\S]*自动匹配统计[\s\S]*疑似匹配列表[\s\S]*未匹配列表/, 'import preview modal should expose the required sections');
assert.match(fnBody('leadBasicInfoFormHtml'), /姓名[\s\S]*电话[\s\S]*水平[\s\S]*线索时间[\s\S]*来源[\s\S]*所属校区[\s\S]*类型[\s\S]*需求产品[\s\S]*意向等级[\s\S]*跟进优先级[\s\S]*跟进人[\s\S]*基本信息/, 'lead create and edit drawer form should follow the detail drawer field order');
assert.doesNotMatch(fnBody('openLeadCreateDrawer'), /lead-form-row-4|openStandardModal/, 'lead create drawer should not keep the old four-column modal body');
assert.match(leadsSource, /function openLeadCreateDrawer\(/, 'lead create should use the drawer entry');
assert.match(fnBody('openLeadCreateDrawer'), /openStandardDetailDrawer\(/, 'lead create should open the standard right drawer');
assert.match(fnBody('openLeadCreateDrawer'), /leadDetailHeroHtml\(\{\.\.\.lead,displayName:'新增线索'\},\{createMode:true\}\)[\s\S]*leadDetailTabsHtml\('basic',\{createMode:true\}\)/, 'lead create drawer should reuse drawer style but render the create-only empty header and single tab');
assert.match(fnBody('openLeadModal'), /openLeadCreateDrawer\(\)/, 'legacy create entry should forward to the drawer');
assert.doesNotMatch(leadsSource, /openStandardModal\(\{title:leadId\?'编辑线索':'新增线索'/, 'lead create should not keep the old centered modal shell');
assert.doesNotMatch(leadsSource, /setCourtModalFrame\(leadId\?'编辑线索':'新增线索'/, 'lead create and edit modal should not keep the old shell');
assert.match(leadsSource, /lead_campus','所属校区'/, 'lead create and edit modal should expose campus selection');
assert.doesNotMatch(fnBody('leadCampusOptions'), /\{value:'',label:'-'\}/, 'campus options should only return real campuses so the new lead drawer does not render two dash choices');
assert.doesNotMatch(fnBody('leadBasicInfoFormHtml'), /lead\?\.campus\|\|leadDefaultCampusValue\(\)|currentUser\?\.name/, 'empty create fields should not fall back to current campus or current user');
assert.doesNotMatch(leadsSource, /id="lead_systemStatus"/, 'lead create and edit modal should remove the current status field');
assert.doesNotMatch(leadsSource, /function leadConversionActionPanelHtml\(/, 'lead conversion tab should remove the separate conversion action panel');
assert.match(fnBody('leadLinkedAccountFieldHtml'), /关联[\s\S]*修改[\s\S]*删除/, 'lead conversion tab should keep linked account actions inline in the summary rows');
assert.match(leadsSource, /查看[\s\S]*跟进/, 'lead rows should expose view and follow-up actions');
assert.doesNotMatch(fnBody('renderLeads'), /转化/, 'lead rows should not expose conversion action');
assert.match(leadsSource, /function leadSourceOptions\(\)[\s\S]*FlowTennisBusinessTaxonomy\.optionList\('leadSources'\)/, 'lead source options should use the global business dictionary');
assert.match(leadsSource, /function leadCustomerTypeOptions\(\)[\s\S]*FlowTennisBusinessTaxonomy\.optionList\('leadCustomerTypes'\)/, 'lead customer type options should use the global business dictionary');
assert.match(leadsSource, /function leadDemandProductOptions\(\)[\s\S]*FlowTennisBusinessTaxonomy\.optionList\('leadDemandProducts'\)/, 'lead demand product options should use the global business dictionary');
assert.match(leadsSource, /function leadSourceText\(lead\)[\s\S]*FlowTennisBusinessTaxonomy\.normalizeLeadSource\(lead\?\.source\)/, 'lead source display should normalize legacy source values');
assert.match(leadsSource, /function leadCustomerTypeText\(lead\)[\s\S]*FlowTennisBusinessTaxonomy\.normalizeLeadCustomerType/, 'lead customer type display should normalize legacy values');
assert.match(leadsSource, /function leadDemandProductText\(lead\)[\s\S]*FlowTennisBusinessTaxonomy\.normalizeLeadDemandProduct/, 'lead demand product display should normalize legacy values');
assert.match(leadsSource, /function leadStageOptions\(\)[\s\S]*FlowTennisBusinessTaxonomy\.values\('leadStages'\)/, 'lead stage dropdown options should use the global lead stage order');
assert.match(fnBody('renderLeadToolbarFilters'), /key:'stage'[\s\S]*options:\[\{value:'',label:'全部',emptyDisplay:'线索阶段'\},\.\.\.leadStageOptions\(\)\]/, 'lead stage filter should keep the fixed global stage order instead of row order');
assert.match(leadsSource, /function leadIntentOptions\(\)[\s\S]*FlowTennisBusinessTaxonomy\.optionList\('leadIntentLevels'\)/, 'lead intent options should use the global business dictionary');
assert.match(leadsSource, /function leadLevelOptions\(\)[\s\S]*FlowTennisBusinessTaxonomy\.optionList\('leadLevels'\)/, 'lead level options should use the global business dictionary');
assert.match(leadsSource, /function leadLevelCanonicalValue\(value\)[\s\S]*\['1','2','3','4','5'\]\.includes\(text\)[\s\S]*`\$\{text\}\.0`/, 'lead standard integer levels should display and edit as x.0');
assert.match(leadsSource, /function leadLevelText\(lead\)[\s\S]*leadLevelCanonicalValue\(lead\?\.level\)/, 'lead level display should preserve standard decimal labels');
assert.match(leadsSource, /function leadLevelControlHtml\([\s\S]*lead_level_custom[\s\S]*toggleLeadLevelCustomInput/, 'custom lead level should provide an input instead of saving the literal custom label');
assert.match(fnBody('leadPayloadFromForm'), /const levelValue=document\.getElementById\('lead_level'\)\?\.value\|\|''[\s\S]*level:levelValue==='自定义'\?document\.getElementById\('lead_level_custom'\)\?\.value\?\.trim\?\.\(\)\|\|'':levelValue/, 'lead save payload should use custom level input value');
assert.match(fnBody('leadPayloadFromForm'), /followupPriority:document\.getElementById\('lead_followupPriority'\)\?\.value\|\|''/, 'lead save payload should include follow-up priority');
assert.match(apiSource, /const LEAD_LIST_PROJECTION_FIELDS=\[[\s\S]*'level'[\s\S]*\]/, 'lead list API projection should include level');
assert.match(apiSource, /const LEAD_LIST_PROJECTION_FIELDS=\[[\s\S]*'followupPriority'[\s\S]*\]/, 'lead list API projection should include follow-up priority');
assert.match(leadsRoutesSource, /function parseLeadPaging\(query\)/, 'lead list API should expose server-side paging');
assert.match(leadsRoutesSource, /cachedResult=\{sorted:sortLeadListRows\(filtered,query\),summary:buildLeadListSummary\(filtered,\{studentTeachingSummaryRows:scopedSummaryRows,filterState\}\),filters:buildLeadListFilterMeta\(visibleRows,filterState\)\};[\s\S]*const payload=paging\?\{\.\.\.buildLeadListPage\(cachedResult\.sorted,paging\),summary:cachedResult\.summary,filters:cachedResult\.filters\}:cachedResult\.sorted;[\s\S]*writeLeadPagedResponseCache\(responseCacheKey,payload\);[\s\S]*return sendJson\(res,payload\)/, 'lead list API should sort, summarize from unified teaching read model, count filters before caching and returning paged metadata');
assert.match(leadsRoutesSource, /function buildLeadListSummary\(rows=\[\],options=\{\}\)[\s\S]*historicalStudents[\s\S]*activeStudents[\s\S]*trialAttended[\s\S]*trialAttendedToFormalPurchase/, 'lead paged API should return all top stat fields from unified teaching read model without waiting for lifecycle metrics');
assert.match(stateSource, /function renderLeadTableLoading\([\s\S]*renderTableSkeletonLoading\('leadTbody',15,'线索数据加载中\.\.\.'\)/, 'leads loading state should use the shared full-table skeleton');
assert.match(stateSource, /function renderLeadTableError\([\s\S]*tms-table-error-state[\s\S]*加载失败[\s\S]*重新加载/, 'leads load failure should render an inline retry state');
assert.match(stateSource, /function renderLeadTableLoading\([\s\S]*renderTableSkeletonLoading\('leadTbody',15/, 'leads loading state should pass all visible columns to the skeleton helper');
assert.match(stateSource, /function renderLeadTableError\(message\)[\s\S]*colspan="15"/, 'leads error state should span all visible columns');
assert.match(stateSource, /if\(pg==='leads'\)renderLeadTableLoading\(\);/, 'leads page should use the dedicated loading renderer');
assert.match(stateSource, /if\(pg==='leads'\)renderLeadTableError\(String\(e\.message\|\|e\)\);/, 'leads page load failure should render the dedicated error state');
assert.doesNotMatch(stateSource, /leads:\['campuses','leads','purchasesPage'\]/, 'leads page should not block on the full purchases aggregate for standard course-chain stats');
assert.doesNotMatch(stateSource, /leads:\['customerCenterPage'\]/, 'leads page should not background-load customer center data for top student cards');
assert.doesNotMatch(stateSource, /leads:\['lifecycleMetricsPage'\]/, 'leads page should not background-load lifecycle metrics before the first paged list is usable');
assert.match(fnBody('leadTeachingSummaryValue'), /leadLifecycleMetricsReady\(\)/, 'lead teaching summary helper should still wait for lifecycle metrics when it is used elsewhere');
assert.match(fnBody('refreshLeadRuntime'), /const base=\['leads'\][\s\S]*if\(waitForMetrics\)base\.push\('lifecycleMetricsPage'\)/, 'lead mutations should allow local lead rows to refresh without waiting for lifecycle metrics');
assert.match(fnBody('refreshLeadRuntimeInBackground'), /refreshLeadRuntime\(\{\.\.\.options,waitForMetrics:true\}\)/, 'lead lifecycle metrics should still refresh through the background path after lead mutations');
assert.doesNotMatch(fnBody('refreshLeadRuntime'), /leadFollowups/, 'lead runtime refresh must not reload all followups');
assert.match(fnBody('refreshLeadRuntime'), /catch\(e\)\{\s*console\.warn\('lead runtime refresh skipped',e\);\s*\}/, 'lead save should not report save failure after the backend has already saved but the post-save refresh fails');
assert.doesNotMatch(fnBody('runLeadImportCommit'), /await refreshLeadRuntime\(/, 'lead import should not block success on a full refresh');
assert.match(fnBody('runLeadImportCommit'), /refreshLeadRuntimeInBackground\(\{withStudents:true,withCourts:true\},renderLeads\)/, 'lead import should refresh imported rows and lifecycle metrics in the background');
assert.match(fnBody('saveLead'), /const res=leadId\?await apiCall\('PUT','\/leads\/'\+leadId,payload\):await apiCall\('POST','\/leads',\{\.\.\.payload,createInitialFollowup:true\}\);[\s\S]*if\(res\?\.lead\)upsertLeadLocal\(res\.lead\);[\s\S]*return res;/, 'lead save should merge the saved row locally before the best-effort refresh');
assert.match(fnBody('leadBasicInfoFormHtml'), /lead_source[\s\S]*leadEmptyDropdownOption\(\)[\s\S]*lead_campus[\s\S]*leadEmptyDropdownOption\(\)[\s\S]*lead_customerType[\s\S]*leadEmptyDropdownOption\(\)[\s\S]*lead_demandProduct[\s\S]*leadEmptyDropdownOption\(\)[\s\S]*lead_intentLevel[\s\S]*leadEmptyDropdownOption\(\)[\s\S]*lead_followupPriority[\s\S]*leadEmptyDropdownOption\(\)[\s\S]*lead_owner[\s\S]*leadEmptyDropdownOption\(\)/, 'new lead drawer empty dropdown fields should render blank until the user chooses a value');
assert.match(fnBody('renderLeads'), /leadDateDisplayText\(lead\)[\s\S]*renderStandardCellText\(leadSourceText\(lead\),false\)[\s\S]*renderLeadTag\(leadCustomerTypeText\(lead\),'customerType'\)[\s\S]*renderLeadTag\(leadDemandProductText\(lead\),'demandProduct'\)[\s\S]*leadLevelText\(lead\)[\s\S]*leadProfileText\(lead\)[\s\S]*renderLeadTag\(leadStageDisplayText\(lead\),'stage'\)[\s\S]*renderStandardCellText\(lead\?\.intentLevel,false\)/, 'lead list rows should show formatted lead date, source as plain text, and keep type, demand, level, basic info, stage, and intent in table order');
assert.match(fnBody('renderLeads'), /<td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">\$\{esc\(leadWechatText\(lead\)\)\}<\/div><\/td>/, 'lead list first name column should use the same bold primary text as student lists');
assert.doesNotMatch(fnBody('renderLeads'), /renderLeadTag\(leadSourceText\(lead\),'source'\)/, 'lead list source should not render as a tag');
assert.match(css, /\.tms-table-wrapper\{overflow:auto;max-height:calc\(100vh - 170px\)/, 'standard table wrapper should globally show one more default row while keeping internal scrolling');
assert.match(tableCss, /\.tms-table-wrapper\{overflow:auto;max-height:calc\(100vh - 170px\)/, 'shared table component css should use the same global table height');
assert.doesNotMatch(css, /#page-leads \.tms-table-wrapper\{max-height:/, 'lead table should not own a page-only height override');
assert.match(css, /#page-leads \.tms-table th\{padding-top:8px;padding-bottom:8px;font-size:12px\}/, 'leads table header should match the standard table font size');
assert.match(css, /#page-leads \.tms-table td\{padding-top:6px;padding-bottom:6px;font-size:12px;line-height:1\.15;vertical-align:middle\}/, 'leads table rows should match the standard row height and font size');
assert.match(standardSource, /style:'width:220px'[\s\S]*data-lead-sort="trialLessonAt"/, 'lead trial lesson column should be wide enough for the full date/time text');
assert.match(standardSource, /label:'基本信息'[\s\S]*style:'width:280px'/, 'lead basic info column should use the requested width');
assert.match(standardSource, /label:'需求产品'[\s\S]*style:'width:110px'/, 'lead demand product column should use the requested width');
assert.match(css, /#page-leads \.tms-text-primary,#page-leads \.tms-cell-text,#page-leads \.tms-text-remark\{font-size:12px\}/, 'leads nested table text should match the student page font size');
assert.match(css, /#page-leads \.tms-tag-lead-communicated\{background:#E3F0ED;color:#2E766E\}/, 'leads tags should use grounded colors instead of purple');
assert.match(css, /\.tms-tag-priority-p0\{background:#FDE8E4;color:#9F2A17;font-weight:700\}/, 'priority P0 should use the strongest red style');
assert.match(css, /\.tms-tag-priority-p4\{background:#E9ECEF;color:#57606A\}/, 'priority P4 should use gray');
assert.match(standardSource, /function installStandardTooltip\([\s\S]*document\.addEventListener\('mouseover'[\s\S]*closest\?\.\('\[data-tooltip\]'\)[\s\S]*showStandardTooltip\(target\)/, 'standard long-text hover should use a global tooltip listener');
assert.match(css, /\.tms-global-tooltip\{position:fixed;z-index:9999/, 'standard long-text hover should render through a fixed global tooltip');
assert.doesNotMatch(css, /\.tms-tooltip-text:hover::after/, 'standard table tooltip should not depend on clipped pseudo-element hover');
assert.match(standardSource, /if\(\/私教\/\.test\(text\)\)return 'tms-tag-course-private'[\s\S]*if\(\/小班\/\.test\(text\)\)return 'tms-tag-course-small'[\s\S]*if\(\/陪打\/\.test\(text\)\)return 'tms-tag-course-partner'/, 'demand product tags should reuse schedule course type classes for private, small group, and partner');
assert.match(css, /\.tms-tag-course-private\{background:#EFF4FF;color:#305CC8\}[\s\S]*\.tms-tag-course-small\{background:#F0FDF4;color:#047857\}[\s\S]*\.tms-tag-course-partner\{background:#F5F3FF;color:#6D28D9\}/, 'demand product course classes should reuse schedule course type colors');
assert.match(css, /\.modal\.modal-court\.modal-leads-form \.mbody\{overflow:visible\}/, 'lead form modal should keep dropdowns from being clipped');
assert.match(css, /\.modal\.modal-court \.lead-form-row-4\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:14px\}/, 'lead form should use four equal columns');
assert.match(css, /\.tms-pagination,\.tms-pagination \*\{font-weight:400/, 'all standard table footers should use normal font weight');
assert.doesNotMatch(css, /#page-leads \.tms-pagination,#page-leads \.tms-pagination \*\{font-weight:400/, 'pagination font weight should not be a lead-only rule');
assert.match(css, /\.modal\.modal-court \.tms-readonly-card\{[^}]*background:#FFFFFF[^}]*border-radius:12px[^}]*border:1px solid #E6E1DC[^}]*box-shadow:0 1px 2px rgba\(0,0,0,\.05\)[^}]*padding:24px[^}]*margin-bottom:32px/, 'readonly detail sections should sit on the shared white card');
assert.match(css, /\.modal\.modal-court \.tms-readonly-card \.tms-detail-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*row-gap:24px[^}]*column-gap:32px/, 'readonly detail cards should use the wider data grid');
assert.match(css, /\.modal\.modal-court \.tms-readonly-card\.lead-readonly-card\{grid-column:1\/-1\}/, 'lead detail readonly card should span the full modal width');
assert.match(css, /\.modal\.modal-court \.tms-readonly-card\.lead-readonly-card-4 \.tms-detail-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/, 'lead detail basic readonly card should use four columns');
assert.doesNotMatch(css, /lead-timeline-list/, 'lead timeline should not keep the old custom axis styles');
assert.doesNotMatch(css, /lead-timeline-item/, 'lead timeline should not keep the old custom row styles');
assert.match(css, /\.student-lesson-timeline-item::before\{[\s\S]*left:6px[\s\S]*background:#ECE7E1/, 'lead timeline should inherit the shared student lesson vertical line');
assert.match(css, /#page-leads \.tms-empty-state[\s\S]*#page-leads \.tms-state-action/, 'leads empty, loading, and error states should have scoped standard styles');
assert.match(css, /\.tms-sort-header\{[^}]*display:inline-flex[^}]*cursor:pointer/, 'leads sortable headers should use the shared sort style');
assert.match(css, /#page-leads \.tms-stats-row\{[^}]*display:grid[^}]*grid-template-columns:repeat\(auto-fit,minmax\(200px,1fr\)\)[^}]*overflow:visible/, 'lead stats should use the shared adaptive top data card grid');
assert.match(leadsSource, /renderStandardDataCards\(cardData\)/, 'lead stats should render through the shared data card helper');

console.log('leads view tests passed');
