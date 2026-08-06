function restoreEditingScheduleEntitlementRowsForRecommendation(entitlements=[],schedule={},currentSchedule=null,helpers={}){
  const scheduleId=String(schedule?.scheduleId||schedule?.id||'').trim();
  if(!scheduleId||!currentSchedule||String(currentSchedule.id||'').trim()!==scheduleId)return entitlements||[];
  const parseLesson=typeof helpers.parseLessonValue==='function'?helpers.parseLessonValue:v=>{
    const n=Number(v);
    return Number.isFinite(n)?n:0;
  };
  const collectDeltas=typeof helpers.scheduleEntitlementDeltas==='function'?helpers.scheduleEntitlementDeltas:()=>[];
  const rows=new Map((entitlements||[]).filter(Boolean).map(row=>[String(row.id||''),row]));
  collectDeltas(currentSchedule).forEach(delta=>{
    const id=String(delta.entitlementId||'').trim();
    if(!id||!rows.has(id))return;
    const ent=rows.get(id);
    rows.set(id,{...ent,status:ent.status==='voided'?'voided':'active',remainingLessons:parseLesson(ent.remainingLessons)+parseLesson(delta.delta)});
  });
  return [...rows.values()];
}

function normalizePurchaseBusinessKey(value){
  return String(value||'').trim().slice(0,512);
}

function purchaseBusinessKey(row={}){
  return normalizePurchaseBusinessKey(row.businessKey||row.sourceBusinessKey||row.idempotencyKey);
}

function createPurchaseEntitlementRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,getCachedRow,get,scan,put,del,mkTable,filterLoadAllForUser,uuidv4,
    isCampusScopedAdmin,parseArr,parseLessonValue,scheduleEntitlementDeltas,buildCoachRefs,buildOperationTrace,withOperationTrace,
    normalizeEntitlementLedgerRowsForDetailView,getIndexedActiveEntitlementsForStudents,recommendEntitlements,
    validateManualEntitlementAdjustment,applyEntitlementLessonDelta,buildManualEntitlementLedgerRecord,buildStudentBenefitLedgerRecord,
    assertCanDeleteEntitlement,syncStudentActiveEntitlementIndexes,writePurchaseAndEntitlementAtomic,
    buildEntitlementFromPurchase,buildPurchaseRecord,assertCanEditPurchaseWithLedger,purchaseHasEntitlementLedger,normalizePurchasePayMethod,
    validatePurchaseInputForPackage,syncEntitlementFromPurchase,assertCanVoidPurchase,
    T_PURCHASES,T_PACKAGES,T_STUDENTS,T_ENTITLEMENTS,T_ENTITLEMENT_AUTHORIZATIONS,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_BENEFIT_LEDGER,T_SCHEDULE,T_CLASSES,T_COACHES,T_USERS
  }=deps;
  const nextUuid=typeof uuidv4==='function'
    ? ()=>uuidv4()
    : ()=>require('crypto').randomUUID();

  function authorizationIsActive(row={},date=''){
    if(String(row.status||'active')!=='active')return false;
    const day=String(date||'').slice(0,10);
    if(row.validFrom&&day&&day<String(row.validFrom).slice(0,10))return false;
    if(row.validUntil&&day&&day>String(row.validUntil).slice(0,10))return false;
    return true;
  }
  function entitlementAuthorizationTableMissing(error){
    return /OTSObjectNotExist|Requested table does not exist/i.test(String(error?.message||error||''));
  }
  function buildEntitlementAuthorizationMirror(auth={},enabled=true){
    return {
      isAuthorizedUse:!!enabled,
      authorizationId:String(auth.id||'').trim(),
      authorizationStatus:enabled?'active':String(auth.status||'disabled')||'disabled',
      authorizationValidFrom:String(auth.validFrom||'').slice(0,10),
      authorizationValidUntil:String(auth.validUntil||'').slice(0,10),
      authorizationNotes:String(auth.notes||'').trim(),
      authorizationCreatedBy:String(auth.createdBy||'').trim(),
      authorizationCreatedAt:String(auth.createdAt||'').trim(),
      authorizationUpdatedAt:String(auth.updatedAt||'').trim(),
      packageOwnerStudentId:String(auth.ownerStudentId||'').trim(),
      packageOwnerStudentName:String(auth.ownerStudentName||'').trim(),
      authorizedStudentId:String(auth.authorizedStudentId||'').trim(),
      authorizedStudentName:String(auth.authorizedStudentName||'').trim(),
      usedByStudentId:String(auth.authorizedStudentId||'').trim(),
      usedByStudentName:String(auth.authorizedStudentName||'').trim()
    };
  }
  function buildInlineAuthorizationRow(entitlement={}){
    const authorizationId=String(entitlement.authorizationId||'').trim();
    if(!authorizationId)return null;
    return {
      id:authorizationId,
      entitlementId:String(entitlement.id||'').trim(),
      purchaseId:String(entitlement.purchaseId||'').trim(),
      packageName:String(entitlement.packageName||'').trim(),
      ownerStudentId:String(entitlement.packageOwnerStudentId||entitlement.studentId||'').trim(),
      ownerStudentName:String(entitlement.packageOwnerStudentName||entitlement.studentName||'').trim(),
      authorizedStudentId:String(entitlement.authorizedStudentId||entitlement.usedByStudentId||'').trim(),
      authorizedStudentName:String(entitlement.authorizedStudentName||entitlement.usedByStudentName||'').trim(),
      status:String(entitlement.authorizationStatus||'').trim()||((entitlement.isAuthorizedUse===false||entitlement.isAuthorizedUse==='false')?'disabled':'active'),
      validFrom:String(entitlement.authorizationValidFrom||'').slice(0,10),
      validUntil:String(entitlement.authorizationValidUntil||'').slice(0,10),
      notes:String(entitlement.authorizationNotes||'').trim(),
      createdBy:String(entitlement.authorizationCreatedBy||'').trim(),
      createdAt:String(entitlement.authorizationCreatedAt||entitlement.updatedAt||'').trim(),
      updatedAt:String(entitlement.authorizationUpdatedAt||entitlement.updatedAt||'').trim()
    };
  }
  async function loadAuthorizationRows(){
    const [tableRows,entitlements]=await Promise.all([
      getCachedScan(T_ENTITLEMENT_AUTHORIZATIONS).catch(()=>[]),
      getCachedScan(T_ENTITLEMENTS).catch(()=>[])
    ]);
    const rows=[...(tableRows||[])];
    const seen=new Set(rows.map(row=>String(row.id||'').trim()).filter(Boolean));
    (entitlements||[]).forEach(ent=>{
      const row=buildInlineAuthorizationRow(ent);
      if(!row||seen.has(String(row.id||'').trim()))return;
      rows.push(row);
      seen.add(String(row.id||'').trim());
    });
    return rows;
  }
  async function ensureEntitlementAuthorizationTable(){
    if(typeof mkTable==='function'&&T_ENTITLEMENT_AUTHORIZATIONS)await mkTable(T_ENTITLEMENT_AUTHORIZATIONS);
  }
  async function putEntitlementAuthorization(row){
    try{
      return await put(T_ENTITLEMENT_AUTHORIZATIONS,row.id,row);
    }catch(error){
      if(!entitlementAuthorizationTableMissing(error))throw error;
      await ensureEntitlementAuthorizationTable();
      return put(T_ENTITLEMENT_AUTHORIZATIONS,row.id,row);
    }
  }
  async function saveEntitlementAuthorizationMirror(row,enabled=true){
    const entitlementId=String(row?.entitlementId||'').trim();
    if(!entitlementId)return null;
    const entitlement=await getCachedRow(T_ENTITLEMENTS,entitlementId).catch(()=>null);
    if(!entitlement)return null;
    const next={...entitlement,...buildEntitlementAuthorizationMirror(row,enabled)};
    await put(T_ENTITLEMENTS,entitlementId,next);
    return next;
  }
  function decorateAuthorizedEntitlement(ent={},auth={}){
    return {
      ...ent,
      isAuthorizedUse:true,
      authorizationId:auth.id||'',
      packageOwnerStudentId:auth.ownerStudentId||ent.studentId||'',
      packageOwnerStudentName:auth.ownerStudentName||ent.studentName||'',
      authorizedStudentId:auth.authorizedStudentId||'',
      authorizedStudentName:auth.authorizedStudentName||'',
      usedByStudentId:auth.authorizedStudentId||'',
      usedByStudentName:auth.authorizedStudentName||''
    };
  }
  async function authorizedRecommendationEntitlements(studentIds=[],date=''){
    if(!T_ENTITLEMENT_AUTHORIZATIONS)return [];
    const ids=new Set(parseArr(studentIds).map(String).filter(Boolean));
    if(!ids.size)return [];
    const authorizations=(await loadAuthorizationRows())
      .filter(row=>ids.has(String(row.authorizedStudentId||''))&&authorizationIsActive(row,date));
    const entitlementIds=[...new Set(authorizations.map(row=>String(row.entitlementId||'')).filter(Boolean))];
    if(!entitlementIds.length)return [];
    const rows=(await Promise.all(entitlementIds.map(id=>getCachedRow(T_ENTITLEMENTS,id).catch(()=>null)))).filter(Boolean);
    const byId=new Map(rows.map(row=>[String(row.id||''),row]));
    return authorizations.map(auth=>{
      const ent=byId.get(String(auth.entitlementId||''));
      return ent?decorateAuthorizedEntitlement(ent,auth):null;
    }).filter(Boolean);
  }

  function buildPurchaseGiftBenefitRows({purchase,student,user,operationTrace,now,idFactory}={}){
    const giftTypes=[
      {field:'courtBookingGiftCount',benefitCode:'courtBooking',benefitLabel:'订场'},
      {field:'ballMachineGiftCount',benefitCode:'ballMachine',benefitLabel:'发球机'}
    ];
    return giftTypes.map(type=>{
      const count=Math.max(0,parseInt(purchase?.[type.field])||0);
      if(!count)return null;
      return buildStudentBenefitLedgerRecord({
        studentId:purchase.studentId||student?.id||'',
        studentName:purchase.studentName||student?.name||'',
        benefitCode:type.benefitCode,
        benefitLabel:type.benefitLabel,
        unit:'次',
        delta:count,
        action:'supplement',
        reason:purchase.giftReason||'课包购买赠送权益',
        relatedDate:purchase.purchaseDate,
        operator:user?.name||purchase.operator||'',
        sourcePurchaseId:purchase.id,
        sourcePackageId:purchase.packageId,
        sourcePackageName:purchase.packageName,
        purchaseId:purchase.id,
        packageId:purchase.packageId,
        packageName:purchase.packageName,
        ...operationTrace
      },{id:idFactory(),now});
    }).filter(Boolean);
  }

  function buildPurchaseGiftVoidRows({purchase,benefitLedger,user,operationTrace,now,idFactory}={}){
    return (benefitLedger||[]).filter(row=>String(row.sourcePurchaseId||row.purchaseId||'')===String(purchase?.id||'')&&Number(row.delta||0)>0).map(row=>buildStudentBenefitLedgerRecord({
      studentId:row.studentId||purchase.studentId||'',
      studentName:row.studentName||purchase.studentName||'',
      benefitCode:row.benefitCode,
      benefitLabel:row.benefitLabel,
      unit:row.unit||'次',
      delta:-Math.abs(parseInt(row.delta)||0),
      action:'void',
      reason:'购买记录作废，撤回赠送权益',
      relatedDate:now.slice(0,10),
      operator:user?.name||'',
      sourcePurchaseId:purchase.id,
      sourcePackageId:purchase.packageId,
      sourcePackageName:purchase.packageName,
      sourceBenefitLedgerId:row.id,
      purchaseId:purchase.id,
      packageId:purchase.packageId,
      packageName:purchase.packageName,
      ...operationTrace
    },{id:idFactory(),now}));
  }

  return async function handlePurchaseEntitlementRoutes({path,method,body,user,res,query}){
    if(path==='/purchases'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(T_PURCHASES).catch(()=>[]);
        if(!isCampusScopedAdmin(user))return sendJson(res,rows);
        const [students,packages,entitlements]=await Promise.all([
          getCachedScan(T_STUDENTS).catch(()=>[]),
          getCachedScan(T_PACKAGES).catch(()=>[]),
          getCachedScan(T_ENTITLEMENTS).catch(()=>[])
        ]);
        return sendJson(res,filterLoadAllForUser({purchases:rows,students,packages,entitlements},user).purchases);
      }
      if(method==='POST'){
        const pkg=await get(T_PACKAGES,body.packageId).catch(()=>null);
        if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);
        const student=await get(T_STUDENTS,body.studentId).catch(()=>null);
        if(!student)return sendJson(res,{error:'学员不存在'},404);
        const purchaseDate=body.purchaseDate||new Date().toISOString().slice(0,10);
        validatePurchaseInputForPackage(pkg,{...body,purchaseDate});
        const businessKey=normalizePurchaseBusinessKey(body.businessKey||body.sourceBusinessKey||body.idempotencyKey);
        if(businessKey){
          const existingRows=await getCachedScan(T_PURCHASES).catch(()=>[]);
          const existing=(existingRows||[]).find(row=>purchaseBusinessKey(row)===businessKey&&String(row.status||'active')!=='voided');
          if(existing){
            const existingEntitlements=(await getCachedScan(T_ENTITLEMENTS).catch(()=>[])).filter(row=>String(row.purchaseId||'')===String(existing.id||''));
            return sendJson(res,{purchase:existing,entitlement:existingEntitlements[0]||null,entitlements:existingEntitlements,idempotent:true});
          }
          body={...body,businessKey,sourceBusinessKey:businessKey};
        }
        const id=nextUuid();
        const now=new Date().toISOString();
        const operationTrace=buildOperationTrace({operationType:'package-purchase',operator:user.name||body.operator||'',now});
        const purchase=buildPurchaseRecord(pkg,{...body,purchaseDate},student,{id,now,operator:user.name,operationTrace});
        const entitlement=buildEntitlementFromPurchase(pkg,purchase,student,nextUuid(),now);
        const benefitLedgerRows=buildPurchaseGiftBenefitRows({purchase,student,user,operationTrace,now,idFactory:uuidv4});
        await writePurchaseAndEntitlementAtomic({put,del},T_PURCHASES,T_ENTITLEMENTS,purchase,entitlement,{benefitTable:T_MEMBERSHIP_BENEFIT_LEDGER,benefitRows:benefitLedgerRows});
        await syncStudentActiveEntitlementIndexes(null,entitlement);
        return sendJson(res,{purchase,entitlement,benefitLedgerRows});
      }
    }

    const purM=path.match(/^\/purchases\/(.+)$/);
    if(purM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=purM[1];
      if(method==='GET')return sendJson(res,await get(T_PURCHASES,id));
      if(method==='PUT'){
        const old=await get(T_PURCHASES,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'购买记录不存在'},404);
        const ents=(await scan(T_ENTITLEMENTS).catch(()=>[])).filter(e=>e.purchaseId===id);
        const ledger=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
        const now=new Date().toISOString();
        if(purchaseHasEntitlementLedger(id,ents,ledger)){
          const finalAmount=body.amountPaid!==undefined?Math.round((Number(body.amountPaid)||0)*100)/100:Math.round((Number(old.finalAmount??old.amountPaid)||0)*100)/100;
          const systemAmount=Math.round((Number(old.systemAmount??old.packagePrice)||0)*100)/100;
          const priceOverridden=systemAmount!==finalAmount;
          const overrideReason=body.overrideReason!==undefined?String(body.overrideReason||'').trim():(priceOverridden?String(old.overrideReason||'').trim():'');
          if(priceOverridden&&!overrideReason)return sendJson(res,{error:'请填写改价原因'},400);
          const r={
            ...old,
            purchaseDate:body.purchaseDate!==undefined?body.purchaseDate:old.purchaseDate,
            ownerCoach:body.ownerCoach!==undefined?body.ownerCoach:old.ownerCoach,
            amountPaid:finalAmount,
            finalAmount,
            priceOverridden,
            overrideReason:priceOverridden?overrideReason:'',
            payMethod:normalizePurchasePayMethod?normalizePurchasePayMethod(body.payMethod!==undefined?body.payMethod:old.payMethod):(body.payMethod!==undefined?body.payMethod:old.payMethod),
            notes:body.notes!==undefined?body.notes:old.notes,
            updatedAt:now
          };
          assertCanEditPurchaseWithLedger(old,r,ents,ledger);
          await put(T_PURCHASES,id,r);
          return sendJson(res,{purchase:r,entitlements:[]});
        }
        const nextPackageId=body.packageId||old.packageId;
        const purchaseDate=body.purchaseDate||old.purchaseDate||new Date().toISOString().slice(0,10);
        const pkg=await get(T_PACKAGES,nextPackageId).catch(()=>null);
        if(!pkg)return sendJson(res,{error:'售卖课包不存在'},404);
        validatePurchaseInputForPackage(pkg,{...old,...body,purchaseDate},{isEdit:true,oldPackageId:old.packageId});
        const student=await get(T_STUDENTS,body.studentId||old.studentId).catch(()=>null);
        if(!student)return sendJson(res,{error:'学员不存在'},404);
        const operationTrace=buildOperationTrace({operationType:'package-purchase-edit',operator:user.name||old.operator||'',now});
        const r=buildPurchaseRecord(pkg,{...old,...body,id,createdAt:old.createdAt,purchaseDate},student,{id,now,operator:old.operator||user.name,operationTrace});
        await put(T_PURCHASES,id,r);
        const synced=[];
        try{
          for(const ent of ents){
            const next=withOperationTrace(syncEntitlementFromPurchase(pkg,r,student,ent,now),operationTrace);
            await put(T_ENTITLEMENTS,ent.id,next);
            await syncStudentActiveEntitlementIndexes(ent,next);
            synced.push(next);
          }
          return sendJson(res,{purchase:r,entitlements:synced});
        }catch(err){
          await put(T_PURCHASES,id,old).catch(()=>null);
          for(const ent of ents)await put(T_ENTITLEMENTS,ent.id,ent).catch(()=>null);
          throw err;
        }
      }
      if(method==='DELETE'){
        const [ents,ledger,benefitLedger]=await Promise.all([scan(T_ENTITLEMENTS).catch(()=>[]),scan(T_ENTITLEMENT_LEDGER).catch(()=>[]),scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])]);
        assertCanVoidPurchase(id,ents,ledger,benefitLedger);
        const now=new Date().toISOString();
        const operationTrace=buildOperationTrace({operationType:'package-purchase-void',operator:user.name||'',now});
        const old=await get(T_PURCHASES,id).catch(()=>null);
        for(const ent of ents.filter(e=>e.purchaseId===id)){
          const nextEnt=withOperationTrace({...ent,status:'voided',updatedAt:now},operationTrace);
          await put(T_ENTITLEMENTS,ent.id,nextEnt);
          await syncStudentActiveEntitlementIndexes(ent,nextEnt);
          const event=withOperationTrace({id:nextUuid(),entitlementId:ent.id,studentId:ent.studentId||'',purchaseId:id,lessonDelta:0,action:'void_purchase',reason:body.reason||'购买记录作废',operator:user.name||'',createdAt:now},operationTrace);
          await put(T_ENTITLEMENT_LEDGER,event.id,event);
        }
        const voidBenefitRows=old?buildPurchaseGiftVoidRows({purchase:old,benefitLedger,user,operationTrace,now,idFactory:uuidv4}):[];
        for(const row of voidBenefitRows)await put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row);
        if(old)await put(T_PURCHASES,id,withOperationTrace({...old,status:'voided',voidedAt:now,voidedBy:user.name||'',voidReason:body.reason||'购买记录作废',updatedAt:now},operationTrace));
        return sendJson(res,{success:true,benefitLedgerRows:voidBenefitRows});
      }
    }

    if(path==='/entitlement-ledger'){
      await init();
      if(method==='GET'){
        const rows=normalizeEntitlementLedgerRowsForDetailView(await getCachedScan(T_ENTITLEMENT_LEDGER).catch(()=>[]));
        if(user.role==='admin'&&!isCampusScopedAdmin(user))return sendJson(res,rows);
        const [students,schedule,classes,purchases,packages,entitlements,coaches,users]=await Promise.all([
          getCachedScan(T_STUDENTS).catch(()=>[]),
          getCachedScan(T_SCHEDULE).catch(()=>[]),
          getCachedScan(T_CLASSES).catch(()=>[]),
          getCachedScan(T_PURCHASES).catch(()=>[]),
          getCachedScan(T_PACKAGES).catch(()=>[]),
          getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
          getCachedScan(T_COACHES).catch(()=>[]),
          getCachedScan(T_USERS).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        return sendJson(res,filterLoadAllForUser({students,schedule,classes,purchases,packages,entitlements,entitlementLedger:rows,coaches},user,coachRefs).entitlementLedger);
      }
    }

    if(path==='/entitlement-authorizations'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureEntitlementAuthorizationTable();
      if(method==='GET'){
        const rows=await loadAuthorizationRows();
        const entitlementId=String(query.get('entitlementId')||'').trim();
        const studentId=String(query.get('studentId')||'').trim();
        const ownerStudentId=String(query.get('ownerStudentId')||'').trim();
        const authorizedStudentId=String(query.get('authorizedStudentId')||'').trim();
        return sendJson(res,rows.filter(row=>{
          if(entitlementId&&String(row.entitlementId||'')!==entitlementId)return false;
          if(ownerStudentId&&String(row.ownerStudentId||'')!==ownerStudentId)return false;
          if(authorizedStudentId&&String(row.authorizedStudentId||'')!==authorizedStudentId)return false;
          if(studentId&&String(row.ownerStudentId||'')!==studentId&&String(row.authorizedStudentId||'')!==studentId)return false;
          return true;
        }));
      }
      if(method==='POST'){
        const entitlement=await getCachedRow(T_ENTITLEMENTS,String(body.entitlementId||'').trim()).catch(()=>null);
        if(!entitlement)return sendJson(res,{error:'课包余额不存在'},404);
        const owner=await getCachedRow(T_STUDENTS,entitlement.studentId).catch(()=>null);
        const authorized=await getCachedRow(T_STUDENTS,String(body.authorizedStudentId||'').trim()).catch(()=>null);
        if(!authorized)return sendJson(res,{error:'被授权学员不存在'},404);
        if(String(entitlement.studentId||'')===String(authorized.id||''))return sendJson(res,{error:'不能授权给课包本人'},400);
        const existing=(await loadAuthorizationRows()).find(row=>
          String(row.entitlementId||'')===String(entitlement.id||'')&&
          String(row.authorizedStudentId||'')===String(authorized.id||'')&&
          String(row.status||'active')==='active'
        );
        if(existing)return sendJson(res,{authorization:existing});
        const now=new Date().toISOString();
        const row={
          id:nextUuid(),
          entitlementId:entitlement.id,
          purchaseId:entitlement.purchaseId||'',
          packageName:entitlement.packageName||'',
          ownerStudentId:entitlement.studentId||'',
          ownerStudentName:entitlement.studentName||owner?.name||'',
          authorizedStudentId:authorized.id||'',
          authorizedStudentName:authorized.name||'',
          status:'active',
          validFrom:String(body.validFrom||'').slice(0,10),
          validUntil:String(body.validUntil||'').slice(0,10),
          notes:String(body.notes||'').trim(),
          createdBy:user.name||'',
          createdAt:now,
          updatedAt:now
        };
        await saveEntitlementAuthorizationMirror(row,true).catch(err=>console.error('[entitlement-auth] mirror save failed',err));
        try{
          await putEntitlementAuthorization(row);
        }catch(error){
          if(!entitlementAuthorizationTableMissing(error))throw error;
        }
        return sendJson(res,{authorization:row});
      }
    }

    const authM=path.match(/^\/entitlement-authorizations\/(.+)$/);
    if(authM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const id=authM[1];
      const old=await getCachedRow(T_ENTITLEMENT_AUTHORIZATIONS,id).catch(()=>null);
      const inlineOld=await getCachedScan(T_ENTITLEMENTS).then(rows=>rows.map(buildInlineAuthorizationRow).find(row=>row&&row.id===id)).catch(()=>null);
      const baseOld=old||inlineOld;
      if(!baseOld)return sendJson(res,{error:'授权记录不存在'},404);
      if(method==='PUT'){
        const next={...baseOld,status:body.status!==undefined?String(body.status||'disabled'):baseOld.status,validFrom:body.validFrom!==undefined?String(body.validFrom||'').slice(0,10):baseOld.validFrom,validUntil:body.validUntil!==undefined?String(body.validUntil||'').slice(0,10):baseOld.validUntil,notes:body.notes!==undefined?String(body.notes||'').trim():baseOld.notes,updatedAt:new Date().toISOString()};
        await saveEntitlementAuthorizationMirror(next,String(next.status||'active')==='active');
        try{
          await putEntitlementAuthorization(next);
        }catch(error){
          if(!entitlementAuthorizationTableMissing(error))throw error;
        }
        return sendJson(res,{authorization:next});
      }
      if(method==='DELETE'){
        const next={...baseOld,status:'disabled',updatedAt:new Date().toISOString(),disabledBy:user.name||''};
        await saveEntitlementAuthorizationMirror(next,false);
        try{
          await putEntitlementAuthorization(next);
        }catch(error){
          if(!entitlementAuthorizationTableMissing(error))throw error;
        }
        return sendJson(res,{success:true,authorization:next});
      }
    }

    if(path==='/entitlements'){
      await init();
      if(method==='GET'){
        const sid=query.get('studentId')||'';
        const rows=(user.role==='admin'&&sid&&!isCampusScopedAdmin(user))
          ? await getIndexedActiveEntitlementsForStudents([sid])
          : await getCachedScan(T_ENTITLEMENTS).catch(()=>[]);
        if(user.role==='admin'&&!isCampusScopedAdmin(user))return sendJson(res,sid?rows.filter(e=>e.studentId===sid):rows);
        const [students,schedule,classes,purchases,packages,coaches,users]=await Promise.all([
          getCachedScan(T_STUDENTS).catch(()=>[]),
          getCachedScan(T_SCHEDULE).catch(()=>[]),
          getCachedScan(T_CLASSES).catch(()=>[]),
          getCachedScan(T_PURCHASES).catch(()=>[]),
          getCachedScan(T_PACKAGES).catch(()=>[]),
          getCachedScan(T_COACHES).catch(()=>[]),
          getCachedScan(T_USERS).catch(()=>[])
        ]);
        const coachRefs=buildCoachRefs({coaches,users});
        const scoped=filterLoadAllForUser({students,schedule,classes,purchases,packages,entitlements:rows,coaches},user,coachRefs).entitlements;
        return sendJson(res,sid?scoped.filter(e=>e.studentId===sid):scoped);
      }
    }

    if(path==='/entitlements/recommend'&&method==='POST'){
      await init();
      const scheduleId=String(body.scheduleId||'').trim();
      const [ownRows,authorizedRows,coaches,users]=await Promise.all([
        getIndexedActiveEntitlementsForStudents(parseArr(body.studentIds)),
        authorizedRecommendationEntitlements(parseArr(body.studentIds),body.startTime),
        getCachedScan(T_COACHES).catch(()=>[]),
        getCachedScan(T_USERS).catch(()=>[])
      ]);
      let recommendationRows=[...ownRows,...authorizedRows];
      let currentSchedule=null;
      if(scheduleId){
        currentSchedule=await get(T_SCHEDULE,scheduleId).catch(()=>null);
        const oldEntitlementIds=parseArr(currentSchedule?.entitlementIds);
        if(currentSchedule?.entitlementId)oldEntitlementIds.push(currentSchedule.entitlementId);
        const missingIds=[...new Set(oldEntitlementIds.filter(id=>id&&!recommendationRows.some(row=>String(row.id||'')===String(id))))];
        if(missingIds.length){
          const extraRows=(await Promise.all(missingIds.map(id=>getCachedRow(T_ENTITLEMENTS,id).catch(()=>null)))).filter(Boolean);
          recommendationRows=[...recommendationRows,...extraRows];
        }
      }
      recommendationRows=restoreEditingScheduleEntitlementRowsForRecommendation(recommendationRows,body,currentSchedule,{parseLessonValue,scheduleEntitlementDeltas});
      return sendJson(res,recommendEntitlements(recommendationRows,{...body,coachRefs:buildCoachRefs({coaches,users})}));
    }

    const entManualM=path.match(/^\/entitlements\/(.+)\/manual-adjust$/);
    if(entManualM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const id=entManualM[1];
      const old=await get(T_ENTITLEMENTS,id).catch(()=>null);
      if(!old)return sendJson(res,{error:'课包余额不存在'},404);
      const [purchase,packageRow,student]=await Promise.all([
        old.purchaseId?get(T_PURCHASES,old.purchaseId).catch(()=>null):Promise.resolve(null),
        old.packageId?get(T_PACKAGES,old.packageId).catch(()=>null):Promise.resolve(null),
        old.studentId?get(T_STUDENTS,old.studentId).catch(()=>null):Promise.resolve(null)
      ]);
      const count=Math.abs(parseLessonValue(body.lessonDelta||body.count,0));
      const action=String(body.action||'manual_consume');
      const delta=action==='manual_return'?count:-count;
      const relatedDate=String(body.relatedDate||body.consumeDate||'').slice(0,10);
      const reason=String(body.reason||body.notes||'').trim();
      validateManualEntitlementAdjustment({entitlement:old,purchase:purchase||{},packageRow:packageRow||{},student:student||{},user,lessonDelta:delta,relatedDate,reason});
      const now=new Date().toISOString();
      const operationTrace=buildOperationTrace({operationType:delta<0?'manual-lesson-consume':'manual-lesson-return',operator:user.name||'',now});
      const next=withOperationTrace(applyEntitlementLessonDelta(old,delta,now),operationTrace);
      const ledger=buildManualEntitlementLedgerRecord({entitlement:old,lessonDelta:delta,relatedDate,reason,user,operationTrace},{now});
      try{
        await put(T_ENTITLEMENTS,id,next);
        await syncStudentActiveEntitlementIndexes(old,next);
        await put(T_ENTITLEMENT_LEDGER,ledger.id,ledger);
        return sendJson(res,{entitlement:next,ledger});
      }catch(err){
        await put(T_ENTITLEMENTS,id,old).catch(()=>null);
        await syncStudentActiveEntitlementIndexes(next,old).catch(()=>null);
        await del(T_ENTITLEMENT_LEDGER,ledger.id).catch(()=>null);
        throw err;
      }
    }

    const entM=path.match(/^\/entitlements\/(.+)$/);
    if(entM){
      const id=entM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_ENTITLEMENTS,id));
      if(method==='DELETE'){
        if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
        const old=await getCachedRow(T_ENTITLEMENTS,id).catch(()=>null);
        assertCanDeleteEntitlement(id,await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]),await scan(T_ENTITLEMENTS).catch(()=>[]));
        await del(T_ENTITLEMENTS,id);
        await syncStudentActiveEntitlementIndexes(old,null);
        return sendJson(res,{success:true});
      }
    }

    return false;
  };
}

module.exports={createPurchaseEntitlementRoutes,restoreEditingScheduleEntitlementRowsForRecommendation};
