function createLeadsRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,get,scan,put,filterLoadAllForUser,isProductionRuntime,isCampusScopedAdmin,
    cleanLeadText,ensureLeadTables,scanFirstRows,PRODUCTION_PAGE_READ_LIMITS,
    LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS,LEAD_LIST_PROJECTION_FIELDS,mergeDuplicateLeadRows,
    normalizeLeadRecord,leadCanonicalNameKey,mergeLeadRows,buildLeadInitialFollowup,
    normalizeLeadFollowupRecord,applyLeadFollowupsSnapshot,applyLeadFollowupSnapshot,normalizeLeadImportRows,
    buildLeadImportPreviewRows,leadImportPreviewSummary,dedupeLeadRows,buildLeadDedupKey,
    buildLeadStudentRecord,buildLeadCourtRecord,matchLeadToStudent,matchLeadToCourt,
    T_LEADS,T_LEAD_FOLLOWUPS,T_LEAD_IMPORT_BATCHES,T_STUDENTS,T_COURTS,T_MEMBERSHIP_ACCOUNTS
  }=deps;

  function leadSearchHit(q,...values){
    if(!q)return true;
    const keyword=String(q).toLowerCase().trim();
    return values.some(v=>String(v||'').toLowerCase().includes(keyword));
  }

  return async function handleLeadsRoutes({path,method,body,user,res,query}){
    if(path==='/lead-followups'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const leadId=cleanLeadText(query.get('leadId'));
      const rows=isProductionRuntime()?await scanFirstRows(T_LEAD_FOLLOWUPS,{limit:PRODUCTION_PAGE_READ_LIMITS.leadFollowups,columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]);
      if(!isCampusScopedAdmin(user))return sendJson(res,leadId?rows.filter(row=>String(row.leadId||'')===leadId):rows);
      const leads=await getCachedScan(T_LEADS,{columns:LEAD_LIST_PROJECTION_FIELDS}).catch(()=>[]);
      const scoped=filterLoadAllForUser({leads,leadFollowups:rows},user).leadFollowups;
      return sendJson(res,leadId?scoped.filter(row=>String(row.leadId||'')===leadId):scoped);
    }
    if(path==='/leads'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      if(method==='GET'){
        const rows=isProductionRuntime()?await scanFirstRows(T_LEADS,{limit:PRODUCTION_PAGE_READ_LIMITS.leads,columns:LEAD_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_LEADS,{columns:LEAD_LIST_PROJECTION_FIELDS}).catch(()=>[]);
        const q=cleanLeadText(query.get('q')).toLowerCase();
        const source=cleanLeadText(query.get('source'));
        const consultType=cleanLeadText(query.get('consultType'));
        const owner=cleanLeadText(query.get('owner'));
        const systemStatus=cleanLeadText(query.get('systemStatus'));
        const waiting=cleanLeadText(query.get('waiting'));
        const dateFrom=cleanLeadText(query.get('dateFrom'));
        const dateTo=cleanLeadText(query.get('dateTo'));
        const todayStr=new Date().toISOString().slice(0,10);
        const visibleRows=filterLoadAllForUser({leads:mergeDuplicateLeadRows(rows)},user).leads;
        const filtered=visibleRows.filter(row=>{
          if(q&&!leadSearchHit(q,row.displayName,row.wechatName,row.phone,row.source,row.consultType,row.intentLevel,row.owner,row.rawStatus,row.systemStatus,row.latestConcern,row.latestConclusion,row.nextAction))return false;
          if(source&&row.source!==source)return false;
          if(consultType&&row.consultType!==consultType)return false;
          if(owner&&row.owner!==owner)return false;
          if(systemStatus&&row.systemStatus!==systemStatus)return false;
          if(dateFrom&&String(row.leadDate||'')<dateFrom)return false;
          if(dateTo&&String(row.leadDate||'')>dateTo)return false;
          if(waiting==='today'&&String(row.nextFollowupAt||'').slice(0,10)!==todayStr)return false;
          if(waiting==='overdue'&&String(row.nextFollowupAt||'').slice(0,10)>=todayStr)return false;
          return true;
        }).sort((a,b)=>String(b.leadDate||b.createdAt||'').localeCompare(String(a.leadDate||a.createdAt||'')));
        return sendJson(res,filtered);
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const lead=normalizeLeadRecord({...body,createdAt:now,updatedAt:now},{now});
        const existingLeads=await scan(T_LEADS).catch(()=>[]);
        const sameName=mergeDuplicateLeadRows(existingLeads).find(row=>leadCanonicalNameKey(row)===leadCanonicalNameKey(lead));
        if(sameName){
          const next=mergeLeadRows([sameName,{...lead,id:sameName.id,createdAt:sameName.createdAt,leadDate:sameName.leadDate,updatedAt:now}]);
          await put(T_LEADS,next.id,next);
          return sendJson(res,{lead:next,followup:null,merged:true});
        }
        await put(T_LEADS,lead.id,lead);
        const followup=body.createInitialFollowup===false?null:buildLeadInitialFollowup(lead);
        if(followup)await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        return sendJson(res,{lead,followup});
      }
    }
    const leadIdM=path.match(/^\/leads\/([^/]+)$/);
    if(leadIdM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await ensureLeadTables();
      const leadId=leadIdM[1];
      if(method==='PUT'){
        await init();
        const old=await get(T_LEADS,leadId).catch(()=>null);
        if(!old)return sendJson(res,{error:'线索不存在'},404);
        const next=normalizeLeadRecord({...old,...body,id:leadId,createdAt:old.createdAt},{now:new Date().toISOString()});
        await put(T_LEADS,leadId,next);
        return sendJson(res,next);
      }
    }
    const leadFollowupIdM=path.match(/^\/lead-followups\/([^/]+)$/);
    if(leadFollowupIdM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const followupId=leadFollowupIdM[1];
      if(method==='PUT'){
        const oldFollowup=await get(T_LEAD_FOLLOWUPS,followupId).catch(()=>null);
        if(!oldFollowup)return sendJson(res,{error:'跟进记录不存在'},404);
        const leadId=cleanLeadText(oldFollowup.leadId);
        const lead=await get(T_LEADS,leadId).catch(()=>null);
        if(!lead)return sendJson(res,{error:'线索不存在'},404);
        const followup=normalizeLeadFollowupRecord({...oldFollowup,...body,id:followupId,leadId,createdAt:oldFollowup.createdAt},{now:new Date().toISOString()});
        await put(T_LEAD_FOLLOWUPS,followupId,followup);
        const rows=(await scan(T_LEAD_FOLLOWUPS).catch(()=>[])).filter(row=>String(row.leadId||'')===String(leadId)).map(row=>String(row.id||'')===String(followupId)?followup:row);
        const nextLead=applyLeadFollowupsSnapshot(lead,rows);
        await put(T_LEADS,leadId,nextLead);
        return sendJson(res,{followup,lead:nextLead});
      }
    }
    const leadFollowupsM=path.match(/^\/leads\/([^/]+)\/followups$/);
    if(leadFollowupsM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const leadId=leadFollowupsM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(method==='GET'){
        const rows=((isProductionRuntime()?await scanFirstRows(T_LEAD_FOLLOWUPS,{limit:PRODUCTION_PAGE_READ_LIMITS.leadFollowups,columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[])))
          .filter(row=>String(row.leadId||'')===String(leadId))
          .sort((a,b)=>String(b.followupAt||b.createdAt||'').localeCompare(String(a.followupAt||a.createdAt||'')));
        return sendJson(res,rows);
      }
      if(method==='POST'){
        const followup=normalizeLeadFollowupRecord({...body,leadId,followupBy:body.followupBy||user.name||''},{now:new Date().toISOString()});
        await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        const nextLead=applyLeadFollowupSnapshot(lead,followup);
        await put(T_LEADS,leadId,nextLead);
        return sendJson(res,{followup,lead:nextLead});
      }
    }
    if(path==='/leads/import-preview'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const leads=normalizeLeadImportRows(body);
      const [students,courts,membershipAccounts]=await Promise.all([
        scan(T_STUDENTS).catch(()=>[]),
        scan(T_COURTS).catch(()=>[]),
        scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])
      ]);
      const rows=buildLeadImportPreviewRows(leads,{students,courts,membershipAccounts});
      return sendJson(res,{rows,summary:leadImportPreviewSummary(rows)});
    }
    if(path==='/leads/import-commit'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const batchKey=cleanLeadText(body.batchKey)||`preview:${Buffer.from(String(body.csvText||'')).toString('base64').slice(0,48)}`;
      const existingBatch=await get(T_LEAD_IMPORT_BATCHES,batchKey).catch(()=>null);
      if(existingBatch)return sendJson(res,existingBatch);
      const previewRows=Array.isArray(body.rows)&&body.rows.length?body.rows:buildLeadImportPreviewRows(normalizeLeadImportRows(body),{
        students:await scan(T_STUDENTS).catch(()=>[]),
        courts:await scan(T_COURTS).catch(()=>[]),
        membershipAccounts:await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])
      });
      const existingLeads=await scan(T_LEADS).catch(()=>[]);
      const existingKeys=new Set((existingLeads||[]).map(buildLeadDedupKey));
      const rowsToCreate=dedupeLeadRows(previewRows).filter(row=>!existingKeys.has(buildLeadDedupKey(row)));
      const createdLeads=[];
      const createdFollowups=[];
      for(const row of rowsToCreate){
        const lead=normalizeLeadRecord(row,{id:row.id,now:new Date().toISOString()});
        await put(T_LEADS,lead.id,lead);
        createdLeads.push(lead);
        const followup=buildLeadInitialFollowup(lead);
        await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        createdFollowups.push(followup);
      }
      const result={
        batchKey,
        importedAt:new Date().toISOString(),
        leadCount:createdLeads.length,
        followupCount:createdFollowups.length,
        skippedDuplicates:(previewRows||[]).length-rowsToCreate.length,
        summary:{...leadImportPreviewSummary(previewRows),importableRows:rowsToCreate.length}
      };
      await put(T_LEAD_IMPORT_BATCHES,batchKey,result);
      return sendJson(res,result);
    }
    const leadConvertStudentM=path.match(/^\/leads\/([^/]+)\/convert-student$/);
    if(leadConvertStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const leadId=leadConvertStudentM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(lead.studentId){
        const student=await get(T_STUDENTS,lead.studentId).catch(()=>null);
        return sendJson(res,{lead,student,created:false});
      }
      let student=body.studentId?await get(T_STUDENTS,body.studentId).catch(()=>null):null;
      if(!student){
        const studentMatch=matchLeadToStudent?matchLeadToStudent(lead,await scan(T_STUDENTS).catch(()=>[])):{matchType:'none',record:null};
        student=studentMatch.record||null;
        if(!student){
          student=buildLeadStudentRecord(lead,{now:new Date().toISOString()});
          await put(T_STUDENTS,student.id,student);
        }
      }
      const nextLead=normalizeLeadRecord({...lead,studentId:student.id,isCourseConverted:true,membershipAccountId:lead.membershipAccountId||'',updatedAt:new Date().toISOString(),createdAt:lead.createdAt},{id:lead.id,now:new Date().toISOString()});
      await put(T_LEADS,lead.id,nextLead);
      return sendJson(res,{lead:nextLead,student,created:!body.studentId});
    }
    const leadConvertCourtM=path.match(/^\/leads\/([^/]+)\/convert-court$/);
    if(leadConvertCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const leadId=leadConvertCourtM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(lead.courtId){
        const court=await get(T_COURTS,lead.courtId).catch(()=>null);
        return sendJson(res,{lead,court,created:false});
      }
      let court=body.courtId?await get(T_COURTS,body.courtId).catch(()=>null):null;
      if(!court){
        const courtMatch=matchLeadToCourt?matchLeadToCourt(lead,(await scan(T_COURTS).catch(()=>[])).filter(row=>String(row.status||'active')!=='inactive')):{matchType:'none',record:null};
        court=courtMatch.record||null;
        if(!court){
          court=buildLeadCourtRecord(lead,{studentId:lead.studentId,now:new Date().toISOString()});
          await put(T_COURTS,court.id,court);
        }
      }
      const membershipAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
      const nextLead=normalizeLeadRecord({...lead,courtId:court.id,membershipAccountId:membershipAccount?.id||lead.membershipAccountId||'',isCourtConverted:true,isMembershipConverted:!!membershipAccount,updatedAt:new Date().toISOString(),createdAt:lead.createdAt},{id:lead.id,now:new Date().toISOString()});
      await put(T_LEADS,lead.id,nextLead);
      return sendJson(res,{lead:nextLead,court,created:!body.courtId});
    }
    const leadLinkStudentM=path.match(/^\/leads\/([^/]+)\/link-student$/);
    if(leadLinkStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const lead=await get(T_LEADS,leadLinkStudentM[1]).catch(()=>null);
      const student=await get(T_STUDENTS,body.studentId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const nextLead=normalizeLeadRecord({...lead,studentId:student.id,isCourseConverted:true,createdAt:lead.createdAt},{id:lead.id,now:new Date().toISOString()});
      await put(T_LEADS,lead.id,nextLead);
      return sendJson(res,{lead:nextLead,student});
    }
    const leadLinkCourtM=path.match(/^\/leads\/([^/]+)\/link-court$/);
    if(leadLinkCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTables();
      const lead=await get(T_LEADS,leadLinkCourtM[1]).catch(()=>null);
      const court=await get(T_COURTS,body.courtId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(!court)return sendJson(res,{error:'订场用户不存在'},404);
      const membershipAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
      const nextLead=normalizeLeadRecord({...lead,courtId:court.id,membershipAccountId:membershipAccount?.id||'',isCourtConverted:true,isMembershipConverted:!!membershipAccount,createdAt:lead.createdAt},{id:lead.id,now:new Date().toISOString()});
      await put(T_LEADS,lead.id,nextLead);
      return sendJson(res,{lead:nextLead,court,membershipAccount});
    }
    return false;
  };
}

module.exports={createLeadsRoutes};
