(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FlowTennisBusinessTaxonomy = api;
  root.normalizePaymentMethod = api.normalizePaymentMethod;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const TRANSACTION_TYPES = ['收款', '消耗', '退款', '废弃'];
  const PAYMENT_METHODS = ['储值卡', '微信', '支付宝', '现金', '转账', '大众点评券码', '抖音券码', '其他'];
  const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map(value => ({ value, label: value }));
  const SOURCES = ['转介绍', '小红书', '大众点评', '视频号', '抖音', '播客', '孙老师', '直接线下到电', '群友', '小班课转化', '开业活动期间', '其他'];
  const PRODUCT_TYPES = ['私教课', '体验课', '小班课', '大师课', '陪打'];
  const STANDARD_COURSE_TYPE_OPTIONS = [
    { value: '私教课', label: '私教课' },
    { value: '体验课 / 私教体验课', label: '体验课 / 私教体验课' },
    { value: '体验课 / 小班体验课', label: '体验课 / 小班体验课' },
    { value: '小班课 / 单次', label: '小班课 / 单次' },
    { value: '小班课 / 训练营', label: '小班课 / 训练营' },
    { value: '小班课 / 随到随学', label: '小班课 / 随到随学' },
    { value: '大师课', label: '大师课' },
    { value: '陪打', label: '陪打' }
  ];
  const EXPERIENCE_TYPES = ['私教体验课', '小班体验课'];
  const SMALL_CLASS_TYPE_OPTIONS = [
    { value: 'single', label: '单次' },
    { value: 'bootcamp', label: '训练营' },
    { value: 'dropin', label: '随到随学' }
  ];
  const STUDENT_TYPE_OPTIONS = ['成人', '青少年'].map(value => ({ value, label: value }));
  const PACKAGE_STATUS_OPTIONS = [
    { value: 'active', label: '售卖中' },
    { value: 'inactive', label: '已停售' }
  ];
  const PACKAGE_TIME_BAND_OPTIONS = ['全天', '黄金时段', '非黄金时段'].map(value => ({ value, label: value }));
  const SCHEDULE_STATUSES = ['已排课', '已结束', '已取消'];
  const SCHEDULE_CANCEL_REASONS = ['学员请假', '教练请假', '天气 / 场地', '临时调整', '体验课未到', '其他'];
  const SCHEDULE_NOTIFY_STATUSES = ['未通知', '已通知学员', '已通知教练', '都已通知'];
  const SCHEDULE_CONFIRM_STATUSES = ['待确认', '已确认'];
  const SCHEDULE_SOURCES = ['排课表', '教练运营', '班次', '学员', '学习计划'];
  const CLASS_STATUSES = ['已排班', '已取消', '已结课'];
  const STUDENT_STATUS_LABELS = ['上课中', '待转化', '沉默30天', '仅订场', '无班次'];
  const LEAD_SOURCE_OPTIONS = ['大众点评', '抖音', '小红书', '直接线下到店', '朋友转介绍', '孙老师介绍', '小班课转化', '群友', '开业活动期间', '未知'].map(value => ({ value, label: value }));
  const LEAD_CONSULT_OPTIONS = ['成人私教课', '成人小班课', '青少年私教课', '青少年小班课', '订场', '约球', '陪打', '发球机', '穿线', '咨询储值卡（会员）', '合作等', '未说明需求'].map(value => ({ value, label: value }));
  const LEAD_INTENT_OPTIONS = ['沉默', '20%-40%', '40%-60%', '60%-80%', '80%-100%'].map(value => ({ value, label: value }));
  const LEAD_LEVEL_OPTIONS = ['0', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '自定义'].map(value => ({ value, label: value }));
  const LEAD_FOLLOWUP_STATUS_OPTIONS = ['体验课完成', '体验课预约', '无意向', '新线索', '已报名-私教', '已报名-随到随学', '已报名-训练营', '已报名-专项', '已订场', '已对接其他校区', '已沟通', '已流失', '转化跟进中'].map(value => ({ value, label: value }));
  const LEAD_FOLLOWUP_TYPE_OPTIONS = ['电话', '微信', '到店', '面谈', '其他'].map(value => ({ value, label: value }));
  const LEAD_STATUS_AFTER_OPTIONS = ['新线索', '跟进中', '已约体验', '已转课程', '已转订场', '已转课程+订场', '已流失'].map(value => ({ value, label: value }));
  const ENTITLEMENT_STATUS_OPTIONS = [
    { value: 'active', label: '正常' },
    { value: 'depleted', label: '已用完' },
    { value: 'voided', label: '已作废' }
  ];
  const MEMBERSHIP_PLAN_STATUS_OPTIONS = [
    { value: 'draft', label: '草稿' },
    { value: 'active', label: '上架' },
    { value: 'inactive', label: '停售' }
  ];
  const MATCH_STATUS_OPTIONS = [
    { value: '', label: '全部状态' },
    { value: 'open', label: '招募中' },
    { value: 'full', label: '已满员' },
    { value: 'booked', label: '已订场' },
    { value: 'attendance_pending', label: '待确认到场' },
    { value: 'fee_pending', label: '待确认费用' },
    { value: 'settled', label: '已结清' },
    { value: 'cancelled', label: '已取消' }
  ];
  const PRICE_TYPE_OPTIONS = [
    { value: 'venue_rate', label: '场地价格' },
    { value: 'channel_product', label: '渠道商品' }
  ];
  const PRICE_CHANNEL_OPTIONS = ['大众点评', '抖音', '小程序', '门店'].map(value => ({ value, label: value }));
  const PRICE_PRODUCT_TYPE_OPTIONS = ['订场券', '体验课', '小班课', '课包'].map(value => ({ value, label: value }));
  const PRICE_BUSINESS_TYPE_OPTIONS = [
    { value: 'court', label: '订场' },
    { value: 'lesson', label: '课程' },
    { value: 'package', label: '课包' }
  ];
  const PRICE_STATUS_OPTIONS = [
    { value: 'active', label: '启用' },
    { value: 'inactive', label: '停用' }
  ];
  const COURT_FINANCE_BUSINESS_TYPES = ['会员订场', '散客订场', '课程订场', '领导订场', '内部使用', '约球局'];
  const COURT_FINANCE_BUSINESS_OPTIONS = COURT_FINANCE_BUSINESS_TYPES.map(value => ({ value, label: value }));
  const FINANCE_TRANSACTION_TYPE_OPTIONS = TRANSACTION_TYPES.map(value => ({ value, label: value }));
  const COURSE_TYPE_OPTIONS = [
    { level1: '私教课', level2: '' },
    { level1: '小班课', level2: '单次' },
    { level1: '小班课', level2: '训练营' },
    { level1: '小班课', level2: '随到随学' },
    { level1: '体验课', level2: '私教体验课' },
    { level1: '体验课', level2: '小班体验课' },
    { level1: '大师课', level2: '' },
    { level1: '陪打', level2: '' }
  ];
  const BUSINESS_DICTIONARIES = {
    sources: SOURCES,
    productTypes: PRODUCT_TYPES,
    standardCourseTypes: STANDARD_COURSE_TYPE_OPTIONS,
    experienceTypes: EXPERIENCE_TYPES,
    smallClassTypes: SMALL_CLASS_TYPE_OPTIONS,
    studentTypes: STUDENT_TYPE_OPTIONS,
    packageStatuses: PACKAGE_STATUS_OPTIONS,
    packageTimeBands: PACKAGE_TIME_BAND_OPTIONS,
    payMethods: PAYMENT_METHODS,
    scheduleStatuses: SCHEDULE_STATUSES,
    scheduleCancelReasons: SCHEDULE_CANCEL_REASONS,
    scheduleNotifyStatuses: SCHEDULE_NOTIFY_STATUSES,
    scheduleConfirmStatuses: SCHEDULE_CONFIRM_STATUSES,
    scheduleSources: SCHEDULE_SOURCES,
    classStatuses: CLASS_STATUSES,
    studentStatusLabels: STUDENT_STATUS_LABELS,
    leadSources: LEAD_SOURCE_OPTIONS,
    leadConsultTypes: LEAD_CONSULT_OPTIONS,
    leadIntentLevels: LEAD_INTENT_OPTIONS,
    leadLevels: LEAD_LEVEL_OPTIONS,
    leadFollowupStatuses: LEAD_FOLLOWUP_STATUS_OPTIONS,
    leadFollowupTypes: LEAD_FOLLOWUP_TYPE_OPTIONS,
    leadStatusAfter: LEAD_STATUS_AFTER_OPTIONS,
    entitlementStatuses: ENTITLEMENT_STATUS_OPTIONS,
    membershipPlanStatuses: MEMBERSHIP_PLAN_STATUS_OPTIONS,
    matchStatuses: MATCH_STATUS_OPTIONS,
    priceTypes: PRICE_TYPE_OPTIONS,
    priceChannels: PRICE_CHANNEL_OPTIONS,
    priceProductTypes: PRICE_PRODUCT_TYPE_OPTIONS,
    priceBusinessTypes: PRICE_BUSINESS_TYPE_OPTIONS,
    priceStatuses: PRICE_STATUS_OPTIONS,
    financeTransactionTypes: FINANCE_TRANSACTION_TYPE_OPTIONS,
    courtFinanceBusinessTypes: COURT_FINANCE_BUSINESS_OPTIONS
  };

  function optionItem(value) {
    return typeof value === 'string' ? { value, label: value } : { ...value };
  }

  function optionList(name) {
    const list = BUSINESS_DICTIONARIES[name] || [];
    return Array.isArray(list) ? list.map(optionItem) : [];
  }

  function values(name) {
    return optionList(name).map(option => option.value);
  }

  function text(value) {
    return String(value || '').trim();
  }

  function includesAny(value, keywords) {
    const raw = text(value);
    return keywords.some(keyword => raw.includes(keyword));
  }

  function normalizePaymentMethod(value) {
    const raw = text(value);
    if (raw === '储值扣款' || raw === '储值卡') return '储值扣款';
    if (raw === '课包划扣') return '课包划扣';
    if (['大众点评', '大众点评券码', '大众点评支付'].includes(raw)) return '大众点评券码';
    if (['单独支付', '商家码支付', '微信', '微信转账', '微信转账支付', '会员充值'].includes(raw)) return '微信';
    if (raw === '现金') return '现金';
    if (raw === '转账') return '转账';
    if (raw === '抖音') return '抖音券码';
    if (raw === '支付宝转账支付') return '支付宝';
    if (raw === '小程序') return '小程序';
    return '其他';
  }

  function normalizeTransactionType(row) {
    const action = text(row && (row.transactionType || row.action || row.actionType || row.type));
    const status = text(row && row.status);
    const payment = normalizePaymentMethod(row && (row.paymentChannel || row.payMethod));
    const businessType = text(row && row.businessType);
    const note = `${text(row && row.notes)} ${text(row && row.reason)} ${text(row && row.systemStatus)}`;
    if (status === 'voided' || status === 'deleted' || includesAny(note, ['作废', '废弃', '原额失效'])) return '废弃';
    if (['退款', '冲回', '回退', '消耗回退', '冲正'].includes(action)) return '退款';
    if (['消耗', '已入账', '消费'].includes(action)) return '消耗';
    if (action === '记录' && (payment === '储值扣款' || payment === '课包划扣' || businessType === '会员订场')) return '消耗';
    if (action === '收款' || action === '充值') return '收款';
    return '收款';
  }

  function normalizeCourseType(row) {
    const courseType = text(row && (row.courseType || row.packageCourseType || row.type));
    const level2 = text(row && (row.courseTypeLevel2 || row.courseSubType || row.subCourseType));
    const experienceType = text(row && row.experienceType);
    const packageName = text(row && (row.packageName || row.productName || row.name || row.incomeType));
    const haystack = `${courseType} ${level2} ${experienceType} ${packageName}`;
    if (courseType === '训练营' || level2 === '训练营' || includesAny(haystack, ['训练营'])) return { level1: '小班课', level2: '训练营' };
    if (level2 === '随到随学' || includesAny(haystack, ['随到随学'])) return { level1: '小班课', level2: '随到随学' };
    if (level2 === '单次') return { level1: '小班课', level2: '单次' };
    if (includesAny(haystack, ['小班体验'])) return { level1: '体验课', level2: '小班体验课' };
    if (includesAny(haystack, ['私教体验', '体验课'])) return { level1: '体验课', level2: '私教体验课' };
    if (includesAny(haystack, ['大师课'])) return { level1: '大师课', level2: '' };
    if (includesAny(haystack, ['陪打'])) return { level1: '陪打', level2: '' };
    if (courseType === '小班课' || includesAny(haystack, ['小班', '班课'])) return { level1: '小班课', level2: '单次' };
    return { level1: '私教课', level2: '' };
  }

  function normalizeBusinessType(row) {
    const raw = text(row && row.businessType);
    const category = text(row && (row.category || row.sourceCategory || row.incomeType || row.sourceProject));
    const payment = normalizePaymentMethod(row && (row.paymentChannel || row.payMethod));
    const all = `${raw} ${category}`;
    if (raw === '会员储值' || raw === '储值' || includesAny(all, ['会员充值', '储值'])) {
      return { level1: '储值', level2: '', level3: '', display: '储值' };
    }
    if (['会员订场', '散客订场', '课程订场', '约球局'].includes(raw) || includesAny(all, ['订场', '场地', '约球', '内部占用', '内部使用', '领导', '课程订场'])) {
      let level2 = '散客订场';
      if (raw === '约球局' || includesAny(all, ['约球'])) level2 = '约球局';
      else if (raw === '会员订场' || payment === '储值扣款' || includesAny(all, ['会员订场'])) level2 = '会员订场';
      else if (raw === '课程订场' || includesAny(all, ['课程订场'])) level2 = '课程订场';
      else if (includesAny(all, ['领导'])) level2 = '领导订场';
      else if (includesAny(all, ['内部占用', '内部使用'])) level2 = '内部使用';
      return { level1: '场地', level2, level3: '', display: `场地 / ${level2}` };
    }
    const course = normalizeCourseType(row || {});
    const display = course.level2 ? `课程 / ${course.level1} / ${course.level2}` : `课程 / ${course.level1}`;
    return { level1: '课程', level2: course.level1, level3: course.level2, display };
  }

  function transactionAmount(row) {
    const type = normalizeTransactionType(row || {});
    const cash = Math.abs(Number(row && row.cashDelta) || 0);
    const recognized = Math.abs(Number(row && row.recognizedRevenueDelta) || 0);
    if (type === '收款') return cash;
    if (type === '消耗') return recognized || cash;
    if (type === '退款') return -(cash || recognized);
    return cash || recognized;
  }

  return {
    BUSINESS_DICTIONARIES,
    TRANSACTION_TYPES,
    PAYMENT_METHODS,
    PAYMENT_METHOD_OPTIONS,
    SOURCES,
    PRODUCT_TYPES,
    STANDARD_COURSE_TYPE_OPTIONS,
    EXPERIENCE_TYPES,
    SMALL_CLASS_TYPE_OPTIONS,
    STUDENT_TYPE_OPTIONS,
    PACKAGE_STATUS_OPTIONS,
    PACKAGE_TIME_BAND_OPTIONS,
    PAY_METHODS: PAYMENT_METHODS,
    SCHEDULE_STATUSES,
    SCHEDULE_CANCEL_REASONS,
    SCHEDULE_NOTIFY_STATUSES,
    SCHEDULE_CONFIRM_STATUSES,
    SCHEDULE_SOURCES,
    CLASS_STATUSES,
    STUDENT_STATUS_LABELS,
    LEAD_SOURCE_OPTIONS,
    LEAD_CONSULT_OPTIONS,
    LEAD_INTENT_OPTIONS,
    LEAD_LEVEL_OPTIONS,
    LEAD_FOLLOWUP_STATUS_OPTIONS,
    LEAD_FOLLOWUP_TYPE_OPTIONS,
    LEAD_STATUS_AFTER_OPTIONS,
    ENTITLEMENT_STATUS_OPTIONS,
    MEMBERSHIP_PLAN_STATUS_OPTIONS,
    MATCH_STATUS_OPTIONS,
    PRICE_TYPE_OPTIONS,
    PRICE_CHANNEL_OPTIONS,
    PRICE_PRODUCT_TYPE_OPTIONS,
    PRICE_BUSINESS_TYPE_OPTIONS,
    PRICE_STATUS_OPTIONS,
    COURT_FINANCE_BUSINESS_TYPES,
    COURT_FINANCE_BUSINESS_OPTIONS,
    FINANCE_TRANSACTION_TYPE_OPTIONS,
    COURSE_TYPE_OPTIONS,
    optionList,
    values,
    normalizePaymentMethod,
    normalizeTransactionType,
    normalizeCourseType,
    normalizeBusinessType,
    transactionAmount
  };
});
