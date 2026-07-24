const defaultBusinessTaxonomy = require('../public/assets/scripts/core/business-taxonomy.js');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

const DEFAULT_ID_FACTORY=()=>`${Date.now()}-${Math.random().toString(16).slice(2)}`;
function fallbackParseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function fallbackNormalizeMoney(value){const n=Number(value);return Number.isFinite(n)?Math.round(n*100)/100:0;}
function fallbackDateMs(v){if(!v)return NaN;if(v instanceof Date)return v.getTime();return new Date(String(v).replace(' ','T')).getTime();}
function fallbackAssertPhone(value){return String(value||'').trim();}
function hasMoneyValue(value){return value!==undefined&&value!==null&&String(value).trim()!=='';}

function createCourtFinanceRules(deps={}){
  const uuidv4=deps.uuidv4||DEFAULT_ID_FACTORY;
  const parseArr=deps.parseArr||fallbackParseArr;
  const normalizeMoney=deps.normalizeMoney||fallbackNormalizeMoney;
  const roundMoney=deps.roundMoney||((n)=>Math.round((Number(n)||0)*100)/100);
  const dateMs=deps.dateMs||fallbackDateMs;
  const businessTaxonomy=deps.businessTaxonomy||defaultBusinessTaxonomy;
  const isBillableSchedule=deps.isBillableSchedule||(()=>false);
  const isDirectPaidSchedule=deps.isDirectPaidSchedule||(()=>false);
  const withOperationTrace=deps.withOperationTrace||((record)=>record);
  const assertPhone=deps.assertPhone||fallbackAssertPhone;
  const courtBookingRange=deps.courtBookingRange||(()=>null);
  const validateScheduleConflicts=deps.validateScheduleConflicts||(()=>{});

  function normalizeCourtBookingHistoryRows(court,history){
    return (history||[]).map(row=>{
      const isCourtBooking=row?.type==='消费'&&row?.category==='订场';
      const hasCampusField=Object.prototype.hasOwnProperty.call(row||{},'campus');
      const campus=normalizeCampusValue(row?.campus||(isCourtBooking?court?.campus:''));
      if(isCourtBooking||hasCampusField){
        return {...row,campus};
      }
      return row;
    });
  }
  function assertCourtBookingHistoryAgainstSchedules(court,schedules){
    for(const row of normalizeCourtHistory(court?.history)){
      if(row?.type!=='消费'||row?.category!=='订场')continue;
      const booking=courtBookingRange(court,row);
      if(!booking)continue;
      validateScheduleConflicts(
        {
          id:row.id||court?.id||'court-booking',
          startTime:booking.startTime,
          endTime:booking.endTime,
          campus:booking.campus,
          venue:booking.venue,
          status:'已排课'
        },
        schedules,
        row.id
      );
    }
  }

function scheduleStoredValueChargeSpecs(schedule){
  if(!isBillableSchedule(schedule))return [];
  const charges=[];
  const lessonAmount=roundMoney(schedule?.paidAmount||schedule?.paymentAmount||0);
  if(isDirectPaidSchedule(schedule)&&isStoredValuePayMethod(schedule?.payMethod||schedule?.paymentChannel)&&lessonAmount>0){
    charges.push({
      key:'lesson',
      amount:lessonAmount,
      courtIdField:'storedValueCourtId',
      amountField:'storedValueAmount',
      category:`排课${schedule?.courseType==='体验课'?(schedule.experienceType||'体验课'):(schedule?.courseType||'课程')}`,
      sourceCategory:'排课储值卡扣款',
      sourceProject:`${schedule?.courseType==='体验课'?(schedule.experienceType||'体验课'):(schedule?.courseType||'课程')} ${String(schedule?.startTime||'').replace('T',' ').slice(0,16)}`,
      defaultNote:'排课产生的储值卡扣款',
      consumeNote:'排课产生的储值卡扣款',
      returnNote:'取消排课退回储值卡',
      returnOriginalNote:'编辑排课退回原储值卡扣款',
      consumeDiffNote:'编辑排课补扣储值卡',
      returnDiffNote:'编辑排课退回储值卡差额'
    });
  }
  const fieldFeeAmount=roundMoney(schedule?.fieldFeeAmount||0);
  if(schedule?.requiresFieldFee&&isStoredValuePayMethod(schedule?.fieldFeePayMethod)&&fieldFeeAmount>0){
    charges.push({
      key:'fieldFee',
      amount:fieldFeeAmount,
      courtIdField:'storedValueFieldFeeCourtId',
      amountField:'storedValueFieldFeeAmount',
      category:'课程订场',
      sourceCategory:'排课场地费储值卡扣款',
      sourceProject:`排课场地费 ${String(schedule?.startTime||'').replace('T',' ').slice(0,16)}`,
      defaultNote:'排课场地费储值卡扣款',
      consumeNote:'场地费储值卡扣款',
      returnNote:'取消排课退回场地费储值卡扣款',
      returnOriginalNote:'编辑排课退回原场地费储值卡扣款',
      consumeDiffNote:'编辑排课补扣场地费',
      returnDiffNote:'编辑排课退回场地费差额'
    });
  }
  return charges;
}
function scheduleStoredValuePaymentAmount(schedule){
  return scheduleStoredValueChargeSpecs(schedule).reduce((sum,item)=>roundMoney(sum+item.amount),0);
}
function activeCourtForStoredValue(court){
  const status=String(court?.status||'active');
  return court&&status!=='inactive'&&status!=='deleted'&&!court.deletedAt&&!court.mergedIntoCourtId;
}
function resolveScheduleStoredValueCourt(schedule,courts=[],students=[],charge={}){
  const storedCourtId=String(schedule?.[charge.courtIdField||'storedValueCourtId']||'').trim();
  if(storedCourtId){
    const court=(courts||[]).find(item=>String(item?.id||'')===storedCourtId&&activeCourtForStoredValue(item));
    if(court)return court;
  }
  const studentIds=parseArr(schedule?.studentIds).filter(Boolean);
  if(studentIds.length!==1)throw new Error('储值卡扣款请只选择 1 名学员');
  const studentId=studentIds[0];
  const student=(students||[]).find(item=>String(item?.id||'')===String(studentId))||{};
  const studentPhone=String(student.phone||student.mobile||student.studentPhone||'').trim();
  const studentName=String(student.name||schedule?.studentName||'').trim();
  const rows=(courts||[]).filter(activeCourtForStoredValue).filter(court=>{
    const ids=normalizeStudentIds(court);
    if(ids.includes(String(studentId)))return true;
    if(studentPhone&&String(court.phone||'').trim()===studentPhone)return true;
    return !studentPhone&&studentName&&String(court.name||'').trim()===studentName;
  });
  if(!rows.length)throw new Error('未找到该学员的会员储值卡');
  return rows.sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0];
}
function buildScheduleStoredValueHistoryRow(schedule,{court,type='消费',amount=0,now=new Date().toISOString(),operator='',operationTrace=null,note='',idSuffix='consume',charge=null}={}){
  const courseLabel=schedule?.courseType==='体验课'?(schedule.experienceType||'体验课'):(schedule?.courseType||'课程');
  const historyId=`schedule-stored-${schedule.id}-${idSuffix}`;
  const occurredDate=String(schedule?.startTime||now).slice(0,10);
  const category=charge?.category||`排课${courseLabel}`;
  const sourceCategory=charge?.sourceCategory||'排课储值卡扣款';
  const sourceProject=charge?.sourceProject||`${courseLabel} ${String(schedule?.startTime||'').replace('T',' ').slice(0,16)}`;
  const row=withOperationTrace({
    id:historyId,
    date:occurredDate,
    occurredDate,
    createdAt:now,
    recordedAt:now,
    type,
    transactionType:type==='冲正'?'冲正':'消耗',
    businessTypeLevel1:'课程',
    businessTypeLevel2:charge?.key==='fieldFee'?'课程订场':courseLabel,
    category,
    sourceCategory,
    sourceType:'schedule',
    sourceDocument:`排课 ${schedule.id}`,
    sourceProject,
    scheduleId:schedule.id,
    studentId:parseArr(schedule?.studentIds)[0]||'',
    studentName:schedule?.studentName||'',
    payMethod:'储值卡',
    normalizedPaymentMethod:businessTaxonomy.normalizePaymentMethod('储值卡'),
    amount:roundMoney(amount),
    note:note||charge?.defaultNote||'排课产生的储值卡扣款',
    startTime:schedule?.startTime||'',
    endTime:schedule?.endTime||'',
    venue:schedule?.venue||'',
    campus:schedule?.campus||court?.campus||'',
    coach:schedule?.coach||'',
    operator:operator||schedule?.updatedBy||schedule?.createdBy||'系统记录',
    revenueBucket:'储值扣款'
  },operationTrace);
  return row;
}
function buildScheduleStoredValueCourtUpdate({previousSchedule=null,nextSchedule=null,courts=[],students=[],now=new Date().toISOString(),operator='',operationTrace=null}={}){
  const next={...(nextSchedule||{})};
  const previousCharges=scheduleStoredValueChargeSpecs(previousSchedule);
  const nextCharges=scheduleStoredValueChargeSpecs(nextSchedule);
  const keys=[...new Set([...previousCharges.map(item=>item.key),...nextCharges.map(item=>item.key)])];
  if(next.storedValueCourtId===undefined)next.storedValueCourtId='';
  if(next.storedValueAmount===undefined)next.storedValueAmount=0;
  if(next.storedValueFieldFeeCourtId===undefined)next.storedValueFieldFeeCourtId='';
  if(next.storedValueFieldFeeAmount===undefined)next.storedValueFieldFeeAmount=0;
  if(!keys.length){
    next.storedValueCourtId='';
    next.storedValueAmount=0;
    next.storedValueFieldFeeCourtId='';
    next.storedValueFieldFeeAmount=0;
    return {schedule:next,court:null,courts:[],originalCourts:[],historyRows:[]};
  }
  const updates=new Map();
  const originals=new Map();
  const historyRows=[];
  const addRow=(court,row)=>{
    if(!court||!row||row.amount<=0)return;
    if(!originals.has(court.id))originals.set(court.id,court);
    const current=updates.get(court.id)||{...court,history:normalizeCourtHistory(court.history)};
    current.history=[...normalizeCourtHistory(current.history),row];
    updates.set(court.id,current);
    historyRows.push(row);
  };
  keys.forEach(key=>{
    const previousCharge=previousCharges.find(item=>item.key===key)||null;
    const nextCharge=nextCharges.find(item=>item.key===key)||null;
    const previousAmount=roundMoney(previousCharge?.amount||0);
    const nextAmount=roundMoney(nextCharge?.amount||0);
    const charge=nextCharge||previousCharge;
    const previousCourt=previousAmount?resolveScheduleStoredValueCourt(previousSchedule,courts,students,previousCharge):null;
    const nextCourt=nextAmount?resolveScheduleStoredValueCourt(next,courts,students,nextCharge):null;
    if(nextCharge&&nextCourt){
      next[nextCharge.courtIdField]=nextCourt.id;
      next[nextCharge.amountField]=nextAmount;
    }else if(charge){
      next[charge.courtIdField]='';
      next[charge.amountField]=0;
    }
    if(previousAmount&&(!nextAmount||previousCourt.id!==nextCourt.id)){
      addRow(previousCourt,buildScheduleStoredValueHistoryRow(previousSchedule,{
        court:previousCourt,
        type:'冲正',
        amount:previousAmount,
        now,
        operator,
        operationTrace,
        note:nextAmount?previousCharge.returnOriginalNote:previousCharge.returnNote,
        idSuffix:`${key}-return-${operationTrace?.operationId||now}`,
        charge:previousCharge
      }));
    }
    if(nextAmount&&(!previousAmount||previousCourt.id!==nextCourt.id)){
      addRow(nextCourt,buildScheduleStoredValueHistoryRow(next,{
        court:nextCourt,
        type:'消费',
        amount:nextAmount,
        now,
        operator,
        operationTrace,
        note:nextCharge.consumeNote,
        idSuffix:`${key}-consume-${operationTrace?.operationId||now}`,
        charge:nextCharge
      }));
    }
    if(previousAmount&&nextAmount&&previousCourt.id===nextCourt.id){
      const diff=roundMoney(nextAmount-previousAmount);
      if(diff>0){
        addRow(nextCourt,buildScheduleStoredValueHistoryRow(next,{
          court:nextCourt,
          type:'消费',
          amount:diff,
          now,
          operator,
          operationTrace,
          note:nextCharge.consumeDiffNote,
          idSuffix:`${key}-consume-diff-${operationTrace?.operationId||now}`,
          charge:nextCharge
        }));
      }else if(diff<0){
        addRow(previousCourt,buildScheduleStoredValueHistoryRow(previousSchedule,{
          court:previousCourt,
          type:'冲正',
          amount:Math.abs(diff),
          now,
          operator,
          operationTrace,
          note:previousCharge.returnDiffNote,
          idSuffix:`${key}-return-diff-${operationTrace?.operationId||now}`,
          charge:previousCharge
        }));
      }
    }
  });
  const updatedCourts=[...updates.values()].map(court=>{
    computeCourtFinance(court);
    return {...court,updatedAt:now};
  });
  return {schedule:next,court:updatedCourts[0]||null,courts:updatedCourts,originalCourts:[...originals.values()],historyRows};
}
function normalizeStudentIds(input){
  const ids=Array.isArray(input.studentIds)?input.studentIds:(input.studentId?[input.studentId]:[]);
  return [...new Set(ids.map(x=>String(x||'').trim()).filter(Boolean))];
}
function extractDepositAmountFromText(text){
  const raw=String(text||'');
  const m=raw.match(/已储值\s*([0-9]+(?:\.[0-9]+)?)/);
  return m?normalizeMoney(m[1]):0;
}
function normalizeFinancePriceSnapshot(row){
  const hasSnapshot=row.priceMode||row.pricePlanId||row.systemAmount!==undefined||row.finalAmount!==undefined;
  if(!hasSnapshot)return row;
  const systemAmount=normalizeMoney(row.systemAmount);
  const finalAmount=normalizeMoney(row.finalAmount!==undefined?row.finalAmount:row.amount);
  const priceOverridden=row.category==='订场'&&(systemAmount>0?systemAmount!==finalAmount:finalAmount===0);
  const overrideReason=String(row.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  return {
    ...row,
    priceMode:String(row.priceMode||'manual').trim(),
    pricePlanId:String(row.pricePlanId||'').trim(),
    channel:String(row.channel||'').trim(),
    channelOrderNo:String(row.channelOrderNo||'').trim(),
    redeemCode:String(row.redeemCode||'').trim(),
    systemAmount,
    finalAmount,
    amount:finalAmount||normalizeMoney(row.amount),
    priceOverridden,
    overrideReason,
    memberDiscount:normalizeMoney(row.memberDiscount||1)||1
  };
}
function courtFinanceRevenueBucket(row){
  if(row?.category==='内部占用')return '内部占用';
  if(row?.category!=='订场')return '';
  const method=String(row?.payMethod||'').trim();
  if(isStoredValuePayMethod(method))return '储值扣款';
  if(method==='代用户订场')return '代用户订场';
  return '现场收款';
}
function isStoredValuePayMethod(value){
  const method=String(value||'').trim();
  return method==='储值扣款'||method==='储值卡';
}
function normalizeCourtHistory(history){
  if(!Array.isArray(history))return[];
  return history.map((h)=> {
    const priced=normalizeFinancePriceSnapshot(h);
    const amountRaw=normalizeMoney(priced.amount);
    const type=h.type||'消费';
    const payMethod=h.payMethod||(type==='消费'&&amountRaw<0?'储值扣款':'');
    const revenueBucket=courtFinanceRevenueBucket({...priced,type,payMethod});
    const isInternalOccupancy=type==='消费'&&priced.category==='内部占用';
    const recordedAt=String(priced.recordedAt||priced.createdAt||'').trim();
    const occurredDate=String(priced.occurredDate||priced.date||'').slice(0,10);
    return {
      ...priced,
      type,
      payMethod,
      category:priced.category||'其他',
      studentId:priced.studentId||'',
      amount:isInternalOccupancy?0:Math.abs(amountRaw),
      bonusAmount:normalizeMoney(priced.bonusAmount),
      ...(occurredDate&&recordedAt?{occurredDate}:{}),
      ...(recordedAt?{recordedAt}:{}),
      ...(revenueBucket?{revenueBucket}:{})
    };
  });
}
function isMembershipExpiryClearRow(row){
  return row?.type==='冲正'&&row?.category==='会员到期清零';
}
function computeCourtFinance(input){
  const history=normalizeCourtHistory(input.history);
  const allowNegativeBalance=input?.allowNegativeBalance===true;
  if(!history.length){
    return {
      balance:normalizeMoney(input.balance),
      totalDeposit:normalizeMoney(input.totalDeposit),
      spentAmount:normalizeMoney(input.spentAmount),
      receivedAmount:normalizeMoney(input.receivedAmount!=null?input.receivedAmount:input.totalDeposit),
      storedValueSpent:normalizeMoney(input.storedValueSpent),
      directPaidSpent:normalizeMoney(input.directPaidSpent)
    };
  }
  const totals={balance:0,totalDeposit:0,spentAmount:0,receivedAmount:0,storedValueSpent:0,directPaidSpent:0};
  for(const h of history){
    const amount=normalizeMoney(h.amount);
    const bonus=normalizeMoney(h.bonusAmount);
    if(h.type==='消费'&&h.category==='内部占用')continue;
    if(amount<0)throw new Error('流水金额不能小于0');
    if(h.type==='充值'){
      totals.totalDeposit+=amount;
      totals.receivedAmount+=amount;
      totals.balance+=amount+bonus;
      continue;
    }
    if(h.type==='消费'){
      totals.spentAmount+=amount;
      if(isStoredValuePayMethod(h.payMethod)){
        totals.storedValueSpent+=amount;
        totals.balance-=amount;
        if(totals.balance<0&&!allowNegativeBalance)throw new Error('余额不足，不能使用储值扣款');
      }else{
        totals.directPaidSpent+=amount;
        totals.receivedAmount+=amount;
      }
      continue;
    }
    if(h.type==='退款'){
      if(h.payMethod==='储值退款'){
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能退款');
      }
      totals.receivedAmount-=amount;
      if(totals.receivedAmount<0)throw new Error('退款金额超过累计实收');
      continue;
    }
    if(h.type==='冲正'){
      if(isMembershipExpiryClearRow(h)){
        totals.balance-=amount;
        if(totals.balance<0)throw new Error('余额不足，不能执行会员到期清零');
        continue;
      }
      totals.spentAmount-=amount;
      if(totals.spentAmount<0)throw new Error('冲正金额超过累计消费');
      if(isStoredValuePayMethod(h.payMethod)){
        totals.storedValueSpent-=amount;
        if(totals.storedValueSpent<0)throw new Error('冲正金额超过储值扣款消费');
        totals.balance+=amount;
      }else{
        totals.directPaidSpent-=amount;
        if(totals.directPaidSpent<0)throw new Error('冲正金额超过单次支付消费');
        totals.receivedAmount-=amount;
        if(totals.receivedAmount<0)throw new Error('冲正金额超过累计实收');
      }
      continue;
    }
  }
  Object.keys(totals).forEach(k=>{totals[k]=Math.round(totals[k]*100)/100;});
  return totals;
}
function summarizeCourtFinanceRevenue(input){
  const history=normalizeCourtHistory(input?.history||[]);
  const summary={
    storedValueBooking:0,
    onsiteBooking:0,
    proxyBooking:0,
    matchBooking:0,
    internalOccupancyCount:0,
    internalOccupancyAmount:0,
    cashReceived:0,
    confirmedRevenue:0,
    pendingRevenue:0,
    bookingUsageAmount:0,
    paidBookingCount:0
  };
  for(const h of history){
    if(!['消费','退款','冲正'].includes(h.type))continue;
    const amount=normalizeMoney(h.amount);
    if(h.category==='内部占用'){
      if(h.type!=='消费')continue;
      summary.internalOccupancyCount+=1;
      continue;
    }
    if(h.category!=='订场')continue;
    const direction=h.type==='消费'?1:-1;
    const bucket=h.revenueBucket||courtFinanceRevenueBucket(h);
    const signedAmount=amount*direction;
    if(h.type==='消费')summary.paidBookingCount+=1;
    if(h.sourceCategory==='约球订场')summary.matchBooking+=signedAmount;
    if(bucket==='储值扣款')summary.storedValueBooking+=signedAmount;
    else if(bucket==='代用户订场')summary.proxyBooking+=signedAmount;
    else summary.onsiteBooking+=signedAmount;
  }
  summary.cashReceived=summary.onsiteBooking+summary.proxyBooking;
  summary.confirmedRevenue=summary.storedValueBooking+summary.onsiteBooking;
  summary.pendingRevenue=summary.proxyBooking;
  summary.bookingUsageAmount=summary.storedValueBooking+summary.onsiteBooking+summary.proxyBooking;
  Object.keys(summary).forEach(k=>{summary[k]=Math.round(summary[k]*100)/100;});
  return summary;
}
function mergeCourtNotes(targetCourt,sourceCourt){
  const targetNotes=String(targetCourt?.notes||'').trim();
  const sourceNotes=String(sourceCourt?.notes||'').trim();
  const sourceMark=`[合并自 ${sourceCourt?.name||'原用户'} · ${sourceCourt?.id||''}]`;
  if(!sourceNotes)return [targetNotes,sourceMark].filter(Boolean).join('\n');
  return [targetNotes,`${sourceMark} ${sourceNotes}`].filter(Boolean).join('\n');
}
function courtHistorySortKey(row){
  const typeOrder={充值:'0',消费:'1',退款:'2',冲正:'3'};
  return `${String(row?.occurredDate||row?.date||'9999-12-31').slice(0,10)} ${String(row?.startTime||row?.recordedAt||row?.createdAt||'').slice(11,19)} ${typeOrder[row?.type]||'9'} ${String(row?.id||'')}`;
}
function mergeCourtRecords({targetCourt,sourceCourt,membershipAccounts=[],membershipOrders=[],membershipBenefitLedger=[],membershipAccountEvents=[],now=new Date().toISOString()}={}){
  if(!targetCourt?.id||!sourceCourt?.id)throw new Error('请选择要合并的订场用户');
  if(String(targetCourt.id)===String(sourceCourt.id))throw new Error('不能合并到自己');
  const targetActiveAccount=(membershipAccounts||[]).find(row=>String(row.courtId||'')===String(targetCourt.id)&&row.status!=='voided');
  const sourceActiveAccount=(membershipAccounts||[]).find(row=>String(row.courtId||'')===String(sourceCourt.id)&&row.status!=='voided');
  if(targetActiveAccount&&sourceActiveAccount)throw new Error('两个订场用户都已有会员账户，当前暂不支持直接合并，请先处理会员账户');
  const mergedStudentIds=[...new Set([...normalizeStudentIds(targetCourt),...normalizeStudentIds(sourceCourt)])];
  const mergedHistory=[...buildLegacyCourtOpeningHistory(targetCourt),...buildLegacyCourtOpeningHistory(sourceCourt)].sort((a,b)=>courtHistorySortKey(a).localeCompare(courtHistorySortKey(b)));
  const mergedTarget=normalizeCourtRecord({
    ...sourceCourt,
    ...targetCourt,
    id:targetCourt.id,
    name:targetCourt.name||sourceCourt.name||'',
    phone:targetCourt.phone||sourceCourt.phone||'',
    campus:targetCourt.campus||sourceCourt.campus||'',
    joinDate:targetCourt.joinDate||sourceCourt.joinDate||'',
    recentFollowUpDate:targetCourt.recentFollowUpDate||sourceCourt.recentFollowUpDate||'',
    nextFollowUpDate:targetCourt.nextFollowUpDate||sourceCourt.nextFollowUpDate||'',
    owner:targetCourt.owner||sourceCourt.owner||'',
    depositAttitude:targetCourt.depositAttitude||sourceCourt.depositAttitude||'',
    familiarity:targetCourt.familiarity||sourceCourt.familiarity||'',
    notes:mergeCourtNotes(targetCourt,sourceCourt),
    studentId:mergedStudentIds[0]||'',
    studentIds:mergedStudentIds,
    status:'active',
    mergedIntoCourtId:'',
    mergedAt:'',
    deletedAt:'',
    history:mergedHistory,
    updatedAt:now
  },{allowNegativeBalance:true});
  const rewriteCourtLink=row=>({...row,courtId:targetCourt.id,courtName:mergedTarget.name||targetCourt.name||targetCourt.id,phone:mergedTarget.phone||'',studentIds:mergedStudentIds,updatedAt:now});
  return {
    targetCourt:mergedTarget,
    sourceCourt:{...sourceCourt,status:'inactive',mergedIntoCourtId:targetCourt.id,mergedAt:now,updatedAt:now},
    membershipAccounts:(membershipAccounts||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipOrders:(membershipOrders||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipBenefitLedger:(membershipBenefitLedger||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row),
    membershipAccountEvents:(membershipAccountEvents||[]).map(row=>String(row.courtId||'')===String(sourceCourt.id)?rewriteCourtLink(row):row)
  };
}
  function normalizeCourtRecord(input,refs={}){
    const inferredDeposit=extractDepositAmountFromText(input.depositAttitude);
    const normalizedInput={...input,campus:normalizeCampusValue(input.campus)};
  if(inferredDeposit>0&&!normalizeMoney(normalizedInput.totalDeposit))normalizedInput.totalDeposit=inferredDeposit;
  if(inferredDeposit>0&&!hasMoneyValue(input.balance)){
    const spent=normalizeMoney(normalizedInput.spentAmount);
    const total=normalizeMoney(normalizedInput.totalDeposit);
    if(spent>0&&total>0)normalizedInput.balance=Math.max(0,total-spent);
  }
  const currentHistory=normalizeCourtHistory(input.history);
  const history=normalizeCourtBookingHistoryRows(normalizedInput,currentHistory.length?currentHistory:buildLegacyCourtOpeningHistory(normalizedInput)).sort((a,b)=>courtHistorySortKey(a).localeCompare(courtHistorySortKey(b)));
  if(Array.isArray(refs.schedules))assertCourtBookingHistoryAgainstSchedules({...normalizedInput,history},refs.schedules);
  const finance=computeCourtFinance({...normalizedInput,history,allowNegativeBalance:refs.allowNegativeBalance===true});
  const studentIds=normalizeStudentIds(normalizedInput);
  return {
    ...normalizedInput,
    phone:assertPhone(normalizedInput.phone),
    studentId:studentIds[0]||'',
    studentIds,
    history,
    ...finance
  };
}
function buildLegacyCourtOpeningHistory(court){
  const history=normalizeCourtHistory(court?.history);
  if(history.length||!court)return history;
  const total=normalizeMoney(court.totalDeposit);
  const balance=normalizeMoney(court.balance);
  const spent=normalizeMoney(court.spentAmount);
  const date=court.joinDate||new Date().toISOString().slice(0,10);
  const idBase=String(court.id||'legacy');
  const stored=Math.max(0,total-balance);
  const direct=Math.max(0,spent-stored);
  const rows=[];
  if(total>0)rows.push({id:'legacy-deposit-'+idBase,date,type:'充值',category:'历史储值',payMethod:'历史导入',amount:total,note:'期初导入汇总',source:'import'});
  if(stored>0)rows.push({id:'legacy-stored-spent-'+idBase,date,type:'消费',category:'历史消费',payMethod:'储值扣款',amount:stored,note:'期初导入汇总',source:'import'});
  if(direct>0)rows.push({id:'legacy-direct-spent-'+idBase,date,type:'消费',category:'历史消费',payMethod:'历史导入',amount:direct,note:'期初导入汇总',source:'import'});
  return rows;
}
function legacyCourtFinanceWarnings(court){
  const total=normalizeMoney(court?.totalDeposit);
  const balance=normalizeMoney(court?.balance);
  const spent=normalizeMoney(court?.spentAmount);
  const warnings=[];
  if(balance>total)warnings.push('余额大于累计充值');
  if(total-balance>spent)warnings.push('余额减少金额大于累计消费');
  return warnings;
}

  return {
    scheduleStoredValuePaymentAmount,
    resolveScheduleStoredValueCourt,
    buildScheduleStoredValueHistoryRow,
    buildScheduleStoredValueCourtUpdate,
    normalizeStudentIds,
    extractDepositAmountFromText,
    normalizeCourtHistory,
    computeCourtFinance,
    summarizeCourtFinanceRevenue,
    isStoredValuePayMethod,
    mergeCourtRecords,
    normalizeCourtRecord,
    buildLegacyCourtOpeningHistory,
    legacyCourtFinanceWarnings,
    courtHistorySortKey
  };
}

module.exports={createCourtFinanceRules};
