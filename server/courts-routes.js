function createCourtRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,getCachedRow,filterLoadAllForUser,uuidv4,
    buildOperationTrace,stampCourtHistoryOperationTrace,normalizeCourtRecord,put,
    importCourtRows,deleteCourtsByIds,loadCourtDeleteReferenceData,mergeCourtRecords,del,
    parseLegacyCourtNotes,shouldMigrateLegacyCourtFinance,buildLegacyCourtOpeningHistory,
    legacyCourtFinanceWarnings,computeCourtFinance,normalizeMoney,normalizeCourtHistory,courtDeleteAction,
    T_COURTS,T_SCHEDULE,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,
    T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS
  }=deps;

  return async function handleCourtRoutes({path,method,body,user,res}){
    if(path==='/courts'){
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(T_COURTS);
        return sendJson(res,filterLoadAllForUser({courts:rows},user).courts);
      }
      if(method==='POST'){
        const id=uuidv4();
        const operationTrace=buildOperationTrace({operationType:'court-booking',operator:user.name||body.operator||''});
        const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
        const r={...normalizeCourtRecord(stampCourtHistoryOperationTrace({nextCourt:body,operationTrace}),{schedules}),id,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        await put(T_COURTS,id,r);return sendJson(res,r);
      }
    }
    if(path==='/courts/import'&&method==='POST'){
      await init();
      const rows=Array.isArray(body.rows)?body.rows:[];
      return sendJson(res,await importCourtRows(rows));
    }
    if(path==='/courts/batch-delete'&&method==='POST'){
      await init();
      const result=await deleteCourtsByIds(body.ids,await loadCourtDeleteReferenceData());
      return sendJson(res,result);
    }
    if(path==='/courts/merge'&&method==='POST'){
      await init();
      const sourceCourtId=String(body?.sourceCourtId||'').trim();
      const targetCourtId=String(body?.targetCourtId||'').trim();
      const deleteSource=body?.deleteSource===true;
      if(!sourceCourtId||!targetCourtId)return sendJson(res,{error:'请选择要合并的订场用户'},400);
      if(sourceCourtId===targetCourtId)return sendJson(res,{error:'不能合并到自己'},400);
      const [sourceCourt,targetCourt,membershipRefs]=await Promise.all([
        getCachedRow(T_COURTS,sourceCourtId).catch(()=>null),
        getCachedRow(T_COURTS,targetCourtId).catch(()=>null),
        loadCourtDeleteReferenceData()
      ]);
      if(!sourceCourt)return sendJson(res,{error:'原订场用户不存在'},404);
      if(!targetCourt)return sendJson(res,{error:'目标订场用户不存在'},404);
      const merged=mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts:membershipRefs.membershipAccounts,
        membershipOrders:membershipRefs.membershipOrders,
        membershipBenefitLedger:membershipRefs.membershipBenefitLedger,
        membershipAccountEvents:membershipRefs.membershipAccountEvents,
        now:new Date().toISOString()
      });
      await put(T_COURTS,targetCourt.id,merged.targetCourt);
      await Promise.all([
        ...merged.membershipAccounts.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_ACCOUNTS,row.id,row)),
        ...merged.membershipOrders.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_ORDERS,row.id,row)),
        ...merged.membershipBenefitLedger.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row)),
        ...merged.membershipAccountEvents.filter(row=>String(row.courtId||'')===targetCourtId).map(row=>put(T_MEMBERSHIP_ACCOUNT_EVENTS,row.id,row))
      ]);
      if(deleteSource)await del(T_COURTS,sourceCourt.id);
      else await put(T_COURTS,sourceCourt.id,merged.sourceCourt);
      return sendJson(res,{success:true,targetCourt:merged.targetCourt,removedCourtId:deleteSource?sourceCourt.id:'',archivedSource:!deleteSource});
    }
    if(path==='/courts/migrate-legacy'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await getCachedScan(T_COURTS);
      let changed=0;
      const preview=[];
      for(const row of rows){
        const parsed=parseLegacyCourtNotes(row.notes);
        const next={
          ...row,
          notes:parsed.notes,
          owner:row.owner||parsed.updates.owner||'',
          depositAttitude:row.depositAttitude||parsed.updates.depositAttitude||'',
          familiarity:row.familiarity||parsed.updates.familiarity||'',
          spentAmount:row.spentAmount!=null&&row.spentAmount!==''?parseFloat(row.spentAmount)||0:(parsed.updates.spentAmount||0)
        };
        const hasFieldChange=
          String(next.notes||'')!==String(row.notes||'')||
          String(next.owner||'')!==String(row.owner||'')||
          String(next.depositAttitude||'')!==String(row.depositAttitude||'')||
          String(next.familiarity||'')!==String(row.familiarity||'')||
          String(next.spentAmount||0)!==String(row.spentAmount||0);
        if(!hasFieldChange)continue;
        changed++;
        if(preview.length<20)preview.push({id:row.id,name:row.name,before:row.notes||'',after:next.notes||'',owner:next.owner||'',depositAttitude:next.depositAttitude||'',familiarity:next.familiarity||'',spentAmount:next.spentAmount||0});
        if(!dryRun)await put(T_COURTS,row.id,{...next,updatedAt:new Date().toISOString()});
      }
      return sendJson(res,{dryRun,total:rows.length,changed,preview});
    }
    if(path==='/courts/migrate-finance-legacy'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const dryRun=body?.dryRun!==false;
      const rows=await getCachedScan(T_COURTS);
      const schedules=await getCachedScan(T_SCHEDULE).catch(()=>[]);
      let candidates=0,migrated=0,skipped=0;
      const preview=[];
      for(const row of rows){
        if(!shouldMigrateLegacyCourtFinance(row))continue;
        candidates++;
        const history=buildLegacyCourtOpeningHistory(row);
        const warnings=legacyCourtFinanceWarnings(row);
        let computed=null;
        try{computed=computeCourtFinance({...row,history});}catch(e){warnings.push(e.message);}
        if(preview.length<20)preview.push({
          id:row.id,
          name:row.name||'',
          before:{balance:normalizeMoney(row.balance),totalDeposit:normalizeMoney(row.totalDeposit),spentAmount:normalizeMoney(row.spentAmount),receivedAmount:normalizeMoney(row.receivedAmount)},
          generated:history,
          computed,
          warnings
        });
        if(warnings.length){skipped++;continue;}
        if(!dryRun){
          const next=normalizeCourtRecord({...row,history,updatedAt:new Date().toISOString()},{schedules});
          await put(T_COURTS,row.id,next);
          migrated++;
        }
      }
      return sendJson(res,{dryRun,total:rows.length,candidates,migrated,skipped,preview});
    }
    const cM=path.match(/^\/courts\/(.+)$/);if(cM){const id=cM[1];if(method==='PUT'){const prev=await getCachedRow(T_COURTS,id).catch(()=>null);const prevHistory=JSON.stringify(normalizeCourtHistory(prev?.history));const nextHistory=JSON.stringify(normalizeCourtHistory(body?.history));const operationTrace=buildOperationTrace({operationType:'court-booking',operator:user.name||body.operator||''});const stampedBody=stampCourtHistoryOperationTrace({previousCourt:prev,nextCourt:body,operationTrace});const schedules=prevHistory===nextHistory?[]:await getCachedScan(T_SCHEDULE).catch(()=>[]);const r={...normalizeCourtRecord(stampedBody,{schedules}),id,updatedAt:new Date().toISOString()};await put(T_COURTS,id,r);return sendJson(res,r);}if(method==='DELETE'){const court=await getCachedRow(T_COURTS,id).catch(()=>null);if(!court)return sendJson(res,{error:'订场用户不存在'},404);const action=courtDeleteAction(court,await loadCourtDeleteReferenceData());if(action==='delete'){await del(T_COURTS,id);return sendJson(res,{success:true,archived:false});}const now=new Date().toISOString();await put(T_COURTS,id,{...court,status:'inactive',deletedAt:court.deletedAt||now,updatedAt:now});return sendJson(res,{success:true,archived:true});}}
    return false;
  };
}

module.exports={createCourtRoutes};
