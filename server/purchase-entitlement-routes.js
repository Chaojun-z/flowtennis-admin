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

function createPurchaseEntitlementRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,getCachedRow,get,scan,put,del,filterLoadAllForUser,uuidv4,
    isCampusScopedAdmin,parseArr,parseLessonValue,scheduleEntitlementDeltas,buildCoachRefs,buildOperationTrace,withOperationTrace,
    normalizeEntitlementLedgerRowsForDetailView,getIndexedActiveEntitlementsForStudents,recommendEntitlements,
    validateManualEntitlementAdjustment,applyEntitlementLessonDelta,buildManualEntitlementLedgerRecord,buildStudentBenefitLedgerRecord,
    assertCanDeleteEntitlement,syncStudentActiveEntitlementIndexes,writePurchaseAndEntitlementAtomic,
    buildEntitlementFromPurchase,buildPurchaseRecord,assertCanEditPurchaseWithLedger,purchaseHasEntitlementLedger,normalizePurchasePayMethod,
    validatePurchaseInputForPackage,syncEntitlementFromPurchase,assertCanVoidPurchase,
    T_PURCHASES,T_PACKAGES,T_STUDENTS,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_BENEFIT_LEDGER,T_SCHEDULE,T_CLASSES,T_COACHES,T_USERS
  }=deps;

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
        const id=uuidv4();
        const now=new Date().toISOString();
        const operationTrace=buildOperationTrace({operationType:'package-purchase',operator:user.name||body.operator||'',now});
        const purchase=buildPurchaseRecord(pkg,{...body,purchaseDate},student,{id,now,operator:user.name,operationTrace});
        const entitlement=buildEntitlementFromPurchase(pkg,purchase,student,uuidv4(),now);
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
          const event=withOperationTrace({id:uuidv4(),entitlementId:ent.id,studentId:ent.studentId||'',purchaseId:id,lessonDelta:0,action:'void_purchase',reason:body.reason||'购买记录作废',operator:user.name||'',createdAt:now},operationTrace);
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
      const [rows,coaches,users]=await Promise.all([
        getIndexedActiveEntitlementsForStudents(parseArr(body.studentIds)),
        getCachedScan(T_COACHES).catch(()=>[]),
        getCachedScan(T_USERS).catch(()=>[])
      ]);
      let recommendationRows=rows;
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
