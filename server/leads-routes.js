const { readLeadSourceRows } = require('./lead-source-read-model.js');
const { buildCustomerLifecycleRows } = require('./read-models/customer-lifecycle.js');
const { buildLeadPoolRows } = require('./read-models/platform-metrics.js');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

function createLeadsRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,get,scan,put,del,filterLoadAllForUser,isProductionRuntime,isCampusScopedAdmin,uuidv4,
    cleanLeadText,ensureLeadTables,scanFirstRows,PRODUCTION_PAGE_READ_LIMITS,
    LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS,LEAD_LIST_PROJECTION_FIELDS,mergeDuplicateLeadRows,
    normalizeLeadRecord,leadCanonicalNameKey,mergeLeadRows,buildLeadInitialFollowup,
    normalizeLeadFollowupRecord,applyLeadFollowupsSnapshot,applyLeadFollowupSnapshot,normalizeLeadImportRows,
    buildLeadImportPreviewRows,leadImportPreviewSummary,dedupeLeadRows,buildLeadDedupKey,buildLeadMergePlan,
    buildLeadStudentRecord,buildLeadCourtRecord,matchLeadToStudent,matchLeadToCourt,
    T_LEADS,T_LEAD_FOLLOWUPS,T_LEAD_IMPORT_BATCHES,T_STUDENTS,T_COURTS,T_MEMBERSHIP_ACCOUNTS,
    T_PURCHASES,T_ENTITLEMENTS,T_SCHEDULE,T_MEMBERSHIP_ORDERS,T_ENTITLEMENT_LEDGER,
    T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,T_FINANCIAL_LEDGER,T_PLANS,T_CLASSES,T_FEEDBACKS
  }=deps;
  const LEAD_LIST_CACHE_TTL_MS=30000;
  const LEAD_LIST_CACHE_MAX_ENTRIES=120;
  const leadSourceRowsCache={expiresAt:0,rows:null};
  const leadPagedResponseCache=new Map();

  function cloneLeadCachePayload(value){
    return JSON.parse(JSON.stringify(value));
  }

  function clearLeadListCaches(){
    leadSourceRowsCache.expiresAt=0;
    leadSourceRowsCache.rows=null;
    leadPagedResponseCache.clear();
  }

  function trimLeadPagedResponseCache(){
    while(leadPagedResponseCache.size>LEAD_LIST_CACHE_MAX_ENTRIES){
      const firstKey=leadPagedResponseCache.keys().next().value;
      if(!firstKey)break;
      leadPagedResponseCache.delete(firstKey);
    }
  }

  function leadListQueryCachePart(query){
    return [...(query||new URLSearchParams()).entries()]
      .map(([key,value])=>[cleanLeadText(key),cleanLeadText(value)])
      .sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
  }

  function leadListUserCachePart(user={}){
    const campusIds=Array.isArray(user.campusIds)?user.campusIds:[];
    return {
      role:cleanLeadText(user.role),
      name:cleanLeadText(user.name||user.username||user.id),
      dataScope:cleanLeadText(user.dataScope),
      campus:cleanLeadText(user.campus),
      campusIds:campusIds.map(cleanLeadText).sort()
    };
  }

  function leadPagedResponseCacheKey(query,user){
    return JSON.stringify({query:leadListQueryCachePart(query),user:leadListUserCachePart(user)});
  }

  function readLeadPagedResponseCache(key,now=Date.now()){
    const cached=leadPagedResponseCache.get(key);
    if(!cached||cached.expiresAt<=now){
      if(cached)leadPagedResponseCache.delete(key);
      return null;
    }
    return cloneLeadCachePayload(cached.payload);
  }

  function writeLeadPagedResponseCache(key,payload,now=Date.now()){
    leadPagedResponseCache.set(key,{expiresAt:now+LEAD_LIST_CACHE_TTL_MS,payload:cloneLeadCachePayload(payload)});
    trimLeadPagedResponseCache();
  }

  function leadSearchHit(q,...values){
    if(!q)return true;
    const keyword=String(q).toLowerCase().trim();
    return values.some(v=>String(v||'').toLowerCase().includes(keyword));
  }

  function parseLeadPaging(query){
    const enabled=query?.get('paged')==='1'||query?.get('page')||query?.get('pageSize');
    if(!enabled)return null;
    const page=Math.max(1,parseInt(query?.get('page')||'1',10)||1);
    const pageSize=Math.max(1,Math.min(parseInt(query?.get('pageSize')||'15',10)||15,100));
    return {page,pageSize};
  }

  function buildLeadListPage(rows=[],paging=null){
    if(!paging)return null;
    const total=rows.length;
    const pages=Math.max(1,Math.ceil(total/paging.pageSize));
    const page=Math.min(paging.page,pages);
    const start=(page-1)*paging.pageSize;
    return {rows:rows.slice(start,start+paging.pageSize),total,page,pageSize:paging.pageSize,pages};
  }

  function leadCsvValues(value){
    return cleanLeadText(value).split(',').map(item=>cleanLeadText(item)).filter(Boolean);
  }

  function leadRowFieldText(row,...fields){
    for(const field of fields){
      const value=cleanLeadText(row?.[field]);
      if(value)return value;
    }
    return '';
  }

  function leadDateMs(value){
    const raw=cleanLeadText(value).replace(' ','T');
    const parsed=Date.parse(raw);
    return Number.isFinite(parsed)?parsed:0;
  }

  function leadDateOnly(value){
    const text=cleanLeadText(value);
    const match=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(match)return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
    return text.slice(0,10);
  }

  function leadSortMetric(row,key){
    if(key==='leadDate')return leadDateMs(row?.leadDate||row?.createdAt);
    if(key==='trialLessonAt')return leadDateMs(row?.trialAtRaw||row?.trialLessonAt||row?.trialAt);
    if(key==='lastFollowupAt')return leadDateMs(row?.lastFollowupAt);
    if(key==='formalSignupAt')return leadDateMs(row?.courseFirstPurchaseAt||row?.formalSignupAt||row?.enrollAtRaw||row?.enrollAt);
    if(key==='followupCount')return Number(row?.followupCount)||0;
    return 0;
  }

  function sortLeadListRows(rows=[],query){
    const sortKey=cleanLeadText(query?.get('sortKey'));
    const sortDir=cleanLeadText(query?.get('sortDir'))==='asc'?'asc':'desc';
    if(sortKey){
      const dir=sortDir==='asc'?1:-1;
      return [...rows].sort((a,b)=>{
        const av=leadSortMetric(a,sortKey),bv=leadSortMetric(b,sortKey);
        const emptyA=!av,emptyB=!bv;
        if(emptyA&&emptyB)return cleanLeadText(b.updatedAt||b.createdAt||b.id).localeCompare(cleanLeadText(a.updatedAt||a.createdAt||a.id));
        if(emptyA)return 1;
        if(emptyB)return -1;
        return (av-bv)*dir||cleanLeadText(b.updatedAt||b.createdAt||b.id).localeCompare(cleanLeadText(a.updatedAt||a.createdAt||a.id));
      });
    }
    return [...rows].sort((a,b)=>{
      const leadDateDiff=leadDateMs(b?.leadDate||b?.createdAt)-leadDateMs(a?.leadDate||a?.createdAt);
      if(leadDateDiff!==0)return leadDateDiff;
      const followupDiff=leadDateMs(b?.lastFollowupAt)-leadDateMs(a?.lastFollowupAt);
      if(followupDiff!==0)return followupDiff;
      return cleanLeadText(b?.updatedAt||b?.createdAt||b?.id).localeCompare(cleanLeadText(a?.updatedAt||a?.createdAt||a?.id));
    });
  }

  function leadCampusMatches(row,value,name=''){
    const expected=normalizeCampusValue(value||name);
    if(!expected)return true;
    return [row?.campus,row?.campusCode,row?.campusName].some(item=>normalizeCampusValue(item)===expected);
  }

  function leadGlobalDateValue(row){
    return leadDateOnly(row?.leadDate||row?.createdAt||row?.updatedAt||row?.lastFollowupAt);
  }

  function leadSummaryBool(value){
    if(value===true)return true;
    const text=cleanLeadText(value).toLowerCase();
    return ['true','1','yes','是','已'].includes(text);
  }

  function leadSummaryRate(value,total){
    if(!total)return '0%';
    const percent=(Number(value)||0)*100/(Number(total)||0);
    return `${Number.isInteger(percent)?percent:percent.toFixed(1)}%`;
  }

  function leadSummaryTrialAttended(row={}){
    if(leadSummaryBool(row.hasTrialAttended))return true;
    if(cleanLeadText(row.trialAttendedAt))return true;
    return ['体验课完成','已体验待转化','已体验待成交'].includes(leadRowFieldText(row,'leadStage','systemStatus','rawStatus'));
  }

  function leadSummaryCourseConverted(row={}){
    return leadSummaryBool(row.hasCourseConversion)||leadSummaryBool(row.isCourseConverted)||!!cleanLeadText(row.studentId);
  }

  function buildLeadListSummary(rows=[]){
    const list=Array.isArray(rows)?rows:[];
    const total=list.length;
    const historicalStudents=list.filter(row=>leadSummaryBool(row.isHistoricalStudentRoster)||leadSummaryTrialAttended(row)||leadSummaryCourseConverted(row)).length;
    const activeStudents=list.filter(row=>leadSummaryBool(row.isActiveStudentRoster)).length;
    const trialAttended=list.filter(leadSummaryTrialAttended).length;
    const trialAttendedToFormalPurchase=list.filter(row=>leadSummaryBool(row.hasTrialToCourseConversion)||(leadSummaryTrialAttended(row)&&leadSummaryCourseConverted(row))).length;
    return {
      total,
      historicalStudents,
      historicalStudentRate:leadSummaryRate(historicalStudents,total),
      activeStudents,
      activeStudentRate:leadSummaryRate(activeStudents,historicalStudents),
      trialAttended,
      trialAttendedRate:leadSummaryRate(trialAttended,total),
      trialAttendedToFormalPurchase,
      trialAttendedToFormalPurchaseRate:leadSummaryRate(trialAttendedToFormalPurchase,trialAttended)
    };
  }

  function visibleLeadSourceRows(rows=[]){
    return (rows||[]).filter(row=>!['merged','voided','deleted'].includes(cleanLeadText(row?.status)));
  }

  function stableLeadCreateHash(value){
    let hash=2166136261;
    for(const ch of String(value||'')){
      hash^=ch.charCodeAt(0);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }

  function leadCreateStableId(lead){
    if(typeof buildLeadDedupKey!=='function')return '';
    const key=buildLeadDedupKey(lead);
    return key?`lead-manual-${stableLeadCreateHash(key)}`:'';
  }

  function earliestDuplicateLead(lead,rows=[]){
    if(typeof buildLeadDedupKey!=='function')return null;
    const key=buildLeadDedupKey(lead);
    const matches=visibleLeadSourceRows(rows).filter(row=>buildLeadDedupKey(row)===key);
    return matches.sort((a,b)=>
      String(a.createdAt||a.leadDate||'').localeCompare(String(b.createdAt||b.leadDate||''))||
      String(a.id||'').localeCompare(String(b.id||''))
    )[0]||null;
  }

  async function findExistingDuplicateLead(lead){
    if(!lead?.id)return null;
    const byId=typeof get==='function'?await get(T_LEADS,lead.id).catch(()=>null):null;
    if(byId&&!['merged','voided','deleted'].includes(cleanLeadText(byId.status)))return byId;
    const rows=typeof scan==='function'?await scan(T_LEADS).catch(()=>[]):[];
    return earliestDuplicateLead(lead,rows);
  }

  function hiddenLeadSourceIds(rows=[]){
    return new Set((rows||[])
      .filter(row=>['merged','voided','deleted'].includes(cleanLeadText(row?.status)))
      .map(row=>cleanLeadText(row?.id))
      .filter(Boolean));
  }

  async function readLeadMergeData(){
    const [
      leads,followups,students,courts,membershipAccounts,purchases,entitlements,schedule,membershipOrders,
      entitlementLedger,membershipBenefitLedger,membershipAccountEvents,financialLedger,plans,classes,feedbacks
    ]=await Promise.all([
      scan(T_LEADS).catch(()=>[]),
      T_LEAD_FOLLOWUPS?scan(T_LEAD_FOLLOWUPS).catch(()=>[]):Promise.resolve([]),
      T_STUDENTS?scan(T_STUDENTS).catch(()=>[]):Promise.resolve([]),
      T_COURTS?scan(T_COURTS).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNTS?scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([]),
      T_PURCHASES?scan(T_PURCHASES).catch(()=>[]):Promise.resolve([]),
      T_ENTITLEMENTS?scan(T_ENTITLEMENTS).catch(()=>[]):Promise.resolve([]),
      T_SCHEDULE?scan(T_SCHEDULE).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ORDERS?scan(T_MEMBERSHIP_ORDERS).catch(()=>[]):Promise.resolve([]),
      T_ENTITLEMENT_LEDGER?scan(T_ENTITLEMENT_LEDGER).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_BENEFIT_LEDGER?scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNT_EVENTS?scan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[]):Promise.resolve([]),
      T_FINANCIAL_LEDGER?scan(T_FINANCIAL_LEDGER).catch(()=>[]):Promise.resolve([]),
      T_PLANS?scan(T_PLANS).catch(()=>[]):Promise.resolve([]),
      T_CLASSES?scan(T_CLASSES).catch(()=>[]):Promise.resolve([]),
      T_FEEDBACKS?scan(T_FEEDBACKS).catch(()=>[]):Promise.resolve([])
    ]);
    return {
      leads,followups,students,courts,membershipAccounts,purchases,entitlements,schedule,membershipOrders,
      entitlementLedger,membershipBenefitLedger,membershipAccountEvents,financialLedger,plans,classes,feedbacks
    };
  }

  function leadMergeSummary(plan){
    return {
      primaryLeadId:plan.primaryLeadId,
      mergeLeadIds:plan.mergeLeadIds,
      primaryLead:plan.primaryUpdate,
      duplicateLeads:plan.duplicateLeadUpdates,
      studentProfileMerge:plan.studentProfileMerge,
      conflicts:plan.conflicts,
      counts:plan.counts
    };
  }

  function lifecycleSourcePatch(row,lead,now){
    const sourceLeadId=cleanLeadText(row?.sourceLeadId||row?.leadId||row?.fromLeadId||lead?.id);
    if(!row?.id||!sourceLeadId||cleanLeadText(row.sourceLeadId)===sourceLeadId)return null;
    return {...row,sourceLeadId,updatedAt:now};
  }

  async function ensureLifecycleSourceLink(table,row,lead,now){
    const next=lifecycleSourcePatch(row,lead,now);
    if(!next)return row;
    await put(table,next.id,next);
    return next;
  }

  function leadDealParts(lead={}){
    const deal=cleanLeadText(lead.dealType||lead.conversionType);
    return new Set(deal.split('+').map(cleanLeadText).filter(Boolean));
  }

  function leadHasConvertedDeal(lead={}){
    const stage=cleanLeadText(lead.leadStage||lead.systemStatus||lead.rawStatus||lead.status);
    if(/未成交|未转化/.test(stage))return false;
    return stage==='已成交'&&leadDealParts(lead).size>0;
  }

  function leadHasConvertedOutcome(lead={}){
    const stage=cleanLeadText(lead.leadStage||lead.systemStatus||lead.rawStatus||lead.status);
    return leadHasConvertedDeal(lead)||stage==='已成交'||lead.convertedFlag===true||lead.isCourseConverted===true||lead.isCourtConverted===true||lead.isMembershipConverted===true||!!cleanLeadText(lead.dealType||lead.conversionType);
  }

  function sourceLeadId(row={}){
    return cleanLeadText(row.sourceLeadId||row.leadId||row.fromLeadId);
  }

  function leadHasBusinessLinks(lead={},data={}){
    const leadId=cleanLeadText(lead.id);
    if(cleanLeadText(lead.studentId)||cleanLeadText(lead.courtId)||cleanLeadText(lead.membershipAccountId))return true;
    return [data.students,data.courts,data.membershipAccounts].some(rows=>(rows||[]).some(row=>sourceLeadId(row)===leadId));
  }

  async function readLeadDeleteData(){
    const [followups,students,courts,membershipAccounts]=await Promise.all([
      T_LEAD_FOLLOWUPS?scan(T_LEAD_FOLLOWUPS).catch(()=>[]):Promise.resolve([]),
      T_STUDENTS?scan(T_STUDENTS).catch(()=>[]):Promise.resolve([]),
      T_COURTS?scan(T_COURTS).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNTS?scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([])
    ]);
    return {followups,students,courts,membershipAccounts};
  }

  function fallbackId(prefix,lead={},linkedId=''){
    const source=cleanLeadText(lead.id||linkedId||Date.now());
    return `${prefix}-${source.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  }

  async function ensureDealStudent(lead={},now,preferredStudentId=''){
    if(!T_STUDENTS)return {student:null,created:false};
    if(cleanLeadText(lead.studentId)){
      let student=await get(T_STUDENTS,lead.studentId).catch(()=>null);
      if(student)student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
      return {student,created:false};
    }
    let student=preferredStudentId?await get(T_STUDENTS,preferredStudentId).catch(()=>null):null;
    if(!student){
      const studentMatch=matchLeadToStudent?matchLeadToStudent(lead,await scan(T_STUDENTS).catch(()=>[])):{matchType:'none',record:null};
      student=studentMatch.record||null;
    }
    let created=false;
    if(!student){
      student=buildLeadStudentRecord(lead,{now});
      await put(T_STUDENTS,student.id,student);
      created=true;
    }
    student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
    return {student,created};
  }

  async function ensureDealCourt(lead={},now,{studentId='',preferredCourtId=''}={}){
    if(!T_COURTS)return {court:null,created:false};
    if(cleanLeadText(lead.courtId)){
      let court=await get(T_COURTS,lead.courtId).catch(()=>null);
      if(court)court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
      return {court,created:false};
    }
    let court=preferredCourtId?await get(T_COURTS,preferredCourtId).catch(()=>null):null;
    if(!court){
      const courtRows=(await scan(T_COURTS).catch(()=>[])).filter(row=>String(row.status||'active')!=='inactive');
      const courtMatch=matchLeadToCourt?matchLeadToCourt(lead,courtRows):{matchType:'none',record:null};
      court=courtMatch.record||null;
    }
    let created=false;
    if(!court){
      court=buildLeadCourtRecord(lead,{studentId,now});
      await put(T_COURTS,court.id,court);
      created=true;
    }
    court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
    return {court,created};
  }

  function buildLeadMembershipAccountRecord(lead={},court={},now){
    const id=(typeof uuidv4==='function'?uuidv4():fallbackId('membership-from-lead',lead,court.id));
    return {
      id,
      courtId:cleanLeadText(court.id||court.courtId),
      courtName:cleanLeadText(court.name||court.courtName||lead.displayName||lead.wechatName),
      phone:cleanLeadText(court.phone||lead.phone),
      status:'active',
      sourceLeadId:cleanLeadText(lead.id),
      memberLabel:'线索成交待开卡',
      createdAt:now,
      updatedAt:now
    };
  }

  async function ensureDealMembershipAccount(lead={},court={},now){
    if(!T_MEMBERSHIP_ACCOUNTS||!cleanLeadText(court?.id))return {membershipAccount:null,created:false};
    const rows=await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);
    let membershipAccount=(rows||[]).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
    if(membershipAccount){
      membershipAccount=await ensureLifecycleSourceLink(T_MEMBERSHIP_ACCOUNTS,membershipAccount,lead,now);
      return {membershipAccount,created:false};
    }
    membershipAccount=buildLeadMembershipAccountRecord(lead,court,now);
    await put(T_MEMBERSHIP_ACCOUNTS,membershipAccount.id,membershipAccount);
    return {membershipAccount,created:true};
  }

  async function materializeLeadConversionIdentities(lead={},options={}){
    if(!lead?.id||!leadHasConvertedDeal(lead))return {lead,student:null,court:null,membershipAccount:null,created:{student:false,court:false,membershipAccount:false},changed:false};
    const parts=leadDealParts(lead);
    const needsStudent=parts.has('课程')||parts.has('陪打');
    const needsCourt=parts.has('订场')||parts.has('订场会员');
    const needsMembership=parts.has('订场会员');
    if(!needsStudent&&!needsCourt&&!needsMembership)return {lead,student:null,court:null,membershipAccount:null,created:{student:false,court:false,membershipAccount:false},changed:false};
    const now=options.now||new Date().toISOString();
    let nextLead={...lead};
    let student=null,court=null,membershipAccount=null;
    const created={student:false,court:false,membershipAccount:false};
    if(needsStudent){
      const result=await ensureDealStudent(nextLead,now,options.studentId||'');
      student=result.student;
      created.student=result.created;
      if(student?.id)nextLead={...nextLead,studentId:student.id};
    }
    if(needsCourt){
      const result=await ensureDealCourt(nextLead,now,{studentId:nextLead.studentId||'',preferredCourtId:options.courtId||''});
      court=result.court;
      created.court=result.created;
      if(court?.id)nextLead={...nextLead,courtId:court.id};
    }
    if(needsMembership&&court?.id){
      const result=await ensureDealMembershipAccount(nextLead,court,now);
      membershipAccount=result.membershipAccount;
      created.membershipAccount=result.created;
      if(membershipAccount?.id)nextLead={...nextLead,membershipAccountId:membershipAccount.id};
    }
    const normalized=normalizeLeadRecord({
      ...nextLead,
      isCourseConverted:nextLead.isCourseConverted===true||needsStudent,
      isCourtConverted:nextLead.isCourtConverted===true||needsCourt,
      isMembershipConverted:nextLead.isMembershipConverted===true||!!nextLead.membershipAccountId,
      createdAt:lead.createdAt
    },{id:lead.id,now});
    const changed=['studentId','courtId','membershipAccountId','isCourseConverted','isCourtConverted','isMembershipConverted'].some(key=>String(normalized[key]??'')!==String(lead[key]??''));
    if(changed)await put(T_LEADS,lead.id,normalized);
    return {lead:normalized,student,court,membershipAccount,created,changed};
  }

  async function materializeLeadConversionRows(leads=[]){
    const next=[];
    for(const lead of leads||[]){
      const result=await materializeLeadConversionIdentities(lead);
      next.push(result.lead);
    }
    return next;
  }

  function syntheticLeadIdForLifecycle(row={}){
    const studentId=cleanLeadText(row.studentId);
    return studentId?`lead-from-student-${studentId}`:'';
  }

  function buildSyntheticLeadRecord(row={},id,now){
    const leadDate=cleanLeadText(row.firstTouchAt||row.leadEnteredAt||row.leadDate||row.trialAtRaw||row.courseFirstPurchaseAt||row.conversionAt);
    const raw={
      id,
      displayName:cleanLeadText(row.displayName),
      name:cleanLeadText(row.displayName),
      wechatName:cleanLeadText(row.displayName),
      phone:cleanLeadText(row.phone),
      source:cleanLeadText(row.source),
      campus:cleanLeadText(row.campus),
      customerType:cleanLeadText(row.customerType),
      demandProduct:cleanLeadText(row.demandProduct),
      consultType:cleanLeadText(row.demandProduct),
      profileNote:'',
      owner:cleanLeadText(row.owner),
      leadDate,
      trialAtRaw:cleanLeadText(row.trialAtRaw),
      enrollAtRaw:cleanLeadText(row.courseFirstPurchaseAt),
      formalCoach:cleanLeadText(row.formalCoach),
      studentId:cleanLeadText(row.studentId),
      createdAt:cleanLeadText(row.createdAt)||now,
      updatedAt:now
    };
    return normalizeLeadRecord?normalizeLeadRecord(raw,{id,now}):raw;
  }

  function groupLeadFollowupsByLeadId(followups=[]){
    const map=new Map();
    for(const row of followups||[]){
      const leadId=cleanLeadText(row?.leadId);
      if(!leadId)continue;
      const list=map.get(leadId)||[];
      list.push(row);
      map.set(leadId,list);
    }
    return map;
  }

  function applyCurrentLeadSnapshots(leads=[],followups=[]){
    if(typeof applyLeadFollowupsSnapshot!=='function')return leads||[];
    const followupsByLeadId=groupLeadFollowupsByLeadId(followups);
    return (leads||[]).map(lead=>{
      const leadId=cleanLeadText(lead?.id);
      const rows=leadId?followupsByLeadId.get(leadId):null;
      return rows?.length?applyLeadFollowupsSnapshot(lead,rows):lead;
    });
  }

  async function readLeadFollowupRows(){
    if(!T_LEAD_FOLLOWUPS)return [];
    if(isProductionRuntime()){
      if(typeof scanFirstRows!=='function')return [];
      return scanFirstRows(T_LEAD_FOLLOWUPS,{
        limit:PRODUCTION_PAGE_READ_LIMITS?.leadFollowups,
        columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS
      }).catch(()=>[]);
    }
    if(typeof getCachedScan!=='function')return [];
    return getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]);
  }

  async function applyPersistedLeadSnapshot(lead){
    const leadId=cleanLeadText(lead?.id);
    if(!leadId||!T_LEAD_FOLLOWUPS||typeof scan!=='function'||typeof applyLeadFollowupsSnapshot!=='function')return lead;
    const rows=(await scan(T_LEAD_FOLLOWUPS).catch(()=>[])).filter(row=>cleanLeadText(row.leadId)===leadId);
    return rows.length?applyLeadFollowupsSnapshot(lead,rows):lead;
  }

  async function materializeStudentLifecycleLeads(mergedLeads=[],customerLifecycleRows=[]){
    const existingIds=new Set((mergedLeads||[]).map(row=>cleanLeadText(row.id)).filter(Boolean));
    const existingStudentIds=new Set((mergedLeads||[]).map(row=>cleanLeadText(row.studentId)).filter(Boolean));
    const now=new Date().toISOString();
    const created=[];
    for(const row of customerLifecycleRows||[]){
      const studentId=cleanLeadText(row.studentId);
      if(!studentId||cleanLeadText(row.sourceLeadId)||existingStudentIds.has(studentId))continue;
      const id=syntheticLeadIdForLifecycle(row);
      if(!id||existingIds.has(id))continue;
      const lead=buildSyntheticLeadRecord(row,id,now);
      await put(T_LEADS,id,lead);
      created.push(lead);
      existingIds.add(id);
      existingStudentIds.add(studentId);
    }
    return created;
  }

  async function readLeadPoolRows({lifecycleScope='all'}={}){
    const [leads,followups,students,purchases,entitlements,schedule,courts,membershipAccounts,membershipOrders]=await Promise.all([
      readLeadSourceRows({isProductionRuntime,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS}),
      readLeadFollowupRows(),
      T_STUDENTS?getCachedScan(T_STUDENTS).catch(()=>[]):Promise.resolve([]),
      T_PURCHASES?getCachedScan(T_PURCHASES).catch(()=>[]):Promise.resolve([]),
      T_ENTITLEMENTS?getCachedScan(T_ENTITLEMENTS).catch(()=>[]):Promise.resolve([]),
      T_SCHEDULE?getCachedScan(T_SCHEDULE).catch(()=>[]):Promise.resolve([]),
      T_COURTS?getCachedScan(T_COURTS).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNTS?getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ORDERS?getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]):Promise.resolve([])
    ]);
    const hiddenLeadIds=hiddenLeadSourceIds(leads);
    let mergedLeads=await materializeLeadConversionRows(mergeDuplicateLeadRows(applyCurrentLeadSnapshots(visibleLeadSourceRows(leads),followups)));
    let customerLifecycleRows=buildCustomerLifecycleRows({
      leads:mergedLeads,
      students,
      purchases,
      entitlements,
      schedule,
      courts,
      membershipAccounts,
      membershipOrders
    });
    const createdLeads=await materializeStudentLifecycleLeads(mergedLeads,customerLifecycleRows);
    if(createdLeads.length){
      mergedLeads=mergeDuplicateLeadRows([...mergedLeads,...createdLeads]);
      customerLifecycleRows=buildCustomerLifecycleRows({
        leads:mergedLeads,
        students,
        purchases,
        entitlements,
        schedule,
        courts,
        membershipAccounts,
        membershipOrders
      });
    }
    return buildLeadPoolRows({leads:mergedLeads,customerLifecycleRows,lifecycleScope,mergeDuplicates:false})
      .filter(row=>!hiddenLeadIds.has(cleanLeadText(row.id))&&!hiddenLeadIds.has(cleanLeadText(row.sourceLeadId)));
  }

  async function readVisibleLeadRows({expandLifecycleSearch=false}={}){
    return readLeadPoolRows({lifecycleScope:expandLifecycleSearch?'all':'course'});
  }

  async function readFastVisibleLeadRows(){
    const now=Date.now();
    if(Array.isArray(leadSourceRowsCache.rows)&&leadSourceRowsCache.expiresAt>now)return leadSourceRowsCache.rows;
    const rows=await readLeadSourceRows({isProductionRuntime,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS});
    const visibleRows=mergeDuplicateLeadRows(visibleLeadSourceRows(rows));
    leadSourceRowsCache.rows=visibleRows;
    leadSourceRowsCache.expiresAt=now+LEAD_LIST_CACHE_TTL_MS;
    return visibleRows;
  }

  async function ensureLeadTablesForRequest(){
    if(typeof isProductionRuntime==='function'&&isProductionRuntime())return;
    if(typeof ensureLeadTables==='function')await ensureLeadTables();
  }

  return async function handleLeadsRoutes({path,method,body,user,res,query}){
    if(path==='/lead-followups'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=cleanLeadText(query.get('leadId'));
      const rows=isProductionRuntime()?await scanFirstRows(T_LEAD_FOLLOWUPS,{limit:PRODUCTION_PAGE_READ_LIMITS.leadFollowups,columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]);
      if(!isCampusScopedAdmin(user))return sendJson(res,leadId?rows.filter(row=>String(row.leadId||'')===leadId):rows);
      const leads=await readLeadSourceRows({isProductionRuntime,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS});
      const scoped=filterLoadAllForUser({leads,leadFollowups:rows},user).leadFollowups;
      return sendJson(res,leadId?scoped.filter(row=>String(row.leadId||'')===leadId):scoped);
    }
    if(path==='/leads'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      if(method==='GET'){
        const q=cleanLeadText(query.get('q')).toLowerCase();
        const paging=parseLeadPaging(query);
        const responseCacheKey=paging?leadPagedResponseCacheKey(query,user):'';
        const cachedResponse=responseCacheKey?readLeadPagedResponseCache(responseCacheKey):null;
        if(cachedResponse)return sendJson(res,cachedResponse);
        const rows=paging?await readFastVisibleLeadRows():await readVisibleLeadRows({expandLifecycleSearch:!!q});
        const source=cleanLeadText(query.get('source'));
        const customerType=cleanLeadText(query.get('customerType'));
        const consultType=cleanLeadText(query.get('consultType')||query.get('demandProduct'));
        const ownerValues=leadCsvValues(query.get('owner'));
        const systemStatus=cleanLeadText(query.get('systemStatus')||query.get('leadStage'));
        const dealType=cleanLeadText(query.get('dealType'));
        const campusValue=cleanLeadText(query.get('campus'));
        const campusName=cleanLeadText(query.get('campusName'));
        const waiting=cleanLeadText(query.get('waiting'));
        const dateFrom=cleanLeadText(query.get('dateFrom'));
        const dateTo=cleanLeadText(query.get('dateTo'));
        const startDate=cleanLeadText(query.get('startDate'));
        const endDate=cleanLeadText(query.get('endDate'));
        const todayStr=new Date().toISOString().slice(0,10);
        const visibleRows=filterLoadAllForUser({leads:rows},user).leads;
        const filtered=visibleRows.filter(row=>{
          if(q&&!leadSearchHit(q,row.displayName,row.wechatName,row.name,row.phone,row.source,row.customerType,row.demandProduct,row.consultType,row.intentLevel,row.owner,row.profileNote,row.rawStatus,row.systemStatus,row.leadStage,row.studentStage,row.courtStage,row.membershipStatus,row.latestConcern,row.latestConclusion,row.nextAction))return false;
          if(source&&leadRowFieldText(row,'source')!==source)return false;
          if(customerType&&leadRowFieldText(row,'customerType','consultType','demandProduct','profileNote')!==customerType)return false;
          if(consultType&&leadRowFieldText(row,'demandProduct','consultType')!==consultType)return false;
          if(ownerValues.length&&!ownerValues.includes(leadRowFieldText(row,'owner')))return false;
          if(systemStatus&&leadRowFieldText(row,'leadStage','systemStatus','rawStatus')!==systemStatus)return false;
          if(dealType&&leadRowFieldText(row,'dealType','conversionType')!==dealType)return false;
          if((campusValue||campusName)&&!leadCampusMatches(row,campusValue,campusName))return false;
          const leadDateValue=leadDateOnly(row.leadDate);
          if(dateFrom&&leadDateValue<dateFrom)return false;
          if(dateTo&&leadDateValue>dateTo)return false;
          if(startDate&&leadGlobalDateValue(row)<startDate)return false;
          if(endDate&&leadGlobalDateValue(row)>endDate)return false;
          if(waiting==='today'&&String(row.nextFollowupAt||'').slice(0,10)!==todayStr)return false;
          if(waiting==='overdue'&&String(row.nextFollowupAt||'').slice(0,10)>=todayStr)return false;
          return true;
        });
        const sorted=sortLeadListRows(filtered,query);
        const summary=buildLeadListSummary(filtered);
        const payload=paging?{...buildLeadListPage(sorted,paging),summary}:sorted;
        if(responseCacheKey)writeLeadPagedResponseCache(responseCacheKey,payload);
        return sendJson(res,payload);
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const draft=normalizeLeadRecord({...body,createdAt:now,updatedAt:now},{now});
        const stableId=cleanLeadText(body.id)?'':leadCreateStableId(draft);
        const lead=stableId?normalizeLeadRecord({...body,id:stableId,createdAt:now,updatedAt:now},{id:stableId,now}):draft;
        const existing=await findExistingDuplicateLead(lead);
        if(existing)return sendJson(res,{lead:existing,followup:null,duplicate:true});
        const materialized=await materializeLeadConversionIdentities(lead,{now});
        if(!materialized.changed)await put(T_LEADS,lead.id,lead);
        const followup=body.createInitialFollowup===false?null:buildLeadInitialFollowup(lead);
        if(followup)await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        clearLeadListCaches();
        return sendJson(res,{lead:materialized.lead,followup});
      }
    }
    if(path==='/leads/merge-preview'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      try{
        const plan=buildLeadMergePlan({
          primaryLeadId:body.primaryLeadId,
          mergeLeadIds:body.mergeLeadIds,
          data:await readLeadMergeData(),
          finalLeadStage:body.finalLeadStage,
          operator:user.name||''
        });
        return sendJson(res,leadMergeSummary(plan));
      }catch(error){
        return sendJson(res,{error:error.message||'线索合并预览失败'},error.statusCode||400);
      }
    }
    if(path==='/leads/merge'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      try{
        const plan=buildLeadMergePlan({
          primaryLeadId:body.primaryLeadId,
          mergeLeadIds:body.mergeLeadIds,
          data:await readLeadMergeData(),
          finalLeadStage:body.finalLeadStage,
          operator:user.name||''
        });
        await put(T_LEADS,plan.primaryUpdate.id,plan.primaryUpdate);
        for(const row of plan.movedFollowups)await put(T_LEAD_FOLLOWUPS,row.id,row);
        for(const row of plan.duplicateLeadUpdates)await put(T_LEADS,row.id,row);
        for(const row of plan.studentSourceUpdates)await put(T_STUDENTS,row.id,row);
        if(plan.studentProfileMerge?.targetStudentUpdate)await put(T_STUDENTS,plan.studentProfileMerge.targetStudentUpdate.id,plan.studentProfileMerge.targetStudentUpdate);
        for(const row of plan.studentProfileMerge?.sourceStudentUpdates||[])await put(T_STUDENTS,row.id,row);
        for(const row of plan.courtSourceUpdates)await put(T_COURTS,row.id,row);
        for(const row of plan.membershipSourceUpdates)await put(T_MEMBERSHIP_ACCOUNTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.purchases||[])await put(T_PURCHASES,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.entitlements||[])await put(T_ENTITLEMENTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.entitlementLedger||[])await put(T_ENTITLEMENT_LEDGER,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.schedule||[])await put(T_SCHEDULE,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipOrders||[])await put(T_MEMBERSHIP_ORDERS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipBenefitLedger||[])await put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipAccountEvents||[])await put(T_MEMBERSHIP_ACCOUNT_EVENTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipAccounts||[])await put(T_MEMBERSHIP_ACCOUNTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.courts||[])await put(T_COURTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.financialLedger||[])await put(T_FINANCIAL_LEDGER,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.plans||[])await put(T_PLANS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.classes||[])await put(T_CLASSES,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.feedbacks||[])await put(T_FEEDBACKS,row.id,row);
        clearLeadListCaches();
        return sendJson(res,leadMergeSummary(plan));
      }catch(error){
        return sendJson(res,{error:error.message||'线索合并失败'},error.statusCode||400);
      }
    }
    const leadIdM=path.match(/^\/leads\/([^/]+)$/);
    if(leadIdM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await ensureLeadTablesForRequest();
      const leadId=leadIdM[1];
      if(method==='GET'){
        await init();
        const raw=await get(T_LEADS,leadId).catch(()=>null);
        if(!raw)return sendJson(res,{error:'线索不存在'},404);
        const snapshot=await applyPersistedLeadSnapshot(raw);
        const scopedRaw=filterLoadAllForUser({leads:[snapshot]},user).leads||[];
        if(!scopedRaw.length)return sendJson(res,{error:'线索不存在'},404);
        return sendJson(res,scopedRaw[0]);
      }
      if(method==='PUT'){
        await init();
        const old=await get(T_LEADS,leadId).catch(()=>null);
        if(!old)return sendJson(res,{error:'线索不存在'},404);
        const now=new Date().toISOString();
        const normalized=normalizeLeadRecord({...old,...body,id:leadId,createdAt:old.createdAt},{now});
        const next=await applyPersistedLeadSnapshot(normalized);
        const materialized=await materializeLeadConversionIdentities(next,{now});
        if(!materialized.changed)await put(T_LEADS,leadId,next);
        clearLeadListCaches();
        return sendJson(res,materialized.lead);
      }
      if(method==='DELETE'){
        await init();
        const lead=await get(T_LEADS,leadId).catch(()=>null);
        if(!lead)return sendJson(res,{error:'线索不存在'},404);
        const now=new Date().toISOString();
        const data=await readLeadDeleteData();
        const linked=leadHasBusinessLinks(lead,data);
        const converted=leadHasConvertedOutcome(lead);
        const followups=(data.followups||[]).filter(row=>cleanLeadText(row.leadId)===cleanLeadText(leadId));
        if(!linked&&!converted){
          await Promise.all([
            del(T_LEADS,leadId),
            ...followups.map(row=>del(T_LEAD_FOLLOWUPS,row.id))
          ]);
          clearLeadListCaches();
          return sendJson(res,{success:true,deleted:true,archived:false,followupIds:followups.map(row=>row.id)});
        }
        const next={...lead,status:'voided',voidedAt:lead.voidedAt||now,voidedBy:user.name||'',voidReason:cleanLeadText(body?.reason)||'线索删除时自动作废，历史业务数据保留',updatedAt:now};
        await put(T_LEADS,leadId,next);
        clearLeadListCaches();
        return sendJson(res,{success:true,deleted:false,archived:true,lead:next});
      }
    }
    const leadFollowupIdM=path.match(/^\/lead-followups\/([^/]+)$/);
    if(leadFollowupIdM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const followupId=leadFollowupIdM[1];
      if(method==='PUT'){
        const oldFollowup=await get(T_LEAD_FOLLOWUPS,followupId).catch(()=>null);
        if(!oldFollowup)return sendJson(res,{error:'跟进记录不存在'},404);
        const leadId=cleanLeadText(oldFollowup.leadId);
        const lead=await get(T_LEADS,leadId).catch(()=>null);
        if(!lead)return sendJson(res,{error:'线索不存在'},404);
        const now=new Date().toISOString();
        const followup=normalizeLeadFollowupRecord({...oldFollowup,...body,id:followupId,leadId,createdAt:oldFollowup.createdAt},{now});
        await put(T_LEAD_FOLLOWUPS,followupId,followup);
        const rows=(await scan(T_LEAD_FOLLOWUPS).catch(()=>[])).filter(row=>String(row.leadId||'')===String(leadId)).map(row=>String(row.id||'')===String(followupId)?followup:row);
        const nextLead=applyLeadFollowupsSnapshot(lead,rows);
        const materialized=await materializeLeadConversionIdentities(nextLead,{now});
        if(!materialized.changed)await put(T_LEADS,leadId,nextLead);
        clearLeadListCaches();
        return sendJson(res,{followup,lead:materialized.lead});
      }
    }
    const leadFollowupsM=path.match(/^\/leads\/([^/]+)\/followups$/);
    if(leadFollowupsM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
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
        const now=new Date().toISOString();
        const followup=normalizeLeadFollowupRecord({...body,leadId,followupBy:body.followupBy||user.name||''},{now});
        await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        const nextLead=applyLeadFollowupSnapshot(lead,followup);
        const materialized=await materializeLeadConversionIdentities(nextLead,{now});
        if(!materialized.changed)await put(T_LEADS,leadId,nextLead);
        clearLeadListCaches();
        return sendJson(res,{followup,lead:materialized.lead});
      }
    }
    if(path==='/leads/import-preview'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
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
      await ensureLeadTablesForRequest();
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
        const now=new Date().toISOString();
        const lead=normalizeLeadRecord(row,{id:row.id,now});
        const materialized=await materializeLeadConversionIdentities(lead,{now});
        if(!materialized.changed)await put(T_LEADS,lead.id,lead);
        createdLeads.push(materialized.lead);
        const followup=buildLeadInitialFollowup(materialized.lead);
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
      clearLeadListCaches();
      return sendJson(res,result);
    }
    const leadConvertStudentM=path.match(/^\/leads\/([^/]+)\/convert-student$/);
    if(leadConvertStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=leadConvertStudentM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(lead.studentId){
        const now=new Date().toISOString();
        let student=await get(T_STUDENTS,lead.studentId).catch(()=>null);
        if(student)student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
        const materialized=await materializeLeadConversionIdentities(lead,{now,studentId:lead.studentId});
        clearLeadListCaches();
        return sendJson(res,{lead:materialized.lead,student,created:false});
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
      const now=new Date().toISOString();
      student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
      const nextLead=normalizeLeadRecord({...lead,studentId:student.id,isCourseConverted:true,membershipAccountId:lead.membershipAccountId||'',updatedAt:now,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,studentId:student.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      clearLeadListCaches();
      return sendJson(res,{lead:materialized.lead,student,created:!body.studentId});
    }
    const leadConvertCourtM=path.match(/^\/leads\/([^/]+)\/convert-court$/);
    if(leadConvertCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=leadConvertCourtM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(lead.courtId){
        const now=new Date().toISOString();
        let court=await get(T_COURTS,lead.courtId).catch(()=>null);
        if(court)court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
        const materialized=await materializeLeadConversionIdentities(lead,{now,courtId:lead.courtId});
        clearLeadListCaches();
        return sendJson(res,{lead:materialized.lead,court,created:false});
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
      const now=new Date().toISOString();
      court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
      const membershipAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
      const nextLead=normalizeLeadRecord({...lead,courtId:court.id,membershipAccountId:membershipAccount?.id||lead.membershipAccountId||'',isCourtConverted:true,isMembershipConverted:!!membershipAccount,updatedAt:now,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,courtId:court.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      clearLeadListCaches();
      return sendJson(res,{lead:materialized.lead,court,created:!body.courtId});
    }
    const leadLinkStudentM=path.match(/^\/leads\/([^/]+)\/link-student$/);
    if(leadLinkStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadLinkStudentM[1]).catch(()=>null);
      const student=await get(T_STUDENTS,body.studentId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const now=new Date().toISOString();
      const linkedStudent=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
      const nextLead=normalizeLeadRecord({...lead,studentId:linkedStudent.id,isCourseConverted:true,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,studentId:linkedStudent.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      clearLeadListCaches();
      return sendJson(res,{lead:materialized.lead,student:linkedStudent});
    }
    const leadLinkCourtM=path.match(/^\/leads\/([^/]+)\/link-court$/);
    if(leadLinkCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadLinkCourtM[1]).catch(()=>null);
      const court=await get(T_COURTS,body.courtId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(!court)return sendJson(res,{error:'订场用户不存在'},404);
      const now=new Date().toISOString();
      const linkedCourt=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
      const membershipAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
      const nextLead=normalizeLeadRecord({...lead,courtId:linkedCourt.id,membershipAccountId:membershipAccount?.id||'',isCourtConverted:true,isMembershipConverted:!!membershipAccount,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,courtId:linkedCourt.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      clearLeadListCaches();
      return sendJson(res,{lead:materialized.lead,court:linkedCourt,membershipAccount:materialized.membershipAccount||membershipAccount});
    }
    const leadUnlinkStudentM=path.match(/^\/leads\/([^/]+)\/unlink-student$/);
    if(leadUnlinkStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadUnlinkStudentM[1]).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      const student=lead.studentId?await get(T_STUDENTS,lead.studentId).catch(()=>null):null;
      const now=new Date().toISOString();
      const nextLead=normalizeLeadRecord({...lead,studentId:'',isCourseConverted:false,dealType:'',conversionType:'',createdAt:lead.createdAt},{id:lead.id,now});
      await put(T_LEADS,lead.id,nextLead);
      let nextStudent=student;
      if(student&&cleanLeadText(student.sourceLeadId||student.leadId||student.fromLeadId)===cleanLeadText(lead.id)){
        nextStudent={...student,sourceLeadId:'',leadId:'',fromLeadId:'',updatedAt:now};
        await put(T_STUDENTS,nextStudent.id,nextStudent);
      }
      clearLeadListCaches();
      return sendJson(res,{lead:nextLead,student:nextStudent});
    }
    const leadUnlinkCourtM=path.match(/^\/leads\/([^/]+)\/unlink-court$/);
    if(leadUnlinkCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadUnlinkCourtM[1]).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      const court=lead.courtId?await get(T_COURTS,lead.courtId).catch(()=>null):null;
      const now=new Date().toISOString();
      const nextLead=normalizeLeadRecord({...lead,courtId:'',membershipAccountId:'',isCourtConverted:false,isMembershipConverted:false,dealType:'',conversionType:'',createdAt:lead.createdAt},{id:lead.id,now});
      await put(T_LEADS,lead.id,nextLead);
      let nextCourt=court;
      if(court&&cleanLeadText(court.sourceLeadId||court.leadId||court.fromLeadId)===cleanLeadText(lead.id)){
        nextCourt={...court,sourceLeadId:'',leadId:'',fromLeadId:'',updatedAt:now};
        await put(T_COURTS,nextCourt.id,nextCourt);
      }
      clearLeadListCaches();
      return sendJson(res,{lead:nextLead,court:nextCourt});
    }
    return false;
  };
}

module.exports={createLeadsRoutes};
