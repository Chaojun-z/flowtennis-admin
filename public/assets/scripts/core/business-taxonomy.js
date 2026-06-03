(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FlowTennisBusinessTaxonomy = api;
  root.normalizePaymentMethod = api.normalizePaymentMethod;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const TRANSACTION_TYPES = ['收款', '消耗', '退款', '废弃'];
  const PAYMENT_METHODS = ['小程序', '微信', '支付宝', '储值扣款', '课包划扣', '大众点评券码', '抖音券码', '其他'];
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

  function text(value) {
    return String(value || '').trim();
  }

  function includesAny(value, keywords) {
    const raw = text(value);
    return keywords.some(keyword => raw.includes(keyword));
  }

  function normalizePaymentMethod(value) {
    const raw = text(value);
    if (raw === '储值扣款') return '储值扣款';
    if (raw === '课包划扣') return '课包划扣';
    if (['大众点评', '大众点评券码', '大众点评支付'].includes(raw)) return '大众点评券码';
    if (['单独支付', '商家码支付', '微信', '微信转账', '微信转账支付', '转账', '会员充值'].includes(raw)) return '微信';
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
    TRANSACTION_TYPES,
    PAYMENT_METHODS,
    COURSE_TYPE_OPTIONS,
    normalizePaymentMethod,
    normalizeTransactionType,
    normalizeCourseType,
    normalizeBusinessType,
    transactionAmount
  };
});
