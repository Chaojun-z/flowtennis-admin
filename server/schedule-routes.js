function createScheduleRoutes(deps={}){
  const {
    init,sendJson,getScheduleListRows,filterLoadAllForUser,getCachedScan,getCoachScheduleRowsForUser,
    buildCoachRefs,timedEndpointMetric,assertCanWriteSchedule,uuidv4,buildOperationTrace,
    withOperationTrace,normalizeCoachLateInfo,normalizeScheduleFieldFee,parseArr,normalizeVenue,
    timed,validateScheduleSave,assertScheduleEntitlementRequired,assertScheduleFieldFeeInput,
    withRequiredStorageTimeout,resolveScheduleEntitlementDeltas,assertScheduleEntitlementCapacity,
    scheduleStoredValuePaymentAmount,getFastStudentsRead,buildScheduleStoredValueCourtUpdate,
    put,scheduleLessonDelta,applyEntitlementDelta,applySmallGroupFreeAbsences,applyLessonDelta,
    syncScheduleFieldFeeFinancialLedger,persistScheduleStoredValueCourts,syncCoachScheduleIndexes,syncScheduleConflictIndexes=async()=>{},
    scheduleListSnapshotSync=null,
    del,rollbackScheduleStoredValueCourts,rollbackSmallGroupFreeAbsences,scheduleSaveErrorStatus,
    get,withTimeout,scanFeedbacks,assertScheduleEditableAfterFeedback,scan,scheduleEntitlementDeltas,
    restoreSmallGroupFreeAbsenceLedgerRows,parseLessonValue,returnEntitlementFreeAbsence,
    diffScheduleEntitlementDeltas,effectiveScheduleStatus,assertCanDeleteSchedule,
    T_SCHEDULE,T_COACHES,T_USERS,T_ENTITLEMENTS,T_COURTS,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_ACCOUNTS
  }=deps;

  async function syncScheduleListSnapshotDelta(row, options = {}) {
    if (!scheduleListSnapshotSync || typeof scheduleListSnapshotSync.recordDelta !== 'function') return null;
    return scheduleListSnapshotSync.recordDelta(row, options).catch((err) => {
      console.error('schedule list snapshot delta sync failed:', err);
      return null;
    });
  }

  return async function handleScheduleRoutes({path,method,body,user,res}){
    if(path==='/schedule'){
      await init();
      if(method==='GET'){if(user.role==='admin'){const rows=await getScheduleListRows();return sendJson(res,filterLoadAllForUser({schedule:rows},user).schedule);}const [coaches,users]=await Promise.all([getCachedScan(T_COACHES).catch(()=>[]),getCachedScan(T_USERS).catch(()=>[])]);return sendJson(res,await getCoachScheduleRowsForUser(user,buildCoachRefs({coaches,users})));}
      if(method==='POST'){
        return timedEndpointMetric('schedule.save',async()=>{
          try{assertCanWriteSchedule(user);}catch(e){return sendJson(res,{error:e.message},403);}
          const id=uuidv4();
          const now=new Date().toISOString();
          const operationTrace=buildOperationTrace({operationType:'lesson-consume',operator:user.name||'',now});
          const linkedScheduleGroupId=body.allowLinkedVenueConflict?String(body.linkedScheduleGroupId||id).trim():'';
          const r=withOperationTrace({...body,...normalizeCoachLateInfo(body),...normalizeScheduleFieldFee(body),studentIds:parseArr(body.studentIds).filter(Boolean),expectedStudentIds:parseArr(body.expectedStudentIds).filter(Boolean),absentStudentIds:parseArr(body.absentStudentIds).filter(Boolean),venue:normalizeVenue(body.venue),id,status:body.status||'已排课',cancelReason:body.cancelReason||'',notifyStatus:body.notifyStatus||'未通知',confirmStatus:body.confirmStatus||'待确认',scheduleSource:body.scheduleSource||'排课表',allowLinkedVenueConflict:!!body.allowLinkedVenueConflict,linkedScheduleGroupId,createdBy:user.name,createdAt:now,updatedAt:now},operationTrace);
          let validation;
          try{validation=await timed('schedule create validate',async()=>{
            const risk=await validateScheduleSave(r,null);
            assertScheduleEntitlementRequired(r);
            assertScheduleFieldFeeInput(r);
            const [entitlementRows,coaches,users]=await Promise.all([
              withRequiredStorageTimeout(getCachedScan(T_ENTITLEMENTS).catch(()=>[]),3500,'课包余额校验超时，请稍后重试'),
              getCachedScan(T_COACHES).catch(()=>[]),
              getCachedScan(T_USERS).catch(()=>[])
            ]);
            /* hot-cache guard: const entitlementDeltas=resolveScheduleEntitlementDeltas(r,await getCachedScan(T_ENTITLEMENTS).catch(()=>[])); */
            const coachRefs=buildCoachRefs({coaches,users});
            const entitlementDeltas=resolveScheduleEntitlementDeltas({...r,coachRefs},entitlementRows);
            r.entitlementIds=entitlementDeltas.map(d=>d.entitlementId);
            r.entitlementId=r.entitlementIds.length===1?r.entitlementIds[0]:'';
            await assertScheduleEntitlementCapacity({...r,coachRefs},null);
            let storedValueUpdate={schedule:r,courts:[],originalCourts:[],historyRows:[]};
            if(scheduleStoredValuePaymentAmount(r)>0){
              const [courtRows,studentRows,membershipAccounts]=await Promise.all([
                withRequiredStorageTimeout(getCachedScan(T_COURTS).catch(()=>[]),3500,'会员储值卡余额校验超时，请稍后重试'),
                getFastStudentsRead().catch(()=>[]),
                T_MEMBERSHIP_ACCOUNTS?getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([])
              ]);
              storedValueUpdate=buildScheduleStoredValueCourtUpdate({previousSchedule:null,nextSchedule:r,courts:courtRows,students:studentRows,membershipAccounts,now,operator:user.name||'',operationTrace});
              Object.assign(r,storedValueUpdate.schedule);
            }
            return {risk,entitlementDeltas,entitlementRows,storedValueUpdate};
          });}catch(err){return sendJson(res,{error:String(err?.message||err)},scheduleSaveErrorStatus(err));}
          const {risk,entitlementDeltas,entitlementRows,storedValueUpdate}=validation;
          await timed('schedule create persist',()=>put(T_SCHEDULE,id,r));
          const nextDelta=scheduleLessonDelta(r);
          const appliedEntitlements=[];
          let lessonApplied=false;
          try{
            const entitlementChanged=await timed('schedule create entitlement writes',async()=>{
              const changed=[];
              for(const nextEntDelta of entitlementDeltas){
                const update=await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','排课消课',user,operationTrace,r);
                if(update)changed.push(update);
                appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'排课保存失败退回'});
              }
              const freeAbsenceRows=await applySmallGroupFreeAbsences(r,entitlementRows,user,operationTrace);
              freeAbsenceRows.forEach(ledger=>{
                changed.push({entitlement:null,ledger});
                appliedEntitlements.push({...ledger,action:'free_absence'});
              });
              return changed;
            });
            const lessonUpdate=nextDelta?await timed('schedule create lesson writes',()=>applyLessonDelta(nextDelta.classId,nextDelta.delta,r.studentIds)):null;
            if(nextDelta)lessonApplied=true;
            const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
            const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
            const financialLedger=await timed('schedule create field fee finance write',()=>syncScheduleFieldFeeFinancialLedger(r,user,now));
            const storedValueCourts=await timed('schedule create stored value writes',()=>persistScheduleStoredValueCourts(storedValueUpdate));
            await timed('schedule create conflict index write',()=>syncScheduleConflictIndexes(null,r));
          let notification={skipped:true,reason:'official_account_reminder_only'};
            await syncCoachScheduleIndexes(null,r).catch(err=>{
              notification={...(notification||{}),sent:false,indexError:err.message};
            });
            await syncScheduleListSnapshotDelta(r,{reason:'schedule-create'});
            return sendJson(res,{schedule:r,warnings:risk.warnings||[],...(lessonUpdate||{}),entitlements,entitlementLedger,entitlement:entitlements[0]||null,ledger:entitlementLedger[0]||null,financialLedger:financialLedger?[financialLedger]:[],courts:storedValueCourts,notification});
          }catch(err){
            await del(T_SCHEDULE,id).catch(()=>null);
            await syncScheduleConflictIndexes(r,null).catch(()=>null);
            await rollbackScheduleStoredValueCourts(storedValueUpdate);
            await rollbackSmallGroupFreeAbsences((appliedEntitlements||[]).filter(item=>item.action==='free_absence')).catch(()=>null);
            for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user,operationTrace,r).catch(()=>null);
            if(nextDelta&&lessonApplied)await applyLessonDelta(nextDelta.classId,-nextDelta.delta,r.studentIds).catch(()=>null);
            throw err;
          }
        },{mode:'create'});
      }
    }
    const schM=path.match(/^\/schedule\/(.+)$/);
    if(schM){
      const id=schM[1];
      if(method==='GET')return sendJson(res,await get(T_SCHEDULE,id));
      if(method==='PUT'){
        return timedEndpointMetric('schedule.save',async()=>{
          try{assertCanWriteSchedule(user);}catch(e){return sendJson(res,{error:e.message},403);}
          const ex=await get(T_SCHEDULE,id).catch(()=>null);
          const isCancelOnlyUpdate=String(body.status||'').trim()==='已取消'&&Object.keys(body||{}).every(key=>['status','cancelReason'].includes(key));
          const operationTrace=buildOperationTrace({operationType:'lesson-consume',operator:user.name||'',now:new Date().toISOString()});
          const allowLinkedVenueConflict=!!(body.allowLinkedVenueConflict??ex?.allowLinkedVenueConflict);
          const linkedScheduleGroupId=allowLinkedVenueConflict?String(body.linkedScheduleGroupId||ex?.linkedScheduleGroupId||id).trim():'';
          const r=withOperationTrace({...ex,...body,...normalizeCoachLateInfo({...ex,...body}),...normalizeScheduleFieldFee({...ex,...body}),studentIds:parseArr(body.studentIds??ex?.studentIds).filter(Boolean),expectedStudentIds:parseArr(body.expectedStudentIds??ex?.expectedStudentIds).filter(Boolean),absentStudentIds:parseArr(body.absentStudentIds??ex?.absentStudentIds).filter(Boolean),venue:normalizeVenue(body.venue??ex?.venue),allowLinkedVenueConflict,linkedScheduleGroupId,id,updatedAt:new Date().toISOString()},operationTrace);
          if(Object.prototype.hasOwnProperty.call(body,'entitlementIds'))r.entitlementIds=parseArr(body.entitlementIds).filter(Boolean);
          else if(Object.prototype.hasOwnProperty.call(body,'entitlementId'))r.entitlementIds=String(body.entitlementId||'').trim()?[String(body.entitlementId).trim()]:[];
          const oldDelta=scheduleLessonDelta(ex);
          const nextDelta=scheduleLessonDelta(r);
          if(isCancelOnlyUpdate&&ex){
            const feedbacks=await timed('schedule cancel feedback guard',()=>withTimeout(scanFeedbacks().catch(()=>[]),1500,[]));
            assertScheduleEditableAfterFeedback(ex,r,feedbacks);
            const allLedger=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
            const oldEntDeltas=scheduleEntitlementDeltas(ex);
            const oldFreeAbsenceLedger=allLedger.filter(row=>row.scheduleId===id&&row.action==='free_absence');
            let storedValueUpdate={schedule:r,courts:[],originalCourts:[],historyRows:[]};
            if(scheduleStoredValuePaymentAmount(ex)>0){
              const [courtRows,studentRows,membershipAccounts]=await Promise.all([
                withRequiredStorageTimeout(getCachedScan(T_COURTS).catch(()=>[]),3500,'会员储值卡余额校验超时，请稍后重试'),
                getFastStudentsRead().catch(()=>[]),
                T_MEMBERSHIP_ACCOUNTS?getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([])
              ]);
              storedValueUpdate=buildScheduleStoredValueCourtUpdate({previousSchedule:ex,nextSchedule:r,courts:courtRows,students:studentRows,membershipAccounts,now:r.updatedAt,operator:user.name||'',operationTrace});
              Object.assign(r,storedValueUpdate.schedule);
            }
            await timed('schedule cancel persist',()=>put(T_SCHEDULE,id,r));
            const appliedEntitlements=[];
            const appliedClassDeltas=[];
            try{
              const entitlements=[];
              const entitlementLedger=[];
              for(const oldEntDelta of oldEntDeltas){
                const updated=await applyEntitlementDelta(oldEntDelta.entitlementId,id,oldEntDelta.delta,'return','取消排课退回权益',user,operationTrace,ex);
                if(updated){
                  entitlements.push(updated.entitlement);
                  entitlementLedger.push(updated.ledger);
                  appliedEntitlements.push({entitlementId:oldEntDelta.entitlementId,delta:-oldEntDelta.delta,action:'rollback',reason:'取消排课失败重新扣回权益'});
                }
              }
              await rollbackSmallGroupFreeAbsences(oldFreeAbsenceLedger);
              let lessonUpdate=null;
              if(oldDelta){
                lessonUpdate=await applyLessonDelta(oldDelta.classId,-oldDelta.delta,parseArr(ex.studentIds));
                appliedClassDeltas.push({classId:oldDelta.classId,delta:oldDelta.delta,studentIds:parseArr(ex.studentIds)});
              }
              const storedValueCourts=await timed('schedule cancel stored value writes',()=>persistScheduleStoredValueCourts(storedValueUpdate));
              await timed('schedule cancel conflict index write',()=>syncScheduleConflictIndexes(ex,r));
              await syncCoachScheduleIndexes(ex,r).catch(err=>console.error('schedule cancel index sync failed:',err));
              await syncScheduleListSnapshotDelta(r,{reason:'schedule-cancel'});
              return sendJson(res,{schedule:r,entitlements,entitlementLedger,...(lessonUpdate||{}),courts:storedValueCourts,warnings:[]});
            }catch(err){
              await put(T_SCHEDULE,id,ex).catch(()=>null);
              await syncScheduleConflictIndexes(r,ex).catch(()=>null);
              await rollbackScheduleStoredValueCourts(storedValueUpdate);
              await restoreSmallGroupFreeAbsenceLedgerRows(oldFreeAbsenceLedger).catch(()=>null);
              for(const item of appliedClassDeltas)await applyLessonDelta(item.classId,item.delta,item.studentIds).catch(()=>null);
              for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user,operationTrace,ex).catch(()=>null);
              throw err;
            }
          }
          let validation;
          try{validation=await timed('schedule update validate',async()=>{
            const risk=await validateScheduleSave(r,ex);
            assertScheduleEntitlementRequired(r);
            assertScheduleFieldFeeInput(r);
            assertScheduleEditableAfterFeedback(
              ex,
              r,
              await timed('schedule update feedback guard',()=>withTimeout(scanFeedbacks().catch(()=>[]),3000,[]))
            );
            const allLedger=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
            const oldFreeAbsenceLedger=allLedger.filter(row=>row.scheduleId===id&&row.action==='free_absence');
            const oldEntDeltas=scheduleEntitlementDeltas(ex);
            const oldEntIds=new Set(oldEntDeltas.map(d=>d.entitlementId));
            const [entitlementRows,coaches,users]=await Promise.all([
              withRequiredStorageTimeout(getCachedScan(T_ENTITLEMENTS).catch(()=>[]),3500,'课包余额校验超时，请稍后重试'),
              getCachedScan(T_COACHES).catch(()=>[]),
              getCachedScan(T_USERS).catch(()=>[])
            ]);
            const coachRefs=buildCoachRefs({coaches,users});
            const freeAbsenceReturnIds=new Set(oldFreeAbsenceLedger.map(row=>row.entitlementId).filter(Boolean));
            const nextBaseRows=entitlementRows.map(ent=>{
              let next=oldEntIds.has(ent.id)?{...ent,status:'active',remainingLessons:parseLessonValue(ent.remainingLessons)+(oldEntDeltas.find(d=>d.entitlementId===ent.id)?.delta||0)}:ent;
              if(freeAbsenceReturnIds.has(ent.id))next=returnEntitlementFreeAbsence(next);
              return next;
            });
            const nextEntDeltas=resolveScheduleEntitlementDeltas({...r,coachRefs},nextBaseRows);
            r.entitlementIds=nextEntDeltas.map(d=>d.entitlementId);
            r.entitlementId=r.entitlementIds.length===1?r.entitlementIds[0]:'';
            await assertScheduleEntitlementCapacity({...r,coachRefs},ex);
            let storedValueUpdate={schedule:r,courts:[],originalCourts:[],historyRows:[]};
            if(scheduleStoredValuePaymentAmount(ex)>0||scheduleStoredValuePaymentAmount(r)>0){
              const [courtRows,studentRows,membershipAccounts]=await Promise.all([
                withRequiredStorageTimeout(getCachedScan(T_COURTS).catch(()=>[]),3500,'会员储值卡余额校验超时，请稍后重试'),
                getFastStudentsRead().catch(()=>[]),
                T_MEMBERSHIP_ACCOUNTS?getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([])
              ]);
              storedValueUpdate=buildScheduleStoredValueCourtUpdate({previousSchedule:ex,nextSchedule:r,courts:courtRows,students:studentRows,membershipAccounts,now:r.updatedAt,operator:user.name||'',operationTrace});
              Object.assign(r,storedValueUpdate.schedule);
            }
            return {risk,oldEntDeltas,nextEntDeltas,oldFreeAbsenceLedger,nextBaseRows,storedValueUpdate};
          });}catch(err){return sendJson(res,{error:String(err?.message||err)},scheduleSaveErrorStatus(err));}
          const {risk,oldEntDeltas,nextEntDeltas,oldFreeAbsenceLedger,nextBaseRows,storedValueUpdate}=validation;
          await timed('schedule update persist',()=>put(T_SCHEDULE,id,r));
          const appliedEntitlements=[];
          const appliedClassDeltas=[];
          try{
            const changed=[];
            const entitlementChanged=await timed('schedule update entitlement writes',async()=>{
              const rows=[];
              const entDiff=diffScheduleEntitlementDeltas(oldEntDeltas,nextEntDeltas);
              for(const oldEntDelta of entDiff.returns){rows.push(await applyEntitlementDelta(oldEntDelta.entitlementId,id,oldEntDelta.delta,'return','编辑排课退回旧权益',user,operationTrace,ex));appliedEntitlements.push({entitlementId:oldEntDelta.entitlementId,delta:-oldEntDelta.delta,action:'rollback',reason:'编辑排课失败重新扣旧权益'});}
              for(const nextEntDelta of entDiff.consumes){rows.push(await applyEntitlementDelta(nextEntDelta.entitlementId,id,-nextEntDelta.delta,'consume','编辑排课消课',user,operationTrace,r));appliedEntitlements.push({entitlementId:nextEntDelta.entitlementId,delta:nextEntDelta.delta,action:'rollback',reason:'编辑排课失败退回新权益'});}
              await rollbackSmallGroupFreeAbsences(oldFreeAbsenceLedger);
              const freeAbsenceRows=await applySmallGroupFreeAbsences(r,nextBaseRows,user,operationTrace);
              freeAbsenceRows.forEach(ledger=>{
                rows.push({entitlement:null,ledger});
                appliedEntitlements.push({...ledger,action:'free_absence'});
              });
              return rows;
            });
            await timed('schedule update lesson writes',async()=>{
              if(oldDelta){changed.push(await applyLessonDelta(oldDelta.classId,-oldDelta.delta,parseArr(ex.studentIds)));appliedClassDeltas.push({classId:oldDelta.classId,delta:oldDelta.delta,studentIds:parseArr(ex.studentIds)});}
              if(nextDelta){changed.push(await applyLessonDelta(nextDelta.classId,nextDelta.delta,r.studentIds));appliedClassDeltas.push({classId:nextDelta.classId,delta:-nextDelta.delta,studentIds:r.studentIds});}
            });
            const classes=changed.filter(Boolean).map(x=>x.class);
            const plans=changed.filter(Boolean).flatMap(x=>x.plans||[]);
            const entitlements=entitlementChanged.filter(Boolean).map(x=>x.entitlement);
            const entitlementLedger=entitlementChanged.filter(Boolean).map(x=>x.ledger);
            const financialLedger=await timed('schedule update field fee finance write',()=>syncScheduleFieldFeeFinancialLedger(r,user,new Date().toISOString()));
            const storedValueCourts=await timed('schedule update stored value writes',()=>persistScheduleStoredValueCourts(storedValueUpdate));
            await timed('schedule update conflict index write',()=>syncScheduleConflictIndexes(ex,r));
            await syncCoachScheduleIndexes(ex,r).catch(err=>console.error('schedule update index sync failed:',err));
            await syncScheduleListSnapshotDelta(r,{reason:'schedule-update'});
            return sendJson(res,{schedule:r,classes,plans,entitlements,entitlementLedger,financialLedger:financialLedger?[financialLedger]:[],courts:storedValueCourts,warnings:risk.warnings||[]});
          }catch(err){
            await put(T_SCHEDULE,id,ex).catch(()=>null);
            await syncScheduleConflictIndexes(r,ex).catch(()=>null);
            await rollbackScheduleStoredValueCourts(storedValueUpdate);
            await rollbackSmallGroupFreeAbsences((appliedEntitlements||[]).filter(item=>item.action==='free_absence')).catch(()=>null);
            await restoreSmallGroupFreeAbsenceLedgerRows(oldFreeAbsenceLedger).catch(()=>null);
            for(const item of appliedClassDeltas)await applyLessonDelta(item.classId,item.delta,item.studentIds).catch(()=>null);
            for(const item of appliedEntitlements)await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user,operationTrace,r).catch(()=>null);
            throw err;
          }
        },{mode:'update'});
      }
      if(method==='DELETE'){
        const ex=await get(T_SCHEDULE,id).catch(()=>null);
        const oldDelta=scheduleLessonDelta(ex);
        const allLedger=await scan(T_ENTITLEMENT_LEDGER).catch(()=>[]);
        const scheduleLedger=allLedger.filter(row=>row.scheduleId===id);
        assertCanDeleteSchedule(ex||id,await scanFeedbacks(),allLedger);
        const operationTrace=buildOperationTrace({operationType:'lesson-consume',operator:user.name||'',now:new Date().toISOString()});
        const oldEntDeltas=scheduleEntitlementDeltas(ex);
        const oldFreeAbsenceLedger=scheduleLedger.filter(row=>row.action==='free_absence');
        const isCancelled=ex&&effectiveScheduleStatus(ex)==='已取消';
        let storedValueUpdate={schedule:{...(ex||{}),status:'已取消'},courts:[],originalCourts:[],historyRows:[]};
        if(scheduleStoredValuePaymentAmount(ex)>0){
          const [courtRows,studentRows,membershipAccounts]=await Promise.all([
            withRequiredStorageTimeout(getCachedScan(T_COURTS).catch(()=>[]),3500,'会员储值卡余额校验超时，请稍后重试'),
            getFastStudentsRead().catch(()=>[]),
            T_MEMBERSHIP_ACCOUNTS?getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([])
          ]);
          storedValueUpdate=buildScheduleStoredValueCourtUpdate({previousSchedule:ex,nextSchedule:{...ex,status:'已取消'},courts:courtRows,students:studentRows,membershipAccounts,now:operationTrace.operationAt,operator:user.name||'',operationTrace});
        }
        const appliedEntitlements=[];
        const deletedLedger=[];
        const generatedLedger=[];
        const appliedClassDeltas=[];
        let freeAbsenceRolledBack=false;
        try{
          if(ex&&!isCancelled){
            for(const oldEntDelta of oldEntDeltas){
              const updated=await applyEntitlementDelta(oldEntDelta.entitlementId,id,oldEntDelta.delta,'return','删除排课退回权益',user,operationTrace,ex);
              if(updated?.ledger)generatedLedger.push(updated.ledger);
              if(updated)appliedEntitlements.push({entitlementId:oldEntDelta.entitlementId,delta:-oldEntDelta.delta,action:'rollback',reason:'删除排课失败重新扣回权益'});
            }
            await rollbackSmallGroupFreeAbsences(oldFreeAbsenceLedger);
            freeAbsenceRolledBack=oldFreeAbsenceLedger.length>0;
          }
          for(const row of [...scheduleLedger,...generatedLedger]){
            await del(T_ENTITLEMENT_LEDGER,row.id);
            deletedLedger.push(row);
          }
          const lessonUpdate=oldDelta?await applyLessonDelta(oldDelta.classId,-oldDelta.delta,parseArr(ex?.studentIds)):null;
          if(oldDelta)appliedClassDeltas.push({classId:oldDelta.classId,delta:oldDelta.delta,studentIds:parseArr(ex?.studentIds)});
          const storedValueCourts=await timed('schedule delete stored value writes',()=>persistScheduleStoredValueCourts(storedValueUpdate));
          await del(T_SCHEDULE,id);
          await timed('schedule delete conflict index write',()=>syncScheduleConflictIndexes(ex,null));
          await syncCoachScheduleIndexes(ex,null).catch(err=>console.error('schedule delete index sync failed:',err));
          await syncScheduleListSnapshotDelta(null,{scheduleId:id,deleted:true,reason:'schedule-delete'});
          return sendJson(res,{success:true,...(lessonUpdate||{}),entitlementLedger:deletedLedger,courts:storedValueCourts});
        }catch(err){
          if(ex)await put(T_SCHEDULE,id,ex).catch(()=>null);
          await syncScheduleConflictIndexes(null,ex).catch(()=>null);
          await rollbackScheduleStoredValueCourts(storedValueUpdate);
          if(freeAbsenceRolledBack)await restoreSmallGroupFreeAbsenceLedgerRows(oldFreeAbsenceLedger).catch(()=>null);
          for(const row of deletedLedger.filter(row=>!generatedLedger.some(generated=>generated.id===row.id)))await put(T_ENTITLEMENT_LEDGER,row.id,row).catch(()=>null);
          for(const row of generatedLedger)await del(T_ENTITLEMENT_LEDGER,row.id).catch(()=>null);
          for(const item of appliedClassDeltas)await applyLessonDelta(item.classId,item.delta,item.studentIds).catch(()=>null);
          for(const item of appliedEntitlements){
            const rollback=await applyEntitlementDelta(item.entitlementId,id,item.delta,item.action,item.reason,user,operationTrace,ex).catch(()=>null);
            if(rollback?.ledger)await del(T_ENTITLEMENT_LEDGER,rollback.ledger.id).catch(()=>null);
          }
          throw err;
        }
      }
    }
    return false;
  };
}

module.exports={createScheduleRoutes};
