const { v4: uuidv4 } = require('uuid');
const businessTaxonomy = require('../../public/assets/scripts/core/business-taxonomy.js');

function createFinanceSnapshotHelpers(deps = {}) {
  const {
    buildFinanceCampusResolvers,
    normalizeOperatorAccountName,
    parseArr,
    financeBusinessDateTime,
    financeWeekdayText,
    financeDifferenceReason,
    financePurchaseStatusText,
    normalizeEntitlementLedgerRowsForView,
    importedLedgerMonthKey,
    isBillableSchedule,
    isDirectPaidSchedule,
    isStoredValuePayMethod,
    roundMoney,
    financeTimeText,
    financeDateTimeText,
    normalizeCourtHistory,
    effectiveScheduleStatus,
    parseLessonValue,
    computeCourtFinance
  } = deps;

function financeNeutralActionLabel(text=''){
  return /免费|赠送/.test(String(text||''))?'赠送':'记录';
}
function applyStandardFinanceFields(row){
  const business=businessTaxonomy.normalizeBusinessType(row);
  const transactionType=businessTaxonomy.normalizeTransactionType(row);
  return {
    ...row,
    transactionType,
    businessTypeLevel1:business.level1,
    businessTypeLevel2:business.level2,
    businessTypeLevel3:business.level3,
    displayBusinessType:business.display,
    normalizedPaymentMethod:businessTaxonomy.normalizePaymentMethod(row.paymentChannel||row.payMethod),
    transactionAmount:businessTaxonomy.transactionAmount(row)
  };
}
function financeCourtHistoryBusinessType(row){
  const category=String(row?.category||'');
  const sourceCategory=String(row?.sourceCategory||'');
  const payMethod=String(row?.payMethod||'').trim();
  if(row?.type==='充值')return '会员储值';
  if(sourceCategory.includes('约球订场'))return '约球局';
  if(category.includes('订场')){
    if(payMethod==='储值扣款'||payMethod==='储值卡'||payMethod.includes('储值')||category.includes('会员'))return '会员订场';
    return '散客订场';
  }
  if(/课|班课|训练营|体验/.test(category))return '课程';
  return '其他';
}
function financeCourtHistoryBusinessDate(historyRow){
  const primary=historyRow.recordedAt||historyRow.createdAt;
  const occurredAt=historyRow.occurredAt;
  const dateOnly=historyRow.occurredDate||historyRow.date;
  if(!primary&&!occurredAt&&dateOnly)return String(dateOnly).slice(0,10);
  return financeBusinessDateTime(primary,occurredAt,dateOnly);
}
function financeRecognizedAmountForConsumeRow(row,entitlement,purchase){
  const lessonDelta=Math.abs(Number(row?.lessonDelta)||0);
  const totalLessons=Math.max(1,Number(entitlement?.totalLessons)||Number(purchase?.packageLessons)||lessonDelta||1);
  const amountPaid=Number(purchase?.amountPaid)||0;
  if(!amountPaid||!lessonDelta)return 0;
  return Math.round((amountPaid/totalLessons)*lessonDelta*100)/100;
}
function financeOperationTraceFields(source={}){
  const trace={};
  ['operationId','batchId','operationType','operationAt','operationBy'].forEach(key=>{
    if(source?.[key]!==undefined&&source?.[key]!==null&&String(source[key]).trim()!=='')trace[key]=source[key];
  });
  return trace;
}
function aggregateFinanceHistoricalMonthlyLedgerRows(rows=[]){
  const monthlyMap=new Map();
  const result=[];
  (rows||[]).forEach(row=>{
    const monthKey=importedLedgerMonthKey(row);
    if(!monthKey){
      result.push(row);
      return;
    }
    const key=[row.entitlementId,row.purchaseId,row.studentId,row.reason||'',monthKey].join('|');
    const current=monthlyMap.get(key);
    if(!current){
      monthlyMap.set(key,{...row,sourceMonth:row.sourceMonth||monthKey});
      return;
    }
    monthlyMap.set(key,{
      ...current,
      lessonDelta:(Number(current.lessonDelta)||0)+(Number(row.lessonDelta)||0),
      relatedDate:String(row.relatedDate||'')>String(current.relatedDate||'')?row.relatedDate:current.relatedDate,
      createdAt:String(row.createdAt||'')>String(current.createdAt||'')?row.createdAt:current.createdAt
    });
  });
  return [...result,...monthlyMap.values()];
}
function buildFinanceUnifiedRows({campuses=[],students=[],purchases=[],entitlements=[],entitlementLedger=[],courts=[],membershipOrders=[],schedule=[],users=[]}={}){
  const campusName=buildFinanceCampusResolvers(campuses);
  const operatorText=(...values)=>{
    for(const value of values){
      const normalized=normalizeOperatorAccountName(value,users);
      if(normalized)return normalized;
    }
    return '未记录';
  };
  const studentMap=new Map((students||[]).map(item=>[String(item.id||''),item]));
  const entitlementByPurchaseId=new Map();
  const entitlementMap=new Map();
  (entitlements||[]).forEach(item=>{
    entitlementMap.set(String(item.id||''),item);
    if(item?.purchaseId&&!entitlementByPurchaseId.has(String(item.purchaseId)))entitlementByPurchaseId.set(String(item.purchaseId),item);
  });
  const purchaseMap=new Map((purchases||[]).map(item=>[String(item.id||''),item]));
  const scheduleMap=new Map((schedule||[]).map(item=>[String(item.id||''),item]));
  const courtMap=new Map((courts||[]).map(item=>[String(item.id||''),item]));
  const courtMembershipOrderIds=new Set();
  (courts||[]).forEach(court=>normalizeCourtHistory(court.history).forEach(historyRow=>{
    const membershipOrderId=String(historyRow.membershipOrderId||'').trim();
    if(membershipOrderId)courtMembershipOrderIds.add(membershipOrderId);
  }));
  const courseReceiptRows=(purchases||[]).filter(purchase=>!['voided','refunded','deleted'].includes(String(purchase?.status||'active'))).map(purchase=>{
    const entitlement=entitlementByPurchaseId.get(String(purchase.id))||{};
    const student=studentMap.get(String(purchase.studentId||''))||{};
    const rowCampusName=campusName.fromHints(
      parseArr(entitlement.campusIds)[0]||entitlement.campus||'',
      purchase.campus,
      student.campus,
      purchase.notes,
      purchase.packageName,
      purchase.productName
    )||'—';
    const actualAmount=Number(purchase.amountPaid)||0;
    const operator=operatorText(purchase.operator,purchase.createdBy,purchase.updatedBy);
    const differenceReason=financeDifferenceReason(`${purchase.notes||''} ${purchase.packageName||''} ${purchase.productName||''}`);
    return {
      id:`purchase-${purchase.id}`,
      ...financeOperationTraceFields(purchase),
      businessDate:financeBusinessDateTime(purchase.purchaseDate,purchase.paidAt,purchase.paymentTime,purchase.createdAt),
      weekdayText:financeWeekdayText(purchase.purchaseDate||purchase.createdAt),
      timeText:'—',
      customer:purchase.studentName||'—',
      campusName:rowCampusName,
      businessType:differenceReason?'差异项':'课程',
      action:differenceReason?'差异':(actualAmount>0?'收款':financeNeutralActionLabel(`${purchase.notes||''} ${purchase.payMethod||''}`)),
      cashDelta:differenceReason?0:actualAmount,
      recognizedRevenueDelta:0,
      deferredRevenueDelta:differenceReason?0:actualAmount,
      paymentChannel:purchase.payMethod||'—',
      sourceDocument:`购买记录 ${purchase.id}`,
      notes:differenceReason?`${differenceReason}；${purchase.notes||''}`:(purchase.notes||''),
      incomeType:purchase.packageName||purchase.productName||'课包购买',
      packageName:purchase.packageName||purchase.productName||'课包',
      collector:operator,
      operator,
      differenceReason:differenceReason||'',
      systemStatus:financePurchaseStatusText(purchase),
      totalLessons:Number(entitlement.totalLessons)||Number(purchase.packageLessons)||0,
      usedLessons:Math.max(0,(Number(entitlement.totalLessons)||Number(purchase.packageLessons)||0)-(Number(entitlement.remainingLessons)||0)),
      remainingLessons:Number(entitlement.remainingLessons)||0,
      sourceProject:purchase.packageName||purchase.productName||'课包购买',
      debitTarget:purchase.packageName||purchase.productName||'课包'
    };
  });
  const membershipReceiptRows=(membershipOrders||[])
    .filter(order=>String(order?.status||'active')!=='voided')
    .filter(order=>!courtMembershipOrderIds.has(String(order?.id||'')))
    .map(order=>{
      const court=courtMap.get(String(order.courtId||''))||{};
      const rowCampusName=campusName.fromHints(court.campus,court.campusName,order.courtName,order.notes,order.membershipPlanName)||'—';
      const amount=Number(order.rechargeAmount)||0;
      const operator=operatorText(order.operator,order.createdBy,order.updatedBy);
      const differenceReason=financeDifferenceReason(`${order.notes||''} ${order.membershipPlanName||''}`);
      return {
        id:`membership-${order.id}`,
        ...financeOperationTraceFields(order),
        businessDate:financeBusinessDateTime(order.purchaseDate,order.paidAt,order.paymentTime,order.createdAt),
        weekdayText:financeWeekdayText(order.purchaseDate||order.createdAt),
        timeText:'—',
        customer:order.courtName||court.name||order.courtId||'—',
        campusName:rowCampusName,
        businessType:differenceReason?'差异项':'会员储值',
        action:differenceReason?'差异':(amount>0?'收款':financeNeutralActionLabel(`${order.notes||''} ${order.payMethod||''}`)),
        cashDelta:differenceReason?0:amount,
        recognizedRevenueDelta:0,
        deferredRevenueDelta:differenceReason?0:amount,
        paymentChannel:order.payMethod||'会员充值',
        sourceDocument:`会员订单 ${order.id}`,
        notes:differenceReason?`${differenceReason}；${order.notes||''}`:(order.notes||''),
        incomeType:'会员储值',
        packageName:'',
        collector:operator,
        operator,
        differenceReason:differenceReason||'',
        systemStatus:differenceReason?'差异项':'正常',
        totalLessons:0,
        usedLessons:0,
        remainingLessons:0,
        sourceProject:'会员充值',
        debitTarget:'会员储值余额'
      };
    });
  const courseConsumeRows=aggregateFinanceHistoricalMonthlyLedgerRows(normalizeEntitlementLedgerRowsForView(entitlementLedger||[]).filter(row=>Number(row.lessonDelta||0)!==0)).map(row=>{
    const entitlement=entitlementMap.get(String(row.entitlementId||''))||{};
    const purchase=purchaseMap.get(String(entitlement.purchaseId||row.purchaseId||''))||{};
    if(['voided','refunded','deleted'].includes(String(entitlement.status||''))||['voided','refunded','deleted'].includes(String(purchase.status||'')))return null;
    const scheduleRow=scheduleMap.get(String(row.scheduleId||''))||{};
    const student=studentMap.get(String(purchase.studentId||''))||{};
    const recognizedAmount=financeRecognizedAmountForConsumeRow(row,entitlement,purchase);
    const sign=Number(row.lessonDelta||0)>0?-1:1;
    const operator=operatorText(row.operator,row.createdBy,row.updatedBy,scheduleRow.operator,scheduleRow.createdBy,purchase.operator);
    return {
      id:`consume-${row.id}`,
      ...financeOperationTraceFields(row),
      businessDate:financeBusinessDateTime(row.createdAt,row.recordedAt,row.relatedDate),
      weekdayText:financeWeekdayText(row.relatedDate||row.createdAt),
      timeText:financeTimeText(scheduleRow.startTime),
      customer:entitlement.studentName||purchase.studentName||scheduleRow.studentName||'—',
      campusName:campusName.fromValue(scheduleRow.campus||parseArr(entitlement.campusIds)[0]||purchase.campus||student.campus)||'—',
      businessType:'课程',
      action:Number(row.lessonDelta||0)>0?'回退':'消耗',
      cashDelta:0,
      recognizedRevenueDelta:Math.round(recognizedAmount*sign*100)/100,
      deferredRevenueDelta:Math.round(-recognizedAmount*sign*100)/100,
      paymentChannel:'课包划扣',
      sourceDocument:row.scheduleId?`排课 ${row.scheduleId}`:`课包流水 ${row.id}`,
      notes:row.notes||row.reason||'',
      incomeType:entitlement.packageName||purchase.packageName||'课包消耗',
      packageName:entitlement.packageName||purchase.packageName||'课包',
      collector:operator,
      operator,
      differenceReason:'',
      systemStatus:row.scheduleId||row.importSource==='系统导入'?'已关联':'待补来源',
      totalLessons:Number(entitlement.totalLessons)||Number(purchase.packageLessons)||0,
      usedLessons:Math.max(0,(Number(entitlement.totalLessons)||Number(purchase.packageLessons)||0)-(Number(entitlement.remainingLessons)||0)),
      remainingLessons:Number(entitlement.remainingLessons)||0,
      sourceProject:scheduleRow.id?`${scheduleRow.courseType||'课程'} ${financeDateTimeText(scheduleRow.startTime)}`:(row.reason||'历史导入'),
      debitTarget:entitlement.packageName||purchase.packageName||'课包'
    };
  }).filter(Boolean);
  const directScheduleRows=(schedule||[]).filter(item=>isBillableSchedule(item)&&isDirectPaidSchedule(item)&&!isStoredValuePayMethod(item.payMethod||item.paymentChannel)&&roundMoney(item.paidAmount||item.paymentAmount)>0).map(item=>{
    const amount=roundMoney(item.paidAmount||item.paymentAmount);
    const payMethod=String(item.payMethod||item.paymentChannel||'').trim()||'—';
    const businessDate=financeBusinessDateTime(item.paidAt||item.paymentTime||item.createdAt,item.paymentTime,item.createdAt,String(item.startTime||'').slice(0,10));
    const courseLabel=item.courseType==='体验课'?(item.experienceType||'体验课'):(item.courseType||'课程');
    const operator=operatorText(item.operator,item.createdBy,item.updatedBy);
    return {
      id:`schedule-direct-${item.id}`,
      businessDate,
      weekdayText:financeWeekdayText(item.startTime||item.createdAt),
      timeText:item.startTime&&item.endTime?`${String(item.startTime).slice(11,16)}-${String(item.endTime).slice(11,16)}`:financeTimeText(item.startTime),
      customer:item.studentName||'—',
      campusName:campusName.fromValue(item.campus)||'—',
      businessType:'课程',
      action:'收款',
      cashDelta:amount,
      recognizedRevenueDelta:amount,
      deferredRevenueDelta:0,
      paymentChannel:payMethod,
      sourceDocument:`排课 ${item.id}`,
      notes:item.notes||'',
      incomeType:courseLabel,
      packageName:'',
      collector:operator,
      operator,
      differenceReason:'',
      systemStatus:'正常',
      totalLessons:Number(item.lessonCount)||0,
      usedLessons:Number(item.lessonCount)||0,
      remainingLessons:0,
      sourceProject:`${courseLabel} ${financeDateTimeText(item.startTime)}`,
      debitTarget:'直接收款'
    };
  });
  const scheduleFieldFeeRows=(schedule||[]).filter(item=>isBillableSchedule(item)&&roundMoney(item.fieldFeeAmount)>0).map(item=>{
    const amount=roundMoney(item.fieldFeeAmount);
    const businessDate=financeBusinessDateTime(item.fieldFeePaidAt||item.fieldFeePaymentTime||item.paidAt||item.paymentTime||item.createdAt,item.fieldFeePaymentTime,item.paymentTime,item.createdAt,String(item.startTime||'').slice(0,10));
    const operator=operatorText(item.fieldFeeOperator,item.operator,item.createdBy,item.updatedBy);
    return {
      id:`schedule-field-fee-${item.id}`,
      businessDate,
      weekdayText:financeWeekdayText(item.startTime||item.createdAt),
      timeText:item.startTime&&item.endTime?`${String(item.startTime).slice(11,16)}-${String(item.endTime).slice(11,16)}`:financeTimeText(item.startTime),
      customer:item.studentName||'—',
      campusName:campusName.fromValue(item.campus)||'—',
      businessType:'课程订场',
      action:'收款',
      cashDelta:amount,
      recognizedRevenueDelta:amount,
      deferredRevenueDelta:0,
      paymentChannel:item.fieldFeePayMethod||'—',
      sourceDocument:`排课 ${item.id}`,
      notes:item.fieldFeeNote||item.fieldFeeReason||'排课场地费',
      incomeType:'课程订场',
      packageName:item.packageName||'',
      collector:operator,
      operator,
      differenceReason:'',
      systemStatus:'正常',
      totalLessons:0,
      usedLessons:0,
      remainingLessons:0,
      sourceProject:`排课场地费 ${financeDateTimeText(item.startTime)}`,
      debitTarget:'场地费'
    };
  });
  const courtRows=(courts||[]).flatMap(court=>{
    const baseCampusName=campusName.fromHints(court.campus,court.campusName,court.name,court.notes);
    return normalizeCourtHistory(court.history).map(historyRow=>{
      const noteText=`${historyRow.note||''} ${historyRow.category||''} ${historyRow.sourceCategory||''} ${historyRow.payMethod||''}`;
      const rowCampusName=campusName.fromHints(baseCampusName,historyRow.campus,historyRow.note,historyRow.category,historyRow.source,historyRow.importSource,historyRow.sourceCategory)||'—';
      const differenceReason=financeDifferenceReason(noteText);
      const businessType=financeCourtHistoryBusinessType(historyRow);
      const amount=Math.round((Number(historyRow.amount)||0)*100)/100;
      const operator=operatorText(historyRow.operator,historyRow.createdBy,historyRow.updatedBy);
      let action=financeNeutralActionLabel(noteText);
      let cashDelta=0;
      let recognizedRevenueDelta=0;
      let deferredRevenueDelta=0;
      if(historyRow.type==='充值'){
        action=amount>0?'收款':action;
        cashDelta=amount;
        deferredRevenueDelta=amount;
      }else if(historyRow.type==='消费'&&isStoredValuePayMethod(historyRow.payMethod)){
        action=amount>0?'已入账':action;
        recognizedRevenueDelta=amount;
        deferredRevenueDelta=-amount;
      }else if(historyRow.type==='消费'){
        action=amount>0?'收款':action;
        cashDelta=amount;
        recognizedRevenueDelta=amount;
      }else if(historyRow.type==='退款'&&String(historyRow.payMethod||'').trim()==='储值退款'){
        action='退款';
        cashDelta=-amount;
        deferredRevenueDelta=-amount;
      }else if(historyRow.type==='退款'){
        action='退款';
        cashDelta=-amount;
        recognizedRevenueDelta=-amount;
      }else if(historyRow.type==='冲正'&&isStoredValuePayMethod(historyRow.payMethod)){
        action='冲回';
        recognizedRevenueDelta=-amount;
        deferredRevenueDelta=amount;
      }else if(historyRow.type==='冲正'){
        action='冲回';
        cashDelta=-amount;
        recognizedRevenueDelta=-amount;
      }
      if(differenceReason){
        action='差异';
        cashDelta=0;
        recognizedRevenueDelta=0;
        deferredRevenueDelta=0;
      }
      return {
        id:`court-${court.id}-${historyRow.id||historyRow.date||uuidv4()}`,
        ...financeOperationTraceFields(historyRow),
        businessDate:financeCourtHistoryBusinessDate(historyRow),
        weekdayText:financeWeekdayText(historyRow.occurredDate||historyRow.date),
        timeText:historyRow.startTime&&historyRow.endTime?`${String(historyRow.startTime).slice(11,16)}-${String(historyRow.endTime).slice(11,16)}`:(historyRow.time||'—'),
        customer:court.name||court.id,
        campusName:rowCampusName,
        businessType:differenceReason?'差异项':businessType,
        action,
        cashDelta,
        recognizedRevenueDelta,
        deferredRevenueDelta,
        paymentChannel:historyRow.payMethod||'—',
        sourceDocument:historyRow.sourceDocument||`订场账户 ${court.id}`,
        notes:differenceReason?`${differenceReason}；${historyRow.note||historyRow.category||''}`:(historyRow.note||historyRow.category||''),
        incomeType:businessType,
        packageName:'',
        collector:operator,
        operator,
        differenceReason:differenceReason||'',
        systemStatus:differenceReason?'差异项':'正常',
        totalLessons:0,
        usedLessons:0,
        remainingLessons:0,
        sourceProject:historyRow.sourceProject||businessType,
        debitTarget:businessType==='会员储值'?'会员储值余额':(isStoredValuePayMethod(historyRow.payMethod)?'会员储值余额':'现场收款')
      };
    }).filter(Boolean);
  });
  return [...courseReceiptRows,...membershipReceiptRows,...courseConsumeRows,...directScheduleRows,...scheduleFieldFeeRows,...courtRows]
    .map(applyStandardFinanceFields)
    .sort((a,b)=>String(b.businessDate||'').localeCompare(String(a.businessDate||''))||String(b.id||'').localeCompare(String(a.id||'')));
}
function buildFinanceSettlementRows({campuses=[],schedule=[]}={}){
  const campusName=buildFinanceCampusResolvers(campuses);
  const grouped=new Map();
  (schedule||[]).forEach(item=>{
    const month=String(item.startTime||'').slice(0,7);
    if(!month)return;
    const coach=String(item.coach||'').trim()||'未分配';
    const rowCampusName=campusName.fromValue(item.campus)||'—';
    const key=[month,coach,rowCampusName].join('|');
    const current=grouped.get(key)||{month,coach,campusName:rowCampusName,lessonUnits:0,lateCount:0,lateFeeAmount:0};
    if(effectiveScheduleStatus(item)==='已结束')current.lessonUnits+=parseLessonValue(item.lessonCount,1);
    if(item.coachLateFree){
      current.lateCount+=1;
      current.lateFeeAmount+=Number(item.coachLateFieldFeeAmount)||0;
    }
    grouped.set(key,current);
  });
  return [...grouped.values()]
    .filter(row=>row.lessonUnits>0||row.lateCount>0||row.lateFeeAmount>0)
    .sort((a,b)=>String(b.month||'').localeCompare(String(a.month||''))||String(a.coach||'').localeCompare(String(b.coach||''),'zh-Hans-CN'));
}
function sumFinanceRows(rows=[],field){
  return Math.round((rows||[]).reduce((sum,row)=>sum+(Number(row?.[field])||0),0)*100)/100;
}
function buildFinanceOverviewDataFromRows(rows=[]){
  const businessRows=(rows||[]).filter(row=>!row?.differenceReason);
  const courseRows=businessRows.filter(row=>row.businessType==='课程');
  const packageReceiptRows=courseRows.filter(row=>row.action==='收款'&&String(row.sourceDocument||'').startsWith('购买记录'));
  const packageRecognizedRows=courseRows.filter(row=>['消耗','回退','已入账'].includes(String(row.action||''))&&String(row.paymentChannel||'')==='课包划扣');
  const directCourseRows=courseRows.filter(row=>row.action==='收款'&&String(row.sourceDocument||'').startsWith('排课'));
  const storedValueRows=businessRows.filter(row=>row.businessType==='会员储值');
  const storedValueConsumedRows=businessRows.filter(row=>row.businessType==='会员订场');
  const bookingRows=businessRows.filter(row=>['散客订场','约球局','课程订场'].includes(row.businessType));
  const bookingIncome=sumFinanceRows(bookingRows,'cashDelta');
  const bookingRecognized=sumFinanceRows(bookingRows,'recognizedRevenueDelta');
  return {
    all:{
      cash:sumFinanceRows(businessRows,'cashDelta'),
      recognized:sumFinanceRows(businessRows,'recognizedRevenueDelta'),
      deferred:sumFinanceRows(businessRows,'deferredRevenueDelta'),
      courseIncome:sumFinanceRows(courseRows,'cashDelta'),
      courseRecognized:sumFinanceRows(courseRows,'recognizedRevenueDelta'),
      directCourseIncome:sumFinanceRows(directCourseRows,'cashDelta'),
      directCourseRecognized:sumFinanceRows(directCourseRows,'recognizedRevenueDelta'),
      packageIncome:sumFinanceRows(packageReceiptRows,'cashDelta'),
      packageRecognized:sumFinanceRows(packageRecognizedRows,'recognizedRevenueDelta'),
      storedValueIncome:sumFinanceRows(storedValueRows,'cashDelta'),
      storedValueConsumed:sumFinanceRows(storedValueConsumedRows,'recognizedRevenueDelta'),
      bookingIncome,
      bookingRecognized,
      courtIncome:bookingIncome,
      courtRecognized:bookingRecognized,
      tradeCount:businessRows.filter(row=>row.action==='收款'&&Number(row.cashDelta)>0).length
    },
    campuses:[]
  };
}
function buildFinancePageSnapshot(source={}){
  const financeNormalizedRows=buildFinanceUnifiedRows(source);
  return {
    generatedAt:new Date().toISOString(),
    financeOverviewData:buildFinanceOverviewDataFromRows(financeNormalizedRows),
    financeNormalizedRows,
    financeSettlementRows:buildFinanceSettlementRows(source)
  };
}
const FINANCE_IMPORT_INCREMENT_PREFIX='private_lesson_csv_import_';
const FINANCE_MEMBERSHIP_IMPORT_ORDER_PREFIX='membership-import-order-';
const MABAO_FINAL_IMPORT_TAG='mabao-finance-import-20260524';
function isFinanceImportIncrementRow(row){
  return String(row?.id||'').startsWith(FINANCE_IMPORT_INCREMENT_PREFIX)||String(row?.importBatchId||'').startsWith(FINANCE_IMPORT_INCREMENT_PREFIX);
}
function isFinanceMembershipImportIncrementOrder(row){
  return String(row?.id||'').startsWith(FINANCE_MEMBERSHIP_IMPORT_ORDER_PREFIX);
}
function courtWithFinanceImportHistory(court){
  if(String(court?.status||'active')==='inactive'||court?.mergedIntoCourtId||court?.deletedAt)return {...court,history:[]};
  const history=normalizeCourtHistory(court?.history).filter(row=>String(row?.seedTag||'')===MABAO_FINAL_IMPORT_TAG||String(row?.id||'').startsWith('private_lesson_csv_import_20260524-court-'));
  return history.length?{...court,history}:{...court,history:[]};
}
function membershipStoredValueOverview({courts=[],membershipAccounts=[]}={}){
  const courtMap=new Map((courts||[]).map(court=>[String(court.id||''),court]));
  const activeAccounts=(membershipAccounts||[]).filter(account=>!['voided','cleared'].includes(String(account?.status||'')));
  const courtIds=new Set(activeAccounts.map(account=>String(account?.courtId||'')).filter(Boolean));
  const rows=[...courtIds].map(id=>courtMap.get(id)).filter(court=>court&&String(court?.status||'active')!=='inactive'&&!court?.mergedIntoCourtId&&!court?.deletedAt);
  const totals=rows.reduce((sum,court)=>{
    const finance=computeCourtFinance({...court,allowNegativeBalance:true});
    sum.balance+=Number(finance.balance)||0;
    sum.totalDeposit+=Number(finance.totalDeposit)||0;
    sum.bonus+=normalizeCourtHistory(court.history).filter(row=>row.type==='充值').reduce((rowSum,row)=>rowSum+(Number(row.bonusAmount)||0),0);
    sum.consumed+=Number(finance.storedValueSpent)||0;
    return sum;
  },{balance:0,totalDeposit:0,bonus:0,consumed:0});
  return {
    storedValueBalance:roundMoney(totals.balance),
    storedValueAccountTotal:roundMoney(totals.balance+totals.consumed),
    storedValueConsumed:roundMoney(totals.consumed),
    storedValueDeposit:roundMoney(totals.totalDeposit),
    storedValueBonus:roundMoney(totals.bonus)
  };
}
function buildVerifiedFinanceWithImportIncrements(verifiedFinance={},source={}){
  const purchaseRows=(source.purchases||[]).filter(isFinanceImportIncrementRow);
  const purchaseIds=new Set(purchaseRows.map(row=>String(row.id||'')).filter(Boolean));
  const entitlementRows=(source.entitlements||[]).filter(row=>isFinanceImportIncrementRow(row)||purchaseIds.has(String(row.purchaseId||'')));
  const entitlementIds=new Set(entitlementRows.map(row=>String(row.id||'')).filter(Boolean));
  const ledgerRows=(source.entitlementLedger||[]).filter(row=>isFinanceImportIncrementRow(row)||purchaseIds.has(String(row.purchaseId||''))||entitlementIds.has(String(row.entitlementId||'')));
  const membershipOrderRows=(source.membershipOrders||[]).filter(isFinanceMembershipImportIncrementOrder);
  const courtRows=(source.courts||[]).map(courtWithFinanceImportHistory).filter(row=>normalizeCourtHistory(row.history).length);
  const directScheduleRows=(source.schedule||[]).filter(row=>(isDirectPaidSchedule(row)&&!isStoredValuePayMethod(row.payMethod||row.paymentChannel)&&roundMoney(row.paidAmount||row.paymentAmount)>0)||roundMoney(row.fieldFeeAmount)>0);
  const incrementRows=buildFinanceUnifiedRows({
    campuses:source.campuses||[],
    students:source.students||[],
    purchases:purchaseRows,
    entitlements:entitlementRows,
    entitlementLedger:ledgerRows,
    courts:courtRows,
    membershipOrders:membershipOrderRows,
    schedule:directScheduleRows
  });
  const baseOverview=verifiedFinance?.overviewData||null;
  if(!baseOverview)return {
    overviewData:null,
    normalizedRows:[...(verifiedFinance?.normalizedRows||[]),...incrementRows]
  };
  const businessRows=incrementRows.filter(row=>!row.differenceReason);
  const cashDelta=businessRows.reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const recognizedDelta=businessRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const deferredDelta=businessRows.reduce((sum,row)=>sum+(Number(row.deferredRevenueDelta)||0),0);
  const courseRows=businessRows.filter(row=>row.businessType==='课程');
  const packageReceiptRows=courseRows.filter(row=>row.action==='收款'&&String(row.sourceDocument||'').startsWith('购买记录'));
  const packageRecognizedRows=courseRows.filter(row=>['消耗','回退','已入账'].includes(String(row.action||''))&&String(row.paymentChannel||'')==='课包划扣');
  const directCourseRows=courseRows.filter(row=>row.action==='收款'&&String(row.sourceDocument||'').startsWith('排课'));
  const courseCashDelta=courseRows.reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const courseRecognizedDelta=courseRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const directCourseCashDelta=directCourseRows.reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const directCourseRecognizedDelta=directCourseRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const packageCashDelta=packageReceiptRows.reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const packageRecognizedDelta=packageRecognizedRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const storedValueCashDelta=businessRows.filter(row=>row.businessType==='会员储值').reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const storedValueRecognizedDelta=businessRows.filter(row=>row.businessType==='会员订场').reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const bookingCashDelta=businessRows.filter(row=>['散客订场','约球局','课程订场'].includes(row.businessType)).reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const bookingRecognizedDelta=businessRows.filter(row=>['散客订场','约球局','课程订场'].includes(row.businessType)).reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const tradeCountDelta=businessRows.filter(row=>['课程','会员储值'].includes(row.businessType)&&row.action==='收款'&&Number(row.cashDelta)>0).length;
  const all={...(baseOverview.all||{})};
  all.cash=roundMoney((Number(all.cash)||0)+cashDelta);
  all.recognized=roundMoney((Number(all.recognized)||0)+recognizedDelta);
  all.deferred=roundMoney((Number(all.deferred)||0)+deferredDelta);
  all.courseIncome=roundMoney((Number(all.courseIncome??all.packageIncome)||0)+courseCashDelta);
  all.courseRecognized=roundMoney((Number(all.courseRecognized??all.packageRecognized)||0)+courseRecognizedDelta);
  all.directCourseIncome=roundMoney((Number(all.directCourseIncome)||0)+directCourseCashDelta);
  all.directCourseRecognized=roundMoney((Number(all.directCourseRecognized)||0)+directCourseRecognizedDelta);
  all.packageIncome=roundMoney((Number(all.packageIncome)||0)+packageCashDelta);
  all.packageRecognized=roundMoney((Number(all.packageRecognized)||0)+packageRecognizedDelta);
  all.storedValueIncome=roundMoney((Number(all.storedValueIncome)||0)+storedValueCashDelta);
  all.storedValueConsumed=roundMoney((Number(all.storedValueConsumed)||0)+storedValueRecognizedDelta);
  all.bookingIncome=roundMoney((Number(all.bookingIncome)||0)+bookingCashDelta);
  all.bookingRecognized=roundMoney((Number(all.bookingRecognized)||0)+bookingRecognizedDelta);
  all.tradeCount=(Number(all.tradeCount)||0)+tradeCountDelta;
  if(Array.isArray(source.membershipAccounts)){
    Object.assign(all,membershipStoredValueOverview({courts:source.courts||[],membershipAccounts:source.membershipAccounts||[]}));
  }
  return {
    overviewData:{...baseOverview,all},
    normalizedRows:[...(verifiedFinance.normalizedRows||[]),...incrementRows]
  };
}

  return {
    buildFinanceUnifiedRows,
    buildFinanceSettlementRows,
    buildFinancePageSnapshot,
    buildVerifiedFinanceWithImportIncrements,
    buildFinanceOverviewDataFromRows
  };
}

module.exports = { createFinanceSnapshotHelpers };
