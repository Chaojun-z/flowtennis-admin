const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./helpers/read-index-bundle');
const source = `${appSource}\n${fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/leads.js'), 'utf8')}`;
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

assert.match(source, /let leadDetailActiveTab='basic'/, 'lead drawer should keep active tab state');
assert.match(source, /function leadDetailTabsHtml\(/, 'lead detail should expose drawer tabs');
assert.match(fnBody('leadDetailTabsHtml'), /基础信息[\s\S]*跟进记录[\s\S]*成交信息/, 'lead drawer should have the agreed three tabs');
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
assert.match(source, /function leadConversionActionPanelHtml\(/, 'lead conversion actions should render inside the drawer');
assert.doesNotMatch(fnBody('leadConversionActionPanelHtml'), /转为学员|转为订场用户/, 'conversion tab should hide create-conversion buttons');
assert.match(fnBody('leadConversionActionPanelHtml'), /schedule-detail-action primary[\s\S]*关联已有学员[\s\S]*schedule-detail-action primary[\s\S]*关联已有订场用户/, 'conversion tab should keep existing-record link actions');
assert.match(source, /function ensureLeadConversionLookups\(/, 'conversion tab should lazy-load linked student/court/coach names');
assert.match(fnBody('leadConversionSummaryHtml'), /linkedStudentName\(lead\)[\s\S]*linkedCourtName\(lead\)[\s\S]*linkedCoachName\(lead\?\.formalCoach\)/, 'conversion summary should render names instead of raw ids');
assert.match(fnBody('openLeadLinkStudentModal'), /startLeadConversionDrawerMode\(leadId,'link-student'\)/, 'link student should stay in the lead drawer');
assert.match(fnBody('openLeadLinkCourtModal'), /startLeadConversionDrawerMode\(leadId,'link-court'\)/, 'link court should stay in the lead drawer');
assert.match(source, /function openLeadDetailFromList\(/, 'lead list view action should reset to basic tab');
assert.match(source, /function openLeadFollowupFromList\(/, 'lead list follow-up action should open drawer edit form');
assert.match(fnBody('renderLeads'), /openLeadDetailFromList\('\$\{lead\.id\}'\)[\s\S]*openLeadFollowupFromList\('\$\{lead\.id\}'\)/, 'lead list should show view and follow-up actions');
assert.doesNotMatch(fnBody('renderLeads'), /openLeadConvertModal\('\$\{lead\.id\}'\)/, 'lead list should not show conversion action');
assert.match(fnBody('renderLeads'), /renderStandardCellText\(leadSourceText\(lead\),false\)[\s\S]*renderLeadTag\(leadCustomerTypeText\(lead\),'customerType'\)[\s\S]*renderLeadTag\(leadDemandProductText\(lead\),'demandProduct'\)[\s\S]*renderStandardCellText\(leadLevelText\(lead\)/, 'lead list should place plain source, customer type, and demand product before level');
assert.match(css, /\.modal\.modal-court\.modal-lead-drawer/, 'lead drawer should have scoped drawer styles');
assert.doesNotMatch(css, /lead-followup-item::before\{display:none\}/, 'lead follow-up timeline should keep the shared vertical line');

console.log('leads drawer view tests passed');
