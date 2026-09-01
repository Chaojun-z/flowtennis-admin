const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const leadsSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/leads.js'), 'utf8');

const elements = {
  leadSearch: { value: '' },
  leadSourceFilter: { value: '' },
  leadCustomerTypeFilter: { value: '' },
  leadConsultFilter: { value: '' },
  leadStageFilter: { value: '' },
  leadDealTypeFilter: { value: '' }
};

const context = {
  console,
  leads: [
    { id: 'lead-at-mira', displayName: 'A', owner: '@Mira', dealType: '课程', leadDate: '2026-07-01', createdAt: '2026-07-01' },
    { id: 'lead-coach', displayName: 'B', owner: '张教练', leadStage: '已成交', systemStatus: '已成交', conversionType: '订场会员', leadDate: '2026-07-02', createdAt: '2026-07-02' },
    { id: 'lead-text-only', displayName: 'C', owner: '吴敌', rawStatus: '已报名-私教', leadDate: '2026-07-03', createdAt: '2026-07-03' },
    { id: 'lead-deal-type-only', displayName: 'D', owner: '吴敌', leadStage: '跟进中', systemStatus: '跟进中', dealType: '课程', leadDate: '2026-07-04', createdAt: '2026-07-04' }
  ],
  leadFollowups: [],
  campus: 'all',
  campuses: [],
  currentUser: { name: 'Mira' },
  document: {
    getElementById: id => elements[id] || null,
    querySelectorAll: selector => selector === '.lead-owner-filter-cb:checked' ? context.checkedOwnerBoxes : []
  },
  checkedOwnerBoxes: [],
  lifecycleMap: {
    'lead-manual-date': { leadDateSource: 'manual', firstTouchAt: '2026-04-15', leadDate: '2026-08-29' },
    'lead-system-date': { leadDateSource: 'system', firstTouchAt: '2026-04-15', leadDate: '2026-08-29' }
  },
  FlowTennisBusinessTaxonomy: {
    normalizeLeadSource: value => String(value || '').trim(),
    normalizeLeadCustomerType: value => String(value || '').trim(),
    normalizeLeadDemandProduct: value => String(value || '').trim(),
    optionList: key => key === 'leadDealTypes'
      ? ['课程', '订场', '订场会员'].map(value => ({ value, label: value }))
      : [],
    values: key => key === 'leadStages'
      ? ['新线索', '跟进中', '已约体验', '已体验待成交', '已成交', '已流失']
      : []
  },
  activeCoachNames: () => ['Mira', '张教练'],
  customerLifecycleForRecord: record => context.lifecycleMap[record?.id] || null,
  leadStandardField: (lead, key) => {
    const lifecycle = context.customerLifecycleForRecord(lead);
    return String((lifecycle && lifecycle[key]) || lead?.[key] || '').trim();
  },
  leadDateOnly: value => String(value || '').slice(0, 10),
  today: () => '2026-07-10',
  globalDateWithinRange: () => true,
  searchHit: () => true,
  sameCampusValue: () => true,
  renderStandardCellText: (value, mutedWhenEmpty = true) => `<cell muted="${mutedWhenEmpty}">${value}</cell>`,
  esc: value => String(value ?? '')
};

vm.createContext(context);
vm.runInContext(leadsSource, context, { filename: 'public/assets/scripts/pages/leads.js' });

const ownerOptions = Array.from(vm.runInContext('leadOwnerOptions().map(option => option.value)', context));
assert.deepStrictEqual(
  ownerOptions,
  ['Mira', '吴敌', '陈丹丹', '岳克舟', '张教练'],
  'lead owner options should be fixed owners plus active coaches, de-duplicated in order'
);

context.checkedOwnerBoxes = [{ value: 'Mira' }];
const miraFiltered = Array.from(vm.runInContext('getFilteredLeads().map(lead => lead.id)', context));
assert.deepStrictEqual(miraFiltered, ['lead-at-mira'], 'Mira filter should match historical @Mira rows');

context.checkedOwnerBoxes = [];
elements.leadDealTypeFilter.value = '订场会员';
const dealFiltered = Array.from(vm.runInContext('getFilteredLeads().map(lead => lead.id)', context));
assert.deepStrictEqual(dealFiltered, ['lead-coach'], 'deal type filter should use the same dealType/conversionType reader as the drawer');

assert.strictEqual(
  vm.runInContext("leadDealTypeText(leads.find(lead => lead.id === 'lead-text-only'))", context),
  '',
  'deal type should not be inferred locally from status text without dealType/conversionType'
);
assert.strictEqual(
  vm.runInContext("leadStageDisplayText(leads.find(lead => lead.id === 'lead-coach'))", context),
  '已成交 · 订场会员',
  'lead stage display should show the stored deal type without a duplicate deal type column'
);
assert.strictEqual(
  vm.runInContext("leadStageDisplayText(leads.find(lead => lead.id === 'lead-deal-type-only'))", context),
  '跟进中',
  'deal type alone should not force the displayed lead stage to 已成交'
);
assert.strictEqual(
  vm.runInContext("leadDateDisplayText({ id: 'lead-manual-date', leadDate: '2026-08-29', createdAt: '2026-08-29' })", context),
  '2026-08-29',
  'manual lead time should keep the stored lead date instead of being replaced by later business facts'
);
assert.strictEqual(
  vm.runInContext("leadDateDisplayText({ id: 'lead-system-date', createdAt: '2026-08-29' })", context),
  '2026-04-15',
  'earliest business fact should be used before later created time'
);
assert.strictEqual(
  vm.runInContext("leadDateDisplayText({ id: 'lead-system-date', updatedAt: '2026-08-29' })", context),
  '2026-04-15',
  'system repair time should never be used as lead time'
);
assert.strictEqual(
  vm.runInContext("leadDateDisplayText({ id: 'lead-system-date', hasTeachingSummarySnapshot: true, trialAttendedAt: '2026-08-20', lastFormalLessonAt: '2026-08-30', leadDate: '2026-08-29', createdAt: '2026-08-29', updatedAt: '2026-08-29' })", context),
  '2026-04-15',
  'polluted lead date and created time should not override earlier business facts'
);

const priorityEmpty = vm.runInContext('renderLeadPriorityCell({ followupPriority: "" })', context);
assert.strictEqual(priorityEmpty, '<cell muted="true">-</cell>', 'empty priority should render as a plain dash cell');
