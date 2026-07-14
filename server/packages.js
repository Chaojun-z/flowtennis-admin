const DEFAULT_ID_FACTORY=()=>`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const SMALL_CLASS_TYPES=['single','bootcamp','dropin'];
const PACKAGE_MERGE_CORE_FIELDS=[
  'ownerCoach','courseType','price','lessons','validDays',
  'saleStartDate','saleEndDate','usageStartDate','usageEndDate',
  'dailyTimeWindows','timeBand','coachIds','coachNames','campusIds','maxStudents'
];

function fallbackParseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[];}
function fallbackParseLessonValue(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback;}
function fallbackNormalizeMoney(v){const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:0;}
function packageRefIds(values,parseArr=fallbackParseArr){
  return parseArr(values).map(x=>String(x||'').trim()).filter(Boolean);
}
const PACKAGE_CAMPUS_ALIASES={shunyi_mapo:'shunyi_mapo','顺义马坡':'shunyi_mapo','马坡':'shunyi_mapo'};
PACKAGE_CAMPUS_ALIASES[['ma','bao'].join('')]='shunyi_mapo';
PACKAGE_CAMPUS_ALIASES[['马','宝'].join('')]='shunyi_mapo';
function normalizePackageCampusValue(value){
  const raw=String(value||'').trim();
  return PACKAGE_CAMPUS_ALIASES[raw]||raw;
}
function stableRuleValue(value,parseArr=fallbackParseArr){
  if(Array.isArray(value))return JSON.stringify(value.map(v=>stableRuleValue(v,parseArr)));
  if(value&&typeof value==='object'){
    return JSON.stringify(Object.keys(value).sort().reduce((acc,k)=>{acc[k]=stableRuleValue(value[k],parseArr);return acc;},{}));
  }
  const arr=parseArr(value);
  if(arr.length)return JSON.stringify(arr.map(v=>stableRuleValue(v,parseArr)));
  return String(value??'');
}
function changedCoreFields(oldRec,nextRec,fields,parseArr=fallbackParseArr){
  return fields.filter(k=>stableRuleValue(oldRec?.[k],parseArr)!==stableRuleValue(nextRec?.[k],parseArr));
}
function createPackageRules(deps={}){
  const uuidv4=deps.uuidv4||DEFAULT_ID_FACTORY;
  const parseArr=deps.parseArr||fallbackParseArr;
  const parseLessonValue=deps.parseLessonValue||fallbackParseLessonValue;
  const normalizeMoney=deps.normalizeMoney||fallbackNormalizeMoney;
  const dateKey=deps.dateKey||((value)=>String(value||'').slice(0,10));
  const isSmallGroupCourse=deps.isSmallGroupCourse||(()=>false);
  const smallGroupRuleSnapshot=deps.smallGroupRuleSnapshot||(()=>({}));
  const withOperationTrace=deps.withOperationTrace||((record)=>record);

  function buildEntitlementFromPurchase(pkg,purchase,student,id=uuidv4(),now=new Date().toISOString()){
    const purchaseDate=purchase.purchaseDate||now.slice(0,10);
    const baseLessons=parseLessonValue(pkg.lessons??pkg.totalLessons,0);
    const giftLessons=parseLessonValue(purchase.giftLessons,0);
    const totalLessons=parseLessonValue(purchase.totalLessons,baseLessons+giftLessons);
    const packageCoaches=packageRefIds(pkg.allowedCoaches||pkg.coachNames,parseArr);
    const rec={
      id,
      studentId:purchase.studentId||student?.id||'',
      studentName:purchase.studentName||student?.name||purchase.studentId||'',
      purchaseId:purchase.id||'',
      packageId:pkg.id||purchase.packageId||'',
      packageName:pkg.name||purchase.packageName||'',
      productId:pkg.productId||'',
      productName:pkg.productName||'',
      courseType:pkg.courseType||pkg.type||'',
      totalLessons,
      usedLessons:0,
      remainingLessons:totalLessons,
      validFrom:purchaseDate,
      validUntil:'',
      usageStartDate:pkg.usageStartDate||purchaseDate,
      usageEndDate:'',
      dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
      timeBand:pkg.timeBand||'',
      coachIds:parseArr(pkg.coachIds),
      coachNames:parseArr(pkg.coachNames),
      ownerCoach:purchase.ownerCoach||pkg.ownerCoach||'',
      allowedCoaches:parseArr(purchase.allowedCoaches||packageCoaches),
      campusIds:parseArr(pkg.campusIds),
      maxStudents:parseInt(pkg.maxStudents)||0,
      status:'active',
      createdAt:now,
      updatedAt:now
    };
    if(giftLessons>0){
      rec.basePackageLessons=baseLessons;
      rec.giftLessons=giftLessons;
      rec.giftReason=String(purchase.giftReason||'').trim();
    }
    if(rec.courseType==='体验课'&&pkg.experienceType)rec.experienceType=pkg.experienceType;
    if(isSmallGroupCourse(rec)){
      Object.assign(rec,smallGroupRuleSnapshot({...pkg,...purchase,courseType:rec.courseType}));
      rec.freeAbsenceUsed=parseInt(purchase.freeAbsenceUsed??pkg.freeAbsenceUsed??0)||0;
    }
    return withOperationTrace(rec,purchase);
  }
  function buildPurchaseRecord(pkg,body,student,opts={}){
    const now=opts.now||new Date().toISOString();
    const purchaseDate=body.purchaseDate||now.slice(0,10);
    const systemAmount=normalizeMoney(pkg.price);
    const finalAmount=normalizeMoney(body.amountPaid??pkg.price);
    const priceOverridden=systemAmount!==finalAmount;
    const overrideReason=String(body.overrideReason||'').trim();
    if(priceOverridden&&!overrideReason)throw new Error('请填写改价原因');
    const packageCoaches=packageRefIds(pkg.allowedCoaches||pkg.coachNames,parseArr);
    const packageLessons=parseLessonValue(pkg.lessons,0);
    const giftLessons=Math.max(0,parseLessonValue(body.giftLessons,0));
    const totalLessons=packageLessons+giftLessons;
    const courtBookingGiftCount=Math.max(0,parseInt(body.courtBookingGiftCount)||0);
    const ballMachineGiftCount=Math.max(0,parseInt(body.ballMachineGiftCount)||0);
    const rec={
      ...body,
      id:opts.id||body.id||uuidv4(),
      studentId:student.id,
      studentName:student.name||student.id,
      studentPhone:student.phone||'',
      packageId:pkg.id,
      packageName:pkg.name||'',
      productId:pkg.productId||'',
      productName:pkg.productName||'',
      courseType:pkg.courseType||pkg.type||'',
      packageLessons,
      packagePrice:normalizeMoney(pkg.price),
      priceSource:'package',
      priceSourceId:pkg.id,
      priceSourceName:pkg.name||'',
      systemAmount,
      finalAmount,
      priceOverridden,
      overrideReason,
      packageTimeBand:pkg.timeBand||'',
      dailyTimeWindows:parseArr(pkg.dailyTimeWindows),
      coachIds:parseArr(pkg.coachIds),
      coachNames:parseArr(pkg.coachNames),
      ownerCoach:body.ownerCoach||pkg.ownerCoach||'',
      allowedCoaches:parseArr(body.allowedCoaches||packageCoaches),
      campusIds:parseArr(pkg.campusIds),
      usageStartDate:pkg.usageStartDate||'',
      usageEndDate:pkg.usageEndDate||'',
      purchaseDate,
      amountPaid:finalAmount,
      payMethod:body.payMethod||'',
      operator:opts.operator||body.operator||'',
      status:body.status||'active',
      createdAt:body.createdAt||now,
      updatedAt:now
    };
    if(giftLessons>0){
      rec.giftLessons=giftLessons;
      rec.totalLessons=totalLessons;
      rec.giftReason=String(body.giftReason||'').trim();
    }else{
      delete rec.giftLessons;
      delete rec.totalLessons;
      delete rec.giftReason;
    }
    if(courtBookingGiftCount>0)rec.courtBookingGiftCount=courtBookingGiftCount;else delete rec.courtBookingGiftCount;
    if(ballMachineGiftCount>0)rec.ballMachineGiftCount=ballMachineGiftCount;else delete rec.ballMachineGiftCount;
    if(rec.courseType==='体验课'&&pkg.experienceType)rec.experienceType=pkg.experienceType;
    if(isSmallGroupCourse(rec))Object.assign(rec,smallGroupRuleSnapshot({...pkg,courseType:rec.courseType}));
    return withOperationTrace(rec,opts.operationTrace);
  }
  function validateProductInput(product){
    if(!String(product?.name||'').trim())throw new Error('请填写课程名称');
    if(!String(product?.type||'').trim())throw new Error('请选择课程类型');
    if((parseInt(product?.maxStudents)||0)<=0)throw new Error('人数必须大于 0');
    if(normalizeMoney(product?.price)<0)throw new Error('价格不能小于 0');
    if((parseInt(product?.lessons)||0)<0)throw new Error('课时不能小于 0');
  }
  function normalizeProductRecord(input,old=null,now=new Date().toISOString()){
    const base={...(old||{}),...(input||{})};
    const r={
      ...base,
      name:String(base.name||'').trim(),
      type:String(base.type||'').trim(),
      maxStudents:parseInt(base.maxStudents)||0,
      price:normalizeMoney(base.price),
      lessons:parseInt(base.lessons)||0,
      notes:String(base.notes||'').trim(),
      updatedAt:now
    };
    validateProductInput(r);
    return r;
  }
  function validatePackageInput(pkg,refs={}){
    if(!String(pkg?.name||'').trim())throw new Error('请填写课包名称');
    if(!String(pkg?.courseType||pkg?.type||'').trim())throw new Error('请填写课程类型');
    if(pkg?.productId&&refs.products&&!(refs.products||[]).some(p=>p.id===pkg.productId))throw new Error('课程产品不存在');
    if((parseInt(pkg.lessons)||0)<=0)throw new Error('课时必须大于 0');
    if(normalizeMoney(pkg.price)<=0)throw new Error('价格必须大于 0');
    if((parseInt(pkg.maxStudents)||0)<=0)throw new Error('人数限制必须大于 0');
    if(isSmallGroupCourse(pkg)){
      const rule=smallGroupRuleSnapshot(pkg);
      if(!SMALL_CLASS_TYPES.includes(rule.smallClassType))throw new Error('请选择小班课类型');
      if(rule.smallClassType==='single'&&(parseInt(pkg.lessons)||0)!==1)throw new Error('小班单次必须是 1 次');
      if(rule.smallClassType==='bootcamp'){
        if(String(pkg.timeBand||'')!=='黄金时段')throw new Error('训练营必须是黄金时段');
      }
    }
    if(pkg.saleStartDate&&pkg.saleEndDate&&pkg.saleEndDate<pkg.saleStartDate)throw new Error('活动结束时间不能早于活动开始时间');
    if(pkg.usageStartDate&&pkg.usageEndDate&&pkg.usageEndDate<pkg.usageStartDate)throw new Error('可用结束时间不能早于可用开始时间');
    for(const w of parseArr(pkg.dailyTimeWindows)){
      if((w.startTime&&!w.endTime)||(!w.startTime&&w.endTime))throw new Error('可用时段请填写完整');
      if(w.startTime&&w.endTime&&w.endTime<=w.startTime)throw new Error('可用结束时间必须晚于开始时间');
    }
    const coachIds=packageRefIds(pkg.coachIds,parseArr);
    if(refs.coaches&&coachIds.length){
      const ok=new Set((refs.coaches||[]).flatMap(c=>[c.id,c.name]).filter(Boolean).map(String));
      if(coachIds.some(id=>!ok.has(String(id))))throw new Error('可用教练不存在');
    }
    const ownerCoach=String(pkg.ownerCoach||'').trim();
    if(refs.coaches&&ownerCoach){
      const ok=new Set((refs.coaches||[]).flatMap(c=>[c.id,c.name]).filter(Boolean).map(String));
      parseArr(refs.legacyCoachNames).forEach(name=>ok.add(String(name)));
      if(!ok.has(ownerCoach))throw new Error('主归属教练不存在');
    }
    const campusIds=packageRefIds(pkg.campusIds,parseArr);
    if(refs.campuses&&campusIds.length){
      const ok=new Set((refs.campuses||[]).flatMap(c=>[c.id,c.code,c.name]).filter(Boolean).map(normalizePackageCampusValue));
      if(campusIds.some(id=>!ok.has(normalizePackageCampusValue(id))))throw new Error('可用校区不存在');
    }
  }
  function normalizePackageRecord(input,old=null,refs={},now=new Date().toISOString()){
    const base={...(old||{}),...(input||{})};
    const r={
      ...base,
      productId:String(base.productId||'').trim(),
      productName:String(base.productName||'').trim(),
      courseType:String(base.courseType||base.type||'').trim(),
      lessons:parseInt(base.lessons)||0,
      price:normalizeMoney(base.price),
      validDays:0,
      validUntil:'',
      usageEndDate:'',
      maxStudents:parseInt(base.maxStudents)||0,
      status:base.status||'active',
      updatedAt:now
    };
    if(isSmallGroupCourse(r))Object.assign(r,smallGroupRuleSnapshot(base));
    validatePackageInput(r,refs);
    return r;
  }
  function packageEntitlementValidity(nextPackage,entitlement={},purchase={}){
    const validFrom=entitlement.validFrom||purchase.purchaseDate||dateKey(entitlement.createdAt)||'';
    return {
      validFrom,
      validUntil:'',
      usageStartDate:nextPackage.usageStartDate||validFrom,
      usageEndDate:''
    };
  }
  function syncSoldPackageRuleSnapshots(nextPackage,purchases=[],entitlements=[],now=new Date().toISOString()){
    const packageId=String(nextPackage?.id||'');
    const purchaseById=new Map((purchases||[]).map(p=>[String(p.id||''),p]));
    const purchaseUpdates=(purchases||[]).filter(p=>String(p.packageId||'')===packageId&&p.status!=='voided').map(p=>{
      const baseLessons=parseLessonValue(nextPackage.lessons);
      const giftLessons=parseLessonValue(p.giftLessons);
      const next={...p,courseType:nextPackage.courseType||nextPackage.type||'',packageLessons:baseLessons,totalLessons:baseLessons+giftLessons,packagePrice:normalizeMoney(nextPackage.price),systemAmount:normalizeMoney(nextPackage.price),packageTimeBand:nextPackage.timeBand||'',dailyTimeWindows:parseArr(nextPackage.dailyTimeWindows),ownerCoach:nextPackage.ownerCoach||'',validDays:0,saleStartDate:nextPackage.saleStartDate||'',saleEndDate:nextPackage.saleEndDate||'',usageStartDate:nextPackage.usageStartDate||'',usageEndDate:'',updatedAt:now};
      if(!giftLessons)delete next.totalLessons;
      if(next.courseType==='体验课'&&nextPackage.experienceType)next.experienceType=nextPackage.experienceType;else delete next.experienceType;
      if(isSmallGroupCourse(next))Object.assign(next,smallGroupRuleSnapshot({...nextPackage,courseType:next.courseType}));
      return next;
    });
    const entitlementUpdates=(entitlements||[]).filter(e=>String(e.packageId||'')===packageId&&e.status!=='voided').map(e=>{
      const validity=packageEntitlementValidity(nextPackage,e,purchaseById.get(String(e.purchaseId||''))||{});
      const purchase=purchaseById.get(String(e.purchaseId||''))||{};
      const totalLessons=parseLessonValue(nextPackage.lessons)+parseLessonValue(purchase.giftLessons);
      const usedLessons=parseLessonValue(e.usedLessons,Math.max(0,parseLessonValue(e.totalLessons)-parseLessonValue(e.remainingLessons)));
      const remainingLessons=Math.max(0,totalLessons-usedLessons);
      const next={...e,courseType:nextPackage.courseType||nextPackage.type||'',totalLessons,usedLessons,remainingLessons,timeBand:nextPackage.timeBand||'',dailyTimeWindows:parseArr(nextPackage.dailyTimeWindows),ownerCoach:nextPackage.ownerCoach||'',...validity,status:remainingLessons<=0?'depleted':'active',updatedAt:now};
      if(parseLessonValue(purchase.giftLessons)>0){
        next.basePackageLessons=parseLessonValue(nextPackage.lessons);
        next.giftLessons=parseLessonValue(purchase.giftLessons);
        next.giftReason=String(purchase.giftReason||'').trim();
      }else{
        delete next.basePackageLessons;
        delete next.giftLessons;
        delete next.giftReason;
      }
      if(next.courseType==='体验课'&&nextPackage.experienceType)next.experienceType=nextPackage.experienceType;else delete next.experienceType;
      if(isSmallGroupCourse(next))Object.assign(next,smallGroupRuleSnapshot({...nextPackage,courseType:next.courseType}));
      return next;
    });
    return {purchases:purchaseUpdates,entitlements:entitlementUpdates};
  }
  function assertCanEditPackageWithPurchases(){return;}
  function buildPackageDeactivateUpdate(oldPackage,input={},now=new Date().toISOString()){
    if(!oldPackage||String(input.status||'')!=='inactive'||String(oldPackage.status||'active')==='inactive')return null;
    return {...oldPackage,status:'inactive',updatedAt:now};
  }
  function assertCanMergePackages(masterPackage,sourcePackage){
    if(!masterPackage||!sourcePackage)throw new Error('课包不存在');
    if(String(masterPackage.id||'')===String(sourcePackage.id||''))throw new Error('请选择两个不同课包');
    if(String(masterPackage.status||'active')==='merged')throw new Error('保留课包已被合并，不能作为主课包');
    if(String(sourcePackage.status||'active')==='merged')throw new Error('并入课包已被合并');
    const changed=changedCoreFields(masterPackage,sourcePackage,PACKAGE_MERGE_CORE_FIELDS,parseArr);
    if(changed.length)throw new Error('课包规则不一致，不能合并');
  }
  function mergeDisplayTrace(row,masterPackage,sourcePackage,now){
    const originalPackageId=row.originalPackageId||sourcePackage.id||row.packageId||'';
    const originalPackageName=row.originalPackageName||sourcePackage.name||row.packageName||'';
    return {...row,packageId:masterPackage.id,packageName:masterPackage.name||'',originalPackageId,originalPackageName,packageMergedAt:now,updatedAt:now};
  }
  function buildPackageMergeUpdates({masterPackage,sourcePackage,purchases=[],entitlements=[],schedules=[],now=new Date().toISOString(),operator=''}){
    assertCanMergePackages(masterPackage,sourcePackage);
    const sourceId=String(sourcePackage.id||'');
    const masterName=masterPackage.name||'';
    const nextPurchases=(purchases||[]).filter(row=>String(row.packageId||'')===sourceId).map(row=>({...mergeDisplayTrace(row,masterPackage,sourcePackage,now),priceSourceId:String(row.priceSourceId||'')===sourceId?masterPackage.id:row.priceSourceId,priceSourceName:String(row.priceSourceId||'')===sourceId||String(row.priceSourceName||'')===String(sourcePackage.name||'')?masterName:row.priceSourceName}));
    const nextEntitlements=(entitlements||[]).filter(row=>String(row.packageId||'')===sourceId).map(row=>mergeDisplayTrace(row,masterPackage,sourcePackage,now));
    const purchaseIds=new Set(nextPurchases.map(row=>row.id).filter(Boolean));
    const entitlementIds=new Set(nextEntitlements.map(row=>row.id).filter(Boolean));
    const nextSchedules=(schedules||[]).filter(row=>{
      if(row.packageId&&String(row.packageId)===sourceId)return true;
      if(row.purchaseId&&purchaseIds.has(row.purchaseId))return true;
      if(row.entitlementId&&entitlementIds.has(row.entitlementId))return true;
      return parseArr(row.entitlementIds).some(id=>entitlementIds.has(id));
    }).map(row=>({...row,packageName:masterName,originalPackageId:row.originalPackageId||sourcePackage.id||row.packageId||'',originalPackageName:row.originalPackageName||sourcePackage.name||row.packageName||'',packageMergedAt:now,updatedAt:now}));
    return {sourcePackage:{...sourcePackage,status:'merged',mergedIntoPackageId:masterPackage.id,mergedIntoPackageName:masterName,mergedAt:now,mergedBy:operator||'',updatedAt:now},purchases:nextPurchases,entitlements:nextEntitlements,schedules:nextSchedules};
  }
  function assertCanEditPurchaseWithLedger(oldPurchase,nextPurchase,entitlements=[],ledger=[]){
    if(!oldPurchase||!nextPurchase)return;
    const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===oldPurchase.id).map(e=>e.id));
    if(!(ledger||[]).some(l=>entitlementIds.has(l.entitlementId)))return;
    const changed=Object.keys({...oldPurchase,...nextPurchase}).filter(k=>!['notes','updatedAt'].includes(k)&&stableRuleValue(oldPurchase[k],parseArr)!==stableRuleValue(nextPurchase[k],parseArr));
    if(changed.length)throw new Error('该购买已有课时消耗，只能修改备注');
  }
  function purchaseHasEntitlementLedger(purchaseId,entitlements=[],ledger=[]){
    const entitlementIds=new Set((entitlements||[]).filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
    return (ledger||[]).some(l=>entitlementIds.has(l.entitlementId));
  }
  function validatePurchaseInputForPackage(pkg,purchase,{isEdit=false,oldPackageId=''}={}){
    if(!pkg)throw new Error('售卖课包不存在');
    const samePackage=isEdit&&String(pkg.id||'')===String(oldPackageId||'');
    if(pkg.status&&pkg.status!=='active'&&!samePackage)throw new Error('该课包已停用');
    const purchaseDate=purchase?.purchaseDate||new Date().toISOString().slice(0,10);
    if(pkg.saleStartDate&&purchaseDate<pkg.saleStartDate)throw new Error('不在课包活动购买时间内');
    if(pkg.saleEndDate&&purchaseDate>pkg.saleEndDate)throw new Error('不在课包活动购买时间内');
  }
  function syncEntitlementFromPurchase(pkg,purchase,student,oldEnt,now=new Date().toISOString()){
    const used=parseLessonValue(oldEnt?.usedLessons);
    const next=buildEntitlementFromPurchase(pkg,purchase,student,oldEnt?.id||uuidv4(),now);
    if(oldEnt?.createdAt)next.createdAt=oldEnt.createdAt;
    next.usedLessons=used;
    if(isSmallGroupCourse(next))next.freeAbsenceUsed=parseInt(oldEnt?.freeAbsenceUsed)||0;
    next.remainingLessons=parseLessonValue(next.totalLessons)-used;
    if(next.remainingLessons<0)throw new Error('该购买记录已有消耗，不能改成课时不足的课包');
    next.status=oldEnt?.status==='voided'?'voided':(next.remainingLessons<=0?'depleted':'active');
    return next;
  }

  return {
    buildEntitlementFromPurchase,
    buildPurchaseRecord,
    validateProductInput,
    normalizeProductRecord,
    validatePackageInput,
    normalizePackageRecord,
    stableRuleValue:(value)=>stableRuleValue(value,parseArr),
    changedCoreFields:(oldRec,nextRec,fields)=>changedCoreFields(oldRec,nextRec,fields,parseArr),
    syncSoldPackageRuleSnapshots,
    assertCanEditPackageWithPurchases,
    buildPackageDeactivateUpdate,
    assertCanMergePackages,
    buildPackageMergeUpdates,
    assertCanEditPurchaseWithLedger,
    purchaseHasEntitlementLedger,
    validatePurchaseInputForPackage,
    syncEntitlementFromPurchase
  };
}

module.exports={createPackageRules};
