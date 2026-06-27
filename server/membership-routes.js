function createMembershipRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,getCachedRow,filterLoadAllForUser,uuidv4,put,del,
    runMembershipReconcile,isCampusScopedAdmin,normalizeMoney,reserveRecentMembershipOrderRequest,
    releaseRecentMembershipOrderRequest,buildOperationTrace,normalizeMembershipPlanViewRecord,
    buildMembershipPlanRecord,buildMembershipPurchase,buildMembershipGrantLedgerRows,normalizeCourtHistory,
    normalizeCourtRecord,buildMembershipAccountEventRecord,operatorAccountName,normalizeOperatorAccountName,
    summarizeStudentBenefits,buildStudentBenefitLedgerRecord,MEMBERSHIP_BENEFIT_FIELD_MAP,
    normalizeMembershipOrderViewRecord,allocateMembershipBenefitUsage,buildMembershipBenefitLedgerRecord,
    T_MEMBERSHIP_PLANS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,
    T_MEMBERSHIP_ACCOUNT_EVENTS,T_COURTS,T_USERS
  }=deps;

  return async function handleMembershipRoutes({path,method,body,user,res,query}){
    if(path==='/membership-plans'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){const rows=await getCachedScan(T_MEMBERSHIP_PLANS).catch(()=>[]);return sendJson(res,filterLoadAllForUser({membershipPlans:rows},user).membershipPlans);}
      if(method==='POST'){const now=new Date().toISOString();const r=buildMembershipPlanRecord(body,{id:uuidv4(),now});await put(T_MEMBERSHIP_PLANS,r.id,r);return sendJson(res,r);}
    }
    const mpM=path.match(/^\/membership-plans\/(.+)$/);if(mpM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=mpM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_MEMBERSHIP_PLANS,id));
      if(method==='PUT'){const old=await getCachedRow(T_MEMBERSHIP_PLANS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员方案不存在'},404);const r=buildMembershipPlanRecord({...old,...body,id,createdAt:old.createdAt},{id,now:new Date().toISOString()});await put(T_MEMBERSHIP_PLANS,id,r);return sendJson(res,r);}
      if(method==='DELETE'){const old=await getCachedRow(T_MEMBERSHIP_PLANS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员方案不存在'},404);if(old.status==='active')return sendJson(res,{error:'上架中的会员方案不能删除，请先停售'},400);const orders=await getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]);if(orders.some(o=>o.membershipPlanId===id))return sendJson(res,{error:'该会员方案已有购买记录，不能删除，请停用'},400);await del(T_MEMBERSHIP_PLANS,id);return sendJson(res,{success:true});}
    }
    if(path==='/membership-accounts/reconcile'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendJson(res,await runMembershipReconcile());
    }
    if(path==='/membership-accounts'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){const rows=await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);const courtId=query.get('courtId')||'';if(!isCampusScopedAdmin(user))return sendJson(res,courtId?rows.filter(a=>a.courtId===courtId):rows);const courts=await getCachedScan(T_COURTS).catch(()=>[]);const scoped=filterLoadAllForUser({courts,membershipAccounts:rows},user).membershipAccounts;return sendJson(res,courtId?scoped.filter(a=>a.courtId===courtId):scoped);}
    }
    const maM=path.match(/^\/membership-accounts\/(.+)$/);if(maM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=maM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_MEMBERSHIP_ACCOUNTS,id));
      if(method==='PUT'){
        const old=await getCachedRow(T_MEMBERSHIP_ACCOUNTS,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'会员账户不存在'},404);
        const now=new Date().toISOString();
        const r={...old,...body,id,updatedAt:now};
        if(body.status==='voided'){
          r.status='voided';
          r.voidedAt=now;
          r.voidedBy=user.name||'';
          r.voidReason=body.voidReason||body.reason||'手动作废会员';
        }
        let event=null;
        if(old.status!==r.status&&r.status==='voided'){
          const operationTrace=buildOperationTrace({operationType:'membership-account-void',operator:user.name||'',now});
          event=buildMembershipAccountEventRecord({
            membershipAccountId:id,
            courtId:r.courtId,
            eventType:'voided',
            beforeStatus:old.status,
            afterStatus:'voided',
            operator:user.name||'',
            reason:r.voidReason,
            ...operationTrace
          },{id:uuidv4(),now});
        }
        await put(T_MEMBERSHIP_ACCOUNTS,id,r);
        if(event)await put(T_MEMBERSHIP_ACCOUNT_EVENTS,event.id,event);
        return sendJson(res,event?{account:r,event}:r);
      }
    }
    if(path==='/membership-orders'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){const rows=await getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]);if(!isCampusScopedAdmin(user))return sendJson(res,rows);const [courts,membershipAccounts]=await Promise.all([getCachedScan(T_COURTS).catch(()=>[]),getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])]);return sendJson(res,filterLoadAllForUser({courts,membershipAccounts,membershipOrders:rows},user).membershipOrders);}
      if(method==='POST'){
        const now=new Date().toISOString();
        const purchaseDate=body.purchaseDate||now.slice(0,10);
        const rechargeAmount=normalizeMoney(body.rechargeAmount);
        const requestReservationKey=reserveRecentMembershipOrderRequest({courtId:body.courtId,membershipPlanId:body.membershipPlanId,purchaseDate,rechargeAmount,requestKey:body.requestKey},now);
        if(!requestReservationKey)return sendJson(res,{error:'检测到重复提交，请勿重复开卡/续充'},409);
        const [court,plan,existingAccountFallback]=await Promise.all([
          getCachedRow(T_COURTS,body.courtId).catch(()=>null),
          getCachedRow(T_MEMBERSHIP_PLANS,body.membershipPlanId).catch(()=>null),
          body.membershipAccountId?getCachedRow(T_MEMBERSHIP_ACCOUNTS,body.membershipAccountId).catch(()=>null):Promise.resolve(null)
        ]);
        if(!court){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'订场用户不存在'},404);}
        const existingAccount=existingAccountFallback&&existingAccountFallback.courtId===court.id&&existingAccountFallback.status!=='voided'
          ? existingAccountFallback
          : (await getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(a=>a.courtId===court.id&&a.status!=='voided');
        if(!plan){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'会员方案不存在'},404);}
        if(plan.status&&plan.status!=='active'){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'该会员方案已停用'},400);}
        if(plan.saleStartDate&&purchaseDate<plan.saleStartDate){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'未到会员方案售卖时间'},400);}
        if(plan.saleEndDate&&purchaseDate>plan.saleEndDate){releaseRecentMembershipOrderRequest(requestReservationKey);return sendJson(res,{error:'会员方案售卖时间已结束'},400);}
        const finalRechargeAmount=normalizeMoney(body.rechargeAmount??plan.rechargeAmount);
        const operationTrace=buildOperationTrace({operationType:'membership-recharge',operator:user.name||body.operator||'',now});
        const built=buildMembershipPurchase({court,plan:normalizeMembershipPlanViewRecord(plan),existingAccount,body:{...body,purchaseDate,rechargeAmount:finalRechargeAmount,operator:body.operator||user.name},now,operationTrace});
        const benefitLedgerRows=buildMembershipGrantLedgerRows(built.order,{idFactory:uuidv4,now});
        const originalCourt={...court};
        try{
          const history=[...normalizeCourtHistory(court.history),built.historyRow];
          const nextCourt=normalizeCourtRecord({...court,history,updatedAt:now});
          await Promise.all([
            put(T_MEMBERSHIP_ACCOUNTS,built.account.id,built.account),
            put(T_MEMBERSHIP_ORDERS,built.order.id,built.order),
            put(T_COURTS,court.id,nextCourt),
            ...benefitLedgerRows.map(row=>put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row))
          ]);
          releaseRecentMembershipOrderRequest(requestReservationKey,{keep:true});
          return sendJson(res,{...built,benefitLedgerRows});
        }catch(err){
          await Promise.all([
            put(T_COURTS,originalCourt.id,originalCourt).catch(()=>null),
            del(T_MEMBERSHIP_ORDERS,built.order.id).catch(()=>null),
            ...benefitLedgerRows.map(row=>del(T_MEMBERSHIP_BENEFIT_LEDGER,row.id).catch(()=>null)),
            (!existingAccount?del(T_MEMBERSHIP_ACCOUNTS,built.account.id):put(T_MEMBERSHIP_ACCOUNTS,existingAccount.id,existingAccount)).catch(()=>null)
          ]);
          releaseRecentMembershipOrderRequest(requestReservationKey);
          throw err;
        }
      }
    }
    const moM=path.match(/^\/membership-orders\/(.+)$/);if(moM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=moM[1];
      if(method==='GET')return sendJson(res,await getCachedRow(T_MEMBERSHIP_ORDERS,id));
      if(method==='PUT'){const old=await getCachedRow(T_MEMBERSHIP_ORDERS,id).catch(()=>null);if(!old)return sendJson(res,{error:'会员购买记录不存在'},404);const r={...old,...body,id,updatedAt:new Date().toISOString()};await put(T_MEMBERSHIP_ORDERS,id,r);return sendJson(res,r);}
      if(method==='DELETE'){const old=await getCachedRow(T_MEMBERSHIP_ORDERS,id).catch(()=>null);if(old)await put(T_MEMBERSHIP_ORDERS,id,{...old,status:'voided',voidedAt:new Date().toISOString(),voidedBy:user.name||'',voidReason:body.reason||'会员购买记录作废',updatedAt:new Date().toISOString()});return sendJson(res,{success:true});}
    }
    if(path==='/membership-benefit-ledger'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){
        const [rows,users,courts,membershipAccounts,membershipOrders]=await Promise.all([
          getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]),
          getCachedScan(T_USERS).catch(()=>[]),
          isCampusScopedAdmin(user)?getCachedScan(T_COURTS).catch(()=>[]):Promise.resolve([]),
          isCampusScopedAdmin(user)?getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([]),
          isCampusScopedAdmin(user)?getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]):Promise.resolve([])
        ]);
        const scoped=isCampusScopedAdmin(user)?filterLoadAllForUser({courts,membershipAccounts,membershipOrders,membershipBenefitLedger:rows},user).membershipBenefitLedger:rows;
        return sendJson(res,(scoped||[]).map(row=>({...row,operator:normalizeOperatorAccountName(row.operator,users)})));
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const account=body.membershipAccountId?await getCachedRow(T_MEMBERSHIP_ACCOUNTS,body.membershipAccountId).catch(()=>null):null;
        const operator=body.operator||operatorAccountName(user);
        if(body.studentId&&!body.membershipAccountId){
          if(body.action==='consume'||parseInt(body.delta)<0){
            const ledger=await getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]);
            const current=summarizeStudentBenefits({studentId:body.studentId,ledger}).find(row=>row.benefitCode===body.benefitCode);
            const need=Math.abs(parseInt(body.delta)||0)||Math.abs(parseInt(body.consumeCount)||0);
            if(!need)return sendJson(res,{error:'权益变动次数不能为 0'},400);
            if((parseInt(current?.remaining)||0)<need)return sendJson(res,{error:'剩余权益不足'},400);
            body.delta=-need;
          }
          const operationTrace=buildOperationTrace({operationType:'student-benefit-ledger',operator,now});
          const r=buildStudentBenefitLedgerRecord({...body,operator,...operationTrace},{id:uuidv4(),now});
          await put(T_MEMBERSHIP_BENEFIT_LEDGER,r.id,r);
          return sendJson(res,r);
        }
        if(account&&['voided','cleared'].includes(account.status)&&['consume','supplement'].includes(body.action))return sendJson(res,{error:'当前会员状态不可再消耗或补发权益，请先重新开卡'},400);
        if(!body.membershipOrderRef&&(body.action==='consume'||parseInt(body.delta)<0)){
          const [orders,ledger]=await Promise.all([getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[])]);
          const relevantOrders=(orders||[]).filter(order=>order.membershipAccountId===body.membershipAccountId&&order.courtId===body.courtId);
          const needsPlanFallback=relevantOrders.some(order=>{
            const hasBenefitSnapshot=order?.benefitSnapshot&&Object.keys(order.benefitSnapshot).length>0;
            const hasPlanSnapshot=order?.planBenefitTemplateSnapshot&&Object.keys(order.planBenefitTemplateSnapshot).length>0;
            const hasLegacyCounts=MEMBERSHIP_BENEFIT_FIELD_MAP.some(({field})=>parseInt(order?.[field])>0);
            return !hasBenefitSnapshot&&!hasPlanSnapshot&&!hasLegacyCounts;
          });
          const plans=needsPlanFallback?await getCachedScan(T_MEMBERSHIP_PLANS).catch(()=>[]):[];
          const planMap=new Map((plans||[]).map(plan=>[plan.id,normalizeMembershipPlanViewRecord(plan)]));
          const normalizedOrders=relevantOrders.map(order=>normalizeMembershipOrderViewRecord(order,planMap.get(order.membershipPlanId)||null));
          const operationTrace=buildOperationTrace({operationType:'membership-benefit-consume',operator,now});
          const rows=allocateMembershipBenefitUsage({
            membershipAccountId:body.membershipAccountId,
            courtId:body.courtId,
            benefitCode:body.benefitCode,
            benefitLabel:body.benefitLabel,
            unit:body.unit,
            consumeCount:Math.abs(parseInt(body.delta)||0)||Math.abs(parseInt(body.consumeCount)||0),
            orders:normalizedOrders,
            ledger,
            relatedDate:body.relatedDate,
            reason:body.reason||'会员权益使用',
            operator,
            now,
            operationTrace,
            idFactory:uuidv4
          });
          await Promise.all(rows.map(row=>put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row)));
          return sendJson(res,{records:rows});
        }
        const operationTrace=buildOperationTrace({operationType:'membership-benefit-ledger',operator,now});
        const r=buildMembershipBenefitLedgerRecord({...body,operator,...operationTrace},{id:uuidv4(),now});
        await put(T_MEMBERSHIP_BENEFIT_LEDGER,r.id,r);
        return sendJson(res,r);
      }
    }
    if(path==='/membership-account-events'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){const rows=await getCachedScan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[]);if(!isCampusScopedAdmin(user))return sendJson(res,rows);const [courts,membershipAccounts,membershipOrders]=await Promise.all([getCachedScan(T_COURTS).catch(()=>[]),getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[])]);return sendJson(res,filterLoadAllForUser({courts,membershipAccounts,membershipOrders,membershipAccountEvents:rows},user).membershipAccountEvents);}
    }
    return false;
  };
}

module.exports={createMembershipRoutes};
