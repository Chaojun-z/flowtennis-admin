// ===== 学员信息 =====
let studentDetailActiveTab='basic';
let studentDetailEditingSection='';
let studentDetailEditingStudentId='';
let studentReminderModeRequestSeq=0;
let studentReminderModeSaveTimer=null;
let studentReminderLinkGenerating=false;
let studentSortMode='';
const STUDENT_DEAL_PATH_LABELS=['体验转化','直接成交','老客续费'];
function studentListViewMode(){
  return currentPage==='trial-students'?'trial':'package';
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
function studentUnifiedViewRows(){
  const rows=typeof teachingStudentViewRows==='function'?teachingStudentViewRows(studentListViewMode()):[];
  if(!Array.isArray(rows)||!rows.length)return [];
  return rows.map(row=>{
    const student=students.find(item=>String(item.id||'')===String(row.studentId||row.id||''))||{};
    return {
      ...student,
      ...row,
      id:String(row.studentId||row.id||student.id||''),
      name:row.name||row.displayName||student.name||'',
      phone:row.phone||student.phone||'',
      type:row.type||student.type||'',
      source:row.source||student.source||'',
      campus:row.campus||student.campus||'',
      primaryCoach:row.primaryCoach||student.primaryCoach||'',
      __unifiedTeachingView:true
    };
  }).filter(row=>String(row.id||'').trim());
}
function studentUnifiedRecordForId(id){
  const sid=String(id||'');
  if(!sid)return null;
  return studentUnifiedViewRows().find(row=>String(row.id||row.studentId||'')===sid)
    || students.find(row=>String(row.id||'')===sid)
    || null;
}
function onStudentFilterChange(){stuPage=standardListFirstPage();renderStudents();}
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
const STUDENT_PAYMENT_MODE_OPTIONS=['课包学员','单次付费学员','课包+单次付费'];
const STUDENT_ACTIVITY_STATUS_OPTIONS=['近30天活跃','31-90天活跃','91-180天沉默','180天以上沉睡','从未正式上课'];
const STUDENT_LESSON_VOLUME_OPTIONS=['历史课时30+','历史课时50+','历史课时100+'];
const STUDENT_LIFECYCLE_STATUS_OPTIONS=['课包待续费','已转单次付费','稳定单次付费','有余额未活跃'];
const STUDENT_TAG_FILTER_GROUPS=[
  {key:'packageStatus',label:'课包状态',options:STUDENT_PACKAGE_STATUS_OPTIONS,getter:studentPackageStatusText},
  {key:'paymentMode',label:'付费方式',options:STUDENT_PAYMENT_MODE_OPTIONS,getter:studentPaymentModeText},
  {key:'activityStatus',label:'活跃状态',options:STUDENT_ACTIVITY_STATUS_OPTIONS,getter:studentActivityStatusText},
  {key:'lessonVolume',label:'历史课时',options:STUDENT_LESSON_VOLUME_OPTIONS,getter:studentLessonVolumeText},
  {key:'lifecycleStatus',label:'学员状态',options:STUDENT_LIFECYCLE_STATUS_OPTIONS,getter:studentLifecycleStatusText}
];
let studentTagFilterState={packageStatus:[],paymentMode:[],activityStatus:[],lessonVolume:[],lifecycleStatus:[]};
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
  onStudentFilterChange();
}
function removeStudentTagFilter(key,value){
  const list=studentTagFilterState[key]||[];
  studentTagFilterState={...studentTagFilterState,[key]:list.filter(item=>item!==value)};
  onStudentFilterChange();
}
function clearStudentTagFilters(){
  studentTagFilterState={packageStatus:[],paymentMode:[],activityStatus:[],lessonVolume:[],lifecycleStatus:[]};
  onStudentFilterChange();
}
function studentTagOptionCount(baseRows,group,value){
  return baseRows.filter(s=>group.getter(s)===value).length;
}
function renderStudentTagCascader(baseRows){
  const selected=studentSelectedTagValues();
  const label=selected.length?`标签筛选 ${selected.length}`:'标签筛选';
  const selectedHtml=selected.length?`<div class="student-tag-cascader-selected">${selected.slice(0,3).map(item=>`<button type="button" class="student-tag-chip" onclick="event.stopPropagation();removeStudentTagFilter(${jsArg(item.group.key)},${jsArg(item.value)})">${esc(item.label)} ×</button>`).join('')}${selected.length>3?`<span class="student-tag-more">+${selected.length-3}</span>`:''}</div>`:'';
  const groupsHtml=STUDENT_TAG_FILTER_GROUPS.map(group=>`<div class="student-tag-cascader-group"><div class="student-tag-cascader-group-title">${esc(group.label)}<span>${(studentTagFilterState[group.key]||[]).length||''}</span></div><div class="student-tag-cascader-options">${group.options.map(value=>{
    const checked=(studentTagFilterState[group.key]||[]).includes(value);
    const count=studentTagOptionCount(baseRows,group,value);
    return `<label class="student-tag-cascader-option"><input type="checkbox" ${checked?'checked':''} onchange="toggleStudentTagFilter(${jsArg(group.key)},${jsArg(value)})"><span>${esc(value)}</span><em>${count}</em></label>`;
  }).join('')}</div></div>`).join('');
  return `<div class="student-tag-cascader tms-dropdown ${selected.length?'has-value':''}" id="stuTagCascader_dropdown" data-target="stuTagCascader"><button type="button" class="tms-dropdown-display" onclick="toggleStandardDropdown('stuTagCascader',event)">${esc(label)}</button><div class="tms-dropdown-menu student-tag-cascader-menu" id="stuTagCascader" onclick="event.stopPropagation()">${selectedHtml}<div class="student-tag-cascader-columns">${groupsHtml}</div><div class="student-tag-cascader-footer"><button type="button" onclick="clearStudentTagFilters()">清空</button></div></div></div>`;
}
function studentScheduleIsFormal(row={}){
  const type=normalizeCourseType(row.standardCourseType||row.courseType||row.packageCourseType||row.productType||'');
  return type&&type!=='体验课';
}
function studentFormalLessonRows(stu){
  return schedules
    .filter(row=>scheduleHasStudent(row,stu))
    .filter(row=>effectiveScheduleStatus(row)==='已结束')
    .filter(studentScheduleIsFormal);
}
function studentAnyLessonRows(stu){
  return schedules
    .filter(row=>scheduleHasStudent(row,stu))
    .filter(row=>effectiveScheduleStatus(row)==='已结束');
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
  const direct=Number(stu?.packageBalanceRemaining);
  if(Number.isFinite(direct)&&direct>0)return direct;
  const listRows=studentUnifiedPackageListRows(stu);
  if(listRows.length)return listRows.reduce((sum,row)=>sum+(Number(row.remainingLessons)||0),0);
  return studentFormalEntitlementRows(stu).reduce((sum,row)=>sum+(Number(row.remainingLessons)||0),0);
}
function studentHasFormalPackage(stu){
  return studentFormalPurchaseRows(stu).length>0||studentFormalEntitlementRows(stu).length>0||studentUnifiedPackageListRows(stu).length>0||Number(stu?.coursePurchaseCount)>0;
}
function studentPackageStatusText(stu){
  const remaining=studentPackageRemainingLessons(stu);
  if(!studentHasFormalPackage(stu))return '未买过课包';
  if(remaining>0&&remaining<=2)return '课包即将耗尽';
  if(remaining>0)return '课包有余额';
  return '课包已用完';
}
function studentPaymentModeText(stu){
  const hasPackage=studentHasFormalPackage(stu)||studentFormalLessonRows(stu).some(row=>String(row.settlementType||'').trim()==='package');
  const hasDirect=studentDirectFormalLessonRows(stu).length>0;
  if(hasPackage&&hasDirect)return '课包+单次付费';
  if(hasDirect)return '单次付费学员';
  if(hasPackage)return '课包学员';
  return '-';
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
function studentActivityStatusText(stu){
  const days=studentDaysSince(studentFormalLastLessonDate(stu));
  if(days===null)return '从未正式上课';
  if(days<=30)return '近30天活跃';
  if(days<=90)return '31-90天活跃';
  if(days<=180)return '91-180天沉默';
  return '180天以上沉睡';
}
function studentFormalLessonCountValue(stu){
  const explicit=Number(stu?.formalLessonCount);
  if(Number.isFinite(explicit)&&explicit>0)return explicit;
  return studentFormalLessonRows(stu).length;
}
function studentLessonVolumeText(stu){
  const count=studentFormalLessonCountValue(stu);
  if(count>=100)return '历史课时100+';
  if(count>=50)return '历史课时50+';
  if(count>=30)return '历史课时30+';
  return '-';
}
function studentRecentDirectFormalLessonCount(stu,daysLimit=90){
  return studentDirectFormalLessonRows(stu).filter(row=>{
    const days=studentDaysSince(String(row.startTime||'').slice(0,10));
    return days!==null&&days<=daysLimit;
  }).length;
}
function studentHasDirectAfterPackageUsedUp(stu){
  if(studentPackageStatusText(stu)!=='课包已用完')return false;
  const packageDates=studentFormalPurchaseRows(stu).map(row=>String(row.purchaseDate||row.createdAt||'').slice(0,10)).filter(Boolean).sort();
  const lastPackageDate=packageDates[packageDates.length-1]||'';
  return studentDirectFormalLessonRows(stu).some(row=>{
    const date=String(row.startTime||'').slice(0,10);
    return date&&(!lastPackageDate||date>=lastPackageDate);
  });
}
function studentLifecycleStatusText(stu){
  const status=studentPackageStatusText(stu);
  const activity=studentActivityStatusText(stu);
  const recentDirect30=studentRecentDirectFormalLessonCount(stu,30);
  if(status==='课包有余额'&&activity!=='近30天活跃')return '有余额未活跃';
  if(studentHasDirectAfterPackageUsedUp(stu))return '已转单次付费';
  if(studentRecentDirectFormalLessonCount(stu,90)>=2)return '稳定单次付费';
  if(status==='课包已用完'&&activity==='近30天活跃'&&!recentDirect30)return '课包待续费';
  return '-';
}
function studentIsHistoricalRosterRow(stu){
  return studentAnyLessonRows(stu).length>0||studentFormalLessonCountValue(stu)>0||Number(stu?.completedLessons)>0||studentHasTrialPath(stu);
}
function studentIsActiveRosterRow(stu){
  if(studentPackageRemainingLessons(stu)>0)return true;
  const days=studentDaysSince(studentFormalLastLessonDate(stu));
  if(days!==null&&days<=90)return true;
  return studentRecentDirectFormalLessonCount(stu,90)>0;
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
  if(stu?.detailRecentLessonDate)return String(stu.detailRecentLessonDate||'').slice(0,10);
  const row=schedules.filter(x=>scheduleHasStudent(x,stu)&&x.startTime&&effectiveScheduleStatus(x)==='已结束').sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  return row?.startTime?.slice(0,10)||'';
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
  const text=String(stu?.packageBalanceText||'').trim();
  if(!text||text==='-')return renderStandardCellText('-',false);
  const percent=Number(stu?.packageBalancePercent)||0;
  return `<div class="tms-mini-bar"><div class="tms-mini-bar-fill" style="width:${Math.max(0,Math.min(100,percent))}%"></div><span class="tms-mini-bar-text">${esc(text)}</span></div>`;
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
  if(key==='packageLessons')return Number(stu?.packageBalanceRemaining)||0;
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
  stuPage=standardListFirstPage();
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
    {label:'课包余额',style:'width:110px'},
    {label:'历史课时',style:'width:110px'},
    {label:'学员状态',style:'width:120px'},
    {label:'负责教练',style:'width:110px'},
    {label:'备注',style:'width:280px'},
    {label:'操作',className:'tms-sticky-r',style:'width:150px;padding-right:20px;text-align:right'}
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
  const total=getFilteredStudents().length;
  stuPage=standardListPagination(total,value,stuPageSize).page;
  renderStudents();
}
function setStudentPageSize(value){
  stuPageSize=standardListPageSize(value,stuPageSize);
  stuPage=standardListFirstPage();
  renderStudents();
}
function jumpStudentPage(value){
  const total=getFilteredStudents().length;
  stuPage=standardListPagination(total,value,stuPageSize).page;
  renderStudents();
}
function studentCampusValuesForList(stu){
  const values=[stu?.campus,stu?.campusId,stu?.campusName,...parseArr(stu?.campusIds)];
  return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
}
function studentMatchesCampusForList(stu){
  if(!campus||campus==='all')return true;
  return studentCampusValuesForList(stu).some(value=>sameCampusValue(value,campus)||sameCampusValue(cn(value),cn(campus))||value===cn(campus));
}
function getStudentBaseList(){
  const viewRows=studentUnifiedViewRows();
  const base=viewRows.length?viewRows:students;
  return base.filter(s=>{
    if(!studentMatchesCampusForList(s))return false;
    return studentListViewMode()==='trial'?studentIsHistoricalRosterRow(s):studentIsActiveRosterRow(s);
  });
}
function studentGlobalDateValue(s){
  return s.createdAt||s.enrollDate||s.registerDate||s.joinDate||studentLastLessonDate(s);
}
function getFilteredStudents(){
  const q=(document.getElementById('stuSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('stuTypeFilter')?.value||'';
  const sf=document.getElementById('stuSourceFilter')?.value||'';
  const coachFilter=document.getElementById('stuCoachFilter')?.value||'';
  return getStudentBaseList().filter(s=>{
    const accountText=courtsForStudent(s).map(c=>`${c.name} ${c.phone||''}`).join(' ');
    if(!searchHit(q,s.name,s.phone,s.type,studentSourceText(s),studentPaymentModeText(s),studentPackageStatusText(s),studentActivityStatusText(s),studentLessonVolumeText(s),studentLifecycleStatusText(s),s.activityRange,s.notes,cn(s.campus),accountText,studentPrimaryCoachText(s)))return false;
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
  return lessonUnitsText(studentCompletedLessonUnits(stu));
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
    trialPathCount:studentStandardMetricValue('trialPathStudents')||Number(summary.trialPathStudents)||0,
    trialPathDealCount:studentStandardMetricValue('trialPathDeals')||Number(summary.trialPathDealCustomers)||0,
    trialPathPendingCount:studentStandardMetricValue('trialPathPending')||Number(summary.trialPathPendingCustomers)||0,
    directCourseDealCount:studentStandardMetricValue('directCourseDeals')||Number(summary.directCourseCustomers)||0,
    trialStudentCount:Number(summary.trialStudentCount)||0,
    trialConvertedCount:studentStandardMetricValue('trialPathDeals')||Number(summary.trialPathDealCustomers)||0
  };
  return {
    total:activeStudentCount,
    packageStudentCount:Number(summary.formalStudentCount)||0,
    activePackageStudentCount:Number(summary.activePackageStudentCount)||0,
    purchaseCount:Number(summary.coursePurchaseCount)||0,
    courseRepeatCount:studentStandardMetricValue('courseRepeatBuyers')||Number(summary.courseRepeatCount)||0,
    totalIncome:Number(summary.totalIncome)||0,
    recognized:Number(summary.recognized)||0,
    packageBalance:Number(summary.packageBalance)||0
  };
}
function studentPageStats(base){
  const standardSummary=studentStandardSummaryForMode();
  const unifiedTotal=Number(standardSummary.total);
  const rows=Array.isArray(base)?base:[];
  return {
    ...standardSummary,
    total:Number.isFinite(unifiedTotal)&&unifiedTotal>0?unifiedTotal:rows.length,
    near30ActiveCount:rows.filter(s=>studentActivityStatusText(s)==='近30天活跃').length,
    packageActiveCount:rows.filter(s=>studentPackageStatusText(s)==='课包有余额'||studentPackageStatusText(s)==='课包即将耗尽').length,
    packageLowCount:rows.filter(s=>studentPackageStatusText(s)==='课包即将耗尽').length,
    stableSinglePayCount:rows.filter(s=>studentLifecycleStatusText(s)==='稳定单次付费').length,
    neverFormalCount:rows.filter(s=>studentActivityStatusText(s)==='从未正式上课').length,
    renewalDueCount:rows.filter(s=>studentLifecycleStatusText(s)==='课包待续费').length,
    trialBookedOnlyCount:0,
    trialAttendedPendingCount:0
  };
}
function studentPercentText(value,total){
  if(!total)return '0%';
  const percent=(Number(value)||0)/(Number(total)||0)*100;
  return `${Number.isInteger(percent)?percent:percent.toFixed(1)}%`;
}
function studentTopStatsCards(stats){
  if(studentListViewMode()==='trial')return [
    {label:'历史学员',valueHtml:stats.total,sub:'累计来上过课'},
    {label:'近30天活跃',valueHtml:stats.near30ActiveCount||0,percent:studentPercentText(stats.near30ActiveCount||0,stats.total),sub:'近30天活跃 / 历史学员'},
    {label:'课包有余额',valueHtml:stats.packageActiveCount||0,percent:studentPercentText(stats.packageActiveCount||0,stats.total),sub:'有余额 / 历史学员'},
    {label:'稳定单次付费',valueHtml:stats.stableSinglePayCount||0,percent:studentPercentText(stats.stableSinglePayCount||0,stats.total),sub:'稳定单次付费 / 历史学员'},
    {label:'从未正式上课',valueHtml:stats.neverFormalCount||0,percent:studentPercentText(stats.neverFormalCount||0,stats.total),sub:'无正式课 / 历史学员'}
  ];
  return [
    {label:'在期学员',valueHtml:stats.total,sub:'当前仍有运营价值'},
    {label:'近30天活跃',valueHtml:stats.near30ActiveCount||0,percent:studentPercentText(stats.near30ActiveCount||0,stats.total),sub:'近30天活跃 / 在期学员'},
    {label:'课包有余额',valueHtml:stats.packageActiveCount||0,percent:studentPercentText(stats.packageActiveCount||0,stats.total),sub:'有余额 / 在期学员'},
    {label:'课包即将耗尽',valueHtml:stats.packageLowCount||0,percent:studentPercentText(stats.packageLowCount||0,stats.total),sub:'剩余 1-2 节'},
    {label:'课包待续费',valueHtml:stats.renewalDueCount||0,percent:studentPercentText(stats.renewalDueCount||0,stats.total),sub:'待续费 / 在期学员'}
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
  const leadSummary=s&&!studentDetailIsEmptyHtml(studentLeadSummaryHtml(s))?`<div class="tms-section-header">来源线索摘要</div><div class="student-lead-summary-readonly">${studentLeadSummaryHtml(s)}</div>`:'';
  return `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="finput tms-form-control" id="s_name" value="${rv(s,'name')}" placeholder="姓名"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="finput tms-form-control" id="s_phone" value="${rv(s,'phone')}" placeholder="请输入手机号"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label>${renderStandardDropdownHtml('s_primaryCoach','负责教练',coachOptions,coachName(rv(s,'primaryCoach')),true)}</div><div class="tms-form-item"><label class="tms-form-label">学员类型</label>${renderStandardDropdownHtml('s_type','学员类型',typeOptions,rv(s,'type','成人'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">来源</label>${renderStandardDropdownHtml('s_source','来源',sourceOptions,studentSourceText(s)||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">活动范围</label><input type="text" class="finput tms-form-control" id="s_range" value="${rv(s,'activityRange')}" placeholder="例：朝阳"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所在校区</label>${renderStandardDropdownHtml('s_campus','校区',campusOptions,rv(s,'campus'),true)}</div></div>${leadSummary}<div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="s_notes">${esc(rv(s,'notes'))}</textarea></div></div>`;
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
  return `${studentDetailFieldHtml('姓名',s.name)}${studentDetailFieldHtml('手机号',s.phone)}${studentDetailFieldHtml('负责教练',studentPrimaryCoachText(s))}${studentDetailFieldHtml('学员类型',s.type)}${studentDetailFieldHtml('来源',studentSourceText(s))}${studentDetailFieldHtml('活动范围',s.activityRange)}${studentDetailFieldHtml('所在校区',cn(s.campus))}${studentDetailFieldHtml('备注',studentHumanText(s.notes))}`;
}
function studentDeleteCardHtml(s){
  if(currentUser?.role!=='admin')return '';
  const action=`<button type="button" class="schedule-detail-action muted" onclick="confirmDel('${s.id}','${esc(s.name)}','student')">删除学员</button>`;
  return studentDrawerCardHtml('删除学员','<div class="tms-field-help">删除前需要二次确认。</div>','student-delete-section',action,{useGrid:false});
}
function studentDetailBasicTabHtml(s){
  const leadHtml=studentDetailIsEmptyHtml(studentLeadSummaryHtml(s))?'':studentLeadSummaryHtml(s);
  const leadAction=studentLeadJumpActionHtml(s);
  const linkedHtml=studentConsumptionInfoHtml(s);
  const editing=studentDetailEditingSection==='basic'&&studentDetailEditingStudentId===s.id;
  const editAction=`<button type="button" class="schedule-detail-action" onclick="openStudentModal('${s.id}')">编辑</button>`;
  const saveActions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="cancelStudentDetailEdit('${s.id}')">取消</button><button type="button" class="schedule-detail-action primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`;
  const basicCard=editing
    ? renderDetailDrawerFormCard('基本信息',studentBasicInfoFormHtml(s),saveActions)
    : studentDrawerCardHtml('基本信息',studentBasicInfoReadonlyHtml(s),'',editAction);
  return `<div class="schedule-detail-content">${basicCard}${studentReminderInfoHtml(s)}${studentDeleteCardHtml(s)}${studentDrawerCardHtml('最近课后反馈',studentRecentFeedbackSummaryHtml(s))}${leadHtml?studentDrawerCardHtml('关联线索',leadHtml,'student-lead-section',leadAction,{useGrid:false}):''}${linkedHtml?studentDrawerCardHtml('消费与关联',linkedHtml):''}</div>`;
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
  },{
    successText:'学员权益已保存',
    refresh:async()=>{
      await ensureDatasetsByName(['lifecycleMetricsPage'],{force:true});
      renderStudents();
      openStudentDetail(studentId);
    }
  });
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
      <div class="admin-h5-card-tags"><span class="tms-tag">${esc(studentSourceText(s)||'-')}</span><span class="tms-tag">${esc(studentActivityStatusText(s)||'-')}</span><span class="tms-tag">${esc(studentPaymentModeText(s)||'-')}</span></div>
      <div class="admin-h5-card-grid">
        <span><b>课包状态</b>${esc(studentPackageStatusText(s)||'-')}</span>
        <span><b>课包余额</b>${esc(renderStandardEmptyText(s?.packageBalanceText))}</span>
        <span><b>历史课时</b>${esc(studentLessonVolumeText(s)||'-')}</span>
        <span><b>学员状态</b>${esc(studentLifecycleStatusText(s)||'-')}</span>
        <span><b>负责教练</b>${esc(coachText||'-')}</span>
      </div>
      <p>${esc(noteText||'暂无备注')}</p>
      <div class="admin-h5-card-actions"><button type="button" onclick="openStudentDetail('${s.id}')">查看</button><button type="button" onclick="openPurchaseModal('${s.id}')">课包</button></div>
    </article>`;
  }).join('');
}
function renderStudents(){
  renderStudentToolbarFilters();
  ensureStudentDefaultSort();
  renderStudentTableHeaders();
  updateStudentSortHeaders();
  const filteredStudents=getFilteredStudents();
  let list=getSortedStudents(filteredStudents);
  const stats=studentPageStats(filteredStudents);
  document.getElementById('studentStatsRow').innerHTML=renderStandardDataCards(studentTopStatsCards(stats));
  const isMobileList=document.body.classList.contains('admin-mobile');
  const pageState=isMobileList?{total:list.length,pages:1,slice:list,page:1}:standardListSlice(list,stuPage,stuPageSize);
  stuPage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-students .tms-pagination');
  if(pager)pager.style.display=total?'flex':'none';
  document.getElementById('stuPagerInfo').innerHTML=renderPagerInfoHtml(total);
  renderStudentPagerControls(total,pages);
  document.getElementById('stuTbody').innerHTML=slice.length?slice.map(s=>{
    const coachText=studentPrimaryCoachText(s);
    const noteText=studentHumanText(studentNoteSummary(s));
    return `<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(s.name)}</div></td><td>${renderStandardCellText(studentSourceText(s),false)}</td><td>${renderStandardBusinessTag(s.type,'customerType')}</td><td>${renderStandardCellText(cn(s.campus))}</td><td>${renderStandardCellText(studentActivityStatusText(s),false)}</td><td>${renderStandardCellText(studentPaymentModeText(s),false)}</td><td>${renderStandardCellText(studentPackageStatusText(s),false)}</td><td>${studentUnifiedPackageBalanceHtml(s)}</td><td>${renderStandardCellText(studentLessonVolumeText(s),false)}</td><td>${renderStandardCellText(studentLifecycleStatusText(s),false)}</td><td>${renderStandardCellText(coachText)}</td><td>${renderStandardTooltipText(noteText,'tms-text-remark tms-text-remark-1 student-note-cell')}</td><td class="tms-sticky-r tms-action-cell" style="width:150px;padding-right:20px"><span class="tms-action-link" onclick="openStudentDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openPurchaseModal('${s.id}')">课包</span></td></tr>`;
  }).join(''):studentEmptyStateHtml();
  renderStudentMobileCards(slice);
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
  const items=rows.slice(0,limit).map(item=>{
    if(item.kind){
      const title=[item.time,item.courseType,item.className||item.packageName].filter(Boolean).join(' · ');
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
  const entMap=new Map(entitlements.filter(e=>e.studentId===stu?.id).map(e=>[e.id,e]));
  const map=new Map();
  const ledgerItems=studentConcreteLessonLedgerItems(stu);
  const ledgerKeys=new Set(ledgerItems.map(({row,schedule})=>studentLessonRecordKey({studentId:stu?.id,row,schedule})));
  ledgerItems.forEach(({row,schedule})=>{
    const key=studentLessonRecordMergeKey({studentId:stu?.id,row,schedule});
    const ent=entMap.get(row.entitlementId)||{};
    const sortTime=studentEntitlementLedgerTimeText(row,schedule);
    const existing=map.get(key);
    if(existing?.type==='ledger'){
      const preferred=studentLedgerPreferredDisplayEntitlement(existing.ent,ent);
      map.set(key,{type:'ledger',row:{...(preferred===ent?row:existing.row),lessonDelta:(Number(existing.row.lessonDelta)||0)+(Number(row.lessonDelta)||0)},ent:preferred,sortTime:existing.sortTime||sortTime});
      return;
    }
    map.set(key,{type:'ledger',row,ent,sortTime});
  });
  schedules
    .filter(x=>scheduleHasStudent(x,stu)&&x.startTime)
    .filter(x=>effectiveScheduleStatus(x)!=='已取消')
    .filter(schedule=>studentLessonRecordShouldIncludeSchedule(schedule,stu,ledgerKeys,ledgerItems.length>0))
    .forEach(schedule=>{
      const key=studentLessonRecordKey({studentId:stu?.id,schedule});
      if(!map.has(key))map.set(key,{type:'schedule',schedule,sortTime:schedule.startTime});
    });
  return [...map.values()].sort((a,b)=>String(b.sortTime||'').localeCompare(String(a.sortTime||'')));
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
    stu.activityRange?studentDetailFieldHtml('活动范围',stu.activityRange):'',
    conversionSummary==='已形成转化判断'?studentDetailFieldHtml('转化判断',conversionSummary):'',
    recentFeedback?.needOpsFollowUp?studentDetailFieldHtml('运营跟进','需要运营跟进'):'',
    studentDetailBlockHtml('最近反馈里的运营结论',opsConclusion,{hideEmpty:true}),
    studentDetailBlockHtml('运营备注',esc(renderStandardEmptyText(noteText)),{hideEmpty:true})
  ].join('');
  return studentDetailSectionHtml('运营信息',content);
}
function studentConsumptionInfoHtml(stu){
  const linkedCourts=courtsForStudent(stu);
  const linkedFields=linkedCourts.length?`${studentDetailBlockHtml('订场账户摘要',`${studentAccountSummaryHtml(stu)}<div class="tms-field-help">关联订场账户在「订场/会员」页面编辑用户时选择「关联学员」。</div>`,{hideEmpty:true})}${studentDetailBlockHtml('会员摘要',studentMembershipSummaryHtml(stu),{hideEmpty:true})}`:'';
  return studentDetailSectionHtml('消费与关联信息',linkedFields);
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
function openStudentDetail(id){
  const s=studentUnifiedRecordForId(id);if(!s)return;
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
  const data={name,phone,primaryCoach:document.getElementById('s_primaryCoach')?.value||'',type:document.getElementById('s_type').value,source:FlowTennisBusinessTaxonomy.normalizeLeadSource(document.getElementById('s_source').value),activityRange:document.getElementById('s_range').value.trim(),campus:document.getElementById('s_campus').value,notes:document.getElementById('s_notes').value.trim(),updatedBy:currentUser?.name||''};
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
    if(savedEditId){const res=await apiCall('PUT','/students/'+savedEditId,data);const i=students.findIndex(x=>x.id===savedEditId);students[i]={...students[i],...data,id:savedEditId};mergeLinkedUpdates(res.studentUpdates||{});}
    else{const r=await apiCall('POST','/students',data);students.unshift(r);}
  },{
    successText:savedEditId?'修改成功 ✓':'添加成功 ✓',
    refresh:async()=>{
      await ensureDatasetsByName(['lifecycleMetricsPage'],{force:true});
      renderStudents();renderSchedule();renderPurchases();renderEntitlements();renderMySchedule();
      if(savedEditId){editId=null;studentDetailEditingSection='';studentDetailEditingStudentId='';openStudentDetail(savedEditId);}
      else closeModal();
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
  let csv='姓名,手机号,类型,来源,活动范围,校区,备注\n';
  csv+=d.map(s=>[csvEscapeCell(s.name),csvEscapeCell(s.phone||''),csvEscapeCell(s.type||''),csvEscapeCell(studentSourceText(s)),csvEscapeCell(s.activityRange||''),csvEscapeCell(cn(s.campus)),csvEscapeCell(studentHumanText(s.notes))].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_学员_'+today()+'.csv';a.click();toast('导出成功','success');
}
