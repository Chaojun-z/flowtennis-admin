// ===== 学员信息 =====
function onStudentFilterChange(){stuPage=1;renderStudents();}
function renderStudentToolbarFilters(){
  const typeValue=document.getElementById('stuTypeFilter')?.value||'';
  const sourceValue=document.getElementById('stuSourceFilter')?.value||'';
  const coachValue=document.getElementById('stuCoachFilter')?.value||'';
  const baseRows=getStudentBaseList();
  const typeOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'类型'},{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}],baseRows,(s,value)=>s.type===value);
  const sourceOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'来源'},...SOURCES.map(t=>({value:t,label:t}))],baseRows,(s,value)=>s.source===value);
  const coachOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'负责教练'},{value:'__unassigned__',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))],baseRows,(s,value)=>value==='__unassigned__'?!s.primaryCoach:coachName(s.primaryCoach)===value);
  const wrapMap=[
    ['stuTypeFilterHost','stuTypeFilter','类型',typeOptions,typeValue],
    ['stuSourceFilterHost','stuSourceFilter','来源',sourceOptions,sourceValue],
    ['stuCoachFilterHost','stuCoachFilter','负责教练',coachOptions,coachValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'onStudentFilterChange');
  });
}
function studentLastLessonDate(stu){
  const row=schedules.filter(x=>scheduleHasStudent(x,stu)&&x.startTime&&effectiveScheduleStatus(x)==='已结束').sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  return row?.startTime?.slice(0,10)||'';
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
  if(key==='lastLesson')return studentLastLessonDate(stu);
  if(key==='completedLessons')return studentCompletedLessonUnits(stu);
  if(key==='packageLessons')return studentPackageLessonMeta(stu).remaining||0;
  return '';
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
  stuPage=1;
  renderStudents();
}
function updateStudentSortHeaders(){
  document.querySelectorAll('#page-students [data-student-sort]').forEach(btn=>{
    const active=btn.dataset.studentSort===stuSortKey;
    btn.classList.toggle('asc',active&&stuSortDir==='asc');
    btn.classList.toggle('desc',active&&stuSortDir==='desc');
  });
}
function studentPageNumbers(page,pages){
  if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
  const items=[1];
  const start=Math.max(2,page-2);
  const end=Math.min(pages-1,page+2);
  if(start>2)items.push('...');
  for(let i=start;i<=end;i++)items.push(i);
  if(end<pages-1)items.push('...');
  items.push(pages);
  return items;
}
function renderStudentPagerControls(total,pages){
  const pageSizeHost=document.getElementById('stuPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderCourtDropdownHtml('stuPageSizeValue',`${stuPageSize}条/页`,[{value:'20',label:'20条/页'},{value:'50',label:'50条/页'},{value:'100',label:'100条/页'}],String(stuPageSize),false,'setStudentPageSize');
  const btns=document.getElementById('stuPagerBtns');
  if(!btns)return;
  if(!total||pages<=1){btns.innerHTML='';return;}
  const pageBtns=studentPageNumbers(stuPage,pages).map(item=>item==='...'
    ?'<span class="tms-page-ellipsis">...</span>'
    :`<div class="tms-page-btn${item===stuPage?' active':''}" onclick="stuPage=${item};renderStudents()">${item}</div>`
  ).join('');
  btns.innerHTML=`<div class="tms-page-btn" onclick="stuPage=Math.max(1,stuPage-1);renderStudents()">上一页</div>${pageBtns}<div class="tms-page-btn" onclick="stuPage=Math.min(${pages},stuPage+1);renderStudents()">下一页</div><span class="tms-page-jump">跳至 <input id="stuPageJump" value="${stuPage}" onkeydown="if(event.key==='Enter')jumpStudentPage(this.value)"> 页</span>`;
}
function setStudentPageSize(value){
  const next=parseInt(value,10);
  stuPageSize=[20,50,100].includes(next)?next:20;
  stuPage=1;
  renderStudents();
}
function jumpStudentPage(value){
  const total=getFilteredStudents().length;
  const pages=Math.max(1,Math.ceil(total/stuPageSize));
  stuPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderStudents();
}
function getStudentBaseList(){
  return students.filter(s=>campus==='all'||sameCampusValue(s.campus,campus));
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
    if(!searchHit(q,s.name,s.phone,s.type,s.source,s.activityRange,s.notes,cn(s.campus),accountText,s.primaryCoach))return false;
    if(!globalDateWithinRange(studentGlobalDateValue(s)))return false;
    if(tf&&s.type!==tf)return false;
    if(sf&&s.source!==sf)return false;
    if(coachFilter==='__unassigned__'&&String(s.primaryCoach||'').trim())return false;
    if(coachFilter&&coachFilter!=='__unassigned__'&&coachName(s.primaryCoach)!==coachFilter)return false;
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
function studentScheduleSettlementType(schedule){
  const raw=String(schedule?.settlementType||schedule?.paymentType||'').trim();
  if(['direct','直接收款','paid'].includes(raw))return 'direct';
  if(['gift','free','赠送','免费'].includes(raw))return 'gift';
  return 'package';
}
function studentStatsMatchesCampusName(value){
  if(!campus||campus==='all')return true;
  return sameCampusValue(cn(value),cn(campus));
}
function studentStatsDirectCourseRows(){
  return schedules.filter(row=>{
    if(!row||row.status==='已取消')return false;
    if(studentScheduleSettlementType(row)!=='direct')return false;
    if(!studentStatsMatchesCampusName(row.campus))return false;
    return studentRoundMoney(row.paidAmount||row.paymentAmount)>0;
  });
}
function studentTrialKeys(schedule){
  const ids=[...parseArr(schedule?.studentIds),schedule?.studentId].map(v=>String(v||'').trim()).filter(Boolean);
  if(ids.length)return ids.map(id=>`id:${id}`);
  return String(scheduleStudentSummary(schedule)||schedule?.studentName||'').split(/[、,，\s/]+/).map(v=>v.trim()).filter(Boolean).map(name=>`name:${name}`);
}
function studentPurchaseMatchesTrialKey(purchase,key){
  if(key.startsWith('id:'))return String(purchase.studentId||'').trim()===key.slice(3);
  return String(purchase.studentName||'').trim()===key.slice(5);
}
function studentTrialStats(){
  const trialMap=new Map();
  schedules
    .filter(s=>scheduleCourseType(s)==='体验课'&&effectiveScheduleStatus(s)==='已结束'&&studentStatsMatchesCampusName(s.campus))
    .forEach(s=>{
      const date=String(s.startTime||s.endTime||'').slice(0,10);
      studentTrialKeys(s).forEach(key=>{if(key&&!trialMap.has(key))trialMap.set(key,date);});
    });
  const converted=[...trialMap.entries()].filter(([key,trialDate])=>purchases.some(p=>{
    if(['voided','refunded','deleted'].includes(String(p.status||'')))return false;
    if(!studentPurchaseMatchesTrialKey(p,key))return false;
    const purchaseDate=String(p.purchaseDate||p.createdAt||'').slice(0,10);
    return !trialDate||!purchaseDate||purchaseDate>=trialDate;
  })).length;
  return {trialStudentCount:trialMap.size,trialConvertedCount:converted};
}
function studentStatsCampusNameForPurchase(purchase,entitlement={}){
  const student=students.find(s=>String(s.id||'')===String(purchase?.studentId||entitlement?.studentId||''));
  return cn(parseArr(entitlement?.campusIds)[0]||entitlement?.campus||purchase?.campus||student?.campus||'');
}
function studentStatsMatchesPackageCampus(purchase,entitlement={}){
  if(!campus||campus==='all')return true;
  return sameCampusValue(studentStatsCampusNameForPurchase(purchase,entitlement),cn(campus));
}
function studentPageStats(base){
  const studentIds=new Set(base.map(s=>String(s.id||'')).filter(Boolean));
  const purchaseMapById=new Map(purchases.map(p=>[String(p.id||''),p]));
  const validEntitlements=entitlements.filter(e=>{
    const purchase=purchaseMapById.get(String(e.purchaseId||''))||{};
    return entitlementStatusText(e)!=='已作废'&&purchaseStatusText(purchase)!=='已作废'&&studentStatsMatchesPackageCampus(purchase,e);
  });
  const validEntitlementIds=new Set(validEntitlements.map(e=>String(e.id||'')));
  const purchaseIds=new Set(validEntitlements.map(e=>String(e.purchaseId||'')).filter(Boolean));
  const entitlementByPurchaseId=new Map(validEntitlements.map(e=>[String(e.purchaseId||''),e]).filter(([id])=>id));
  const validPurchases=purchases.filter(p=>{
    if(purchaseStatusText(p)==='已作废')return false;
    if(!studentStatsMatchesPackageCampus(p,entitlementByPurchaseId.get(String(p.id||''))||{}))return false;
    if(campus==='all')return true;
    return studentIds.has(String(p.studentId||''))||purchaseIds.has(String(p.id||''));
  });
  const purchaseMap=new Map(validPurchases.map(p=>[String(p.id||''),p]));
  const entitlementMap=new Map(validEntitlements.map(e=>[String(e.id||''),e]));
  const totalIncome=validPurchases.reduce((sum,p)=>sum+(Number(p.amountPaid??p.finalAmount??0)||0),0);
  const directCourseIncome=studentStatsDirectCourseRows().reduce((sum,row)=>sum+studentRoundMoney(row.paidAmount||row.paymentAmount),0);
  const recognized=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger))
    .filter(row=>Number(row.lessonDelta||0)!==0)
    .filter(row=>validEntitlementIds.has(String(row.entitlementId||''))||purchaseIds.has(String(row.purchaseId||'')))
    .reduce((sum,row)=>{
      const entitlement=entitlementMap.get(String(row.entitlementId||''))||{};
      const purchase=purchaseMap.get(String(entitlement.purchaseId||row.purchaseId||''))||{};
      const lessonDelta=Math.abs(Number(row.lessonDelta)||0);
      const totalLessons=Math.max(1,Number(entitlement.totalLessons)||Number(purchase.packageLessons)||lessonDelta||1);
      const amountPaid=Number(purchase.amountPaid??purchase.finalAmount??0)||0;
      if(!amountPaid||!lessonDelta)return sum;
      const sign=Number(row.lessonDelta||0)>0?-1:1;
      return sum+(Math.round((amountPaid/totalLessons)*lessonDelta*100)/100)*sign;
    },0);
  return {
    total:base.length,
    packageStudentCount:base.filter(s=>studentActiveEntitlementRows(s).length).length,
    totalIncome:Math.round(totalIncome*100)/100,
    recognized:Math.round(recognized*100)/100,
    packageBalance:Math.round((totalIncome-recognized)*100)/100,
    directCourseIncome:Math.round(directCourseIncome*100)/100,
    courseIncome:Math.round((totalIncome+directCourseIncome)*100)/100,
    courseRecognized:Math.round((recognized+directCourseIncome)*100)/100,
    ...studentTrialStats()
  };
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
  return `<div class="tms-detail-field"><div class="tms-detail-label">${esc(label)}</div><div class="tms-detail-value">${esc(renderCourtEmptyText(value))}</div></div>`;
}
function studentDetailIsEmptyHtml(html){
  const text=String(html||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
  return !text||['-','暂无上课记录','暂无课后反馈','暂无已购课包','暂无扣课记录','暂无关联订场账户','暂无关联订场账户会员摘要','未关联线索'].includes(text);
}
function studentDetailBlockHtml(label,html,options={}){
  if(options.hideEmpty&&studentDetailIsEmptyHtml(html))return '';
  return `<div class="tms-detail-field full-width"><div class="tms-detail-label">${esc(label)}</div><div class="tms-detail-block">${html||'-'}</div></div>`;
}
function studentDetailSectionHtml(title,content){
  return content?`<div class="tms-section-header">${title}</div><div class="tms-detail-grid">${content}</div>`:'';
}
function studentDetailTagHtml(text,type='slate'){
  const value=renderCourtEmptyText(text);
  if(value==='-')return '';
  return `<span class="student-detail-tag ${type}">${esc(value)}</span>`;
}
function studentDetailHeroHtml(stu){
  const meta=[
    stu.phone?`手机号：${stu.phone}`:'',
    `累计上课：${studentCompletedLessonCount(stu)}节`,
    stu.notes?`运营备注：${stu.notes}`:''
  ].filter(Boolean).map(item=>`<span>${esc(item)}</span>`).join('');
  return `<div class="student-detail-hero"><div class="student-detail-title-row"><h3>${esc(renderCourtEmptyText(stu.name))}</h3>${studentDetailTagHtml(stu.type,'warm')}${studentDetailTagHtml(cn(stu.campus),'slate')}</div><div class="student-detail-hero-meta">${meta||'<span>暂无补充信息</span>'}</div></div>`;
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
  const studentId=String(stu?.id||'');
  if(!studentId)return [];
  return STUDENT_BENEFIT_TYPES.map(type=>{
    const rows=membershipBenefitLedger.filter(row=>String(row?.studentId||'')===studentId&&row?.benefitCode===type.benefitCode&&row?.action!=='grant');
    const total=rows.filter(row=>(parseInt(row.delta)||0)>0).reduce((sum,row)=>sum+(parseInt(row.delta)||0),0);
    const used=Math.abs(rows.filter(row=>(parseInt(row.delta)||0)<0).reduce((sum,row)=>sum+(parseInt(row.delta)||0),0));
    return {...type,total,used,remaining:Math.max(0,total-used)};
  }).filter(row=>row.total>0||row.remaining>0);
}
function studentBenefitSummaryHtml(stu){
  const rows=studentBenefitRows(stu);
  if(!rows.length)return '';
  return rows.map(row=>`<div class="membership-rights-row"><div style="font-size:13px;color:#332A24;font-weight:600;white-space:nowrap">${esc(row.label)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">共 ${row.total}${esc(row.unit)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">已消耗 ${row.used}${esc(row.unit)}</div><div style="font-size:13px;color:#5C4D43;text-align:right">剩余 ${row.remaining}${esc(row.unit)}</div><div style="font-size:12px;color:#8C7B6E;text-align:right;white-space:nowrap">学员权益</div></div>`).join('');
}
function openStudentBenefitPickerModal(studentId,mode){
  const stu=students.find(x=>x.id===studentId);if(!stu){toast('学员数据未加载，请刷新后重试','warn');return;}
  const currentRows=studentBenefitRows(stu);
  const rows=mode==='consume'?currentRows:STUDENT_BENEFIT_TYPES.map(type=>{const current=currentRows.find(row=>row.benefitCode===type.benefitCode);return {...type,total:current?.total||0,remaining:current?.remaining||0};});
  if(mode==='consume'&&!rows.length){toast('该学员当前没有可消耗权益','warn');return;}
  const actionText=mode==='consume'?'消耗':'赠送';
  const body=`<div class="tms-section-header" style="margin-top:0;">选择权益类型</div><div class="tms-table-card" style="margin-bottom:0"><div class="tms-table-wrapper" style="max-height:360px"><table class="tms-table" style="min-width:620px"><thead><tr><th style="padding-left:20px">权益</th><th style="width:140px">当前剩余</th><th style="width:120px;text-align:right;padding-right:20px">操作</th></tr></thead><tbody>${rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.label,false)}</td><td>${renderCourtCellText(`${row.remaining}/${row.total}${row.unit}`,false)}</td><td style="text-align:right;padding-right:20px"><span class="tms-action-link" onclick="openStudentBenefitActionModal('${studentId}','${row.benefitCode}','${mode}')">${actionText}</span></td></tr>`).join('')}</tbody></table></div></div>`;
  setCourtModalFrame(`${actionText}权益`,body,`<button class="tms-btn tms-btn-default" onclick="openStudentDetail('${studentId}')">返回学员详情</button>`,'modal-wide');
}
function openStudentBenefitActionModal(studentId,benefitCode,mode){
  const stu=students.find(x=>x.id===studentId);if(!stu){toast('学员数据未加载，请刷新后重试','warn');return;}
  const meta=studentBenefitTypeMeta(benefitCode);if(!meta){toast('学员权益仅支持订场和发球机','warn');return;}
  const row=studentBenefitRows(stu).find(item=>item.benefitCode===benefitCode)||{remaining:0,total:0,unit:meta.unit};
  const actionText=mode==='consume'?'消耗':'赠送';
  resetModalActions();
  document.getElementById('mTitle').textContent=mode==='consume'?`消耗 1 次 · ${meta.label}`:`赠送权益 · ${meta.label}`;
  document.getElementById('mBody').innerHTML=`<div class="fgrid"><div class="fg"><div class="flabel">权益名称</div><div class="finput">${esc(meta.label)}</div></div><div class="fg"><div class="flabel">次数</div><input class="finput" id="sb_count" type="number" value="1"></div>${mode==='consume'?`<div class="fg full"><div class="flabel">当前剩余</div><div style="font-size:12px;color:var(--tb);background:rgba(255,255,255,0.45);border:0.5px solid rgba(180,83,9,0.12);border-radius:8px;padding:10px 12px">当前可消耗：${row.remaining}/${row.total}${esc(row.unit)}</div></div>`:''}<div class="fg full"><div class="flabel">原因</div><input class="finput" id="sb_reason" value="${mode==='consume'?'学员权益使用':'学员权益赠送'}"></div></div><div class="mactions"><button class="btn-cancel" onclick="openStudentBenefitPickerModal('${studentId}','${mode}')">返回选择权益</button><button class="btn-save" id="studentBenefitSaveBtn" onclick="saveStudentBenefit('${studentId}','${mode}','${benefitCode}')">${mode==='consume'?'确认消耗':'确认赠送'}</button></div>`;
  document.getElementById('overlay').classList.add('open');
}
async function saveStudentBenefit(studentId,mode,benefitCode){
  const stu=students.find(x=>x.id===studentId);if(!stu)return;
  const meta=studentBenefitTypeMeta(benefitCode);if(!meta)return;
  const count=Math.abs(parseInt(document.getElementById('sb_count')?.value)||1);
  const data={studentId,studentName:stu.name||'',benefitCode:meta.benefitCode,benefitLabel:meta.label,unit:meta.unit,delta:mode==='consume'?-count:count,action:mode,reason:document.getElementById('sb_reason')?.value.trim()||'',relatedDate:today()};
  const btn=document.getElementById('studentBenefitSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    const r=await apiCall('POST','/membership-benefit-ledger',data);
    const rows=Array.isArray(r?.records)?r.records:[r];
    rows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    toast('学员权益已保存','success');
    openStudentDetail(studentId);
  }catch(e){if(btn){btn.disabled=false;btn.textContent=mode==='consume'?'确认消耗':'确认赠送';}toast('保存失败：'+e.message,'error');}
}
function studentRecentFeedbackSummaryHtml(stu){
  const recentFeedbacks=studentRecentFeedbacks(stu,2);
  if(!recentFeedbacks.length)return '';
  return recentFeedbacks.map(f=>`<div class="student-feedback-card"><strong>${esc(String(f.startTime||f.createdAt||'').slice(0,10)||'-')}</strong><span>${esc(f.practicedToday||f.knowledgePoint||f.nextTraining||'已填写反馈')}</span></div>`).join('');
}
function studentLessonRecordMetaIcon(kind){
  if(kind==='time')return '<svg class="student-lesson-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="4"/><path d="M3 10h18"/></svg>';
  if(kind==='site')return '<svg class="student-lesson-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  return '<svg class="student-lesson-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>';
}
function studentLessonRecordMetaItem(kind,text){
  return `<span class="student-lesson-meta-item">${studentLessonRecordMetaIcon(kind)}<span>${esc(renderCourtEmptyText(text))}</span></span>`;
}
function studentHasActiveSearchOrFilter(){
  return !!((document.getElementById('stuSearch')?.value||'').trim()||document.getElementById('stuTypeFilter')?.value||document.getElementById('stuSourceFilter')?.value||document.getElementById('stuCoachFilter')?.value);
}
function studentEmptyStateHtml(){
  const filtered=studentHasActiveSearchOrFilter();
  const title=filtered?'没有匹配的学员':'暂无学员';
  const desc=filtered?'调整搜索或筛选后再试':'点击右上角添加学员开始录入';
  return `<tr><td colspan="11"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderStudents(){
  renderStudentToolbarFilters();
  updateStudentSortHeaders();
  let list=getSortedStudents(getFilteredStudents());
  const base=getStudentBaseList();
  const stats=studentPageStats(base);
  document.getElementById('studentStatsRow').innerHTML=[
    studentStatSplitCard('课程财务大盘',`¥${fmt(stats.courseIncome)}`,`¥${fmt(stats.courseRecognized)}`,'总现金进账 / 总核销收入'),
    studentStatSplitCard('课包专项存量',`¥${fmt(stats.totalIncome)}`,`¥${fmt(stats.packageBalance)}`,'课包实收 / 课包当前余额'),
    studentStatSplitCard('学员结构基本盘',`${stats.total} 人`,`${stats.packageStudentCount} 人`,'总学员数 / 有课包学员数'),
    studentStatSplitCard('体验新客转化',`${stats.trialStudentCount} 人`,`${stats.trialConvertedCount} 人`,'体验课人数 / 体验转正人数')
  ].join('');
  const total=list.length,pages=Math.max(1,Math.ceil(total/stuPageSize));
  if(stuPage>pages)stuPage=pages;
  const slice=list.slice((stuPage-1)*stuPageSize,stuPage*stuPageSize);
  const pager=document.querySelector('#page-students .tms-pagination');
  if(pager)pager.style.display=total?'flex':'none';
  document.getElementById('stuPagerInfo').textContent=`共 ${total} 条`;
  renderStudentPagerControls(total,pages);
  document.getElementById('stuTbody').innerHTML=slice.length?slice.map(s=>{
    const lastLesson=studentLastLessonDate(s);
    const coachText=studentPrimaryCoachText(s);
    const packageText=studentPackageLessonSummary(s);
    return `<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(s.name)}</div></td><td>${renderCourtCellText(s.phone)}</td><td>${renderCourtCellText(s.type)}</td><td>${renderCourtCellText(cn(s.campus))}</td><td>${renderCourtCellText(lastLesson?daysAgoText(lastLesson):'-',false)}</td><td>${renderCourtCellText(studentCompletedLessonCount(s),false)}</td><td>${renderCourtCellText(coachText)}</td><td title="${esc(packageText)}">${studentPackageLessonMiniBar(s)}</td><td>${renderCourtCellText(s.source)}</td><td><div class="tms-text-remark" title="${esc(studentNoteSummary(s))}">${esc(renderCourtEmptyText(studentNoteSummary(s)))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:150px;padding-right:20px"><span class="tms-action-link" onclick="openStudentDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openPurchaseModal('${s.id}')">课包</span><span class="tms-action-link" onclick="openStudentModal('${s.id}')">编辑</span></td></tr>`;
  }).join(''):studentEmptyStateHtml();
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
  const body=rows.slice(0,limit).map(item=>{
    const line=item.type==='ledger'
      ? studentLessonRecordPackageHtml(item.row,item.ent)
      : `<div class="student-lesson-row"><div class="student-lesson-main"><div class="student-lesson-title">${esc(`[${studentLessonRecordTimeText(item.schedule)}] · ${scheduleCourseTypeLabel(item.schedule)} · ${scheduleClassName(item.schedule)}`)}</div><div class="student-lesson-meta">${studentLessonRecordMetaItem('time',studentLessonRecordTimeText(item.schedule))}${studentLessonRecordMetaItem('site',[cn(item.schedule.campus)||'-',item.schedule.venue||''].filter(Boolean).join(' '))}${studentLessonRecordMetaItem('coach',item.schedule.coach||'-')}</div></div></div>`;
    return `<div class="student-lesson-timeline-item"><div class="student-lesson-dot"></div><div class="student-lesson-card">${line}</div></div>`;
  }).join('');
  const more=rows.length>10?`<div style="margin-top:6px"><button class="btn-sec" onclick="toggleStudentLessonRecordExpanded('${stu.id}')">${expanded?'收起':'展开全部'}</button></div>`:'';
  return `<div class="student-lesson-timeline">${body}</div>${more}`;
}
function studentLessonRecordRows(stu){
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
  const opsConclusion=recentFeedback?esc(renderCourtEmptyText([recentFeedback.mainIssues,recentFeedback.recommendedReason,recentFeedback.opsFollowUpSuggestion].filter(Boolean).join('；'))):'-';
  const content=[
    stu.source?studentDetailFieldHtml('来源',stu.source):'',
    stu.activityRange?studentDetailFieldHtml('活动范围',stu.activityRange):'',
    conversionSummary==='已形成转化判断'?studentDetailFieldHtml('转化判断',conversionSummary):'',
    recentFeedback?.needOpsFollowUp?studentDetailFieldHtml('运营跟进','需要运营跟进'):'',
    studentDetailBlockHtml('最近反馈里的运营结论',opsConclusion,{hideEmpty:true}),
    studentDetailBlockHtml('运营备注',esc(renderCourtEmptyText(stu.notes)),{hideEmpty:true})
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
  return `<label class="student-reminder-option${checked?' is-active':''}" onclick="updateStudentReminderMode('${stu.id}','${value}')"><input type="radio" name="studentReminderMode" id="studentReminderMode_${value}" value="${value}" ${checked?'checked':''}><span class="student-reminder-radio"></span><span class="student-reminder-copy-text">${title}</span>${custom}</label>`;
}
function studentReminderInfoHtml(stu){
  const statusClass=stu?.officialAccountOpenId?'tms-tag-green':'tms-tag-tier-slate';
  const linkAction=stu?.officialAccountOpenId
    ?`<button class="student-reminder-copy-btn" onclick="generateStudentReminderBindLink('${stu.id}')"><span>重新复制绑定链接</span><small>换微信或发给家长时使用</small></button><button class="btn-sec" onclick="unbindStudentReminder('${stu.id}')">停止绑定</button>`
    :`<button class="student-reminder-copy-btn" onclick="generateStudentReminderBindLink('${stu.id}')"><span>复制给学员绑定</span><small>学员用微信打开后完成绑定</small></button>`;
  return `<section class="student-detail-section student-reminder-section"><div class="student-reminder-compact"><div class="student-reminder-head"><div class="student-reminder-head-title">服务号提醒偏好<span class="tms-tag ${statusClass}">${studentReminderStatusText(stu)}</span></div><div class="student-reminder-actions">${linkAction}</div></div><div class="student-reminder-options">${studentReminderModeOptionHtml(stu,'all','48小时 + 24小时','适合大多数学员，提前确认行程并在前一天再提醒一次')}${studentReminderModeOptionHtml(stu,'only24h','仅24小时','适合不想收到太多消息的学员')}${studentReminderModeOptionHtml(stu,'custom','自定义','只在你设置的提前时间提醒一次')}${studentReminderModeOptionHtml(stu,'off','不提醒','保留绑定关系，但不再推送上课提醒')}</div><div class="tms-field-help">学员需要关注服务号后才能收到课前提醒；绑定过的学员再次打开链接，会看到已绑定提示。</div></div></section>`;
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
    `咨询需求：${lead.consultType||'-'}`,
    `跟进人：${lead.owner||'-'}`,
    `最近跟进：${lead.lastFollowupAt?fmtDt(lead.lastFollowupAt):'-'}`,
    `下次跟进：${lead.nextFollowupAt||'-'}`,
    `转化结果：${leadConversionText(lead)}`
  ];
  const jumpBtn=lead.id&&typeof jumpToLeadDetail==='function'
    ?`<div style="margin-top:8px"><button class="btn-sec" onclick="jumpToLeadDetail('${lead.id}')">查看线索</button></div>`
    :'';
  return `<div class="tms-readonly-text">${esc(lines.join('；'))}</div>${jumpBtn}`;
}
function openStudentDetail(id){
  const s=students.find(x=>x.id===id);if(!s)return;
  const leadHtml=studentDetailBlockHtml('线索摘要',studentLeadSummaryHtml(s),{hideEmpty:true});
  const benefitHtml=studentBenefitRows(s).length?studentDetailSectionBlockHtml('当前权益',studentBenefitSummaryHtml(s),'student-benefit-section'):'';
  const body=`<div class="student-detail-shell">${studentDetailMetricsHtml(s)}${benefitHtml}${studentDetailSectionBlockHtml('课包购买记录',studentEntitlementSummaryHtml(s),'student-package-section')}${studentDetailSectionBlockHtml('上课记录',studentLessonRecordHtml(s),'student-lesson-section')}${studentDetailSectionBlockHtml('最近课后反馈',studentRecentFeedbackSummaryHtml(s),'student-feedback-section')}${studentReminderInfoHtml(s)}${leadHtml?`<div class="tms-section-header">关联线索</div><div class="tms-detail-grid">${leadHtml}</div>`:''}${studentConsumptionInfoHtml(s)}</div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-default" onclick="openStudentBenefitPickerModal('${s.id}','supplement')">赠送权益</button><button class="tms-btn tms-btn-default" onclick="openStudentBenefitPickerModal('${s.id}','consume')">消耗权益</button><button class="tms-btn tms-btn-primary" onclick="openStudentModal('${s.id}')">编辑资料</button>`;
  setCourtModalFrame('',body,footer,'modal-wide modal-student-detail');
  document.getElementById('mTitle').innerHTML=studentDetailHeroHtml(s);
}
async function copyStudentReminderText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return;}
  const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
}
function mergeStudentReminderUpdate(row){
  const i=students.findIndex(x=>x.id===row.id);
  if(i>=0)students[i]={...students[i],...row};
}
async function generateStudentReminderBindLink(studentId){
  try{
    const res=await apiCall('POST',`/students/${studentId}/reminder-link`,{});
    if(res.student)mergeStudentReminderUpdate(res.student);
    const link=`${window.location.origin}${res.bindPath}`;
    await copyStudentReminderText(link);
    toast('绑定链接已复制','success');
    openStudentDetail(studentId);
  }catch(e){toast('生成绑定链接失败：'+e.message,'error');}
}
async function updateStudentReminderMode(studentId,mode){
  try{
    const customInput=document.getElementById('studentReminderCustomHours');
    const customHours=customInput?customInput.value:undefined;
    const res=await apiCall('POST',`/students/${studentId}/reminder-settings`,{mode,customHours});
    if(res.student)mergeStudentReminderUpdate(res.student);
    toast('提醒时间已更新','success');
    openStudentDetail(studentId);
  }catch(e){toast('更新提醒时间失败：'+e.message,'error');}
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
function openStudentModal(id){
  editId=id;const s=id?students.find(x=>x.id===id):null;
  const typeOptions=[{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}];
  const sourceOptions=[{value:'',label:'-'},...SOURCES.map(t=>({value:t,label:t}))];
  const campusOptions=studentCampusOptions();
  const coachOptions=[{value:'',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const leadSummary=id?`<div class="tms-section-header">来源线索摘要</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">线索来源</label><div class="finput tms-form-control tms-readonly-text">${studentLeadSummaryHtml(s)}</div></div></div>`:'';
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="finput tms-form-control" id="s_name" value="${rv(s,'name')}" placeholder="学员姓名"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="finput tms-form-control" id="s_phone" value="${rv(s,'phone')}" placeholder="请输入手机号"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label>${renderCourtDropdownHtml('s_primaryCoach','负责教练',coachOptions,coachName(rv(s,'primaryCoach')),true)}</div><div class="tms-form-item"><label class="tms-form-label">学员类型</label>${renderCourtDropdownHtml('s_type','学员类型',typeOptions,rv(s,'type','成人'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">来源</label>${renderCourtDropdownHtml('s_source','来源',sourceOptions,rv(s,'source'),true)}</div><div class="tms-form-item"><label class="tms-form-label">活动范围</label><input type="text" class="finput tms-form-control" id="s_range" value="${rv(s,'activityRange')}" placeholder="例：朝阳"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所在校区</label>${renderCourtDropdownHtml('s_campus','校区',campusOptions,rv(s,'campus'),true)}</div></div>${leadSummary}<div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="s_notes">${esc(rv(s,'notes'))}</textarea></div></div>`;
  const footer=id?`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><div style="display:flex;gap:12px;"><button class="tms-btn tms-btn-danger" onclick="confirmDel('${s.id}','${esc(s.name)}','student')">删除</button><button class="tms-btn tms-btn-primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`:`<div style="display:flex;gap:12px;margin-left:auto;"><button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`;
  setCourtModalFrame(id?'编辑学员':'添加学员',body,footer,'modal-tight');
}
async function saveStudent(){
  const name=document.getElementById('s_name').value.trim();if(!name){toast('请输入姓名','warn');return;}
  const phone=document.getElementById('s_phone').value.trim();if(!validateCnPhone(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('studentSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const data={name,phone,primaryCoach:document.getElementById('s_primaryCoach')?.value||'',type:document.getElementById('s_type').value,source:document.getElementById('s_source').value,activityRange:document.getElementById('s_range').value.trim(),campus:document.getElementById('s_campus').value,notes:document.getElementById('s_notes').value.trim(),updatedBy:currentUser?.name||''};
  const duplicates=getStudentDuplicateCandidates(data,editId);
  if(duplicates.length){
    const summary=duplicates.map(s=>`${s.name}${s.phone?`（${s.phone}）`:''}`).join('、');
    if(!confirm(`发现可能重复的学员：${summary}。是否继续保存？`)){
      if(btn){btn.disabled=false;btn.textContent='保存';}
      return;
    }
  }
  try{
    if(editId){const res=await apiCall('PUT','/students/'+editId,data);const i=students.findIndex(x=>x.id===editId);students[i]={...students[i],...data,id:editId};mergeLinkedUpdates(res.studentUpdates||{});}
    else{const r=await apiCall('POST','/students',data);students.unshift(r);}
    closeModal();toast(editId?'修改成功 ✓':'添加成功 ✓','success');renderStudents();renderPlans();renderSchedule();renderPurchases();renderEntitlements();renderMySchedule();
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
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
  csv+=d.map(s=>[csvEscapeCell(s.name),csvEscapeCell(s.phone||''),csvEscapeCell(s.type||''),csvEscapeCell(s.source||''),csvEscapeCell(s.activityRange||''),csvEscapeCell(cn(s.campus)),csvEscapeCell(s.notes||'')].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_学员_'+today()+'.csv';a.click();toast('导出成功','success');
}
