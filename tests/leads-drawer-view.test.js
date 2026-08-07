const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { appSource } = require('./helpers/read-index-bundle');
const source = `${appSource}\n${fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/leads.js'), 'utf8')}`;
const dateControlsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/date-controls.js'), 'utf8');
const leadsOnlySource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/leads.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/assets/styles/pages.css'), 'utf8');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

function htmlEsc(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function runLeadCreateDrawerWithoutCourts(){
  const context = {
    console,
    window: {},
    leads: [],
    leadFollowups: [],
    campuses: [],
    campus: 'all',
    currentUser: null,
    document: {
      getElementById: () => null,
      createElement: () => ({ textContent: '', innerHTML: '' })
    },
    today: () => '2026-08-07',
    esc: htmlEsc,
    activeCoachNames: () => [],
    campusDisplayName: value => String(value || ''),
    renderStandardDropdownHtml: (id) => `<input type="hidden" id="${id}">`,
    renderDetailDrawerHero: ({ title }) => `<div class="hero">${htmlEsc(title)}</div>`,
    renderDetailDrawerTabs: () => '<div class="tabs">基础信息</div>',
    renderDetailDrawerContent: html => `<div class="content">${html}</div>`,
    renderDetailDrawerFormCard: (title, content, actions) => `<section>${htmlEsc(title)}${content}${actions}</section>`,
    openStandardDetailDrawer: payload => { context.drawerPayload = payload; },
    FlowTennisBusinessTaxonomy: {
      optionList: () => [],
      values: () => [],
      normalizeLeadSource: value => String(value || ''),
      normalizeLeadCustomerType: value => String(value || ''),
      normalizeLeadDemandProduct: value => String(value || '')
    }
  };
  vm.createContext(context);
  vm.runInContext(dateControlsSource, context, { filename: 'date-controls.js' });
  vm.runInContext(leadsOnlySource, context, { filename: 'leads.js' });
  assert.strictEqual(typeof context.openLeadCreateDrawer, 'function', 'lead create drawer entry should be available without courts.js');
  context.openLeadCreateDrawer();
  assert.ok(context.drawerPayload, 'lead create drawer should call the standard drawer opener');
  assert.match(context.drawerPayload.titleHtml, /新增线索/, 'lead create drawer should render the create title');
  assert.match(context.drawerPayload.bodyHtml, /id="lead_wechatName"/, 'lead create drawer should render the name field');
  assert.match(context.drawerPayload.bodyHtml, /id="lead_leadDate_btn"/, 'lead create drawer should render the shared date button');
}

assert.match(dateControlsSource, /function courtDateButtonHtml\(/, 'shared date control should live in the core layer');
assert.doesNotMatch(courtsSource, /function courtDateButtonHtml\(/, 'courts page should not own the shared date control');
runLeadCreateDrawerWithoutCourts();

assert.match(source, /let leadDetailActiveTab='basic'/, 'lead drawer should keep active tab state');
assert.match(source, /function leadDetailTabsHtml\(/, 'lead detail should expose drawer tabs');
assert.match(fnBody('leadDetailTabsHtml'), /基础信息[\s\S]*跟进记录[\s\S]*成交信息/, 'lead drawer should have the agreed three tabs');
assert.match(fnBody('leadDetailTabsHtml'), /createMode[\s\S]*\[\['basic','基础信息'\]\]/, 'new lead drawer should only show the basic information tab');
assert.match(fnBody('openLeadDetail'), /openStandardDetailDrawer\(/, 'lead detail should use the standard right drawer');
assert.match(fnBody('openLeadDetail'), /leadDetailActiveTab==='basic'[\s\S]*leadDetailBasicTabHtml\(lead\)[\s\S]*leadDetailActiveTab==='followups'[\s\S]*leadDetailFollowupsTabHtml\(lead\)[\s\S]*leadDetailConversionTabHtml\(lead\)/, 'lead detail should route each tab to its own content');
assert.match(source, /function leadFollowupDrawerFormHtml\(/, 'lead follow-up editing should render inside the drawer');
assert.doesNotMatch(fnBody('leadFollowupDrawerFormHtml'), /datetime-local/, 'lead follow-up date should not use native datetime-local');
assert.match(fnBody('leadFollowupDrawerFormHtml'), /courtDateButtonHtml\('lead_followupAt'[\s\S]*leadFollowupDateInputValue/, 'lead follow-up date should use the shared date picker and keep edit value');
assert.match(fnBody('leadFollowupDrawerFormHtml'), /renderStandardDropdownHtml\('lead_followupBy','跟进人',\[\{value:'',label:'-'\},\.\.\.leadOwnerOptions\(\)\]/, 'lead follow-up owner should use the same dropdown interaction as basic owner');
assert.doesNotMatch(fnBody('leadFollowupDrawerFormHtml'), /id="lead_followupBy"[^>]*<input|<input[^>]*id="lead_followupBy"/, 'lead follow-up owner should not be a free text input');
assert.match(fnBody('openLeadFollowupModal'), /renderStandardDropdownHtml\('lead_followupBy','跟进人',\[\{value:'',label:'-'\},\.\.\.leadOwnerOptions\(\)\]/, 'lead follow-up modal owner should use the same dropdown interaction as basic owner');
assert.doesNotMatch(fnBody('openLeadFollowupModal'), /id="lead_followupBy"[^>]*<input|<input[^>]*id="lead_followupBy"/, 'lead follow-up modal owner should not be a free text input');
assert.match(source, /function startLeadFollowupDrawerEdit\(/, 'lead follow-up records should switch into drawer edit mode');
assert.match(fnBody('leadDetailFollowupsTabHtml'), /schedule-detail-action" onclick="startLeadFollowupDrawerEdit/, 'add follow-up should render as text action instead of a primary button');
assert.doesNotMatch(fnBody('leadDetailFollowupsTabHtml'), /schedule-detail-action primary" onclick="startLeadFollowupDrawerEdit/, 'add follow-up should not render as a brown button');
assert.match(fnBody('leadFollowupDrawerFormHtml'), /full-width[\s\S]*用户顾虑[\s\S]*full-width[\s\S]*本次结论/, 'concern and conclusion should each span the full drawer row');
assert.match(source, /function renderDetailDrawerTimeline\(/, 'lead follow-up timeline should use the shared drawer timeline component');
assert.match(fnBody('leadTimelineHtml'), /renderDetailDrawerTimeline\(rows\.map\(item=>leadFollowupTimelineItemHtml\(lead,item\)\),\{emptyText:'暂无跟进时间线',className:'lead-followup-timeline'\}\)/, 'lead follow-up timeline should call the shared timeline directly');
assert.doesNotMatch(source, /function leadConversionActionPanelHtml\(/, 'lead conversion tab should not keep a separate conversion action panel');
assert.doesNotMatch(fnBody('leadDetailConversionTabHtml'), /成交操作|关联操作|leadConversionActionPanelHtml/, 'conversion tab should remove the separate conversion action card');
assert.match(source, /function leadLinkedAccountFieldHtml\(/, 'lead conversion summary should render linked account rows with inline text actions');
assert.match(fnBody('leadInlineActionHtml'), /lead-inline-link-action/, 'linked account actions should use inline text link styling');
assert.match(fnBody('leadInlineActionHtml'), /id\?`id="\$\{esc\(id\)\}"`:''/, 'inline lead actions should support stable ids for mutation loading states');
assert.match(fnBody('leadLinkedAccountFieldHtml'), /leadUnlinkStudentBtn[\s\S]*leadUnlinkCourtBtn/, 'lead unlink actions should render stable button ids');
assert.match(fnBody('unlinkLeadStudent'), /runStandardMutation\('leadUnlinkStudentBtn'/, 'unlinking a linked student should use a stable mutation target');
assert.match(fnBody('unlinkLeadCourt'), /runStandardMutation\('leadUnlinkCourtBtn'/, 'unlinking a linked court account should use a stable mutation target');
assert.match(fnBody('unlinkLeadStudent'), /refreshLeadRuntime\(\{withStudents:true,waitForMetrics:false\}\)/, 'unlinking a student should refresh local lead/student rows without waiting for lifecycle metrics');
assert.match(fnBody('unlinkLeadCourt'), /refreshLeadRuntime\(\{withCourts:true,waitForMetrics:false\}\)/, 'unlinking a court account should refresh local lead/court rows without waiting for lifecycle metrics');
assert.doesNotMatch(source, /runStandardMutation\('',/, 'lead mutations should not pass an empty action target');
assert.match(fnBody('leadLinkedAccountFieldHtml'), /关联[\s\S]*修改[\s\S]*删除/, 'linked student and court actions should expose link, edit, and delete text actions');
assert.doesNotMatch(fnBody('leadLinkedAccountFieldHtml'), /<button[^>]*class="schedule-detail-action primary"/, 'linked account row should not use framed primary buttons');
assert.doesNotMatch(fnBody('leadLinkedAccountFieldHtml'), /未关联/, 'unlinked accounts should only show the inline link text');
assert.match(source, /function ensureLeadConversionLookups\(/, 'conversion tab should lazy-load linked student/court/coach names');
assert.doesNotMatch(fnBody('ensureLeadConversionLookups'), /purchasesPage/, 'conversion tab must not lazy-load the full purchases aggregate');
assert.match(fnBody('leadConversionSummaryHtml'), /leadLinkedAccountFieldHtml\(lead,'student'\)[\s\S]*leadPurchasePackageActionHtml\(lead\)[\s\S]*leadLinkedAccountFieldHtml\(lead,'court'\)[\s\S]*leadFormalCoachText\(lead\)/, 'conversion summary should render linked account helpers, package status, and coach names instead of raw ids');
assert.match(fnBody('leadConversionSummaryHtml'), /leadCourtConversionActionHtml\(lead\)[\s\S]*leadLinkedAccountFieldHtml\(lead,'court'\)[\s\S]*leadMembershipConversionActionHtml\(lead\)/, 'booking deals should expose create-court and membership next-step entries around the linked court row');
assert.match(source, /function leadCourtConversionActionHtml\(lead\)/, 'conversion summary should expose a create court account entry for converted booking leads');
assert.match(fnBody('leadCourtConversionActionHtml'), /订场[\s\S]*lead\?\.courtId[\s\S]*创建订场用户档案[\s\S]*convertLeadToCourt\('\$\{lead\.id\}'\)/, 'converted booking leads without a court record should show create-court-account action');
assert.match(fnBody('leadCourtConversionActionHtml'), /leadConvertCourtBtn/, 'create court account action should expose a stable mutation id');
assert.match(fnBody('convertLeadToCourt'), /runStandardMutation\('leadConvertCourtBtn'[\s\S]*loadingText:'转化中\.\.\.'/, 'create court account conversion should show loading and prevent duplicate clicks');
assert.match(source, /function leadMembershipConversionActionHtml\(lead\)/, 'conversion summary should expose a membership next-step entry for converted membership leads');
assert.match(fnBody('leadMembershipConversionActionHtml'), /订场会员[\s\S]*lead\?\.membershipAccountId[\s\S]*会员账户[\s\S]*openLeadMembershipNextStep\('\$\{lead\.id\}'\)/, 'converted membership leads without a membership account should show a next-step action without auto-writing finance');
assert.match(fnBody('leadLinkedAccountFieldHtml'), /linkedStudentName\(lead\)[\s\S]*linkedCourtName\(lead\)/, 'linked account helper should render names instead of raw ids');
assert.match(source, /function leadHasFormalPackage\(lead\)/, 'lead conversion summary should know whether linked student already has a formal package');
assert.match(source, /function leadFormalPackageRows\(lead\)/, 'lead conversion summary should collect formal package rows for the linked student');
assert.match(source, /function leadFormalPackageText\(lead\)/, 'lead conversion summary should render purchased package info after buying a package');
assert.match(source, /function leadPurchasePackageActionHtml\(lead\)/, 'lead conversion summary should expose a package purchase action for linked students without formal packages');
assert.match(fnBody('leadConversionSummaryHtml'), /leadPurchasePackageActionHtml\(lead\)/, 'conversion summary should render the package purchase action with the linked student status');
assert.match(fnBody('leadPurchasePackageActionHtml'), /已关联学员但未买课包[\s\S]*去购买课包[\s\S]*openLeadPurchasePackage\('\$\{lead\.id\}'\)/, 'linked students without formal packages should see a purchase package entry');
assert.match(fnBody('leadPurchasePackageActionHtml'), /已购课包[\s\S]*leadFormalPackageText\(lead\)/, 'linked students with formal packages should keep a package info row after purchase');
assert.match(fnBody('leadPurchasePackageActionHtml'), /!lead\?\.studentId[\s\S]*leadStageText\(lead\)==='已成交'[\s\S]*创建学员档案并购买课包[\s\S]*convertLeadToStudentAndPurchase\('\$\{lead\.id\}'\)/, 'converted course leads without a student record should show a create-student-and-purchase entry');
assert.match(fnBody('leadPurchasePackageActionHtml'), /已约体验[\s\S]*已体验待成交[\s\S]*创建体验学员档案并购买体验课包[\s\S]*convertLeadToStudentAndPurchase/, 'trial-stage leads without a student record should expose a create-trial-student-and-purchase entry');
assert.match(fnBody('leadPurchasePackageActionHtml'), /leadConvertStudentPurchaseBtn/, 'create student and purchase action should expose a stable mutation id');
assert.match(source, /async function convertLeadToStudentAndPurchase\(leadId\)/, 'conversion tab should create a student record and continue into the purchase drawer for new students');
assert.match(fnBody('convertLeadToStudentAndPurchase'), /runStandardMutation\('leadConvertStudentPurchaseBtn'[\s\S]*loadingText:'创建中\.\.\.'/, 'create-student-and-purchase should show loading and prevent duplicate clicks');
assert.match(fnBody('convertLeadToStudent'), /runStandardMutation\('leadConvertStudentBtn'[\s\S]*loadingText:'转化中\.\.\.'/, 'legacy direct lead-to-student conversion should also use the mutation helper');
assert.match(source, /function upsertLeadStudentLocal\(/, 'created students should be inserted into the local student list before opening the purchase drawer');
assert.match(fnBody('convertLeadToStudentAndPurchase'), /upsertLeadStudentLocal\(res\?\.student\)[\s\S]*openPurchaseModal\(studentId\)/, 'create-student-and-purchase should not wait for a later refresh before the purchase drawer can find the student');
assert.match(source, /function leadFormalCoachText\(lead\)/, 'lead conversion summary should derive deal coach from lifecycle or purchase owner coach');
assert.doesNotMatch(fnBody('openLeadPurchasePackage'), /purchasesPage/, 'lead purchase entry must not lazy-load the full purchases aggregate');
assert.match(fnBody('openLeadPurchasePackage'), /openPurchaseModal\(lead\.studentId\)/, 'lead purchase entry should open the existing purchase drawer with the linked student id');
assert.match(fnBody('previewLeadMerge'), /runStandardMutation\('leadMergePreviewBtn'[\s\S]*loadingText:'预览中\.\.\.'/, 'lead merge preview should show loading and prevent duplicate clicks');
assert.match(source, /function leadLinkSearchRows\(mode,keyword=''\)/, 'lead link forms should expose searchable linked account rows');
assert.match(source, /function leadLinkPickerHtml\(lead,mode,selectedId='',keyword=''\)/, 'lead link forms should render a searchable picker instead of a long plain dropdown');
assert.match(fnBody('leadConversionLinkFormHtml'), /lead_link_search[\s\S]*placeholder="搜索姓名 \/ 手机号 \/ 校区"[\s\S]*oninput="renderLeadLinkPicker\(/, 'link student and court forms should support keyword search');
assert.doesNotMatch(fnBody('leadConversionLinkFormHtml'), /renderStandardDropdownHtml\(id/, 'link student and court forms should not use the non-searchable standard dropdown');
assert.match(fnBody('openLeadLinkStudentModal'), /startLeadConversionDrawerMode\(leadId,'link-student'\)/, 'link student should stay in the lead drawer');
assert.match(fnBody('openLeadLinkCourtModal'), /startLeadConversionDrawerMode\(leadId,'link-court'\)/, 'link court should stay in the lead drawer');
assert.match(fnBody('saveLeadLinkStudent'), /refreshLeadRuntime\(\{withStudents:true,waitForMetrics:false\}\)/, 'saving a linked student should not wait for lifecycle metrics before releasing the button');
assert.match(fnBody('saveLeadLinkCourt'), /refreshLeadRuntime\(\{withCourts:true,waitForMetrics:false\}\)/, 'saving a linked court account should not wait for lifecycle metrics before releasing the button');
assert.match(source, /function openLeadDetailFromList\(/, 'lead list view action should reset to basic tab');
assert.match(source, /function openLeadFollowupFromList\(/, 'lead list follow-up action should open drawer edit form');
assert.match(fnBody('renderLeads'), /openLeadDetailFromList\('\$\{lead\.id\}'\)[\s\S]*openLeadFollowupFromList\('\$\{lead\.id\}'\)/, 'lead list should show view and follow-up actions');
assert.doesNotMatch(fnBody('renderLeads'), /openLeadConvertModal\('\$\{lead\.id\}'\)/, 'lead list should not show conversion action');
assert.match(fnBody('renderLeads'), /renderStandardCellText\(leadSourceText\(lead\),false\)[\s\S]*renderLeadTag\(leadCustomerTypeText\(lead\),'customerType'\)[\s\S]*renderLeadTag\(leadDemandProductText\(lead\),'demandProduct'\)[\s\S]*renderStandardCellText\(leadLevelText\(lead\)/, 'lead list should place plain source, customer type, and demand product before level');
assert.match(css, /\.modal\.modal-court\.modal-lead-drawer/, 'lead drawer should have scoped drawer styles');
assert.match(css, /\.modal\.modal-court\.modal-lead-drawer \.schedule-detail-title-row \.tms-tag\{[^}]*display:inline-flex[^}]*align-items:center[^}]*justify-content:center/, 'lead drawer top status tag should center its text');
assert.match(css, /\.modal\.modal-court\.modal-lead-drawer \.schedule-detail-block\{[^}]*background:transparent[^}]*border:0[^}]*padding:0/, 'lead basic detail block should be plain text without a framed background');
assert.doesNotMatch(css, /lead-followup-item::before\{display:none\}/, 'lead follow-up timeline should keep the shared vertical line');

console.log('leads drawer view tests passed');
