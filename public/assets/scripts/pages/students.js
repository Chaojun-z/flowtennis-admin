// ===== 学员信息 =====
let studentDetailActiveTab='basic';
let studentDetailEditingSection='';
let studentDetailEditingStudentId='';
let studentDetailRequestSeq=0;
let studentDetailPrewarmSeq=0;
let studentDetailPrewarmKey='';
let studentReminderModeRequestSeq=0;
let studentReminderModeSaveTimer=null;
let studentReminderLinkGenerating=false;
let studentSortMode='';
const STUDENT_DETAIL_PREWARM_CONCURRENCY=2;
const STUDENT_DETAIL_PREWARM_MAX_ROWS=10;
const STUDENT_DEAL_PATH_LABELS=['体验转化','直接成交','老客续费'];
let studentListPageStateByMode={package:{page:1,pageSize:15},trial:{page:1,pageSize:15}};
function studentListViewMode(){
  return currentPage==='trial-students'?'trial':'package';
}
function studentListPageStateKey(){
  return studentListViewMode()==='trial'?'trial':'package';
}
function syncStudentPageGlobalsFromMode(){
  const key=studentListPageStateKey();
  const state=studentListPageStateByMode[key]||{page:1,pageSize:15};
  stuPage=state.page||standardListFirstPage();
  stuPageSize=standardListPageSize(state.pageSize||15,15);
}
function persistStudentPageGlobalsToMode(){
  const key=studentListPageStateKey();
  studentListPageStateByMode[key]={page:stuPage,pageSize:stuPageSize};
}
function resetCurrentStudentListPage(){
  syncStudentPageGlobalsFromMode();
  stuPage=standardListFirstPage();
  persistStudentPageGlobalsToMode();
}
function resetAllStudentListPages(){
  studentListPageStateByMode={
    package:{...(studentListPageStateByMode.package||{}),page:standardListFirstPage()},
    trial:{...(studentListPageStateByMode.trial||{}),page:standardListFirstPage()}
  };
  syncStudentPageGlobalsFromMode();
}
function studentPackageRecordIsTrial(row={}){
  const lifecycle=studentLifecycleRow(row)||{};
  if(customerLifecycleText(lifecycle.hasTrialExperience)==='true'||lifecycle.hasTrialExperience===true)return true;
  const type=normalizeCourseType(row.standardCourseType||row.courseType||row.packageCourseType||'');
  return type==='体验课';
}
function studentHasNonTrialPackage(stu){
  return customerLifecycleText(studentLifecycleStage(stu))==='formal';
}
function studentHasTrialPath(stu){
  const lifecycle=studentLifecycleRow(stu)||{};
  return !!(lifecycle.hasTrialExperience||customerLifecycleText(lifecycle.trialStatus));
}
function studentLifecycleRow(stu){
  const sid=String(stu?.id||stu?.studentId||'');
  if(!sid)return null;
  return typeof customerLifecycleByStudentId==='function'?customerLifecycleByStudentId(sid):null;
}
function studentLifecycleStage(stu){
  return typeof customerLifecycleStudentStage==='function'?customerLifecycleStudentStage(stu):String(studentLifecycleRow(stu)?.studentStage||'').trim();
}
function studentMatchesListPage(stu){
  const lifecycleStage=studentLifecycleStage(stu);
  if(lifecycleStage)return studentListViewMode()==='trial'?['trial','formal'].includes(lifecycleStage):lifecycleStage==='formal';
  const hasPackage=studentHasNonTrialPackage(stu);
  return studentListViewMode()==='trial'?studentHasTrialPath(stu)||hasPackage:hasPackage;
}
function studentUnifiedViewRows({includeSearchIndex=false}={}){
  const rows=typeof teachingStudentViewRows==='function'?teachingStudentViewRows(studentListViewMode()):[];
  const searchRows=includeSearchIndex&&Array.isArray(teachingStudentViews?.searchableStudents)?teachingStudentViews.searchableStudents:[];
  const baseRows=Array.isArray(rows)?rows:[];
  const sourceRows=searchRows.length?baseRows.concat(searchRows):baseRows;
  if(!sourceRows.length)return [];
  const seen=new Set();
  return sourceRows.map(row=>{
    const student=students.find(item=>String(item.id||'')===String(row.studentId||row.id||''))||{};
    const studentHasNotes=Object.prototype.hasOwnProperty.call(student,'notes');
    const rowHasNotes=Object.prototype.hasOwnProperty.call(row,'notes');
    const notes=studentHasNotes?student.notes:(rowHasNotes?row.notes:(student.profileNote||row.profileNote||''));
    return {
      ...student,
      ...row,
      id:String(row.studentId||row.id||student.id||''),
      name:student.name||row.name||row.displayName||'',
      phone:student.phone||row.phone||'',
      type:row.type||student.type||'',
      source:row.source||student.source||'',
      campus:row.campus||student.campus||'',
      primaryCoach:row.primaryCoach||student.primaryCoach||'',
      notes,
      profileNote:row.profileNote||student.profileNote||'',
      searchText:row.searchText||student.searchText||'',
      __unifiedTeachingView:true
    };
  }).filter(row=>{
    const id=String(row.id||'').trim();
    if(!id||seen.has(id))return false;
    seen.add(id);
    return !isHiddenStudentProfile(row);
  });
}
function studentUnifiedRecordForId(id){
  const sid=String(id||'');
  if(!sid)return null;
  const detail=typeof studentDetailViewForId==='function'?studentDetailViewForId(sid):null;
  const base=studentUnifiedViewRows().find(row=>String(row.id||row.studentId||'')===sid)
    || students.find(row=>String(row.id||'')===sid)
    || null;
  return detail?{...(base||{}),...detail}:base;
}
function onStudentFilterChange(){resetCurrentStudentListPage();renderStudents();}
function studentSourceOptions(){
  return FlowTennisBusinessTaxonomy.optionList('leadSources');
}
function studentTrialStatusOptions(){
  return ['-','已约体验','已体验待成交','已成交'].map(value=>({value,label:value}));
}
function studentDealPathOptions(){
  return STUDENT_DEAL_PATH_LABELS.map(value=>({value,label:value}));
}
function studentSourceText(s){
  if(typeof customerLifecycleSource==='function')return customerLifecycleSource(s,s?.source);
  return FlowTennisBusinessTaxonomy.normalizeLeadSource(s?.source);
}
const STUDENT_PACKAGE_STATUS_OPTIONS=['未买过课包','课包有余额','课包即将耗尽','课包已用完'];
const STUDENT_PAYMENT_MODE_OPTIONS=['课包学员','单次付费学员','课包+单次付费','体验课'];
const STUDENT_ACTIVITY_STATUS_OPTIONS=['近30天活跃','31-90天活跃','91-180天沉默','180天以上沉睡','从未正式上课'];
const STUDENT_LESSON_VOLUME_OPTIONS=['历史课时30+','历史课时50+','历史课时100+'];
const STUDENT_LIFECYCLE_STATUS_OPTIONS=['课包活跃中','课包待续费','已转单次付费','稳定单次付费','有余额未活跃'];
const STUDENT_TAG_FILTER_GROUPS=[
  {key:'packageStatus',label:'课包状态',options:STUDENT_PACKAGE_STATUS_OPTIONS,getter:studentPackageStatusText},
  {key:'paymentMode',label:'付费方式',options:STUDENT_PAYMENT_MODE_OPTIONS,getter:studentPaymentModeText},
  {key:'activityStatus',label:'活跃状态',options:STUDENT_ACTIVITY_STATUS_OPTIONS,getter:studentActivityStatusText},
  {key:'lessonVolume',label:'累计上课',options:STUDENT_LESSON_VOLUME_OPTIONS,getter:studentLessonVolumeText},
  {key:'lifecycleStatus',label:'学员状态',options:STUDENT_LIFECYCLE_STATUS_OPTIONS,getter:studentLifecycleStatusText}
];
let studentTagFilterState={packageStatus:[],paymentMode:[],activityStatus:[],lessonVolume:[],lifecycleStatus:[]};
let studentTagCascaderActiveGroupKey='packageStatus';
function studentOptionList(values){
  return values.map(value=>({value,label:value}));
}
function studentSelectedTagValues(){
  return STUDENT_TAG_FILTER_GROUPS.flatMap(group=>(studentTagFilterState[group.key]||[]).map(value=>({group,value,label:value})));
}
function studentTagFilterCount(){
  return studentSelectedTagValues().length;
}
function studentTagFilterMatches(s){
  return STUDENT_TAG_FILTER_GROUPS.every(group=>{
    const selected=studentTagFilterState[group.key]||[];
    return !selected.length||selected.includes(group.getter(s));
  });
}
function toggleStudentTagFilter(key,value){
  const list=studentTagFilterState[key]||[];
  studentTagFilterState={...studentTagFilterState,[key]:list.includes(value)?list.filter(item=>item!==value):[...list,value]};
  onStudentTagFilterChange();
}
function removeStudentTagFilter(key,value){
  const list=studentTagFilterState[key]||[];
  studentTagFilterState={...studentTagFilterState,[key]:list.filter(item=>item!==value)};
  onStudentTagFilterChange();
}
function clearStudentTagFilters(){
  studentTagFilterState={packageStatus:[],paymentMode:[],activityStatus:[],lessonVolume:[],lifecycleStatus:[]};
  onStudentTagFilterChange();
}
function studentTagOptionCount(baseRows,group,value){
  return baseRows.filter(s=>group.getter(s)===value).length;
}
function studentTagCascaderActiveGroup(){
  return STUDENT_TAG_FILTER_GROUPS.find(group=>group.key===studentTagCascaderActiveGroupKey)||STUDENT_TAG_FILTER_GROUPS[0];
}
function setStudentTagCascaderActiveGroup(key,event){
  if(!STUDENT_TAG_FILTER_GROUPS.some(group=>group.key===key))return;
  studentTagCascaderActiveGroupKey=key;
  const baseRows=getStudentBaseList().filter(s=>globalDateWithinRange(studentGlobalDateValue(s)));
  refreshStandardGroupedFilterPanel(studentTagGroupedFilterConfig(baseRows));
}
function studentTagGroupedFilterConfig(baseRows){
  return {
    id:'stuTagFilter',
    label:'标签筛选',
    activeGroupKey:studentTagCascaderActiveGroup().key,
    selectedValuesByGroup:studentTagFilterState,
    onGroupChange:'setStudentTagCascaderActiveGroup',
    onToggle:'toggleStudentTagFilter',
    onRemove:'removeStudentTagFilter',
    onClear:'clearStudentTagFilters',
    groups:STUDENT_TAG_FILTER_GROUPS.map(group=>({
      key:group.key,
      label:group.label,
      options:group.options.map(value=>({value,label:studentLabelDisplayText(value),count:studentTagOptionCount(baseRows,group,value)}))
    }))
  };
}
function renderStudentTagCascader(baseRows){
  return renderStandardGroupedFilterHtml(studentTagGroupedFilterConfig(baseRows));
}
function refreshStudentTagGroupedFilter(){
  const baseRows=getStudentBaseList().filter(s=>globalDateWithinRange(studentGlobalDateValue(s)));
  refreshStandardGroupedFilterPanel(studentTagGroupedFilterConfig(baseRows));
}
function onStudentTagFilterChange(){
  resetCurrentStudentListPage();
  renderStudents({skipToolbar:true});
  refreshStudentTagGroupedFilter();
}
function studentScheduleMatches(row,stu){
  const id=String(stu?.id||stu?.studentId||'').trim();
  if(id&&String(row?.studentId||'').trim()===id)return true;
  const ids=parseArr(row?.studentIds).map(item=>String(item||'').trim()).filter(Boolean);
  if(id&&ids.includes(id))return true;
  return scheduleHasStudent(row,stu);
}
function studentScheduleIsFormal(row={}){
  const type=normalizeCourseType(row.standardCourseType||row.courseType||row.packageCourseType||row.productType||'');
  return type&&type!=='体验课';
}
function studentScheduleIsLessonFact(row={}){
  const status=effectiveScheduleStatus(row);
  if(status==='已取消')return false;
  if(status==='已结束')return true;
  if(['待上课','待确认','预约','已预约'].includes(String(row.status||row.systemStatus||'').trim()))return false;
  const day=String(row.startTime||row.endTime||row.createdAt||'').slice(0,10);
  return !!day&&day<=today();
}
function studentFormalLessonRows(stu){
  return schedules
    .filter(row=>studentScheduleMatches(row,stu))
    .filter(row=>effectiveScheduleStatus(row)==='已结束')
    .filter(studentScheduleIsFormal);
}
function studentAnyLessonRows(stu){
  return schedules
    .filter(row=>studentScheduleMatches(row,stu))
    .filter(studentScheduleIsLessonFact);
}
function studentDirectFormalLessonRows(stu){
  return studentFormalLessonRows(stu).filter(row=>{
    const settlement=String(row.settlementType||row.paymentType||row.payType||'').trim();
    return settlement&&settlement!=='package';
  });
}
function studentFormalPurchaseRows(stu){
  const sid=String(stu?.id||stu?.studentId||'');
  if(!sid)return [];
  return purchases.filter(row=>String(row.studentId||'')===sid&&purchaseStatusText(row)!=='已作废'&&!studentPackageRecordIsTrial(row));
}
function studentFormalEntitlementRows(stu){
  return studentActiveEntitlementRows(stu).filter(row=>!studentPackageRecordIsTrial(row));
}
function studentPackageRemainingLessons(stu){
  return studentPackageLessonMeta(stu).remaining||0;
}
function studentHasFormalPackage(stu){
  return studentFormalPurchaseRows(stu).length>0||studentFormalEntitlementRows(stu).length>0||studentUnifiedPackageListRows(stu).length>0||Number(stu?.coursePurchaseCount)>0;
}
function studentPackageStatusText(stu){
  return String(stu?.packageStatusLabel||'-').trim()||'-';
}
function studentPaymentModeText(stu){
  return String(stu?.paymentModeLabel||'-').trim()||'-';
}
function studentFormalLastLessonDate(stu){
  const explicit=String(stu?.lastFormalLessonAt||'').slice(0,10);
  if(explicit)return explicit;
  const row=studentFormalLessonRows(stu).sort((a,b)=>String(b.startTime||'').localeCompare(String(a.startTime||'')))[0];
  return String(row?.startTime||'').slice(0,10);
}
function studentDaysSince(dateText){
  const raw=String(dateText||'').slice(0,10);
  if(!raw)return null;
  const time=Date.parse(`${raw}T00:00:00`);
  if(!Number.isFinite(time))return null;
  const todayTime=Date.parse(`${today()}T00:00:00`);
  return Math.floor((todayTime-time)/86400000);
}
function studentDateOnOrBeforeNow(value){
  const raw=String(value||'').trim();
  const day=raw.slice(0,10);
  if(!day)return false;
  if(day>today())return false;
  const timeText=raw.match(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/)?.[0];
  if(!timeText)return true;
  const time=Date.parse(timeText.replace(' ','T'));
  return !Number.isFinite(time)||time<=Date.now();
}
function studentActivityStatusFromDate(dateText){
  const days=studentDaysSince(dateText);
  if(days===null)return '';
  if(days<=30)return '近30天活跃';
  if(days<=90)return '31-90天活跃';
  if(days<=180)return '91-180天沉默';
  return '180天以上沉睡';
}
function studentActivityStatusText(stu){
  const label=String(stu?.activityStatusLabel||'-').trim()||'-';
  const safeRecent=studentLastLessonDate(stu);
  if(/未.*上课|从未/.test(label)&&(safeRecent||studentCompletedLessonCount(stu)>0)){
    return studentActivityStatusFromDate(safeRecent)||'180天以上沉睡';
  }
  return label;
}
function studentFormalLessonCountValue(stu){
  const explicit=Number(stu?.formalLessonCount);
  if(Number.isFinite(explicit)&&explicit>0)return explicit;
  return studentFormalLessonRows(stu).length;
}
function studentLessonVolumeText(stu){
  return String(stu?.lessonVolumeLabel||'-').trim()||'-';
}
function studentLifecycleStatusText(stu){
  return String(stu?.studentStatusLabel||'-').trim()||'-';
}
function studentLabelDisplayText(value){
  const raw=String(value||'').trim();
  return ({
    '未买过课包':'未买过',
    '课包有余额':'有余额',
    '课包即将耗尽':'将耗尽',
    '课包已用完':'已用完',
    '课包学员':'课包',
    '单次付费学员':'单次',
    '课包+单次付费':'课包+单次',
    '体验课':'体验课',
    '近30天活跃':'近30天',
    '31-90天活跃':'31~90天',
    '91-180天沉默':'91~180天',
    '180天以上沉睡':'181天+',
    '从未正式上课':'未上课',
    '历史课时30+':'30+',
    '历史课时50+':'50+',
    '历史课时100+':'100+',
    '课包活跃中':'课包活跃',
    '课包待续费':'待续费',
    '已转单次付费':'转单次',
    '稳定单次付费':'稳定单次',
    '有余额未活跃':'未活跃'
  })[raw]||raw;
}
function studentLabelTagClass(value){
  const raw=String(value||'').trim();
  return ({
    '未买过课包':'tms-tag-business-neutral',
    '课包有余额':'tms-tag-business-stage-won',
    '课包即将耗尽':'tms-tag-tier-gold',
    '课包已用完':'tms-tag-priority-p0',
    '课包学员':'tms-tag-business-stage-new',
    '单次付费学员':'tms-tag-course-partner',
    '课包+单次付费':'tms-tag-business-type-adult',
    '体验课':'tms-tag-business-stage-new',
    '近30天活跃':'tms-tag-business-stage-won',
    '31-90天活跃':'tms-tag-business-stage-new',
    '91-180天沉默':'tms-tag-tier-gold',
    '180天以上沉睡':'tms-tag-priority-p0',
    '从未正式上课':'tms-tag-business-neutral',
    '历史课时30+':'tms-tag-business-stage-new',
    '历史课时50+':'tms-tag-course-partner',
    '历史课时100+':'tms-tag-tier-gold',
    '课包活跃中':'tms-tag-business-stage-won',
    '课包待续费':'tms-tag-priority-p0',
    '已转单次付费':'tms-tag-business-stage-new',
    '稳定单次付费':'tms-tag-business-stage-won',
    '有余额未活跃':'tms-tag-tier-gold'
  })[raw]||'tms-tag-business-neutral';
}
function renderStudentLabelTag(value){
  const raw=String(value||'').trim();
  if(!raw||raw==='-'||raw==='—')return renderStandardCellText(raw,false);
  const text=studentLabelDisplayText(raw);
  return `<span class="tms-tag ${studentLabelTagClass(raw)} tms-tooltip-text" data-tooltip="${esc(raw)}">${esc(text)}</span>`;
}
function studentIsHistoricalRosterRow(stu){
  if(stu?.__unifiedTeachingView&&typeof stu.isHistoricalStudentRoster==='boolean')return !!stu.isHistoricalStudentRoster;
  return studentAnyLessonRows(stu).length>0||studentFormalLessonCountValue(stu)>0||Number(stu?.completedLessons)>0||studentHasTrialPath(stu);
}
function studentIsActiveRosterRow(stu){
  if(stu?.__unifiedTeachingView&&typeof stu.isActiveStudentRoster==='boolean')return !!stu.isActiveStudentRoster;
  if(studentPackageRemainingLessons(stu)>0)return true;
  const days=studentDaysSince(studentFormalLastLessonDate(stu));
  return days!==null&&days<=90;
}
function renderStudentToolbarFilters(){
  const typeValue=document.getElementById('stuTypeFilter')?.value||'';
  const sourceValue=document.getElementById('stuSourceFilter')?.value||'';
  const coachValue=document.getElementById('stuCoachFilter')?.value||'';
  const baseRows=getStudentBaseList().filter(s=>globalDateWithinRange(studentGlobalDateValue(s)));
  const linked=withLinkedFilterCounts([
    {key:'type',value:typeValue,options:[{value:'',label:'全部',emptyDisplay:'类型'},{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}],match:(s,value)=>s.type===value},
    {key:'source',value:sourceValue,options:[{value:'',label:'全部',emptyDisplay:'来源'},...studentSourceOptions()],match:(s,value)=>studentSourceText(s)===value},
    {key:'coach',value:coachValue,options:[{value:'',label:'全部',emptyDisplay:'负责教练'},{value:'__unassigned__',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))],match:(s,value)=>value==='__unassigned__'?studentPrimaryCoachText(s)==='-':studentPrimaryCoachText(s)===value}
  ],baseRows);
  const wrapMap=[
    ['stuTypeFilterHost','stuTypeFilter','类型',linked.type.options,linked.type.value],
    ['stuSourceFilterHost','stuSourceFilter','来源',linked.source.options,linked.source.value],
    ['stuCoachFilterHost','stuCoachFilter','负责教练',linked.coach.options,linked.coach.value]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(!host)return;
    host.style.display='';
    host.innerHTML=renderStandardDropdownHtml(id,label,options,value,false,'onStudentFilterChange');
  });
  const tagHost=document.getElementById('stuTagFilterHost');
  if(tagHost)tagHost.innerHTML=renderStudentTagCascader(baseRows);
}
function studentLastLessonDate(stu){
  const explicit=String(stu?.detailRecentLessonDate||'').slice(0,10);
  if(explicit&&studentDateOnOrBeforeNow(stu?.detailRecentLessonDate))return explicit;
  const rows=Array.isArray(stu?.detailLessonRecordRows)?stu.detailLessonRecordRows:[];
  const row=rows.find(item=>studentDateOnOrBeforeNow(item?.time||item?.sortTime||item?.relatedDate||item?.scheduleTime||item?.createdAt));
  return String(row?.time||row?.sortTime||row?.relatedDate||row?.scheduleTime||row?.createdAt||'').slice(0,10);
}
function studentRecentLessonText(stu){
  const date=studentLastLessonDate(stu);
  return date?daysAgoText(date):'-';
}
function studentCumulativeCoursePaidText(stu){
  return String(stu?.cumulativeCoursePaidText||'').trim()||'¥0';
}
function studentPackagePurchaseDate(stu){
  const sid=String(stu?.id||'');
  const dates=[
    ...studentActiveEntitlementRows(stu).filter(e=>!studentPackageRecordIsTrial(e)).map(e=>studentEntitlementPurchaseDate(e,purchases.find(p=>p.id===e.purchaseId)||{})),
    ...purchases.filter(p=>String(p.studentId||'')===sid&&purchaseStatusText(p)!=='已作废'&&!studentPackageRecordIsTrial(p)).map(p=>p.purchaseDate||'')
  ].map(v=>String(v||'').slice(0,10)).filter(Boolean);
  return dates.sort().pop()||'';
}
function studentTrialPackagePurchaseDate(stu){
  const sid=String(stu?.id||'');
  const dates=[
    ...studentActiveEntitlementRows(stu).filter(e=>studentPackageRecordIsTrial(e)).map(e=>studentEntitlementPurchaseDate(e,purchases.find(p=>p.id===e.purchaseId)||{})),
    ...purchases.filter(p=>String(p.studentId||'')===sid&&purchaseStatusText(p)!=='已作废'&&studentPackageRecordIsTrial(p)).map(p=>p.purchaseDate||'')
  ].map(v=>String(v||'').slice(0,10)).filter(Boolean);
  return dates.sort().pop()||'';
}
function studentListPackagePurchaseDate(stu){
  return String(stu?.packagePurchaseDate||'').slice(0,10);
}
function studentPackageNameText(stu){
  const sid=String(stu?.id||'');
  const mode=studentListViewMode();
  const includePackageRow=row=>mode==='trial'?studentPackageRecordIsTrial(row):!studentPackageRecordIsTrial(row);
  const entRows=studentActiveEntitlementRows(stu).filter(includePackageRow);
  const entPurchaseIds=new Set(entRows.map(e=>String(e.purchaseId||'')).filter(Boolean));
  const purchaseRows=purchases
    .filter(p=>(String(p.studentId||'')===sid||entPurchaseIds.has(String(p.id||'')))&&purchaseStatusText(p)!=='已作废'&&includePackageRow(p));
  const rows=[
    ...entRows.map(row=>({row,purchase:purchases.find(p=>p.id===row.purchaseId)||{},date:studentEntitlementPurchaseDate(row,purchases.find(p=>p.id===row.purchaseId)||{})})),
    ...purchaseRows.map(row=>({row,purchase:row,date:row.purchaseDate||row.createdAt||''}))
  ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const labels=[];
  rows.forEach(({row,purchase})=>{
    const text=String(row.packageName||row.productName||row.name||purchase.packageName||purchase.productName||purchase.name||standardPackageLabel({...purchase,...row},false)||'').trim();
    if(text&&!labels.includes(text))labels.push(text);
  });
  return labels.join('；')||'-';
}
function studentNonTrialPurchaseRows(stu){
  const sid=String(stu?.id||'');
  if(!sid)return [];
  return purchases.filter(p=>String(p.studentId||'')===sid&&purchaseStatusText(p)!=='已作废'&&!studentPackageRecordIsTrial(p));
}
function studentDealPathText(stu){
  const lifecycleDealPath=typeof customerLifecycleStudentDealPath==='function'?customerLifecycleStudentDealPath(stu):'';
  if(lifecycleDealPath)return lifecycleDealPath;
  const rows=studentNonTrialPurchaseRows(stu);
  if(!rows.length)return '-';
  if(rows.length>1)return STUDENT_DEAL_PATH_LABELS[2];
  return studentHasTrialPath(stu)?STUDENT_DEAL_PATH_LABELS[0]:STUDENT_DEAL_PATH_LABELS[1];
}
function studentTrialPathStatusText(stu){
  const lifecycleTrialStatus=typeof customerLifecycleStudentTrialStatus==='function'?customerLifecycleStudentTrialStatus(stu):'';
  if(lifecycleTrialStatus)return lifecycleTrialStatus;
  const hasTrialPathEvidence=studentHasTrialPathEvidence(stu);
  if(studentHasNonTrialPackage(stu))return hasTrialPathEvidence?'已成交':'-';
  if(!hasTrialPathEvidence)return '-';
  if(studentLastLessonDate(stu))return '已体验待成交';
  return '已约体验';
}
function studentHasTrialPathEvidence(stu){
  return !!(stu?.hasTrialExperience||studentHasTrialPath(stu));
}
function studentIsFormalCourseDeal(stu){
  const lifecycleStage=studentLifecycleStage(stu)||String(stu?.studentStage||'').trim();
  if(lifecycleStage==='formal')return true;
  return studentHasNonTrialPackage(stu);
}
function studentHasRemainingPackage(stu){
  return studentActiveEntitlementRows(stu).some(e=>!studentPackageRecordIsTrial(e)&&(Number(e.remainingLessons)||0)>0);
}
function studentHumanText(value){
  let text=String(value||'').trim();
  if(!text)return '';
  ['历史导入','马坡私教 CSV 导入自动创建','CSV 导入自动创建'].forEach(label=>{text=text.split(label).join('');});
  return text.replace(/[；;，,。\/｜|·\s]+$/g,'').replace(/^[；;，,。\/｜|·\s]+/g,'').trim();
}
function studentUnifiedPackageListRows(stu){
  return Array.isArray(stu?.packageListRows)?stu.packageListRows:[];
}
function studentUnifiedPackageLineText(row){
  const name=String(row?.packageName||'课包').trim();
  return `${name} ${lessonQty(row?.remainingLessons)}/${lessonQty(row?.totalLessons)}`;
}
function studentUnifiedPackageListHtml(stu){
  const rows=studentUnifiedPackageListRows(stu);
  if(!rows.length)return esc('-');
  return rows.map(row=>`<div>${esc(studentUnifiedPackageLineText(row))}</div>`).join('');
}
function studentUnifiedPackageListTooltip(stu){
  const rows=studentUnifiedPackageListRows(stu);
  return rows.length?rows.map(row=>studentUnifiedPackageLineText(row)).join('\n'):'-';
}
function studentUnifiedPackageBalanceHtml(stu){
  const meta=studentPackageLessonMeta(stu);
  if(!meta.hasPackage||!meta.text||meta.text==='-')return renderStandardCellText('-',false);
  return `<div class="tms-mini-bar"><div class="tms-mini-bar-fill" style="width:${Math.max(0,Math.min(100,meta.pct||0))}%"></div><span class="tms-mini-bar-text">${esc(meta.text)}</span></div>`;
}
function studentUnifiedCompletedLessonCount(stu){
  return lessonUnitsText(stu?.completedLessons);
}
function studentCompletedLessonUnits(stu){
  const lessonMap=new Map();
  const ledgerItems=studentConcreteLessonLedgerItems(stu);
  const ledgerKeys=new Set(ledgerItems.map(item=>studentLessonRecordKey({studentId:stu?.id,row:item.row,schedule:item.schedule})));
  const hasConcretePackageLedger=ledgerItems.length>0;
  schedules
    .filter(x=>scheduleHasStudent(x,stu))
    .filter(x=>effectiveScheduleStatus(x)==='已结束')
    .filter(x=>studentLessonRecordShouldIncludeSchedule(x,stu,ledgerKeys,hasConcretePackageLedger))
    .forEach(x=>lessonMap.set(studentLessonRecordKey({studentId:stu?.id,schedule:x}),scheduleLessonUnits(x)));
  ledgerItems
    .forEach(({row,schedule})=>{
      const key=studentLessonRecordKey({studentId:stu?.id,row,schedule});
      if(!lessonMap.has(key))lessonMap.set(key,studentLedgerLessonUnits(row,schedule));
    });
  return [...lessonMap.values()].reduce((sum,value)=>sum+value,0);
}
function studentSortValue(stu,key){
  if(key==='packagePurchaseDate')return studentListPackagePurchaseDate(stu);
  if(key==='lastLesson')return studentLastLessonDate(stu);
  if(key==='completedLessons')return Number(stu?.completedLessons)||0;
  if(key==='packageLessons')return studentPackageRemainingLessons(stu);
  return '';
}
function ensureStudentDefaultSort(){
  const mode=studentListViewMode();
  if(studentSortMode===mode)return;
  studentSortMode=mode;
  stuSortKey='lastLesson';stuSortDir='desc';
}
function getSortedStudents(list){
  if(!stuSortKey||!stuSortDir)return list;
  const dir=stuSortDir==='asc'?1:-1;
  return list.map((item,index)=>({item,index})).sort((a,b)=>{
    const av=studentSortValue(a.item,stuSortKey),bv=studentSortValue(b.item,stuSortKey);
    const emptyA=av===''||av===null||av===undefined;
    const emptyB=bv===''||bv===null||bv===undefined;
    if(emptyA&&emptyB)return a.index-b.index;
    if(emptyA)return 1;
    if(emptyB)return -1;
    if(typeof av==='number'||typeof bv==='number')return ((Number(av)||0)-(Number(bv)||0))*dir||a.index-b.index;
    return String(av).localeCompare(String(bv))*dir||a.index-b.index;
  }).map(row=>row.item);
}
function cycleStudentSort(key){
  if(stuSortKey!==key){stuSortKey=key;stuSortDir='asc';}
  else if(stuSortDir==='asc')stuSortDir='desc';
  else {stuSortKey='';stuSortDir='';}
  resetCurrentStudentListPage();
  renderStudents();
}
function updateStudentSortHeaders(){
  document.querySelectorAll('#page-students [data-student-sort]').forEach(btn=>{
    const active=btn.dataset.studentSort===stuSortKey;
    btn.classList.toggle('asc',active&&stuSortDir==='asc');
    btn.classList.toggle('desc',active&&stuSortDir==='desc');
  });
}
function studentSortHeader(key,label){
  return `<button class="tms-sort-header" data-student-sort="${key}" onclick="cycleStudentSort('${key}')">${label}<span class="tms-sort-icon"><span class="tms-sort-up"></span><span class="tms-sort-down"></span></span></button>`;
}
function studentTableColumns(){
  return [
    {label:'姓名',className:'tms-sticky-l',style:'width:130px;padding-left:20px'},
    {label:'来源',style:'width:110px'},
    {label:'类型',style:'width:90px'},
    {label:'校区',style:'width:105px'},
    {label:'活跃状态',style:'width:120px'},
    {label:'付费方式',style:'width:120px'},
    {label:'课包状态',style:'width:120px'},
    {html:studentSortHeader('packageLessons','课包余额'),style:'width:120px'},
    {html:studentSortHeader('lastLesson','最近上课'),style:'width:150px'},
    {html:studentSortHeader('completedLessons','累计上课'),style:'width:120px'},
    {label:'累计课程付费',style:'width:130px'},
    {label:'学员状态',style:'width:120px'},
    {label:'负责教练',style:'width:110px'},
    {label:'备注',style:'width:280px'},
    {label:'操作',className:'tms-sticky-r',style:'width:90px;padding-right:20px;text-align:right'}
  ];
}
function renderStudentTableHeaders(){
  const head=document.querySelector('#page-students .tms-table thead tr');
  if(head)head.innerHTML=studentTableColumns().map(renderStandardTableHeadCellHtml).join('');
}
function renderStudentPagerControls(total,pages){
  const pager=document.querySelector('#page-students .tms-pagination');
  if(document.body.classList.contains('admin-mobile')){
    if(pager)pager.style.display='none';
    return;
  }
  const pageSizeHost=document.getElementById('stuPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('stuPageSizeValue',stuPageSize,'setStudentPageSize');
  const btns=document.getElementById('stuPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(stuPage,pages,'setStudentPage');
}
function setStudentPage(value){
  syncStudentPageGlobalsFromMode();
  const total=getFilteredStudents().length;
  stuPage=standardListPagination(total,value,stuPageSize).page;
  persistStudentPageGlobalsToMode();
  renderStudents();
}
function setStudentPageSize(value){
  syncStudentPageGlobalsFromMode();
  stuPageSize=standardListPageSize(value,stuPageSize);
  stuPage=standardListFirstPage();
  persistStudentPageGlobalsToMode();
  renderStudents();
}
function jumpStudentPage(value){
  syncStudentPageGlobalsFromMode();
  const total=getFilteredStudents().length;
  stuPage=standardListPagination(total,value,stuPageSize).page;
  persistStudentPageGlobalsToMode();
  renderStudents();
}
function studentListPrewarmParams(){
  const range=typeof activeGlobalDateRange==='function'?activeGlobalDateRange():{};
  return {
    page:currentPage,
    pageNo:stuPage,
    pageSize:stuPageSize,
    search:document.getElementById('stuSearch')?.value||'',
    type:document.getElementById('stuTypeFilter')?.value||'',
    source:document.getElementById('stuSourceFilter')?.value||'',
    coach:document.getElementById('stuCoachFilter')?.value||'',
    tags:studentTagFilterState,
    sortKey:stuSortKey,
    sortDir:stuSortDir,
    campus:String(campus||''),
    startDate:range?.startDate||'',
    endDate:range?.endDate||''
  };
}
function studentDetailPrewarmCacheKey(rows){
  const ids=(Array.isArray(rows)?rows:[]).map(row=>String(row?.id||row?.studentId||'').trim()).filter(Boolean);
  return JSON.stringify({...studentListPrewarmParams(),ids});
}
function studentDetailPrewarmReady(id){
  if(typeof studentDetailDataReady!=='function')return false;
  return studentDetailDataReady(id,'orders')&&studentDetailDataReady(id,'benefits');
}
function prewarmStudentDetailsForRows(rows){
  if(!studentDetailPageStillValid()||typeof ensureStudentDetailData!=='function')return;
  const currentRows=(Array.isArray(rows)?rows:[]).slice(0,STUDENT_DETAIL_PREWARM_MAX_ROWS);
  const key=studentDetailPrewarmCacheKey(currentRows);
  if(!currentRows.length||key===studentDetailPrewarmKey)return;
  studentDetailPrewarmKey=key;
  const seq=++studentDetailPrewarmSeq;
  const ids=[...new Set(currentRows.map(row=>String(row?.id||row?.studentId||'').trim()).filter(Boolean))]
    .filter(id=>!studentDetailPrewarmReady(id));
  if(!ids.length)return;
  let index=0;
  const worker=async()=>{
    while(index<ids.length&&seq===studentDetailPrewarmSeq&&studentDetailPageStillValid()){
      const id=ids[index++];
      try{await ensureStudentDetailData(id,{silent:true});}
      catch(e){console.warn('student detail prewarm failed',id,e);}
    }
  };
  const workers=Array.from({length:Math.min(STUDENT_DETAIL_PREWARM_CONCURRENCY,ids.length)},worker);
  Promise.allSettled(workers);
}
function studentCampusValuesForList(stu){
  const values=[stu?.campus,stu?.campusId,stu?.campusName,...parseArr(stu?.campusIds)];
  return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
}
function studentMatchesCampusForList(stu){
  if(!campus||campus==='all')return true;
  return studentCampusValuesForList(stu).some(value=>sameCampusValue(value,campus)||sameCampusValue(cn(value),cn(campus))||value===cn(campus));
}
function getStudentBaseList({includeAllRoster=false}={}){
  const viewRows=studentUnifiedViewRows({includeSearchIndex:includeAllRoster});
  const base=viewRows.length?viewRows:students;
  return base.filter(s=>{
    if(isHiddenStudentProfile(s))return false;
    if(!studentMatchesCampusForList(s))return false;
    if(includeAllRoster)return true;
    return studentListViewMode()==='trial'?studentIsHistoricalRosterRow(s):studentIsActiveRosterRow(s);
  });
}
function studentSearchText(s){
  return [
    s?.searchText,
    s?.name,
    s?.displayName,
    s?.phone,
    s?.type,
    studentSourceText(s),
    studentPaymentModeText(s),
    studentPackageStatusText(s),
    studentActivityStatusText(s),
    studentLessonVolumeText(s),
    studentLifecycleStatusText(s),
    s?.notes,
    s?.profileNote,
    cn(s?.campus),
    studentPrimaryCoachText(s)
  ].filter(Boolean).join(' ');
}
function studentGlobalDateValue(s){
  return s.createdAt||s.enrollDate||s.registerDate||s.joinDate||studentLastLessonDate(s);
}
function getFilteredStudents(){
  const q=(document.getElementById('stuSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('stuTypeFilter')?.value||'';
  const sf=document.getElementById('stuSourceFilter')?.value||'';
  const coachFilter=document.getElementById('stuCoachFilter')?.value||'';
  return getStudentBaseList({includeAllRoster:!!q.trim()}).filter(s=>{
    const accountText=courtsForStudent(s).map(c=>`${c.name} ${c.phone||''}`).join(' ');
    if(!searchHit(q,studentSearchText(s),accountText))return false;
    if(!globalDateWithinRange(studentGlobalDateValue(s)))return false;
    if(tf&&s.type!==tf)return false;
    if(sf&&studentSourceText(s)!==sf)return false;
    if(!studentTagFilterMatches(s))return false;
    if(coachFilter==='__unassigned__'&&studentPrimaryCoachText(s)!=='-')return false;
    if(coachFilter&&coachFilter!=='__unassigned__'&&studentPrimaryCoachText(s)!==coachFilter)return false;
    return true;
  });
}
function studentCompletedLessonCount(stu){
  return studentUnifiedCompletedLessonCount(stu);
}
function studentPageTrialConvertedByPurchase(schedule){
  const studentId=parseArr(schedule?.studentIds)[0]||scheduleFeedback(schedule)?.studentId||schedule?.studentId||'';
  const studentName=String(scheduleStudentSummary(schedule)||schedule?.studentName||'').trim();
  const trialDate=String(schedule?.endTime||schedule?.startTime||'').slice(0,10);
  if(!trialDate)return false;
  return purchases.some(p=>{
    if(p?.status==='voided')return false;
    const purchaseDate=String(p.purchaseDate||p.createdAt||'').slice(0,10);
    if(!purchaseDate||purchaseDate<trialDate)return false;
    if(studentId)return String(p.studentId||'')===studentId;
    return studentName&&String(p.studentName||'').trim()===studentName;
  });
}
function studentRoundMoney(value){
  return Math.round((Number(value)||0)*100)/100;
}
function studentStandardMetricValue(key){
  const standard=typeof standardLifecycleMetrics==='object'&&standardLifecycleMetrics?standardLifecycleMetrics:{metrics:{}};
  return Number(standard.metrics?.[key]?.value)||0;
}
function studentStandardSummaryForMode(){
  const standard=typeof standardLifecycleMetrics==='object'&&standardLifecycleMetrics?standardLifecycleMetrics:{};
  const summary=standard.teachingSummary||teachingStudentViews?.summary||{};
  const historicalSummaryCount=Number(summary.historicalStudentCount);
  const activeSummaryCount=Number(summary.activeStudentCount);
  const historicalStudentCount=Number.isFinite(historicalSummaryCount)?historicalSummaryCount:Number(teachingStudentViews?.historicalStudents?.length)||0;
  const activeStudentCount=Number.isFinite(activeSummaryCount)?activeSummaryCount:Number(teachingStudentViews?.activeStudents?.length)||0;
  if(studentListViewMode()==='trial')return {
    total:historicalStudentCount,
    historicalTrialAttendedCount:Number(summary.historicalTrialAttendedCount)||0,
    historicalFormalAttendedCount:Number(summary.historicalFormalAttendedCount)||0,
    historicalTrialWithoutFormalCount:Number(summary.historicalTrialWithoutFormalCount)||0,
    historicalFormalLesson30Count:Number(summary.historicalFormalLesson30Count)||0
  };
  return {
    total:activeStudentCount,
    activeFormalLesson30Count:Number(summary.activeFormalLesson30Count)||0,
    activeFormalLesson90Count:Number(summary.activeFormalLesson90Count)||0,
    activePackageBalanceCount:Number(summary.activePackageBalanceCount)||0,
    activePackageLowCount:Number(summary.activePackageLowCount)||0
  };
}
function studentLoadingStatsForMode(){
  if(studentListViewMode()==='trial')return {
    total:null,
    historicalTrialAttendedCount:null,
    historicalFormalAttendedCount:null,
    historicalTrialWithoutFormalCount:null,
    historicalFormalLesson30Count:null
  };
  return {
    total:null,
    activeFormalLesson30Count:null,
    activeFormalLesson90Count:null,
    activePackageBalanceCount:null,
    activePackageLowCount:null
  };
}
function studentPageStats(base){
  if(typeof customerCenterPageReady==='function'&&!customerCenterPageReady())return studentLoadingStatsForMode();
  return studentStandardSummaryForMode();
}
function studentPercentText(value,total){
  if(!total)return '0%';
  const percent=(Number(value)||0)/(Number(total)||0)*100;
  return `${Number.isInteger(percent)?percent:percent.toFixed(1)}%`;
}
function studentTopStatsCards(stats){
  if(studentListViewMode()==='trial')return [
    {label:'历史学员',valueHtml:stats.total,sub:'累计来上过课'},
    {label:'上过体验课',valueHtml:stats.historicalTrialAttendedCount||0,percent:studentPercentText(stats.historicalTrialAttendedCount||0,stats.total),sub:'上过体验课 / 历史学员'},
    {label:'上过正式课',valueHtml:stats.historicalFormalAttendedCount||0,percent:studentPercentText(stats.historicalFormalAttendedCount||0,stats.total),sub:'上过正式课 / 历史学员'},
    {label:'上过体验未上正式课',valueHtml:stats.historicalTrialWithoutFormalCount||0,percent:studentPercentText(stats.historicalTrialWithoutFormalCount||0,stats.total),sub:'体验未上正式课 / 历史学员'},
    {label:'近30天正式课活跃',valueHtml:stats.historicalFormalLesson30Count||0,percent:studentPercentText(stats.historicalFormalLesson30Count||0,stats.total),sub:'近30天正式课 / 历史学员'}
  ];
  return [
    {label:'在期学员',valueHtml:stats.total,sub:'当前仍有运营价值'},
    {label:'近30天正式课活跃',valueHtml:stats.activeFormalLesson30Count||0,percent:studentPercentText(stats.activeFormalLesson30Count||0,stats.total),sub:'近30天正式课 / 在期学员'},
    {label:'近90天正式课活跃',valueHtml:stats.activeFormalLesson90Count||0,percent:studentPercentText(stats.activeFormalLesson90Count||0,stats.total),sub:'近90天正式课 / 在期学员'},
    {label:'课包有余额',valueHtml:stats.activePackageBalanceCount||0,percent:studentPercentText(stats.activePackageBalanceCount||0,stats.total),sub:'有余额 / 在期学员'},
    {label:'课包即将耗尽',valueHtml:stats.activePackageLowCount||0,percent:studentPercentText(stats.activePackageLowCount||0,stats.total),sub:'剩余 1-2 节 / 在期学员'}
  ];
}
function studentStatSplitCard(title,primary,secondary,caption){
  return `<div class="tms-stat-card student-stat-card"><div class="tms-stat-label">${title}</div><div class="tms-stat-value student-stat-pair"><span>${primary}</span><span class="student-stat-divider">｜</span><span>${secondary}</span></div><div class="tms-stat-sub">${caption}</div></div>`;
}
function getStudentDuplicateCandidates(input,editingId=''){
  const name=String(input?.name||'').trim();
  const phone=String(input?.phone||'').replace(/\s+/g,'').trim();
  return students.filter(s=>{
    if(editingId&&s.id===editingId)return false;
    if(isHiddenStudentProfile(s))return false;
    const samePhone=phone&&String(s.phone||'').replace(/\s+/g,'').trim()===phone;
    const sameName=name&&String(s.name||'').trim()===name;
    return samePhone||sameName;
  });
}
function studentCampusOptions(){
  return [{value:'',label:'-'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
}
function studentDetailFieldHtml(label,value){
  return renderDetailDrawerField(label,value);
}
function studentDetailIsEmptyHtml(html){
  const text=String(html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
  return !text||['-','暂无上课记录','暂无课后反馈','暂无已购课包','暂无扣课记录','暂无关联订场账户','暂无关联订场账户会员摘要','未关联线索'].includes(text);
}
function studentDetailBlockHtml(label,html,options={}){
  if(options.hideEmpty&&studentDetailIsEmptyHtml(html))return '';
  return renderDetailDrawerBlock(label,html);
}
function studentDetailSectionHtml(title,content){
  return content?`<div class="tms-section-header">${title}</div><div class="tms-detail-grid">${content}</div>`:'';
}
function studentDetailTagHtml(text,type='slate'){
  const value=renderStandardEmptyText(text);
  if(value==='-')return '';
  return `<span class="student-detail-tag ${type}">${esc(value)}</span>`;
}
function studentDetailHeroHtml(stu){
  const meta=[
    stu.phone?`手机号：${stu.phone}`:'',
    `累计上课：${studentCompletedLessonCount(stu)}节`
  ].filter(Boolean).map(item=>`<span>${esc(item)}</span>`).join('');
  return renderDetailDrawerHero({
    title:renderStandardEmptyText(stu.name),
    avatar:(renderStandardEmptyText(stu.name)||'学').slice(0,1),
    subtitleHtml:meta||'<span>暂无补充信息</span>',
    statusHtml:`${studentDetailTagHtml(stu.type,'warm')}${studentDetailTagHtml(cn(stu.campus),'slate')}`
  });
}
function studentBasicInfoFormHtml(s){
  const typeOptions=[{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}];
  const sourceOptions=[{value:'',label:'-'},...studentSourceOptions()];
  const campusOptions=studentCampusOptions();
  const coachOptions=[{value:'',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  return `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="finput tms-form-control" id="s_name" value="${rv(s,'name')}" placeholder="姓名"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="finput tms-form-control" id="s_phone" value="${rv(s,'phone')}" placeholder="请输入手机号"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label>${renderStandardDropdownHtml('s_primaryCoach','负责教练',coachOptions,coachName(rv(s,'primaryCoach')),true)}</div><div class="tms-form-item"><label class="tms-form-label">学员类型</label>${renderStandardDropdownHtml('s_type','学员类型',typeOptions,rv(s,'type','成人'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">来源</label>${renderStandardDropdownHtml('s_source','来源',sourceOptions,studentSourceText(s)||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">所在校区</label>${renderStandardDropdownHtml('s_campus','校区',campusOptions,rv(s,'campus'),true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="s_notes">${esc(rv(s,'notes'))}</textarea></div></div>`;
}
function openStudentDrawer({titleHtml='',bodyHtml='',actionsHtml='',studentId=''}) {
  openStandardDetailDrawer({
    titleHtml,
    bodyHtml,
    actionsHtml,
    data:{studentDetailId:studentId||''},
    overlayClasses:['student-drawer-overlay','schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-student-drawer'
  });
}
function studentDetailTabsHtml(active='basic'){
  const tabs=[['basic','基本信息'],['orders','课包/上课记录'],['benefits','权益记录']];
  return renderDetailDrawerTabs(active,tabs,{onClick:'setStudentDetailTab'});
}
function setStudentDetailTab(tab){
  studentDetailActiveTab=['basic','orders','benefits'].includes(tab)?tab:'basic';
  const id=document.getElementById('overlay')?.dataset.studentDetailId||'';
  if(id)openStudentDetail(id);
}
function studentDrawerCardHtml(title,content,extraClass='',actionsHtml='',options={}){
  return renderDetailDrawerCard(title,content,{className:extraClass,actionsHtml,useGrid:options.useGrid!==false,titleHtml:options.titleHtml||''});
}
function studentBasicInfoReadonlyHtml(s){
  return `${studentDetailFieldHtml('姓名',s.name)}${studentDetailFieldHtml('手机号',s.phone)}${studentDetailFieldHtml('负责教练',studentPrimaryCoachText(s))}${studentDetailFieldHtml('学员类型',s.type)}${studentDetailFieldHtml('来源',studentSourceText(s))}${studentDetailFieldHtml('所在校区',cn(s.campus))}${studentDetailFieldHtml('备注',studentHumanText(s.notes))}`;
}
function studentDeleteCardHtml(s){
  if(currentUser?.role!=='admin')return '';
  const action=`<button type="button" class="schedule-detail-action muted" onclick="confirmDel('${s.id}','${esc(s.name)}','student')">删除学员</button>`;
  return studentDrawerCardHtml('删除学员','<div class="tms-field-help">删除前需要二次确认。</div>','student-delete-section',action,{useGrid:false});
}
function studentDetailBasicTabHtml(s){
  const editing=studentDetailEditingSection==='basic'&&studentDetailEditingStudentId===s.id;
  const editAction=`<button type="button" class="schedule-detail-action" onclick="openStudentModal('${s.id}')">编辑</button>`;
  const saveActions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="cancelStudentDetailEdit('${s.id}')">取消</button><button type="button" class="schedule-detail-action primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`;
  const basicCard=editing
    ? renderDetailDrawerFormCard('基本信息',studentBasicInfoFormHtml(s),saveActions)
    : studentDrawerCardHtml('基本信息',studentBasicInfoReadonlyHtml(s),'',editAction);
  return `<div class="schedule-detail-content">${basicCard}${studentReminderInfoHtml(s)}${studentDeleteCardHtml(s)}${studentDrawerCardHtml('最近课后反馈',studentRecentFeedbackSummaryHtml(s))}</div>`;
}
function studentDetailOrdersTabHtml(s){
  const canBuyPackage=currentUser?.role==='admin';
  const action=canBuyPackage?`<button type="button" class="schedule-detail-action primary" onclick="openPurchaseModal('${s.id}')">购买课包</button>`:'';
  return `<div class="schedule-detail-content">${studentDetailMetricsHtml(s)}${studentDrawerCardHtml('课包订单',studentEntitlementSummaryHtml(s),'student-package-section',action,{useGrid:false})}${studentDrawerCardHtml('上课记录',studentLessonRecordHtml(s),'student-lesson-section','',{useGrid:false})}</div>`;
}
function studentBenefitListTableHtml(s){
  const rows=studentBenefitRows(s);
  return renderDetailDrawerTable({
    columns:[
      {label:'权益名称',key:'label',width:'110px'},
      {label:'总次数',render:row=>`${row.total}${esc(row.unit)}`,width:'80px'},
      {label:'已消耗',render:row=>`${row.used}${esc(row.unit)}`,width:'80px'},
      {label:'剩余',render:row=>`${row.remaining}${esc(row.unit)}`,width:'80px'},
      {label:'最近操作时间',key:'lastAt',width:'120px'},
      {label:'操作',width:'110px',align:'right',html:true,render:row=>`<span class="tms-action-link" onclick="openStudentBenefitActionModal(${jsArg(s.id)},${jsArg(row.benefitCode)},'supplement')">发放</span><span class="tms-action-link" onclick="openStudentBenefitActionModal(${jsArg(s.id)},${jsArg(row.benefitCode)},'consume')">消耗</span>`}
    ],
    rows:rows.map(row=>({...row,lastAt:studentBenefitLastActionDate(s,row.benefitCode)||'--'})),
    emptyText:'暂无权益',
    minWidth:'580px'
  });
}
function studentBenefitLastActionDate(stu,benefitCode){
  const row=studentBenefitRows(stu).find(item=>item.benefitCode===benefitCode);
  return row?.lastAt||'';
}
function studentBenefitLedgerRows(stu,mode){
  const rows=mode==='grant'?stu?.detailBenefitGrantRows:stu?.detailBenefitConsumeRows;
  return Array.isArray(rows)?rows:[];
}
function studentBenefitGrantTableHtml(s){
  return renderDetailDrawerTable({
    columns:[
      {label:'发放时间',key:'time',width:'130px'},
      {label:'权益名称',key:'label',width:'110px'},
      {label:'发放次数',key:'count',width:'90px'},
      {label:'发放原因',key:'reason',width:'150px'},
      {label:'操作人',key:'operator',width:'90px'}
    ],
    rows:studentBenefitLedgerRows(s,'grant'),
    emptyText:'暂无权益发放记录',
    minWidth:'570px'
  });
}
function studentBenefitConsumeTableHtml(s){
  return renderDetailDrawerTable({
    columns:[
      {label:'消耗时间',key:'time',width:'130px'},
      {label:'权益名称',key:'label',width:'110px'},
      {label:'消耗次数',key:'count',width:'90px'},
      {label:'消耗原因',key:'reason',width:'150px'},
      {label:'操作人',key:'operator',width:'90px'}
    ],
    rows:studentBenefitLedgerRows(s,'consume'),
    emptyText:'暂无权益消耗记录',
    minWidth:'570px'
  });
}
function studentDetailBenefitsTabHtml(s){
  const actions=`<button type="button" class="schedule-detail-action" onclick="openStudentBenefitPickerModal('${s.id}','supplement')">新增权益</button><button type="button" class="schedule-detail-action primary" onclick="openStudentBenefitPickerModal('${s.id}','consume')">消耗权益</button>`;
  return `<div class="schedule-detail-content">${studentDrawerCardHtml('权益列表',studentBenefitListTableHtml(s),'student-benefit-section',actions,{useGrid:false})}${studentDrawerCardHtml('权益发放记录',studentBenefitGrantTableHtml(s),'','',{useGrid:false})}${studentDrawerCardHtml('权益消耗记录',studentBenefitConsumeTableHtml(s),'','',{useGrid:false})}</div>`;
}
function studentDetailMetricsHtml(stu){
  const meta=studentPackageLessonMeta(stu);
  const recentDate=studentLastLessonDate(stu);
  const cards=[
    {label:'剩余课时/总数',value:meta.hasPackage?lessonQty(meta.remaining):'-',sub:meta.hasPackage?`/ ${lessonQty(meta.total)}节`:'暂无课包'},
    {label:'负责教练',value:studentPrimaryCoachText(stu),sub:''},
    {label:'最近上课',value:recentDate||'-',sub:recentDate?daysAgoText(recentDate).split(' · ')[1]||'':'暂无记录'}
  ];
  return `<div class="student-detail-metrics">${cards.map(card=>`<div class="student-detail-metric"><div class="student-detail-metric-label">${esc(card.label)}</div><div class="student-detail-metric-value">${esc(card.value)}${card.sub?`<span>${esc(card.sub)}</span>`:''}</div></div>`).join('')}</div>`;
}
function studentDetailSectionBlockHtml(title,content,extraClass=''){
  return content?`<section class="student-detail-section ${extraClass}"><h4>${esc(title)}</h4>${content}</section>`:'';
}
const STUDENT_BENEFIT_TYPES=[
  {benefitCode:'courtBooking',label:'订场',unit:'次'},
  {benefitCode:'ballMachine',label:'发球机',unit:'次'}
];
function studentBenefitTypeMeta(benefitCode){
  return STUDENT_BENEFIT_TYPES.find(item=>item.benefitCode===benefitCode)||null;
}
function studentBenefitRows(stu){
  return Array.isArray(stu?.detailBenefitRows)?stu.detailBenefitRows:[];
}
function studentBenefitSummaryHtml(stu){
  const rows=studentBenefitRows(stu);
  if(!rows.length)return '';
  return rows.map(row=>`<div class="membership-rights-row"><div style="font-size:13px;color:#332A24;font-weight:600;white-space:nowrap">${esc(row.label)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">共 ${row.total}${esc(row.unit)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">已消耗 ${row.used}${esc(row.unit)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">剩余 ${row.remaining}${esc(row.unit)}</div><div style="font-size:12px;color:#8C7B6E;text-align:right;white-space:nowrap">学员权益</div></div>`).join('');
}
function openStudentBenefitPickerModal(studentId,mode){
  const stu=studentUnifiedRecordForId(studentId);if(!stu){toast('学员数据未加载，请刷新后重试','warn');return;}
  const currentRows=studentBenefitRows(stu);
  const rows=mode==='consume'?currentRows:STUDENT_BENEFIT_TYPES.map(type=>{const current=currentRows.find(row=>row.benefitCode===type.benefitCode);return {...type,total:current?.total||0,remaining:current?.remaining||0};});
  if(mode==='consume'&&!rows.length){toast('该学员当前没有可消耗权益','warn');return;}
  const actionText=mode==='consume'?'消耗':'赠送';
  const body=`<div class="tms-section-header" style="margin-top:0;">选择权益类型</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper" style="max-height:360px"><table class="tms-table" style="min-width:620px"><thead><tr><th style="padding-left:20px">权益</th><th style="width:140px">当前剩余</th><th style="width:120px;text-align:right;padding-right:20px">操作</th></tr></thead><tbody>${rows.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.label,false)}</td><td>${renderStandardCellText(`${row.remaining}/${row.total}${row.unit}`,false)}</td><td style="text-align:right;padding-right:20px"><span class="tms-action-link" onclick="openStudentBenefitActionModal('${studentId}','${row.benefitCode}','${mode}')">${actionText}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  openStandardModal({title:`${actionText}权益`,bodyHtml:body,actionsHtml:`<button class="tms-btn tms-btn-default" onclick="openStudentDetail('${studentId}')">返回学员详情</button>`,extraClass:'modal-wide'});
}
function openStudentBenefitActionModal(studentId,benefitCode,mode){
  const stu=studentUnifiedRecordForId(studentId);if(!stu){toast('学员数据未加载，请刷新后重试','warn');return;}
  const meta=studentBenefitTypeMeta(benefitCode);if(!meta){toast('学员权益仅支持订场和发球机','warn');return;}
  const row=studentBenefitRows(stu).find(item=>item.benefitCode===benefitCode)||{remaining:0,total:0,unit:meta.unit};
  const actionText=mode==='consume'?'消耗':'赠送';
  resetModalActions();
  document.getElementById('mTitle').textContent=mode==='consume'?`消耗 1 次 · ${meta.label}`:`赠送权益 · ${meta.label}`;
  document.getElementById('mBody').innerHTML=`<div class="fgrid"><div class="fg"><div class="flabel">权益名称</div><div class="finput">${esc(meta.label)}</div></div><div class="fg"><div class="flabel">次数</div><input class="finput" id="sb_count" type="number" value="1"></div>${mode==='consume'?`<div class="fg full"><div class="flabel">当前剩余</div><div style="font-size:12px;color:var(--tb);background:rgba(255,255,255,0.45);border:0.5px solid rgba(180,83,9,0.12);border-radius:8px;padding:10px 12px">当前可消耗：${row.remaining}/${row.total}${esc(row.unit)}</div></div>`:''}<div class="fg full"><div class="flabel">原因</div><input class="finput" id="sb_reason" value="${mode==='consume'?'学员权益使用':'学员权益赠送'}"></div></div><div class="mactions"><button class="btn-cancel" onclick="openStudentBenefitPickerModal('${studentId}','${mode}')">返回选择权益</button><button class="btn-save" id="studentBenefitSaveBtn" onclick="saveStudentBenefit('${studentId}','${mode}','${benefitCode}')">${mode==='consume'?'确认消耗':'确认赠送'}</button></div>`;
  document.getElementById('overlay').classList.add('open');
}
async function saveStudentBenefit(studentId,mode,benefitCode){
  const stu=studentUnifiedRecordForId(studentId);if(!stu)return;
  const meta=studentBenefitTypeMeta(benefitCode);if(!meta)return;
  const count=Math.abs(parseInt(document.getElementById('sb_count')?.value)||1);
  const data={studentId,studentName:stu.name||'',benefitCode:meta.benefitCode,benefitLabel:meta.label,unit:meta.unit,delta:mode==='consume'?-count:count,action:mode,reason:document.getElementById('sb_reason')?.value.trim()||'',relatedDate:today()};
  await runStandardMutation('studentBenefitSaveBtn',async()=>{
    const r=await apiCall('POST','/membership-benefit-ledger',data);
    const rows=Array.isArray(r?.records)?r.records:[r];
    rows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    if(typeof markReadModelsStale==='function')markReadModelsStale();
  },{
    successText:'学员权益已保存',
    refresh:async()=>{
      if(typeof refreshStudentDetailDataAfterMutation==='function')await refreshStudentDetailDataAfterMutation(studentId);
      renderStudents();
      studentDetailActiveTab='benefits';
      openStudentDetail(studentId);
      if(typeof refreshReadModelsInBackground==='function'){
        refreshReadModelsInBackground(['packageCenterPage','customerCenterPage','lifecycleMetricsPage','financePage','purchasesPage'],'student benefit background refresh',()=>{
          renderStudents();
        });
      }
    }
  });
}
async function openEntitlementAuthorizationModal(entitlementId){
  const activeStudentId=String(document.getElementById('overlay')?.dataset.studentDetailId||'').trim();
  let ent=entitlements.find(row=>String(row.id||'')===String(entitlementId||''));
  if(!ent){
    if(activeStudentId&&typeof ensureStudentDetailData==='function'){
      try{await ensureStudentDetailData(activeStudentId,{force:true});}catch(e){console.error('student detail reload for authorization failed',e);}
      ent=entitlements.find(row=>String(row.id||'')===String(entitlementId||''));
    }
  }
  if(!ent){
    const fallback=studentDetailPackageRowForEntitlementId(entitlementId);
    if(fallback){
      ent=fallback;
      if(!entitlements.some(row=>String(row.id||'')===String(entitlementId||'')))entitlements.push(fallback);
    }
  }
  if(!ent){toast('课包不存在','warn');return;}
  const owner=students.find(stu=>String(stu.id||'')===String(ent.studentId||''))||{};
  if(!entitlementAuthorizationStudentRows(ent).length){toast('暂无可授权学员','warn');return;}
  const studentPicker=`<input type="hidden" id="ent_auth_student" value=""><input class="finput tms-form-control" id="ent_auth_student_search" placeholder="搜索姓名 / 手机号" oninput="updateEntitlementAuthorizationStudentSearch(${jsArg(entitlementId)})" autocomplete="off"><div id="ent_auth_student_suggest" class="schedule-student-suggest"></div>`;
  const body=`<div class="tms-section-header" style="margin-top:0;">授权信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课包所有人</label><input class="finput tms-form-control" value="${esc(owner.name||ent.studentName||'-')}" readonly></div><div class="tms-form-item"><label class="tms-form-label">被授权学员</label>${studentPicker}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="ent_auth_notes" placeholder="例如：弟弟使用哥哥课包"></textarea></div></div>`;
  const actions=`<button type="button" class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button type="button" class="tms-btn tms-btn-primary" id="entAuthSaveBtn" onclick="saveEntitlementAuthorization(${jsArg(entitlementId)})">保存授权</button>`;
  openStandardModal({title:'授权课包给其他学员',bodyHtml:body,actionsHtml:actions,extraClass:'modal-tight modal-entitlement-auth',data:{studentDetailId:activeStudentId||ent.studentId||''}});
}
function studentDetailPackageRowForEntitlementId(entitlementId){
  const id=String(entitlementId||'');
  if(!id)return null;
  const activeStudentId=String(document.getElementById('overlay')?.dataset.studentDetailId||'').trim();
  const rows=[studentUnifiedRecordForId(activeStudentId),...studentUnifiedViewRows()].filter(Boolean);
  for(const stu of rows){
    const row=(Array.isArray(stu.detailPackageOrderRows)?stu.detailPackageOrderRows:[]).find(item=>String(item?.entitlementId||'')===id);
    if(row)return {...row,id,studentId:row.studentId||stu.id||stu.studentId||'',studentName:row.studentName||stu.name||''};
  }
  return null;
}
function entitlementAuthorizationStudentRows(entitlement){
  const ownerId=String(entitlement?.studentId||'');
  return students.filter(stu=>String(stu.id||'')&&String(stu.id||'')!==ownerId&&!isHiddenStudentProfile(stu)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-CN'));
}
function entitlementAuthorizationStudentLabel(stu){
  return [stu?.name,stu?.phone].filter(Boolean).join(' · ')||stu?.id||'';
}
function entitlementAuthorizationStudentMeta(stu){
  return [stu?.phone,stu?.wechatName].filter(Boolean).join(' · ')||'';
}
function renderEntitlementAuthorizationStudentSuggestions(entitlementId,keyword=''){
  const ent=entitlements.find(row=>String(row.id||'')===String(entitlementId||''))||{};
  const q=String(keyword||'').trim();
  if(!q)return '';
  const rows=entitlementAuthorizationStudentRows(ent).filter(stu=>searchHit(q,stu.name,stu.phone,stu.wechatName,stu.id)).slice(0,8);
  if(!rows.length)return '<div class="schedule-student-suggest-empty">没有匹配到学员</div>';
  return `<div class="schedule-student-suggest-list">${rows.map(stu=>`<button type="button" onclick="selectEntitlementAuthorizationStudent(${jsArg(stu.id)})"><strong>${esc(stu.name||stu.id||'')}</strong><span>${esc(entitlementAuthorizationStudentMeta(stu)||'-')}</span></button>`).join('')}</div>`;
}
function updateEntitlementAuthorizationStudentSearch(entitlementId){
  const input=document.getElementById('ent_auth_student_search');
  const hidden=document.getElementById('ent_auth_student');
  if(hidden)hidden.value='';
  const suggest=document.getElementById('ent_auth_student_suggest');
  if(suggest)suggest.innerHTML=renderEntitlementAuthorizationStudentSuggestions(entitlementId,input?.value||'');
}
function selectEntitlementAuthorizationStudent(studentId){
  const stu=students.find(row=>String(row.id||'')===String(studentId||''));
  const hidden=document.getElementById('ent_auth_student');
  const input=document.getElementById('ent_auth_student_search');
  if(hidden)hidden.value=stu?.id||'';
  if(input)input.value=entitlementAuthorizationStudentLabel(stu);
  const suggest=document.getElementById('ent_auth_student_suggest');
  if(suggest)suggest.innerHTML='';
}
async function saveEntitlementAuthorization(entitlementId){
  const currentStudentId=String(document.getElementById('overlay')?.dataset.studentDetailId||entitlements.find(row=>String(row.id||'')===String(entitlementId||''))?.studentId||'').trim();
  const authorizedStudentId=document.getElementById('ent_auth_student')?.value||'';
  if(!authorizedStudentId){toast('请先搜索并选择被授权学员','warn');return;}
  const notes=document.getElementById('ent_auth_notes')?.value.trim()||'';
  const result=await runStandardMutation('entAuthSaveBtn',async()=>{
    const saved=await apiCall('POST','/entitlement-authorizations',{entitlementId,authorizedStudentId,notes});
    if(typeof markReadModelsStale==='function')markReadModelsStale(['packageCenterPage','customerCenterPage','purchasesPage']);
    return saved;
  },{loadingText:'保存中...',formatError:entitlementAuthorizationSaveErrorText});
  if(!result)return;
  if(currentStudentId&&typeof refreshStudentDetailDataAfterMutation==='function')await refreshStudentDetailDataAfterMutation(currentStudentId);
  closeModal();
  if(currentStudentId){
    studentDetailActiveTab='orders';
    openStudentDetail(currentStudentId);
  }
  if(typeof refreshReadModelsInBackground==='function'){
    refreshReadModelsInBackground(['packageCenterPage','customerCenterPage','purchasesPage'],'entitlement authorization background refresh');
  }
  toast('授权已保存','success');
}
function entitlementAuthorizationSaveErrorText(error){
  const message=String(error?.message||error||'');
  if(/OTSObjectNotExist|Requested table does not exist|ft_entitlement_authorizations/.test(message))return '授权数据表还没准备好，请刷新页面后再试';
  if(message.includes('/entitlement-authorizations'))return message.replace(/\s*\[\/entitlement-authorizations\]\s*$/,'');
  if(/[\u4e00-\u9fff]/.test(message))return message;
  return '授权保存失败，请稍后重试';
}
function studentRecentFeedbackSummaryHtml(stu){
  const recentFeedbacks=Array.isArray(stu?.detailRecentFeedbackRows)?stu.detailRecentFeedbackRows:studentRecentFeedbacks(stu,2);
  if(!recentFeedbacks.length)return '';
  return recentFeedbacks.map(f=>`<div class="student-feedback-card"><strong>${esc(String(f.date||f.startTime||f.createdAt||'').slice(0,10)||'-')}</strong><span>${esc(f.summary||f.practicedToday||f.knowledgePoint||f.nextTraining||'已填写反馈')}</span></div>`).join('');
}
function studentLessonRecordMetaIcon(kind){
  if(kind==='time')return '<svg class="student-lesson-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="4"/><path d="M3 10h18"/></svg>';
  if(kind==='site')return '<svg class="student-lesson-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  return '<svg class="student-lesson-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>';
}
function studentLessonRecordMetaItem(kind,text){
  return `<span class="student-lesson-meta-item">${studentLessonRecordMetaIcon(kind)}<span>${esc(renderStandardEmptyText(text))}</span></span>`;
}
function studentLessonRecordDetailSectionText(rows=[],index=0){
  const row=rows[index]||{};
  const marker=typeof studentLessonSectionMarker==='function'?studentLessonSectionMarker:(value=>String(value));
  if(row.lessonSectionText)return row.lessonSectionText;
  const entitlementId=String(row.entitlementId||row.purchaseId||row.packageName||'').trim();
  const unit=String(row.unit||'节').trim();
  if(!entitlementId||unit==='次'||/体验/.test(String(row.courseType||row.packageName||'')))return '';
  const packageRows=(Array.isArray(rows)?rows:[])
    .filter(item=>String(item.entitlementId||item.purchaseId||item.packageName||'').trim()===entitlementId)
    .filter(item=>Number(item.lessonDelta)<0)
    .filter(item=>String(item.unit||'').trim()!=='次')
    .filter(item=>!/体验/.test(String(item.courseType||item.packageName||'')));
  const usedBefore=packageRows
    .filter(item=>String(item.sortTime||item.time||'')<String(row.sortTime||row.time||''))
    .reduce((sum,item)=>sum+Math.abs(Number(item.lessonDelta)||0),0);
  const count=Math.abs(Number(row.lessonDelta)||0);
  if(!count)return '';
  const startNo=usedBefore+1;
  const endNo=usedBefore+count;
  const startText=marker(startNo);
  const endText=marker(endNo);
  return `[第${startText}${startText===endText?'':`-${endText}`}${unit}]`;
}
function studentHasActiveSearchOrFilter(){
  return !!((document.getElementById('stuSearch')?.value||'').trim()
    ||document.getElementById('stuTypeFilter')?.value
    ||document.getElementById('stuSourceFilter')?.value
    ||studentTagFilterCount()
    ||document.getElementById('stuCoachFilter')?.value);
}
function studentEmptyStateHtml(){
  const filtered=studentHasActiveSearchOrFilter();
  const title=filtered?'没有匹配的学员':'暂无学员';
  const desc=filtered?'调整搜索或筛选后再试':'点击右上角添加学员开始录入';
  return `<tr><td colspan="${studentTableColumns().length}"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderStudentMobileCards(list){
  const host=document.getElementById('studentMobileCards');
  if(!host)return;
  if(!list.length){
    const filtered=studentHasActiveSearchOrFilter();
    host.innerHTML=`<div class="tms-empty-state"><div class="tms-empty-title">${filtered?'没有匹配的学员':'暂无学员'}</div><div class="tms-empty-desc">${filtered?'调整搜索或筛选后再试':'点击右下角添加学员开始录入'}</div></div>`;
    return;
  }
  host.innerHTML=list.map(s=>{
    const coachText=studentPrimaryCoachText(s);
    const noteText=studentHumanText(studentNoteSummary(s));
    return `<article class="admin-h5-list-card admin-h5-student-card">
      <div class="admin-h5-card-head">
        <div><strong>${esc(s.name)}</strong><span>${esc(cn(s.campus)||'-')}</span></div>
        ${renderStandardBusinessTag(s.type,'customerType')}
      </div>
      <div class="admin-h5-card-tags"><span>${esc(studentSourceText(s)||'-')}</span>${renderStudentLabelTag(studentActivityStatusText(s))}${renderStudentLabelTag(studentPaymentModeText(s))}</div>
      <div class="admin-h5-card-grid">
        <span><b>课包状态</b>${renderStudentLabelTag(studentPackageStatusText(s))}</span>
        <span><b>课包余额</b>${esc(renderStandardEmptyText(studentPackageLessonMeta(s).text))}</span>
        <span><b>最近上课</b>${esc(renderStandardEmptyText(studentRecentLessonText(s)))}</span>
        <span><b>累计上课</b>${esc(renderStandardEmptyText(studentCompletedLessonCount(s)))}</span>
        <span><b>累计课程付费</b>${esc(renderStandardEmptyText(studentCumulativeCoursePaidText(s)))}</span>
        <span><b>学员状态</b>${renderStudentLabelTag(studentLifecycleStatusText(s))}</span>
        <span><b>负责教练</b>${esc(coachText||'-')}</span>
      </div>
      <p>${esc(noteText||'暂无备注')}</p>
      <div class="admin-h5-card-actions"><button type="button" onclick="openStudentDetail('${s.id}')">查看</button><button type="button" onclick="openPurchaseModal('${s.id}')">课包</button></div>
    </article>`;
  }).join('');
}
function renderStudents(options={}){
  syncStudentPageGlobalsFromMode();
  if(!options.skipToolbar)renderStudentToolbarFilters();
  ensureStudentDefaultSort();
  renderStudentTableHeaders();
  updateStudentSortHeaders();
  const filteredStudents=getFilteredStudents();
  let list=getSortedStudents(filteredStudents);
  const stats=studentPageStats(filteredStudents);
  const statsHost=document.getElementById('studentStatsRow');
  if(stats.total==null&&typeof renderStandardSkeletonKpiCards==='function')statsHost.innerHTML=renderStandardSkeletonKpiCards(5);
  else statsHost.innerHTML=renderStandardDataCards(studentTopStatsCards(stats));
  const isMobileList=document.body.classList.contains('admin-mobile');
  const pageState=isMobileList?{total:list.length,pages:1,slice:list,page:1}:standardListSlice(list,stuPage,stuPageSize);
  stuPage=pageState.page;
  persistStudentPageGlobalsToMode();
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-students .tms-pagination');
  if(pager)pager.style.display=total?'flex':'none';
  document.getElementById('stuPagerInfo').innerHTML=renderPagerInfoHtml(total);
  renderStudentPagerControls(total,pages);
  document.getElementById('stuTbody').innerHTML=slice.length?slice.map(s=>{
    const coachText=studentPrimaryCoachText(s);
    const noteText=studentHumanText(studentNoteSummary(s));
    return `<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(s.name)}</div></td><td>${renderStandardCellText(studentSourceText(s),false)}</td><td>${renderStandardBusinessTag(s.type,'customerType')}</td><td>${renderStandardCellText(cn(s.campus))}</td><td>${renderStudentLabelTag(studentActivityStatusText(s))}</td><td>${renderStudentLabelTag(studentPaymentModeText(s))}</td><td>${renderStudentLabelTag(studentPackageStatusText(s))}</td><td>${studentUnifiedPackageBalanceHtml(s)}</td><td>${renderStandardCellText(studentRecentLessonText(s),false)}</td><td>${renderStandardCellText(studentCompletedLessonCount(s),false)}</td><td>${renderStandardCellText(studentCumulativeCoursePaidText(s),false)}</td><td>${renderStudentLabelTag(studentLifecycleStatusText(s))}</td><td>${renderStandardCellText(coachText)}</td><td>${renderStandardTooltipText(noteText,'tms-text-remark tms-text-remark-1 student-note-cell')}</td><td class="tms-sticky-r tms-action-cell" style="width:90px;padding-right:20px"><span class="tms-action-link" onclick="openStudentDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openPurchaseModal('${s.id}')">课包</span></td></tr>`;
  }).join(''):studentEmptyStateHtml();
  renderStudentMobileCards(slice);
  prewarmStudentDetailsForRows(slice);
}
function studentFeedbackHistoryHtml(s){
  const rows=feedbacks.filter(f=>{
    const fIds=parseArr(f.studentIds);
    if(f.studentId===s.id||fIds.includes(s.id))return true;
    const sch=schedules.find(x=>x.id===f.scheduleId);
    if(sch&&parseArr(sch.studentIds).includes(s.id))return true;
    return !f.studentId&&!fIds.length&&String(f.studentName||'')===String(s.name||'');
  }).sort((a,b)=>new Date(b.startTime||b.createdAt||0)-new Date(a.startTime||a.createdAt||0)).slice(0,8);
  if(!rows.length)return '<div style="font-size:12px;color:var(--td)">暂无课后反馈</div>';
  return rows.map(f=>{
    const sch=schedules.find(x=>x.id===f.scheduleId)||{};
    const cls=sch.classId?classes.find(c=>c.id===sch.classId):null;
    const product=cls?.productName||products.find(p=>p.id===cls?.productId)?.name||'';
    const course=[cls?.className,product].filter(Boolean).join(' / ')||'-';
    const campus=f.campus||sch.campus,venue=f.venue||sch.venue;
    return `<div style="border-top:0.5px solid rgba(180,83,9,.12);padding:8px 0;font-size:12px;color:var(--tb)"><div style="font-weight:700;color:var(--th)">${fmtDt(f.startTime||sch.startTime)} · ${esc(coachName(f.coach||sch.coach))||'-'}</div><div style="margin-top:3px;color:var(--ts)">校区/场地：${cn(campus)||'-'} ${esc(venue)||''}；课程：${esc(course)}</div><div style="margin-top:3px">今天练习了：${esc(f.practicedToday)||'-'}</div><div style="margin-top:3px">练习情况：${esc(f.knowledgePoint)||'-'}</div><div style="margin-top:3px">下次练习：${esc(f.nextTraining)||'-'}</div></div>`;
  }).join('');
}
function studentRecentFeedbacks(stu,limit=2){
  return feedbacks.filter(f=>{
    const fIds=parseArr(f.studentIds);
    if(f.studentId===stu.id||fIds.includes(stu.id))return true;
    const sch=schedules.find(x=>x.id===f.scheduleId);
    if(sch&&parseArr(sch.studentIds).includes(stu.id))return true;
    return false;
  }).sort((a,b)=>new Date(b.startTime||b.createdAt||0)-new Date(a.startTime||a.createdAt||0)).slice(0,limit);
}
function studentLessonRecordHtml(stu){
  const rows=studentLessonRecordRows(stu);
  if(!rows.length)return '<div class="student-detail-empty">暂无上课记录</div>';
  const limit=studentLessonRecordExpanded(stu)?rows.length:10;
  const expanded=studentLessonRecordExpanded(stu);
  const items=rows.slice(0,limit).map((item,index)=>{
    if(item.kind){
      const sectionText=studentLessonRecordDetailSectionText(rows,index);
      const detailText=[item.courseType,item.className||item.packageName].filter(Boolean).join(' · ');
      const title=[sectionText,item.lessonRelationText,detailText].filter(Boolean).join(' ');
      return `<div class="student-lesson-row"><div class="student-lesson-main"><div class="student-lesson-title">${esc(title||'上课记录')}</div><div class="student-lesson-meta">${studentLessonRecordMetaItem('time',item.time)}${studentLessonRecordMetaItem('site',[cn(item.campus)||'-',item.venue||''].filter(Boolean).join(' '))}${studentLessonRecordMetaItem('coach',item.coach||'-')}</div></div></div>`;
    }
    const line=item.type==='ledger'
      ? studentLessonRecordPackageHtml(item.row,item.ent)
      : `<div class="student-lesson-row"><div class="student-lesson-main"><div class="student-lesson-title">${esc(`[${studentLessonRecordTimeText(item.schedule)}] · ${scheduleCourseTypeLabel(item.schedule)} · ${scheduleClassName(item.schedule)}`)}</div><div class="student-lesson-meta">${studentLessonRecordMetaItem('time',studentLessonRecordTimeText(item.schedule))}${studentLessonRecordMetaItem('site',[cn(item.schedule.campus)||'-',item.schedule.venue||''].filter(Boolean).join(' '))}${studentLessonRecordMetaItem('coach',item.schedule.coach||'-')}</div></div></div>`;
    return line;
  });
  const more=rows.length>10?`<div style="margin-top:6px"><button class="btn-sec" onclick="toggleStudentLessonRecordExpanded('${stu.id}')">${expanded?'收起':'展开全部'}</button></div>`:'';
  return `${renderDetailDrawerTimeline(items,{emptyText:'暂无上课记录'})}${more}`;
}
function studentLessonRecordRows(stu){
  if(Array.isArray(stu?.detailLessonRecordRows))return stu.detailLessonRecordRows;
  return [];
}
function studentLedgerPreferredDisplayEntitlement(left={},right={}){
  const leftDate=studentEntitlementPurchaseDate(left,purchases.find(p=>p.id===left.purchaseId)||{});
  const rightDate=studentEntitlementPurchaseDate(right,purchases.find(p=>p.id===right.purchaseId)||{});
  return String(rightDate||'')>=String(leftDate||'')?right:left;
}
function studentConcreteLessonLedgerItems(stu){
  return studentEntitlementLedgerRows(stu)
    .filter(row=>studentLessonRecordLedgerShouldShow(row))
    .map(row=>{
      const schedule=findScheduleForEntitlementLedgerRow(row,stu);
      return {row,schedule};
    })
    .filter(item=>studentLessonRecordHasConcreteTime(item.row,item.schedule));
}
function studentLessonRecordShouldIncludeSchedule(schedule,stu,ledgerKeys,hasConcretePackageLedger){
  const key=studentLessonRecordKey({studentId:stu?.id,schedule});
  if(ledgerKeys?.has(key))return false;
  if(!hasConcretePackageLedger)return true;
  return scheduleCourseType(schedule)==='体验课';
}
function studentLessonRecordHasConcreteTime(row={},schedule={}){
  if(isManualEntitlementLedgerRow(row))return true;
  if(schedule?.startTime)return true;
  if(String(row?.sourceTimeBand||'').match(/\d{1,2}:\d{2}/))return true;
  if(String(row?.scheduleTime||'').match(/\d{1,2}:\d{2}/))return true;
  return false;
}
function studentLessonRecordLedgerShouldShow(row={}){
  if(Number(row.lessonDelta)<0)return true;
  if(row.freeLesson===true||row.action==='free_lesson')return true;
  return Number(row.lessonDelta)===0&&/免费|赠送/.test(String(row.reason||'')+String(row.notes||''));
}
function studentLessonRecordExpanded(stu){
  return !!studentLessonRecordExpandedState[stu?.id];
}
function toggleStudentLessonRecordExpanded(studentId){
  studentLessonRecordExpandedState[studentId]=!studentLessonRecordExpandedState[studentId];
  openStudentDetail(studentId);
}
function studentLessonRecordTimeText(s){
  const date=String(s.startTime||'').slice(0,10);
  const start=String(s.startTime||'').slice(11,16);
  const end=String(s.endTime||'').slice(11,16);
  return end?`${date} ${start}-${end}`:`${date} ${start}`;
}
function studentTeachingInfoHtml(stu){
  const coachText=studentCoachSummary(stu);
  const recentSchedule=schedules.filter(x=>scheduleHasStudent(x,stu)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  const recentFeedbacks=studentRecentFeedbacks(stu,2);
  const feedbackHtml=recentFeedbacks.length?recentFeedbacks.map(f=>`${String(f.startTime||f.createdAt||'').slice(0,10)}：${f.practicedToday||f.knowledgePoint||f.nextTraining||'已填写反馈'}`).map(esc).join('<br>'):'-';
  return `<div class="tms-section-header">教学信息</div><div class="tms-detail-grid">${studentDetailFieldHtml('负责教练',coachText)}${studentDetailFieldHtml('最近上课',recentSchedule?.startTime?daysAgoText(recentSchedule.startTime.slice(0,10)):'-')}${studentDetailFieldHtml('累计上课',studentCompletedLessonCount(stu))}${studentDetailFieldHtml('课时 / 课包',studentPackageLessonSummary(stu))}${studentDetailBlockHtml('上课记录',studentLessonRecordHtml(stu),{hideEmpty:true})}${studentDetailBlockHtml('最近2条课后反馈',feedbackHtml,{hideEmpty:true})}</div>`;
}
function studentOpsInfoHtml(stu){
  const recentFeedback=studentRecentFeedbacks(stu,1)[0];
  const conversionSummary=recentFeedback?(recentFeedback.conversionIntent||recentFeedback.recommendedProductType||recentFeedback.needOpsFollowUp?'已形成转化判断':'未形成转化判断'):'暂无转化判断';
  const opsConclusion=recentFeedback?esc(renderStandardEmptyText([recentFeedback.mainIssues,recentFeedback.recommendedReason,recentFeedback.opsFollowUpSuggestion].filter(Boolean).join('；'))):'-';
  const sourceText=studentSourceText(stu);
  const noteText=studentHumanText(stu.notes);
  const content=[
    sourceText?studentDetailFieldHtml('来源',sourceText):'',
    conversionSummary==='已形成转化判断'?studentDetailFieldHtml('转化判断',conversionSummary):'',
    recentFeedback?.needOpsFollowUp?studentDetailFieldHtml('运营跟进','需要运营跟进'):'',
    studentDetailBlockHtml('最近反馈里的运营结论',opsConclusion,{hideEmpty:true}),
    studentDetailBlockHtml('运营备注',esc(renderStandardEmptyText(noteText)),{hideEmpty:true})
  ].join('');
  return studentDetailSectionHtml('运营信息',content);
}
function studentConsumptionInfoHtml(stu){
  const linkedCourts=courtsForStudent(stu);
  if(!linkedCourts.length)return '<div class="student-detail-empty">暂无关联订场账户</div>';
  const cards=linkedCourts.flatMap(c=>{
    const finance=typeof membershipReadModelFinanceForCourt==='function'?membershipReadModelFinanceForCourt(c):courtFinanceLocal(c);
    const item=typeof membershipReadModelItemForCourt==='function'?membershipReadModelItemForCourt(c):null;
    const member=courtMembershipSummary(c);
    const accountType=item?.accountType||member.accountType||'普通';
    const memberStatus=item?.membershipStatus||member.status||'未开通';
    const discount=item?.membershipDiscountText||member.discount||'-';
    const validUntil=item?.membershipValidUntil||member.validUntil||'-';
    const isMember=!/普通|未开|暂无|^[-—]$/.test(`${accountType} ${memberStatus}`);
    return [
      `<div class="student-linked-summary-item"><div class="student-linked-summary-title">订场账户</div><div class="student-linked-summary-main">${esc(c.name||'-')}</div><div class="student-linked-summary-meta"><span>当前余额 ¥${fmt(finance.balance)}</span><span>累计订场消费 ¥${fmt(finance.spentAmount)}</span></div></div>`,
      `<div class="student-linked-summary-item"><div class="student-linked-summary-title">会员状态</div><div class="student-linked-summary-main">${esc(isMember?`${accountType} · ${memberStatus}`:'未开通会员')}</div><div class="student-linked-summary-meta"><span>折扣 ${esc(discount||'-')}</span><span>到期 ${esc(validUntil||'-')}</span></div></div>`
    ];
  });
  return `<div class="student-linked-summary-list">${cards.join('')}</div><div class="student-linked-summary-help">如需调整关联关系，请到「订场/会员」页面编辑订场用户。</div>`;
}
function studentLinkedDetailHtml(s,showAccount=true){
  const latest=schedules.filter(x=>scheduleHasStudent(x,s)).sort((a,b)=>new Date(b.startTime||0)-new Date(a.startTime||0))[0];
  const canBuyPackage=currentUser?.role==='admin';
  return `<div class="sec-ttl">关联信息</div><div style="background:rgba(217,119,6,0.06);border:0.5px solid rgba(217,119,6,0.16);border-radius:8px;padding:10px 12px;margin-bottom:12px">${showAccount?`<div class="flabel">订场账户</div>${studentAccountSummaryHtml(s)}<div class="flabel" style="margin-top:8px">关联订场账户会员摘要</div>${studentMembershipSummaryHtml(s)}`:''}<div class="flabel" style="margin-top:${showAccount?8:0}px">所在班次</div>${studentClassSummaryHtml(s)}<div class="flabel" style="margin-top:8px">课包余额</div>${studentEntitlementSummaryHtml(s)}${canBuyPackage?`<div style="margin-top:8px"><button class="btn-sec" onclick="openPurchaseModal('${s.id}')">购买课包</button></div>`:''}<div class="flabel" style="margin-top:8px">最近记录</div><div style="font-size:12px;color:var(--tb)">最近上课：${latest?.startTime?.slice(0,10)||'-'}；最近订场：${latestCourtUseDateForStudent(s)||'-'}</div><div class="flabel" style="margin-top:8px">课后反馈</div>${studentFeedbackHistoryHtml(s)}</div>`;
}
function studentReminderStatusText(stu){
  if(stu?.officialAccountOpenId)return `已绑定${stu.officialAccountBoundAt?' · '+String(stu.officialAccountBoundAt).slice(0,10):''}`;
  return '未绑定';
}
function studentReminderModeText(stu){
  const mode=stu?.officialAccountReminderMode||'all';
  if(mode==='only24h')return '课前24小时提醒一次';
  if(mode==='custom')return `课前${Number(stu?.officialAccountReminderCustomHours)||12}小时提醒一次`;
  if(mode==='off')return '不提醒';
  return '课前48小时和24小时各提醒一次';
}
function studentReminderModeOptionHtml(stu,value,title,desc){
  const mode=stu?.officialAccountReminderMode||'all';
  const checked=mode===value;
  const customValue=Number(stu?.officialAccountReminderCustomHours)||12;
  const custom=value==='custom'
    ?`<span class="student-reminder-custom" onclick="event.stopPropagation()"><input id="studentReminderCustomHours" type="number" min="1" max="72" value="${customValue}" oninput="if(document.getElementById('studentReminderMode_custom'))document.getElementById('studentReminderMode_custom').checked=true" onchange="updateStudentReminderMode('${stu.id}','custom')"><span>小时</span></span>`
    :'';
  return `<label class="student-reminder-option${checked?' is-active':''}" onclick="updateStudentReminderMode('${stu.id}','${value}')"><input type="radio" name="studentReminderMode" id="studentReminderMode_${value}" value="${value}" ${checked?'checked':''}><span class="student-reminder-radio"></span><span class="student-reminder-copy-text">${esc(title)}</span>${custom}</label>`;
}
function studentReminderInfoHtml(stu){
  const statusClass=stu?.officialAccountOpenId?'tms-tag-green':'tms-tag-tier-slate';
  const linkAction=stu?.officialAccountOpenId
    ?`<button class="student-reminder-copy-btn" onclick="generateStudentReminderBindLink('${stu.id}')"><span>复制绑定链接</span><small>换微信或发给家长时使用</small></button><button class="btn-sec" onclick="unbindStudentReminder('${stu.id}')">停止绑定</button>`
    :`<button class="student-reminder-copy-btn" onclick="generateStudentReminderBindLink('${stu.id}')"><span>复制绑定链接</span><small>学员用微信打开后完成绑定</small></button>`;
  const content=`<div class="student-reminder-options">${studentReminderModeOptionHtml(stu,'all','48小时 + 24小时','适合大多数学员，提前确认行程并在前一天再提醒一次')}${studentReminderModeOptionHtml(stu,'only24h','仅24小时','适合不想收到太多消息的学员')}${studentReminderModeOptionHtml(stu,'custom','自定义','只在你设置的提前时间提醒一次')}${studentReminderModeOptionHtml(stu,'off','不提醒','保留绑定关系，但不再推送上课提醒')}</div><div class="tms-field-help">学员需要关注服务号后才能收到课前提醒；绑定过的学员再次打开链接，会看到已绑定提示。</div>`;
  return studentDrawerCardHtml('服务号提醒偏好',content,'student-reminder-section',linkAction,{useGrid:false,titleHtml:`服务号提醒偏好<span class="tms-tag ${statusClass}">${studentReminderStatusText(stu)}</span>`});
}
function leadRowsForSummary(){
  return typeof leadRows==='function'?leadRows():(Array.isArray(leads)?leads:[]);
}
function leadForStudentSummary(studentId){
  return leadRowsForSummary().find(item=>String(item?.studentId||'')===String(studentId))||null;
}
function studentLeadSummaryHtml(s){
  const lead=leadForStudentSummary(s?.id);
  if(!lead)return '<div class="tms-text-secondary">未关联线索</div>';
  const lines=[
    `来源：${lead.source||'-'}`,
    `需求产品：${lead.demandProduct||lead.consultType||'-'}`,
    `跟进人：${lead.owner||'-'}`,
    `最近跟进：${lead.lastFollowupAt?fmtDt(lead.lastFollowupAt):'-'}`,
    `下次跟进：${lead.nextFollowupAt||'-'}`,
    `转化结果：${leadConversionText(lead)}`
  ];
  return `<div class="tms-readonly-text">${esc(lines.join('；'))}</div>`;
}
function studentLeadJumpActionHtml(s){
  const lead=leadForStudentSummary(s?.id);
  return lead?.id&&typeof jumpToLeadDetail==='function'
    ?`<button type="button" class="schedule-detail-action" onclick="jumpToLeadDetail('${lead.id}')">查看线索</button>`
    :'';
}
function studentDetailDatasetsReady(id){
  const names=Array.isArray(STUDENT_DETAIL_REQUIREMENTS)?STUDENT_DETAIL_REQUIREMENTS:[];
  const staticReady=names.every(name=>loadedDatasets.has(name)&&!(typeof staleCachedDatasets==='object'&&staleCachedDatasets.has(name))&&(!(typeof datasetHasCurrentRequestKey==='function')||datasetHasCurrentRequestKey(name)));
  const detailReady=typeof studentDetailDataReady==='function'?studentDetailDataReady(id,studentDetailActiveTab):false;
  return staticReady&&(detailReady||studentDetailLocalRowsReady(id,studentDetailActiveTab));
}
function studentDetailLocalRowsReady(id,tab=studentDetailActiveTab){
  const s=studentUnifiedRecordForId(id);
  if(!s)return false;
  if(tab==='orders')return false;
  if(tab==='benefits')return Array.isArray(s.detailBenefitRows)&&Array.isArray(s.detailBenefitGrantRows)&&Array.isArray(s.detailBenefitConsumeRows);
  return true;
}
function studentDetailTabNeedsDatasets(tab=studentDetailActiveTab){
  return ['orders','benefits'].includes(tab);
}
function studentDetailDrawerIsOpenFor(id){
  return String(document.getElementById('overlay')?.dataset.studentDetailId||'')===String(id||'');
}
function studentDetailPageStillValid(){
  return ['students','package-students','trial-students'].includes(currentPage);
}
function ensureStudentDetailDatasets(id,{block=false}={}){
  if(studentDetailDatasetsReady(id))return false;
  const s=studentUnifiedRecordForId(id);if(!s)return false;
  const requestSeq=++studentDetailRequestSeq;
  if(block){
    const loadingBody='<div class="schedule-detail-content"><div class="empty"><p>详情加载中...</p></div></div>';
    openStudentDrawer({titleHtml:`${studentDetailHeroHtml(s)}${studentDetailTabsHtml(studentDetailActiveTab)}`,bodyHtml:loadingBody,actionsHtml:'',studentId:s.id});
  }
  const tasks=[];
  if(Array.isArray(STUDENT_DETAIL_REQUIREMENTS)&&STUDENT_DETAIL_REQUIREMENTS.length)tasks.push(ensureDatasetsByName(STUDENT_DETAIL_REQUIREMENTS));
  if(typeof ensureStudentDetailData==='function')tasks.push(ensureStudentDetailData(id,{force:studentDetailTabNeedsDatasets(studentDetailActiveTab)}));
  Promise.all(tasks).then(()=>{
    if(studentDetailRequestSeq!==requestSeq||!studentDetailDrawerIsOpenFor(id)||!studentDetailPageStillValid())return;
    if(!(studentDetailEditingSection==='basic'&&studentDetailEditingStudentId===id))openStudentDetail(id);
  }).catch(e=>{
    console.error('student detail data load failed',e);
    if(block&&studentDetailDrawerIsOpenFor(id)){
      const retry=`<button type="button" class="schedule-detail-action primary" onclick="openStudentDetail('${id}')">重试</button>`;
      const message='学员详情加载失败，请重试';
      toast(message,'error');
      openStudentDrawer({titleHtml:`${studentDetailHeroHtml(s)}${studentDetailTabsHtml(studentDetailActiveTab)}`,bodyHtml:renderDetailDrawerContent(renderDetailDrawerCard('加载失败',`<div class="empty"><p>${esc(message)}</p></div>`,{useGrid:false,actionsHtml:retry})),actionsHtml:'',studentId:s.id});
    }
  });
  return block;
}
function openStudentDetail(id){
  const s=studentUnifiedRecordForId(id);if(!s)return;
  if(studentDetailTabNeedsDatasets()&&ensureStudentDetailDatasets(id,{block:true}))return;
  if(!(studentDetailEditingSection==='basic'&&studentDetailEditingStudentId===id))editId=null;
  const body=studentDetailActiveTab==='basic'?studentDetailBasicTabHtml(s):studentDetailActiveTab==='orders'?studentDetailOrdersTabHtml(s):studentDetailBenefitsTabHtml(s);
  openStudentDrawer({titleHtml:`${studentDetailHeroHtml(s)}${studentDetailTabsHtml(studentDetailActiveTab)}`,bodyHtml:body,actionsHtml:'',studentId:s.id});
}
function cancelStudentDetailEdit(studentId){
  if(studentId)studentDetailEditingStudentId=studentId;
  studentDetailEditingSection='';
  openStudentDetail(studentId);
}
async function copyStudentReminderText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return;}
  const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
}
function mergeStudentReminderUpdate(row){
  const i=students.findIndex(x=>x.id===row.id);
  if(i>=0)students[i]={...students[i],...row};
}
function setStudentReminderModeSaving(saving){
  document.querySelectorAll('.student-reminder-option input').forEach(input=>{input.disabled=!!saving;});
  document.querySelector('.student-reminder-section')?.classList.toggle('is-saving',!!saving);
}
async function generateStudentReminderBindLink(studentId){
  if(studentReminderLinkGenerating)return;
  studentReminderLinkGenerating=true;
  const btn=document.querySelector('.student-reminder-copy-btn');
  const label=btn?.querySelector('span');
  const oldText=label?.textContent||'复制绑定链接';
  if(btn)btn.disabled=true;
  if(label)label.textContent='复制中...';
  try{
    const res=await apiCall('POST',`/students/${studentId}/reminder-link`,{});
    if(res.student)mergeStudentReminderUpdate(res.student);
    const link=`${window.location.origin}${res.bindPath}`;
    await copyStudentReminderText(link);
    toast('绑定链接已复制','success');
    openStudentDetail(studentId);
  }catch(e){
    if(btn)btn.disabled=false;
    if(label)label.textContent=oldText;
    toast('生成绑定链接失败：'+e.message,'error');
  }finally{studentReminderLinkGenerating=false;}
}
async function updateStudentReminderMode(studentId,mode){
  const stu=students.find(x=>x.id===studentId);
  if(!stu)return;
  const previous={...stu};
  const customInput=document.getElementById('studentReminderCustomHours');
  const customHours=customInput?customInput.value:undefined;
  const currentMode=stu.officialAccountReminderMode||'all';
  if(mode===currentMode&&(mode!=='custom'||String(customHours||stu.officialAccountReminderCustomHours||12)===String(stu.officialAccountReminderCustomHours||12)))return;
  const requestSeq=++studentReminderModeRequestSeq;
  if(studentReminderModeSaveTimer)clearTimeout(studentReminderModeSaveTimer);
  mergeStudentReminderUpdate({id:studentId,officialAccountReminderMode:mode,officialAccountReminderCustomHours:customHours||stu.officialAccountReminderCustomHours||12});
  openStudentDetail(studentId);
  setStudentReminderModeSaving(true);
  studentReminderModeSaveTimer=setTimeout(async()=>{
    try{
      const res=await apiCall('POST',`/students/${studentId}/reminder-settings`,{mode,customHours});
      if(requestSeq!==studentReminderModeRequestSeq)return;
      if(res.student)mergeStudentReminderUpdate(res.student);
      toast('提醒时间已更新','success');
      openStudentDetail(studentId);
    }catch(e){
      if(requestSeq!==studentReminderModeRequestSeq)return;
      mergeStudentReminderUpdate(previous);
      toast('更新提醒时间失败：'+e.message,'error');
      openStudentDetail(studentId);
    }finally{
      if(requestSeq===studentReminderModeRequestSeq)setStudentReminderModeSaving(false);
    }
  },300);
}
async function unbindStudentReminder(studentId){
  const stu=students.find(x=>x.id===studentId);
  const ok=await appConfirm(`确认解绑「${stu?.name||'学员'}」的服务号上课提醒？`,{title:'解绑服务号提醒',confirmText:'确认解绑',danger:true});
  if(!ok)return;
  try{
    const res=await apiCall('POST',`/students/${studentId}/reminder-unbind`,{});
    if(res.student)mergeStudentReminderUpdate(res.student);
    toast('服务号提醒已解绑','success');
    openStudentDetail(studentId);
  }catch(e){toast('解绑失败：'+e.message,'error');}
}
function openStudentModal(id='',mode='edit'){
  const s=id?studentUnifiedRecordForId(id):null;
  if(id&&s){
    editId=id;
    studentDetailActiveTab='basic';
    studentDetailEditingSection='basic';
    studentDetailEditingStudentId=id;
    openStudentDetail(id);
    return;
  }
  editId='';
  studentDetailActiveTab='basic';
  studentDetailEditingSection='basic';
  studentDetailEditingStudentId='';
  const titleHtml=studentDetailHeroHtml({name:'新增学员',type:'待保存',campus:''});
  const formActions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="closeModal()">取消</button><button type="button" class="schedule-detail-action primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`;
  const body=`<div class="schedule-detail-content">${renderDetailDrawerFormCard('基本信息',studentBasicInfoFormHtml(null),formActions)}</div>`;
  openStudentDrawer({titleHtml:`${titleHtml}${renderDetailDrawerTabs('basic',[['basic','基本信息']],{onClick:'setStudentDetailTab'})}`,bodyHtml:body,actionsHtml:'',studentId:''});
}
async function saveStudent(){
  const name=document.getElementById('s_name').value.trim();if(!name){toast('请输入姓名','warn');return;}
  const phone=document.getElementById('s_phone').value.trim();if(!validateCnPhone(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('studentSaveBtn');
  const data={name,phone,primaryCoach:document.getElementById('s_primaryCoach')?.value||'',type:document.getElementById('s_type').value,source:FlowTennisBusinessTaxonomy.normalizeLeadSource(document.getElementById('s_source').value),campus:document.getElementById('s_campus').value,notes:document.getElementById('s_notes').value.trim(),updatedBy:currentUser?.name||''};
  const duplicates=getStudentDuplicateCandidates(data,editId);
  if(duplicates.length){
    const summary=duplicates.map(s=>`${s.name}${s.phone?`（${s.phone}）`:''}`).join('、');
    if(!await appConfirm(`发现可能重复的学员：${summary}。是否继续保存？`,{title:'发现重复学员',confirmText:'继续保存'})){
      if(btn){btn.disabled=false;btn.textContent='保存';}
      return;
    }
  }
  const savedEditId=editId;
  await runStandardMutation(btn,async()=>{
    if(savedEditId){const res=await apiCall('PUT','/students/'+savedEditId,data);const i=students.findIndex(x=>x.id===savedEditId);if(i>=0)students[i]={...students[i],...res,id:savedEditId};if(typeof mergeTeachingStudentDetail==='function')mergeTeachingStudentDetail({...res,id:savedEditId,studentId:savedEditId,displayName:res.name||data.name||''});mergeLinkedUpdates(res.studentUpdates||{});}
    else{const r=await apiCall('POST','/students',data);students.unshift(r);}
  },{
    successText:savedEditId?'修改成功 ✓':'添加成功 ✓',
    refresh:()=>{
      renderStudents();
      if(savedEditId){editId=null;studentDetailEditingSection='';studentDetailEditingStudentId='';openStudentDetail(savedEditId);}
      else closeModal();
      if(typeof refreshReadModelsInBackground==='function'){
        refreshReadModelsInBackground(['customerCenterPage','lifecycleMetricsPage','packageCenterPage','purchasesPage'],'student save background refresh',()=>{
          renderStudents();
          if(savedEditId&&studentDetailDrawerIsOpenFor(savedEditId))openStudentDetail(savedEditId);
        });
      }
    }
  });
}
function mergeLinkedUpdates(updates){
  (updates.plans||[]).forEach(r=>{const i=plans.findIndex(x=>x.id===r.id);if(i>=0)plans[i]=r;});
  (updates.schedule||[]).forEach(r=>{const i=schedules.findIndex(x=>x.id===r.id);if(i>=0)schedules[i]=r;});
  (updates.purchases||[]).forEach(r=>{const i=purchases.findIndex(x=>x.id===r.id);if(i>=0)purchases[i]=r;});
  (updates.entitlements||[]).forEach(r=>{const i=entitlements.findIndex(x=>x.id===r.id);if(i>=0)entitlements[i]=r;});
  (updates.feedbacks||[]).forEach(r=>{const i=feedbacks.findIndex(x=>x.id===r.id);if(i>=0)feedbacks[i]=r;});
  (updates.courts||[]).forEach(r=>{const i=courts.findIndex(x=>x.id===r.id);if(i>=0)courts[i]=r;});
}
function exportStudentCSV(){
  const d=getFilteredStudents();
  let csv='姓名,手机号,类型,来源,校区,备注\n';
  csv+=d.map(s=>[csvEscapeCell(s.name),csvEscapeCell(s.phone||''),csvEscapeCell(s.type||''),csvEscapeCell(studentSourceText(s)),csvEscapeCell(cn(s.campus)),csvEscapeCell(studentHumanText(s.notes))].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_学员_'+today()+'.csv';a.click();toast('导出成功','success');
}
