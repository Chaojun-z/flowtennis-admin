(function (root) {
  function trimText(value) {
    return String(value == null ? '' : value).trim();
  }

  function buildStudentQuickCreatePayload(input = {}) {
    return {
      name: trimText(input.name),
      phone: trimText(input.phone),
      campus: trimText(input.campus),
      source: trimText(input.source),
      notes: trimText(input.notes),
      skipDuplicateCheck: true
    };
  }

  function normalizeStudentSettlementRows({ studentIds = [], defaultSettlementType = 'package', existingRows = [] } = {}) {
    const ids = [...new Set((Array.isArray(studentIds) ? studentIds : []).map(trimText).filter(Boolean))];
    const defaultType = trimText(defaultSettlementType) || 'package';
    const rowsById = new Map((Array.isArray(existingRows) ? existingRows : []).map(row => [trimText(row?.studentId), row]));
    return ids.map(studentId => {
      const existing = rowsById.get(studentId) || {};
      const existingType = trimText(existing.settlementType);
      const originalDefaultType = trimText(existing.defaultSettlementType);
      const custom = existing.custom === true || (!!existingType && (originalDefaultType ? existingType !== originalDefaultType : existingType !== defaultType));
      const settlementType = custom ? existingType : defaultType;
      const next = {
        studentId,
        settlementType,
        payMethod: settlementType === 'direct' ? trimText(existing.payMethod) || '微信' : '',
        amount: settlementType === 'direct' ? Number(existing.amount || existing.paidAmount || 0) || 0 : 0,
        fieldFeeMode: trimText(existing.fieldFeeMode) === 'separate' ? 'separate' : 'none',
        fieldFeePayMethod: trimText(existing.fieldFeeMode) === 'separate' ? trimText(existing.fieldFeePayMethod) || '微信' : '',
        fieldFeeAmount: trimText(existing.fieldFeeMode) === 'separate' ? Number(existing.fieldFeeAmount || 0) || 0 : 0,
        entitlementId: trimText(existing.entitlementId),
        note: trimText(existing.note),
        defaultSettlementType: defaultType,
        custom
      };
      if (existing.expanded !== undefined) next.expanded = !!existing.expanded;
      return next;
    });
  }

  function settlementRowLabel(row = {}) {
    const type = trimText(row.settlementType) || 'package';
    if (type === 'direct') {
      const method = trimText(row.payMethod) || '收款';
      const amount = Number(row.amount || row.paidAmount || 0) || 0;
      const fieldFee = trimText(row.fieldFeeMode) === 'separate' ? `；场地费 ${trimText(row.fieldFeePayMethod) || '收款'} ¥${Number(row.fieldFeeAmount || 0) || 0}` : '';
      return `直接收款 · ${method} ¥${amount}${fieldFee}`;
    }
    if (trimText(row.fieldFeeMode) === 'separate') return `${type === 'gift' ? '赠送/免费' : '课包扣减'}；场地费 ${trimText(row.fieldFeePayMethod) || '收款'} ¥${Number(row.fieldFeeAmount || 0) || 0}`;
    if (type === 'gift') return '赠送/免费';
    return '课包扣减';
  }

  function settlementTypeLabel(type = '') {
    return ({ direct: '直接收款', gift: '赠送/免费', package: '课包扣减' })[trimText(type)] || '课包扣减';
  }

  function escapeHtml(value) {
    return trimText(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function jsStringArg(value) {
    return JSON.stringify(trimText(value)).replace(/</g, '\\u003C');
  }

  function summarizeStudentSettlementRows(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '暂无学员结算明细';
    const groups = new Map();
    list.forEach(row => {
      const label = settlementTypeLabel(row?.settlementType);
      groups.set(label, (groups.get(label) || 0) + 1);
    });
    return [...groups.entries()].map(([label, count]) => `${count}人${label}`).join(' / ');
  }

  function serializeStudentSettlementRows(rows = []) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const studentId = trimText(row?.studentId);
      if (!studentId || seen.has(studentId)) return false;
      seen.add(studentId);
      return true;
    }).map(row => ({
      studentId: row.studentId,
      settlementType: trimText(row.settlementType) || 'package',
      payMethod: trimText(row.settlementType) === 'direct' ? trimText(row.payMethod) || '微信' : '',
      amount: trimText(row.settlementType) === 'direct' ? Number(row.amount || row.paidAmount || 0) || 0 : 0,
      fieldFeeMode: trimText(row.fieldFeeMode) === 'separate' ? 'separate' : 'none',
      fieldFeePayMethod: trimText(row.fieldFeeMode) === 'separate' ? trimText(row.fieldFeePayMethod) || '微信' : '',
      fieldFeeAmount: trimText(row.fieldFeeMode) === 'separate' ? Number(row.fieldFeeAmount || 0) || 0 : 0,
      entitlementId: trimText(row.entitlementId),
      note: trimText(row.note)
    }));
  }

  function scheduleStudentSettlementTypeOptions() {
    return [
      { value: 'package', label: '课包扣减' },
      { value: 'direct', label: '直接收款' },
      { value: 'gift', label: '赠送/免费' }
    ];
  }

  function scheduleStudentFieldFeeModeOptions() {
    return [
      { value: 'none', label: '不单独收场地费' },
      { value: 'separate', label: '单独支付场地费' }
    ];
  }

  function dropdownHtml(id, label, options, value, onchange) {
    if (typeof renderStandardDropdownHtml === 'function') return renderStandardDropdownHtml(id, label, options, value, true, onchange);
    const handler = onchange ? `${onchange}()` : '';
    return `<select class="finput tms-form-control" id="${escapeHtml(id)}" onchange="${escapeHtml(handler)}">${(options || []).map(opt => `<option value="${escapeHtml(opt.value)}"${trimText(value) === trimText(opt.value) ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}</select>`;
  }

  function scheduleStudentSettlementRowHtml({ row = {}, studentName = '', packageText = '', payMethodOptions = [] } = {}) {
    const studentId = trimText(row.studentId);
    if (!studentId) return '';
    const safeName = escapeHtml(studentName || studentId);
    const selectedType = trimText(row.settlementType) || 'package';
    const directDisplay = selectedType === 'direct' ? '' : 'none';
    const fieldFeeMode = trimText(row.fieldFeeMode) === 'separate' ? 'separate' : 'none';
    const fieldFeeDisplay = fieldFeeMode === 'separate' ? '' : 'none';
    const amountValue = Number(row.amount || 0) || 0;
    const packageDisplay = selectedType === 'package' ? '' : 'none';
    const safePackageText = escapeHtml(packageText || '按该学员可用课包自动匹配');
    return `<div class="schedule-student-settlement-row" data-student-id="${escapeHtml(studentId)}"><div class="schedule-student-settlement-head"><div class="schedule-student-settlement-name">${safeName}</div><div class="schedule-student-settlement-row-summary" id="sch_studentSettlementRowSummary_${escapeHtml(studentId)}">${escapeHtml(settlementRowLabel(row))}</div></div><div class="tms-form-row schedule-student-settlement-grid"><div class="tms-form-item"><label class="tms-form-label">结算方式</label>${dropdownHtml(`sch_studentSettlementType_${studentId}`,'结算方式',scheduleStudentSettlementTypeOptions(),selectedType,'syncScheduleStudentSettlementRows')}</div><div class="schedule-student-settlement-package" id="sch_studentSettlementPackage_${escapeHtml(studentId)}" style="display:${packageDisplay}"><label class="tms-form-label">扣减课包</label><div class="schedule-student-settlement-package-text" title="${safePackageText}">${safePackageText}</div></div><div class="tms-form-row schedule-student-settlement-direct" id="sch_studentSettlementDirect_${escapeHtml(studentId)}" style="display:${directDisplay}"><div class="tms-form-item"><label class="tms-form-label">课时费支付</label>${dropdownHtml(`sch_studentSettlementPayMethod_${studentId}`,'课时费支付',payMethodOptions,trimText(row.payMethod)||'微信','syncScheduleStudentSettlementRows')}</div><div class="tms-form-item"><label class="tms-form-label">课时费</label><input class="finput tms-form-control" id="sch_studentSettlementAmount_${escapeHtml(studentId)}" type="number" min="0" step="0.01" value="${escapeHtml(amountValue)}" oninput="syncScheduleStudentSettlementRows()"></div></div><div class="tms-form-item"><label class="tms-form-label">场地费</label>${dropdownHtml(`sch_studentSettlementFieldFeeMode_${studentId}`,'场地费',scheduleStudentFieldFeeModeOptions(),fieldFeeMode,'syncScheduleStudentSettlementRows')}</div><div class="tms-form-row schedule-student-settlement-field-fee" id="sch_studentSettlementFieldFee_${escapeHtml(studentId)}" style="display:${fieldFeeDisplay}"><div class="tms-form-item"><label class="tms-form-label">场地费支付</label>${dropdownHtml(`sch_studentSettlementFieldFeePayMethod_${studentId}`,'场地费支付',payMethodOptions,trimText(row.fieldFeePayMethod)||'微信','syncScheduleStudentSettlementRows')}</div><div class="tms-form-item"><label class="tms-form-label">场地费金额</label><input class="finput tms-form-control" id="sch_studentSettlementFieldFeeAmount_${escapeHtml(studentId)}" type="number" min="0" step="0.01" value="${escapeHtml(Number(row.fieldFeeAmount || 0) || 0)}" oninput="syncScheduleStudentSettlementRows()"></div></div></div></div>`;
  }

  function scheduleStudentSettlementPanelHtml({ expanded = false, summary = '', rowsHtml = '' } = {}) {
    return `<div class="schedule-student-settlement-panel"><div class="tms-section-header" style="margin-top:0;display:flex;align-items:center;justify-content:space-between;gap:12px"><div>学员结算明细</div><div style="display:flex;align-items:center;gap:10px"><div id="sch_studentSettlementSummary" style="font-size:12px;color:var(--ts);max-width:320px;text-align:right">${escapeHtml(summary)}</div><button type="button" class="schedule-detail-action" id="sch_studentSettlementToggle" onclick="toggleScheduleStudentSettlementRows()">${expanded ? '收起明细' : '展开明细'}</button></div></div><div class="tms-field-help" style="margin-bottom:12px">默认值只用于快速初始化，每个人都能单独改。</div><div id="sch_studentSettlementBody" style="display:${expanded ? '' : 'none'}"><div class="schedule-student-settlement-list">${rowsHtml}</div></div></div>`;
  }

  function scheduleQuickStudentFormHtml({ campus = '', source = '', campusOptions = [], sourceOptions = [] } = {}) {
    const campusList = Array.isArray(campusOptions) && campusOptions.length ? campusOptions : [{ value: '', label: '— 选择 —' }];
    const sourceList = Array.isArray(sourceOptions) && sourceOptions.length ? sourceOptions : [{ value: '', label: '— 选择 —' }];
    return `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input class="finput tms-form-control" id="sch_quickStudentName" placeholder="姓名"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input class="finput tms-form-control" id="sch_quickStudentPhone" placeholder="手机号"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所在校区</label>${renderStandardDropdownHtml('sch_quickStudentCampus','所在校区',campusList,campus,true)}</div><div class="tms-form-item"><label class="tms-form-label">来源</label>${renderStandardDropdownHtml('sch_quickStudentSource','来源',sourceList,source,true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="sch_quickStudentNotes" placeholder="可选"></textarea></div></div>`;
  }

  function scheduleQuickStudentOverlayHtml({ body = '', actions = '' } = {}) {
    return `<div class="schedule-quick-student-overlay open" id="scheduleQuickStudentOverlay" onclick="if(event.target===this)closeScheduleStudentQuickCreateModal()"><div class="schedule-quick-student-modal"><div class="mhead"><div class="mtitle">新建学员并排课</div><button class="mclose close-x" type="button" aria-label="关闭" title="关闭" onclick="closeScheduleStudentQuickCreateModal()">×</button></div><div class="mbody schedule-detail-form">${body}</div><div class="mactions">${actions}</div></div></div>`;
  }

  const api = {
    trimText,
    buildStudentQuickCreatePayload,
    normalizeStudentSettlementRows,
    serializeStudentSettlementRows,
    summarizeStudentSettlementRows,
    settlementTypeLabel,
    settlementRowLabel,
    scheduleStudentSettlementTypeOptions,
    scheduleStudentFieldFeeModeOptions,
    scheduleStudentSettlementRowHtml,
    scheduleStudentSettlementPanelHtml,
    scheduleQuickStudentFormHtml,
    scheduleQuickStudentOverlayHtml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
