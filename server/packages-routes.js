function assertCanDeletePackage(packageId,purchases){
  if((purchases||[]).some(p=>p.packageId===packageId))throw new Error('该课包已有购买记录，不能删除，请停用');
}

function createPackageRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,get,scan,put,del,filterLoadAllForUser,uuidv4,
    parseArr,normalizePackageRecord,assertCanEditPackageWithPurchases,
    buildPackageDeactivateUpdate,syncSoldPackageRuleSnapshots,buildPackageMergeUpdates,
    syncStudentActiveEntitlementIndexes,
    T_PACKAGES,T_PRODUCTS,T_COACHES,T_CAMPUSES,T_PURCHASES,T_ENTITLEMENTS,T_SCHEDULE
  }=deps;

  return async function handlePackageRoutes({path,method,body,user,res}){
    if(path==='/packages'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      if(method==='GET'){
        const rows=await getCachedScan(T_PACKAGES).catch(()=>[]);
        return sendJson(res,filterLoadAllForUser({packages:rows},user).packages);
      }
      if(method==='POST'){
        const id=uuidv4();
        const refs={
          products:await getCachedScan(T_PRODUCTS).catch(()=>[]),
          coaches:await getCachedScan(T_COACHES).catch(()=>[]),
          campuses:await getCachedScan(T_CAMPUSES).catch(()=>[])
        };
        const now=new Date().toISOString();
        const r=normalizePackageRecord({...body,id},null,refs,now);
        r.createdAt=now;
        await put(T_PACKAGES,id,r);
        return sendJson(res,r);
      }
    }

    if(path==='/packages/merge'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const masterPackageId=String(body.masterPackageId||'').trim();
      const sourcePackageId=String(body.sourcePackageId||'').trim();
      const [masterPackage,sourcePackage,purchases,entitlements,schedules]=await Promise.all([
        get(T_PACKAGES,masterPackageId).catch(()=>null),
        get(T_PACKAGES,sourcePackageId).catch(()=>null),
        scan(T_PURCHASES).catch(()=>[]),
        scan(T_ENTITLEMENTS).catch(()=>[]),
        scan(T_SCHEDULE).catch(()=>[])
      ]);
      const now=new Date().toISOString();
      const updates=buildPackageMergeUpdates({masterPackage,sourcePackage,purchases,entitlements,schedules,now,operator:user.name||''});
      await put(T_PACKAGES,sourcePackageId,updates.sourcePackage);
      await Promise.all([
        ...updates.purchases.map(row=>put(T_PURCHASES,row.id,row)),
        ...updates.entitlements.map(row=>put(T_ENTITLEMENTS,row.id,row)),
        ...updates.schedules.map(row=>put(T_SCHEDULE,row.id,row))
      ]);
      await Promise.all(updates.entitlements.map(row=>syncStudentActiveEntitlementIndexes(null,row)));
      return sendJson(res,{success:true,...updates});
    }

    if(path==='/packages/order'&&method==='PUT'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const orderedIds=Array.isArray(body.orderedIds)?body.orderedIds.map(id=>String(id||'').trim()).filter(Boolean):[];
      if(!orderedIds.length)return sendJson(res,{error:'请提供课包排序'},400);
      if(new Set(orderedIds).size!==orderedIds.length)return sendJson(res,{error:'课包排序不能重复'},400);
      const rows=await scan(T_PACKAGES).catch(()=>[]);
      const byId=new Map(rows.map(row=>[String(row.id||''),row]));
      const missing=orderedIds.filter(id=>!byId.has(id));
      if(missing.length)return sendJson(res,{error:'课包不存在'},404);
      const now=new Date().toISOString();
      const updates=orderedIds.map((id,idx)=>({...byId.get(id),sortOrder:(idx+1)*10,updatedAt:now}));
      await Promise.all(updates.map(row=>put(T_PACKAGES,row.id,row)));
      return sendJson(res,{success:true,packages:updates});
    }

    const pkgM=path.match(/^\/packages\/(.+)$/);
    if(pkgM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      const id=decodeURIComponent(pkgM[1]);
      if(method==='GET')return sendJson(res,await get(T_PACKAGES,id));
      if(method==='PUT'){
        const old=await get(T_PACKAGES,id).catch(()=>null);
        if(!old)return sendJson(res,{error:'售卖课包不存在'},404);
        const now=new Date().toISOString();
        const deactivated=buildPackageDeactivateUpdate(old,body,now);
        if(deactivated){
          await put(T_PACKAGES,id,deactivated);
          return sendJson(res,deactivated);
        }
        const purchaseRows=await scan(T_PURCHASES).catch(()=>[]);
        const entitlementRows=await scan(T_ENTITLEMENTS).catch(()=>[]);
        const legacyCoachNames=[
          old.ownerCoach,
          ...parseArr(old.coachNames),
          ...parseArr(old.coachIds),
          ...purchaseRows.filter(p=>String(p.packageId||'')===String(id)).flatMap(p=>[p.ownerCoach,...parseArr(p.coachNames),...parseArr(p.allowedCoaches)]),
          ...entitlementRows.filter(e=>String(e.packageId||'')===String(id)).flatMap(e=>[e.ownerCoach,...parseArr(e.coachNames),...parseArr(e.allowedCoaches)])
        ].filter(Boolean);
        const refs={
          products:await scan(T_PRODUCTS).catch(()=>[]),
          coaches:await scan(T_COACHES).catch(()=>[]),
          campuses:await scan(T_CAMPUSES).catch(()=>[]),
          legacyCoachNames
        };
        const r=normalizePackageRecord({...body,id},old,refs);
        assertCanEditPackageWithPurchases(old,r,purchaseRows);
        await put(T_PACKAGES,id,r);
        const snapshotUpdates=syncSoldPackageRuleSnapshots(r,purchaseRows,entitlementRows,r.updatedAt);
        await Promise.all([
          ...snapshotUpdates.purchases.map(row=>put(T_PURCHASES,row.id,row)),
          ...snapshotUpdates.entitlements.map(row=>put(T_ENTITLEMENTS,row.id,row))
        ]);
        await Promise.all(snapshotUpdates.entitlements.map(row=>syncStudentActiveEntitlementIndexes(null,row)));
        return sendJson(res,r);
      }
      if(method==='DELETE'){
        assertCanDeletePackage(id,await scan(T_PURCHASES).catch(()=>[]));
        await del(T_PACKAGES,id);
        return sendJson(res,{success:true});
      }
    }

    return false;
  };
}

module.exports={createPackageRoutes,assertCanDeletePackage};
