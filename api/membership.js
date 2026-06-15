const DEFAULT_ID_FACTORY=()=>`${Date.now()}-${Math.random().toString(16).slice(2)}`;
function fallbackParseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function fallbackNormalizeMoney(value){const n=Number(value);return Number.isFinite(n)?Math.round(n*100)/100:0;}
function fallbackDateMs(v){if(!v)return NaN;if(v instanceof Date)return v.getTime();return new Date(String(v).replace(' ','T')).getTime();}
function fallbackNormalizeStudentIds(input){const ids=Array.isArray(input?.studentIds)?input.studentIds:(input?.studentId?[input.studentId]:[]);return [...new Set(ids.map(x=>String(x||'').trim()).filter(Boolean))];}

function createMembershipRules(deps={}){
  const uuidv4=deps.uuidv4||DEFAULT_ID_FACTORY;
  const parseArr=deps.parseArr||fallbackParseArr;
  const normalizeMoney=deps.normalizeMoney||fallbackNormalizeMoney;
  const dateMs=deps.dateMs||fallbackDateMs;
  const normalizeStudentIds=deps.normalizeStudentIds||fallbackNormalizeStudentIds;
  const computeCourtFinance=deps.computeCourtFinance||(()=>({balance:0}));
  const withOperationTrace=deps.withOperationTrace||((record)=>record);
  const MEMBERSHIP_TABLES=deps.membershipTables||[];

const MEMBERSHIP_BENEFIT_FIELD_MAP=[
  {field:'publicLessonCount',code:'publicLesson',label:'大师公开课'},
  {field:'stringingLaborCount',code:'stringingLabor',label:'穿线免手工费'},
  {field:'ballMachineCount',code:'ballMachine',label:'发球机免费'},
  {field:'level2PartnerCount',code:'level2Partner',label:'国家二级运动员陪打'},
  {field:'designatedCoachPartnerCount',code:'designatedCoachPartner',label:'指定教练陪打'}
];
function normalizeMembershipBenefitTemplate(input={},fallbackTemplate={}){
  const rawTemplate=input?.benefitTemplate&&typeof input.benefitTemplate==='object'?input.benefitTemplate:{};
  const fallback=fallbackTemplate&&typeof fallbackTemplate==='object'?fallbackTemplate:{};
  const template={};
  MEMBERSHIP_BENEFIT_FIELD_MAP.forEach(({field,code,label})=>{
    const count=parseInt(
      input?.[field]??
      rawTemplate?.[code]?.count??
      fallback?.[code]?.count??
      0
    )||0;
    if(count<=0)return;
    template[code]={
      label,
      unit:'次',
      count
    };
    if(code==='designatedCoachPartner'){
      const designatedCoachIds=[...new Set(parseArr(
        input?.designatedCoachIds??
        rawTemplate?.[code]?.designatedCoachIds??
        fallback?.[code]?.designatedCoachIds
      ).map(x=>String(x||'').trim()).filter(Boolean))];
      if(designatedCoachIds.length)template[code].designatedCoachIds=designatedCoachIds;
    }
  });
  const customBenefits=parseArr(input?.customBenefits??rawTemplate?.customBenefits??fallback?.customBenefits).map(item=>{
    const count=parseInt(item?.count)||0;
    if(count<=0)return null;
    return {
      label:String(item?.label||'').trim()||'自定义权益',
      unit:String(item?.unit||'次').trim()||'次',
      count
    };
  }).filter(Boolean);
  if(customBenefits.length)template.customBenefits=customBenefits;
  return template;
}
function hasMembershipBenefitSnapshot(value){
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;
}
function addMonthsKey(ds,months){
  const [y,m,d0]=String(ds||'').slice(0,10).split('-').map(n=>parseInt(n)||0);
  const d=new Date(Date.UTC(y,m-1,d0));
  d.setUTCMonth(d.getUTCMonth()+(parseInt(months)||0));
  d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}
function buildMembershipPlanRecord(input,opts={}){
  const now=opts.now||new Date().toISOString();
  if(!String(input?.name||'').trim())throw new Error('请填写会员方案名称');
  const rechargeAmount=normalizeMoney(input.rechargeAmount);
  if(rechargeAmount<=0)throw new Error('会员充值金额必须大于 0');
  const discountRate=normalizeMoney(input.discountRate||1);
  if(discountRate<=0||discountRate>1)throw new Error('会员折扣必须在 0 到 1 之间');
  const saleStartDate=String(input.saleStartDate||'').trim();
  const saleEndDate=String(input.saleEndDate||'').trim();
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate)throw new Error('售卖结束日期不能早于售卖开始日期');
  const benefitTemplate=normalizeMembershipBenefitTemplate(input,input?.benefitTemplate);
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    name:String(input.name).trim(),
    tierCode:String(input.tierCode||'').trim(),
    rechargeAmount,
    discountRate,
    bonusAmount:normalizeMoney(input.bonusAmount),
    publicLessonCount:parseInt(input.publicLessonCount??benefitTemplate.publicLesson?.count)||0,
    stringingLaborCount:parseInt(input.stringingLaborCount??benefitTemplate.stringingLabor?.count)||0,
    ballMachineCount:parseInt(input.ballMachineCount??benefitTemplate.ballMachine?.count)||0,
    level2PartnerCount:parseInt(input.level2PartnerCount??benefitTemplate.level2Partner?.count)||0,
    designatedCoachPartnerCount:parseInt(input.designatedCoachPartnerCount??benefitTemplate.designatedCoachPartner?.count)||0,
    designatedCoachIds:parseArr(input.designatedCoachIds??benefitTemplate.designatedCoachPartner?.designatedCoachIds),
    customBenefits:parseArr(input.customBenefits??benefitTemplate.customBenefits),
    benefitTemplate,
    validMonths:parseInt(input.validMonths)||12,
    maxMonths:parseInt(input.maxMonths)||24,
    saleStartDate,
    saleEndDate,
    status:input.status||'draft',
    notes:input.notes||'',
    createdAt:input.createdAt||now,
    updatedAt:now
  };
}
function normalizeMembershipPlanViewRecord(plan){
  if(!plan||typeof plan!=='object')return plan;
  const benefitTemplate=normalizeMembershipBenefitTemplate(plan,plan?.benefitTemplate);
  return {
    ...plan,
    publicLessonCount:parseInt(plan.publicLessonCount??benefitTemplate.publicLesson?.count)||0,
    stringingLaborCount:parseInt(plan.stringingLaborCount??benefitTemplate.stringingLabor?.count)||0,
    ballMachineCount:parseInt(plan.ballMachineCount??benefitTemplate.ballMachine?.count)||0,
    level2PartnerCount:parseInt(plan.level2PartnerCount??benefitTemplate.level2Partner?.count)||0,
    designatedCoachPartnerCount:parseInt(plan.designatedCoachPartnerCount??benefitTemplate.designatedCoachPartner?.count)||0,
    designatedCoachIds:parseArr(plan.designatedCoachIds??benefitTemplate.designatedCoachPartner?.designatedCoachIds),
    customBenefits:parseArr(plan.customBenefits??benefitTemplate.customBenefits),
    benefitTemplate
  };
}
function normalizeMembershipOrderViewRecord(order,plan=null){
  if(!order||typeof order!=='object')return order;
  const normalizedPlan=normalizeMembershipPlanViewRecord(plan||{});
  const planBenefitTemplateSnapshot=normalizeMembershipBenefitTemplate(order?.planBenefitTemplateSnapshot?{benefitTemplate:order.planBenefitTemplateSnapshot}:order,normalizedPlan?.benefitTemplate||{});
  const hasDealSnapshot=hasMembershipBenefitSnapshot(order?.benefitSnapshot)||order?.benefitSnapshotCustomized===true;
  const benefitSnapshot=hasDealSnapshot?normalizeMembershipBenefitTemplate({benefitTemplate:order.benefitSnapshot},{}):normalizeMembershipBenefitTemplate(order,planBenefitTemplateSnapshot);
  const systemAmount=normalizeMoney(order.systemAmount??normalizedPlan.rechargeAmount);
  const finalAmount=normalizeMoney(order.finalAmount??order.rechargeAmount??systemAmount);
  const priceOverridden=order.priceOverridden!==undefined?!!order.priceOverridden:(systemAmount!==finalAmount);
  const overrideReason=String(order.overrideReason||'').trim();
  return {
    ...order,
    priceSource:order.priceSource||'membership_plan',
    priceSourceId:order.priceSourceId||order.membershipPlanId||'',
    priceSourceName:order.priceSourceName||order.membershipPlanName||normalizedPlan.name||'',
    systemAmount,
    finalAmount,
    priceOverridden,
    overrideReason,
    planBenefitTemplateSnapshot,
    benefitSnapshot
  };
}
function membershipDateRange(startDate,validMonths=12,maxMonths=24){
  return {
    cycleStartDate:startDate,
    validUntil:addMonthsKey(startDate,validMonths),
    hardExpireAt:addMonthsKey(startDate,maxMonths)
  };
}
function isMembershipAccountInTerm(account,purchaseDate){
  return account&&['active','extended'].includes(account.status)&&account.validUntil&&purchaseDate<=account.validUntil;
}
function buildMembershipPurchase({court,plan,existingAccount=null,body={},now=new Date().toISOString(),accountId=uuidv4(),orderId=uuidv4(),historyId=uuidv4(),operationTrace=null}){
  if(!court?.id)throw new Error('订场用户不存在');
  if(!plan?.id)throw new Error('会员方案不存在');
  const purchaseDate=body.purchaseDate||now.slice(0,10);
  const systemAmount=normalizeMoney(plan.rechargeAmount);
  const rechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
  const priceOverridden=systemAmount!==rechargeAmount;
  const overrideReason=String(body.overrideReason||'').trim();
  if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
  if(rechargeAmount<=0)throw new Error('会员充值金额必须大于 0');
  const validMonths=parseInt(plan.validMonths)||12;
  const maxMonths=parseInt(plan.maxMonths)||24;
  const oldAccount=existingAccount||null;
  const inTerm=isMembershipAccountInTerm(oldAccount,purchaseDate);
  const lastQualified=normalizeMoney(oldAccount?.lastQualifiedRechargeAmount);
  const qualifiesRenewalReset=!oldAccount||oldAccount.status==='cleared'||(inTerm&&(!lastQualified||rechargeAmount>=lastQualified));
  const range=qualifiesRenewalReset?membershipDateRange(purchaseDate,validMonths,maxMonths):{
    cycleStartDate:oldAccount.cycleStartDate,
    validUntil:oldAccount.validUntil,
    hardExpireAt:oldAccount.hardExpireAt
  };
  const purchaseBenefitTemplate=body.benefitSnapshot||plan.benefitTemplate||{};
  const benefitSnapshotCustomized=body.benefitSnapshotCustomized===true||hasMembershipBenefitSnapshot(body.benefitSnapshot)||MEMBERSHIP_BENEFIT_FIELD_MAP.some(({field})=>body[field]!==undefined&&body[field]!==null&&String(body[field]).trim()!=='');
  const benefitSnapshot=normalizeMembershipBenefitTemplate({
    ...plan,
    ...body,
    publicLessonCount:body.publicLessonCount??purchaseBenefitTemplate.publicLesson?.count??plan.publicLessonCount,
    stringingLaborCount:body.stringingLaborCount??purchaseBenefitTemplate.stringingLabor?.count??plan.stringingLaborCount,
    ballMachineCount:body.ballMachineCount??purchaseBenefitTemplate.ballMachine?.count??plan.ballMachineCount,
    level2PartnerCount:body.level2PartnerCount??purchaseBenefitTemplate.level2Partner?.count??plan.level2PartnerCount,
    designatedCoachPartnerCount:body.designatedCoachPartnerCount??purchaseBenefitTemplate.designatedCoachPartner?.count??plan.designatedCoachPartnerCount,
    benefitTemplate:purchaseBenefitTemplate,
    customBenefits:body.customBenefits??(benefitSnapshotCustomized?[]:(purchaseBenefitTemplate.customBenefits??plan.customBenefits??plan.benefitTemplate?.customBenefits)),
    designatedCoachIds:body.designatedCoachIds??purchaseBenefitTemplate.designatedCoachPartner?.designatedCoachIds??plan.designatedCoachIds
  },plan.benefitTemplate||{});
  const account={
    ...(oldAccount||{}),
    id:oldAccount?.id||accountId,
    courtId:court.id,
    courtName:court.name||court.id,
    phone:court.phone||'',
    studentIds:normalizeStudentIds(court),
    status:'active',
    memberTag:plan.tierCode||'',
    memberLabel:plan.name||'',
    discountRate:normalizeMoney(body.discountRate??plan.discountRate),
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    autoExtended:false,
    lastQualifiedRechargeAmount:qualifiesRenewalReset?rechargeAmount:(oldAccount?.lastQualifiedRechargeAmount||rechargeAmount),
    lastOrderId:orderId,
    notes:body.accountNotes||oldAccount?.notes||'',
    createdAt:oldAccount?.createdAt||now,
    updatedAt:now
  };
  const order={
    id:orderId,
    membershipAccountId:account.id,
    courtId:court.id,
    courtName:court.name||court.id,
    studentIds:normalizeStudentIds(court),
    membershipPlanId:plan.id,
    membershipPlanName:plan.name||'',
    priceSource:'membership_plan',
    priceSourceId:plan.id,
    priceSourceName:plan.name||'',
    systemAmount,
    finalAmount:rechargeAmount,
    priceOverridden,
    overrideReason,
    rechargeAmount,
    bonusAmount:normalizeMoney(body.bonusAmount??plan.bonusAmount),
    discountRate:account.discountRate,
    purchaseDate,
    effectiveDate:body.effectiveDate||purchaseDate,
    cycleStartDate:range.cycleStartDate,
    validUntil:range.validUntil,
    hardExpireAt:range.hardExpireAt,
    qualifiesRenewalReset,
    planBenefitTemplateSnapshot:normalizeMembershipBenefitTemplate(plan,plan.benefitTemplate||{}),
    benefitSnapshot,
    benefitSnapshotCustomized,
    benefitValidUntil:addMonthsKey(purchaseDate,validMonths),
    courtHistoryRechargeId:historyId,
    operator:body.operator||'',
    requestKey:String(body.requestKey||'').trim(),
    status:body.status||'active',
    notes:body.notes||'',
    createdAt:now,
    updatedAt:now
  };
  const historyRow={
    id:historyId,
    date:purchaseDate,
    type:'充值',
    payMethod:body.payMethod||'会员充值',
    category:'会员充值',
    amount:rechargeAmount,
    bonusAmount:order.bonusAmount,
    membershipOrderId:order.id,
    membershipAccountId:account.id,
    membershipPlanId:plan.id,
    membershipPlanName:plan.name||'',
    systemAmount,
    finalAmount:rechargeAmount,
    priceOverridden,
    overrideReason,
    discountRate:account.discountRate,
    originalAmount:0,
    discountedAmount:0,
    note:body.note||`${plan.name||'会员'}开卡/续充`
  };
  const warning=oldAccount&&inTerm&&!qualifiesRenewalReset?'低于原会员档位，已记录充值但不重置会员有效期':'';
  return {
    account:withOperationTrace(account,operationTrace),
    order:withOperationTrace(order,operationTrace),
    historyRow:withOperationTrace(historyRow,operationTrace),
    warning
  };
}
function membershipBenefitItemsFromOrder(order){
  const hasDealSnapshot=hasMembershipBenefitSnapshot(order?.benefitSnapshot)||order?.benefitSnapshotCustomized===true;
  const snap=hasDealSnapshot?normalizeMembershipBenefitTemplate({benefitTemplate:order.benefitSnapshot},{}):normalizeMembershipBenefitTemplate(order,order?.planBenefitTemplateSnapshot||{});
  const items=[];
  Object.entries(snap).forEach(([code,value])=>{
    if(code==='customBenefits')return;
    const count=parseInt(value?.count)||0;
    if(count>0)items.push({membershipOrderId:order.id,membershipAccountId:order.membershipAccountId,courtId:order.courtId,benefitCode:code,benefitLabel:value.label||code,unit:value.unit||'次',total:count,benefitValidUntil:order.benefitValidUntil});
  });
  parseArr(snap.customBenefits).forEach((value,idx)=>{
    const count=parseInt(value?.count)||0;
    if(count>0)items.push({membershipOrderId:order.id,membershipAccountId:order.membershipAccountId,courtId:order.courtId,benefitCode:`custom_${idx+1}`,benefitLabel:value.label||`自定义权益${idx+1}`,unit:value.unit||'次',total:count,benefitValidUntil:order.benefitValidUntil});
  });
  return items;
}
function summarizeMembershipBenefits({orders=[],ledger=[],today=new Date().toISOString().slice(0,10)}={}){
  return (orders||[]).filter(o=>o.status!=='voided'&&o.status!=='refunded').flatMap(order=>membershipBenefitItemsFromOrder(order).map(item=>{
    const rows=(ledger||[]).filter(l=>l.membershipOrderId===item.membershipOrderId&&l.benefitCode===item.benefitCode&&l.action!=='grant');
    const positiveDelta=rows.filter(l=>(parseInt(l.delta)||0)>0).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const negativeDelta=rows.filter(l=>(parseInt(l.delta)||0)<0).reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
    const total=(item.total||0)+positiveDelta;
    const expired=item.benefitValidUntil&&today>item.benefitValidUntil;
    return {...item,total,used:Math.abs(negativeDelta),adjusted:positiveDelta,remaining:expired?0:Math.max(0,total+negativeDelta),status:expired?'expired':'active'};
  }));
}
const STUDENT_BENEFIT_TYPES=[
  {benefitCode:'courtBooking',benefitLabel:'订场',unit:'次'},
  {benefitCode:'ballMachine',benefitLabel:'发球机',unit:'次'}
];
function studentBenefitTypeMeta(benefitCode){
  return STUDENT_BENEFIT_TYPES.find(item=>item.benefitCode===benefitCode)||null;
}
function summarizeStudentBenefits({studentId='',ledger=[]}={}){
  const id=String(studentId||'').trim();
  if(!id)return [];
  return STUDENT_BENEFIT_TYPES.map(type=>{
    const rows=(ledger||[]).filter(row=>String(row?.studentId||'')===id&&row?.benefitCode===type.benefitCode&&row?.action!=='grant');
    const total=rows.filter(row=>(parseInt(row.delta)||0)>0).reduce((sum,row)=>sum+(parseInt(row.delta)||0),0);
    const consumed=Math.abs(rows.filter(row=>(parseInt(row.delta)||0)<0).reduce((sum,row)=>sum+(parseInt(row.delta)||0),0));
    return {...type,total,used:consumed,remaining:Math.max(0,total-consumed)};
  }).filter(row=>row.total>0||row.remaining>0);
}
function buildStudentBenefitLedgerRecord(input,opts={}){
  if(!input?.studentId)throw new Error('学员权益流水必须关联学员');
  const meta=studentBenefitTypeMeta(input.benefitCode);
  if(!meta)throw new Error('学员权益仅支持订场和发球机');
  const delta=parseInt(input.delta)||0;
  if(!delta)throw new Error('权益变动次数不能为 0');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    studentId:String(input.studentId||'').trim(),
    studentName:input.studentName||'',
    benefitCode:meta.benefitCode,
    benefitLabel:input.benefitLabel||meta.benefitLabel,
    unit:input.unit||meta.unit,
    delta,
    action:input.action||(delta<0?'consume':'supplement'),
    reason:input.reason||(delta<0?'学员权益使用':'学员权益赠送'),
    operator:input.operator||'',
    notes:input.notes||'',
    relatedDate:input.relatedDate||opts.now?.slice(0,10)||new Date().toISOString().slice(0,10),
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function buildMembershipGrantLedgerRows(order,opts={}){
  return membershipBenefitItemsFromOrder(order).map(item=>buildMembershipBenefitLedgerRecord({
    membershipOrderId:order.id,
    membershipAccountId:order.membershipAccountId,
    courtId:order.courtId,
    benefitCode:item.benefitCode,
    benefitLabel:item.benefitLabel,
    unit:item.unit,
    delta:item.total,
    action:'grant',
    reason:'开卡/续充赠送权益',
    operator:order.operator||'',
    relatedDate:order.purchaseDate,
    operationId:order.operationId||'',
    batchId:order.batchId||'',
    operationType:order.operationType||'',
    operationAt:order.operationAt||'',
    operationBy:order.operationBy||''
  },{id:opts.idFactory?opts.idFactory():uuidv4(),now:opts.now||new Date().toISOString()}));
}
function isDuplicateMembershipOrderSubmission({courtId,membershipPlanId,purchaseDate,rechargeAmount,requestKey='',recentOrders=[],now=new Date().toISOString()}={}){
  const cleanRequestKey=String(requestKey||'').trim();
  const targetAmount=normalizeMoney(rechargeAmount);
  const nowMs=dateMs(now);
  return (recentOrders||[]).some(order=>{
    if(!order||order.status==='voided'||order.status==='refunded')return false;
    if(cleanRequestKey&&String(order.requestKey||'').trim()&&String(order.requestKey||'').trim()===cleanRequestKey)return true;
    if(String(order.courtId||'')!==String(courtId||''))return false;
    if(String(order.membershipPlanId||'')!==String(membershipPlanId||''))return false;
    if(String(order.purchaseDate||'')!==String(purchaseDate||''))return false;
    if(normalizeMoney(order.rechargeAmount)!==targetAmount)return false;
    const createdMs=dateMs(order.createdAt);
    return Number.isFinite(nowMs)&&Number.isFinite(createdMs)&&Math.abs(nowMs-createdMs)<=15000;
  });
}
function buildMembershipBenefitLedgerRecord(input,opts={}){
  if(!input?.membershipOrderId)throw new Error('会员权益流水必须关联购买批次');
  if(!input?.membershipAccountId)throw new Error('会员权益流水必须关联会员账户');
  if(!input?.courtId)throw new Error('会员权益流水必须关联订场用户');
  if(!input?.benefitCode)throw new Error('请选择会员权益');
  const delta=parseInt(input.delta)||0;
  if(!delta)throw new Error('权益变动次数不能为 0');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    delta,
    benefitLabel:input.benefitLabel||input.benefitCode,
    unit:input.unit||'次',
    action:input.action||(delta<0?'consume':'supplement'),
    reason:input.reason||(delta<0?'会员权益使用':'会员权益补发'),
    operator:input.operator||'',
    notes:input.notes||'',
    relatedDate:input.relatedDate||opts.now?.slice(0,10)||new Date().toISOString().slice(0,10),
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function buildMembershipAccountEventRecord(input,opts={}){
  if(!input?.membershipAccountId)throw new Error('会员账户事件必须关联会员账户');
  if(!input?.courtId)throw new Error('会员账户事件必须关联订场用户');
  if(!input?.eventType)throw new Error('会员账户事件必须包含事件类型');
  return {
    ...input,
    id:opts.id||input.id||uuidv4(),
    operator:input.operator||'',
    reason:input.reason||'',
    createdAt:input.createdAt||opts.now||new Date().toISOString()
  };
}
function allocateMembershipBenefitUsage({membershipAccountId,courtId,benefitCode,benefitLabel='',unit='次',consumeCount,orders=[],ledger=[],today,now=new Date().toISOString(),idFactory=uuidv4,operator='',reason='会员权益使用',relatedDate='',operationTrace=null}={}){
  const need=Math.abs(parseInt(consumeCount)||0);
  if(!membershipAccountId)throw new Error('会员权益流水必须关联会员账户');
  if(!courtId)throw new Error('会员权益流水必须关联订场用户');
  if(!benefitCode)throw new Error('请选择会员权益');
  if(need<=0)throw new Error('权益变动次数不能为 0');
  const currentDay=today||String(relatedDate||now).slice(0,10);
  const batches=summarizeMembershipBenefits({orders,ledger,today:currentDay})
    .filter(item=>item.membershipAccountId===membershipAccountId&&item.courtId===courtId&&item.benefitCode===benefitCode&&item.remaining>0&&item.status!=='expired')
    .sort((a,b)=>{
      const av=String(a.benefitValidUntil||'9999-99-99');
      const bv=String(b.benefitValidUntil||'9999-99-99');
      if(av!==bv)return av.localeCompare(bv);
      return String(a.membershipOrderId||'').localeCompare(String(b.membershipOrderId||''));
    });
  const available=batches.reduce((sum,item)=>sum+(parseInt(item.remaining)||0),0);
  if(available<need)throw new Error('剩余权益不足');
  let remaining=need;
  const rows=[];
  for(const batch of batches){
    if(remaining<=0)break;
    const delta=Math.min(remaining,parseInt(batch.remaining)||0);
    if(delta<=0)continue;
    rows.push(buildMembershipBenefitLedgerRecord({
      membershipOrderId:batch.membershipOrderId,
      membershipAccountId,
      courtId,
      benefitCode,
      benefitLabel:benefitLabel||batch.benefitLabel||benefitCode,
      unit:unit||batch.unit||'次',
      delta:-delta,
      action:'consume',
      reason,
      operator,
      relatedDate:relatedDate||currentDay,
      ...(operationTrace||{})
    },{id:idFactory(),now}));
    remaining-=delta;
  }
  return rows;
}
function reconcileMembershipAccounts({accounts=[],courts=[],today=new Date().toISOString().slice(0,10),now=new Date().toISOString(),eventIdFactory=uuidv4,historyIdFactory=uuidv4}={}){
  const courtMap=new Map((courts||[]).map(c=>[c.id,c]));
  const nextAccounts=[],events=[],historyRows=[];
  for(const account of accounts||[]){
    let next={...account};
    const court=courtMap.get(account.courtId);
    const finance=computeCourtFinance(court||{history:[]});
    const balance=normalizeMoney(finance.balance);
    if(account.hardExpireAt&&today>account.hardExpireAt&&balance>0&&account.status!=='cleared'){
      const event={id:eventIdFactory(),membershipAccountId:account.id,courtId:account.courtId,eventType:'auto_clear',beforeStatus:account.status,afterStatus:'cleared',beforeValidUntil:account.validUntil,afterValidUntil:account.validUntil,operator:'system',reason:'两年到期余额清零',createdAt:now};
      const historyRow={id:historyIdFactory(),date:today,type:'冲正',payMethod:'储值扣款',category:'会员到期清零',amount:balance,membershipAccountId:account.id,note:'两年到期余额清零'};
      next={...next,status:'cleared',updatedAt:now};
      events.push(event);
      historyRows.push(historyRow);
    }else if(account.validUntil&&account.hardExpireAt&&today>account.validUntil&&today<=account.hardExpireAt&&balance>0&&!account.autoExtended&&account.status==='active'){
      const event={id:eventIdFactory(),membershipAccountId:account.id,courtId:account.courtId,eventType:'auto_extend',beforeStatus:account.status,afterStatus:'extended',beforeValidUntil:account.validUntil,afterValidUntil:account.hardExpireAt,operator:'system',reason:'一年期到期仍有余额，自动延续 12 个月',createdAt:now};
      next={...next,status:'extended',autoExtended:true,updatedAt:now};
      events.push(event);
    }
    nextAccounts.push(next);
  }
  return {accounts:nextAccounts,events,historyRows};
}

  return {
    MEMBERSHIP_TABLES,
    MEMBERSHIP_BENEFIT_FIELD_MAP,
    normalizeMembershipBenefitTemplate,
    buildMembershipPlanRecord,
    buildMembershipPurchase,
    summarizeMembershipBenefits,
    isDuplicateMembershipOrderSubmission,
    buildMembershipAccountEventRecord,
    buildMembershipBenefitLedgerRecord,
    buildStudentBenefitLedgerRecord,
    summarizeStudentBenefits,
    buildMembershipGrantLedgerRows,
    allocateMembershipBenefitUsage,
    reconcileMembershipAccounts,
    normalizeMembershipPlanViewRecord,
    normalizeMembershipOrderViewRecord
  };
}

module.exports={createMembershipRules};
