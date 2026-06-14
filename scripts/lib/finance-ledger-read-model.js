function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function yuanToCent(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centToYuan(value) {
  return roundMoney((Number(value) || 0) / 100);
}

function sourceParts(row) {
  const sourceDocument = String(row?.sourceDocument || '').trim();
  const id = String(row?.id || '').trim();
  const purchase = sourceDocument.match(/^购买记录\s+(.+)$/);
  if (purchase) return { sourceType: 'purchase', sourceId: purchase[1], sourceSubId: '' };
  const schedule = sourceDocument.match(/^排课\s+(.+)$/);
  if (schedule) return { sourceType: 'schedule', sourceId: schedule[1], sourceSubId: '' };
  const court = sourceDocument.match(/^订场账户\s+(.+)$/);
  if (court) return { sourceType: 'court', sourceId: court[1], sourceSubId: id };
  return { sourceType: 'finance_normalized_row', sourceId: id || sourceDocument, sourceSubId: '' };
}

function ledgerTypeForFinanceRow(row) {
  const businessType = String(row?.businessType || '');
  const action = String(row?.action || '');
  const sourceDocument = String(row?.sourceDocument || '');
  const paymentChannel = String(row?.paymentChannel || '');
  const incomeType = String(row?.incomeType || '');

  if (businessType === '课程' && action === '收款' && incomeType.includes('补差')) return 'course_surcharge';
  if (businessType === '课程' && action === '收款' && sourceDocument.startsWith('购买记录')) return 'package_receipt';
  if (businessType === '课程' && action === '收款' && sourceDocument.startsWith('排课')) return 'direct_course_receipt';
  if (businessType === '课程' && ['消耗', '已入账'].includes(action) && paymentChannel === '课包划扣') return 'lesson_consume';
  if (businessType === '课程' && action === '回退') return 'lesson_return';
  if (businessType === '会员储值' && action === '收款') return 'membership_recharge';
  if (businessType === '会员订场' && ['已入账', '消耗'].includes(action)) return 'member_booking_consume';
  if (businessType === '散客订场' && action === '收款') return 'guest_booking_receipt';
  if (businessType === '约球局' && action === '收款') return 'match_fee_sync';
  if (['散客订场', '约球局', '会员订场'].includes(businessType) && action === '退款') return 'booking_refund';
  if (['散客订场', '约球局', '会员订场'].includes(businessType) && action === '冲回') return 'booking_reversal';
  return 'shadow_finance_row';
}

function idempotencyKeyFor({ sourceType, sourceId, sourceSubId, ledgerType }) {
  return [sourceType, sourceId, sourceSubId, ledgerType].map((value) => String(value || '')).join('|');
}

function buildShadowLedgerRowsFromFinanceNormalizedRows(rows = []) {
  return normalizeRows(rows).map((row, index) => {
    const ledgerType = ledgerTypeForFinanceRow(row);
    const source = sourceParts(row);
    const id = String(row?.id || `finance-row-${index}`);
    return {
      id: `shadow-${id}`,
      ledgerVersion: 'shadow-ledger-v1',
      status: 'active',
      businessDate: row?.businessDate || '',
      createdAt: row?.createdAt || row?.businessDate || '',
      operationId: row?.operationId || '',
      batchId: row?.batchId || '',
      operationType: row?.operationType || '',
      operationBy: row?.operator || row?.collector || '',
      campusName: row?.campusName || '',
      userName: row?.customer || '',
      businessType: row?.businessType || '',
      actionType: row?.action || '',
      ledgerType,
      ...source,
      paymentChannel: row?.paymentChannel || '',
      paymentStatus: 'success',
      cashDelta: yuanToCent(row?.cashDelta),
      recognizedRevenueDelta: yuanToCent(row?.recognizedRevenueDelta),
      deferredRevenueDelta: yuanToCent(row?.deferredRevenueDelta),
      productSnapshotName: row?.packageName || row?.incomeType || '',
      sourceSnapshot: {
        financeNormalizedRowId: id,
        sourceDocument: row?.sourceDocument || '',
        notes: row?.notes || '',
        incomeType: row?.incomeType || '',
        debitTarget: row?.debitTarget || ''
      },
      idempotencyKey: idempotencyKeyFor({ ...source, ledgerType }),
      notes: row?.notes || ''
    };
  });
}

function buildFinanceNormalizedRowsFromLedgerRows(rows = []) {
  return normalizeRows(rows)
    .filter((row) => String(row?.status || 'active') === 'active')
    .map((row) => ({
      id: row?.sourceSnapshot?.financeNormalizedRowId || String(row?.id || ''),
      operationId: row?.operationId || '',
      batchId: row?.batchId || '',
      businessDate: row?.businessDate || '',
      customer: row?.userName || '',
      campusName: row?.campusName || '',
      businessType: row?.businessType || '',
      action: row?.actionType || '',
      cashDelta: centToYuan(row?.cashDelta),
      recognizedRevenueDelta: centToYuan(row?.recognizedRevenueDelta),
      deferredRevenueDelta: centToYuan(row?.deferredRevenueDelta),
      paymentChannel: row?.paymentChannel || '',
      sourceDocument: row?.sourceSnapshot?.sourceDocument || '',
      notes: row?.notes || row?.sourceSnapshot?.notes || '',
      incomeType: row?.sourceSnapshot?.incomeType || row?.productSnapshotName || '',
      debitTarget: row?.sourceSnapshot?.debitTarget || '',
      ledgerType: row?.ledgerType || '',
      idempotencyKey: row?.idempotencyKey || idempotencyKeyFor(row)
    }));
}

module.exports = {
  buildShadowLedgerRowsFromFinanceNormalizedRows,
  buildFinanceNormalizedRowsFromLedgerRows,
  idempotencyKeyFor,
  ledgerTypeForFinanceRow,
  roundMoney
};
