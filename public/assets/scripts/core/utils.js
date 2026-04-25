function uid(){return 'u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function durMin(s,e){if(!s||!e)return 0;return Math.round((new Date(e)-new Date(s))/60000)}
function scheduleDurMin(s){return s?.endTime?durMin(s.startTime,s.endTime):60}
function scheduleLessonUnits(s){
  const count=Number(s?.lessonCount);
  if(Number.isFinite(count)&&count>0)return count;
  const mins=scheduleDurMin(s);
  if(mins>0)return Math.max(0,mins/60);
  return 1;
}
function sumScheduleLessonUnits(rows=[]){return rows.reduce((sum,s)=>sum+scheduleLessonUnits(s),0)}
function lessonUnitsText(value){
  const n=Number(value)||0;
  return Number.isInteger(n)?String(n):String(Math.round(n*10)/10);
}
function fmtDt(s){if(!s)return '—';return s.replace('T',' ').slice(0,16)}
function dateMs(v){const d=dtObj(v);return d?d.getTime():NaN}
function courtSortMetric(court,key){
  if(key==='balance')return {empty:false,value:courtFinanceLocal(court).balance};
  if(key==='spentAmount')return {empty:false,value:courtFinanceLocal(court).spentAmount};
  if(['validUntil','recentFollowUpDate','nextFollowUpDate'].includes(key)){
    const raw=String((key==='validUntil'?courtMembershipSummary(court).validUntil:court?.[key])||'').trim();
    if(!raw||raw==='-'||raw==='—')return {empty:true,value:0};
    const timeValue=dateMs(raw);
    return {empty:Number.isNaN(timeValue),value:Number.isNaN(timeValue)?0:timeValue};
  }
  const numeric=parseFloat(court?.[key]);
  return {empty:false,value:Number.isFinite(numeric)?numeric:0};
}
function rv(r,k,d=''){return r&&r[k]!=null?r[k]:d}
function esc(s){if(s==null)return '';const d=document.createElement('div');d.textContent=String(s);return d.innerHTML;}
function parseArr(v){if(Array.isArray(v))return v;if(typeof v==='string'&&v){try{return JSON.parse(v)}catch{return[]}}return[]}
function dtObj(v){return v?new Date(String(v).replace(' ','T')):null}
function dayStart(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function weekStart(d){const x=dayStart(d);const day=x.getDay();x.setDate(x.getDate()-day+(day===0?-6:1));return x}
function monthStart(d){return new Date(d.getFullYear(),d.getMonth(),1)}
function dateKey(d){return localDateKey(d)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function addMonths(d,n){const x=new Date(d);x.setMonth(x.getMonth()+n);return x}
function inRange(s,start,end){const d=dtObj(s);return d&&d>=start&&d<end}
function shanghaiNow(){
  const raw=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  return new Date(raw.replace(' ','T'));
}
function effectiveScheduleStatus(s,now=new Date()){
  const status=s?.status||'已排课';
  if(status==='已下课')return '已结束';
  if(status==='已取消'||status==='已结束')return status;
  const end=s?.endTime?dtObj(s.endTime):null;
  return status==='已排课'&&end&&end<now?'已结束':status;
}
function billableSchedules(){return schedules.filter(s=>s.startTime&&effectiveScheduleStatus(s)!=='已取消')}
function scheduleFeedback(s){return feedbacks.find(f=>f.scheduleId===s.id)}
function hasScheduleFeedback(s){return !!(s.feedbackId||s.feedbackAt||s.feedbackStatus==='已反馈'||scheduleFeedback(s))}
function hasTrialConversionDecision(fb){
  return !!(fb&&(fb.conversionIntent||fb.recommendedProductType||fb.needOpsFollowUp===true||fb.needOpsFollowUp==='是'||fb.opsFollowUpPriority||fb.opsFollowUpSuggestion||fb.playerLevel||fb.goalType));
}
function scheduleIsTrial(s){
  if(s?.isTrial===true||s?.isTrial==='true'||s?.isTrial==='是')return true;
  const texts=[s?.courseType,s?.packageName,s?.className,s?.notes].filter(Boolean).join(' ');
  return /体验/.test(texts);
}
function normalizeCourseType(type=''){
  const raw=String(type||'').trim();
  if(!raw)return '';
  if(raw==='私教')return '私教课';
  if(raw==='班课'||raw==='专项训练')return '训练营';
  if(raw==='\u6b63\u5f0f\u8bfe')return '私教课';
  return raw;
}
function scheduleCourseType(s){
  if(scheduleIsTrial(s))return '体验课';
  return normalizeCourseType(s?.courseType)||'—';
}
function scheduleClassName(s){
  return s?.className||classes.find(c=>c.id===s?.classId)?.className||'—';
}
function scheduleStudentSummary(s){
  const names=parseArr(s?.studentNames);
  if(names.length)return names.join('、');
  const ids=parseArr(s?.studentIds);
  if(ids.length){
    const resolved=ids.map(id=>students.find(st=>st.id===id)?.name||id).filter(Boolean);
    if(resolved.length)return resolved.join('、');
  }
  return s?.studentName||'—';
}
function scheduleParticipantSummary(s){
  const actual=parseArr(s?.studentIds);
  const expected=parseArr(s?.expectedStudentIds);
  const base=expected.length?expected:actual;
  const actualSet=new Set(actual);
  return {expectedCount:base.length,actualCount:actual.length,absentCount:base.filter(id=>!actualSet.has(id)).length};
}
function scheduleAbsentText(s){
  const summary=scheduleParticipantSummary(s);
  return summary.absentCount>0?`缺勤${summary.absentCount}人`:'无缺勤';
}
function scheduleListStudentSummary(s){
  const names=scheduleStudentSummary(s).split('、').filter(Boolean);
  if(names.length<=1)return names[0]||'—';
  return `${names[0]} 等 ${names.length} 人`;
}
function scheduleFeedbackStatusText(s){
  return hasScheduleFeedback(s)?'已填写':'未填写';
}
function scheduleDurationText(s){
  const mins=scheduleDurMin(s);
  if(!mins)return '—';
  if(mins%60===0)return `${mins/60}小时`;
  return `${mins/60}小时`;
}
function scheduleHasStudent(s,student){
  if(!s||!student)return false;
  const ids=parseArr(s.studentIds);
  if(ids.length)return ids.includes(student.id);
  return String(s.studentName||'').trim()===String(student.name||'').trim();
}
function scheduleFeedbackLabel(s){return hasScheduleFeedback(s)?'已反馈':'待反馈'}
function scheduleCourseTags(s){
  const tags=[scheduleCourseType(s),scheduleFeedbackLabel(s)];
  return [...new Set(tags.filter(Boolean))];
}
function scheduleTagBadges(s){
  return scheduleCourseTags(s).map(tag=>`<span class="badge ${tag==='体验课'?'b-amber':tag==='待反馈'?'b-red':tag==='已反馈'?'b-green':'b-blue'}" style="margin-right:4px">${esc(tag)}</span>`).join('');
}
function pendingFeedbackCount(list){const now=new Date();return list.filter(s=>effectiveScheduleStatus(s,now)==='已结束').filter(s=>!hasScheduleFeedback(s)).length}
let workbenchTicker=null;
function isoWeekValue(d){
  const x=dayStart(d);
  x.setDate(x.getDate()+3-((x.getDay()+6)%7));
  const week1=new Date(x.getFullYear(),0,4);
  return `${x.getFullYear()}-W${String(1+Math.round(((x-week1)/86400000-3+((week1.getDay()+6)%7))/7)).padStart(2,'0')}`;
}
function dateFromIsoWeek(v){
  const m=String(v||'').match(/^(\d{4})-W(\d{2})$/);
  if(!m)return null;
  const d=new Date(Number(m[1]),0,4);
  d.setDate(d.getDate()-((d.getDay()+6)%7)+(Number(m[2])-1)*7);
  return dayStart(d);
}
function coachOpsInputValue(d,mode){
  if(mode==='month')return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  if(mode==='week')return isoWeekValue(d);
  return dateKey(d);
}
function coachOpsInputDate(){
  const el=document.getElementById('coachOpsDate');
  const raw=el?.value||today();
  if(coachOpsMode==='month'){
    const m=String(raw).match(/^(\d{4})-(\d{2})$/);
    if(m)return new Date(Number(m[1]),Number(m[2])-1,1);
  }
  if(coachOpsMode==='week')return dateFromIsoWeek(raw)||new Date();
  return dtObj(raw)||new Date();
}
function coachOpsDateLabel(){
  const d=coachOpsInputDate();
  if(coachOpsMode==='month')return `${d.getFullYear()} 年 ${d.getMonth()+1} 月`;
  if(coachOpsMode==='week'){
    const s=weekStart(d),e=addDays(s,6);
    return `${s.getMonth()+1}/${s.getDate()} - ${e.getMonth()+1}/${e.getDate()}`;
  }
  return `${d.getFullYear()} / ${String(d.getMonth()+1).padStart(2,'0')} / ${String(d.getDate()).padStart(2,'0')}`;
}
function coachRiskCount(list){
  let count=0;
  const byCoach={};
  list.filter(s=>s.coach&&s.campus&&s.startTime&&s.endTime).forEach(s=>{(byCoach[s.coach]||(byCoach[s.coach]=[])).push(s)});
  Object.values(byCoach).forEach(rows=>{
    rows.sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
    for(let i=1;i<rows.length;i++){
      const prev=rows[i-1],cur=rows[i];
      if(prev.campus===cur.campus)continue;
      const gap=durMin(prev.endTime,cur.startTime);
      if(gap>=0&&gap<60)count++;
    }
  });
  return count;
}
function coachOverlapCount(list){
  let count=0;
  const rows=list.filter(s=>s.startTime&&s.endTime).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
    if(rows[j].startTime>=rows[i].endTime)break;
    if(rows[i].coach&&rows[i].coach===rows[j].coach)count++;
  }
  return count;
}
function rangeBounds(kind){
  const now=coachOpsInputDate();
  if(kind==='day'){const start=dayStart(now),end=addDays(start,1);return {start,end,label:dateKey(start)};}
  if(kind==='month')return {start:monthStart(now),end:new Date(now.getFullYear(),now.getMonth()+1,1),label:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`};
  const start=weekStart(now),end=addDays(start,7);
  return {start,end,label:`${dateKey(start)} 至 ${dateKey(addDays(end,-1))}`};
}
function distText(list,keyFn){
  const m={};
  list.forEach(x=>{const k=keyFn(x);if(k)m[k]=(m[k]||0)+1;});
  const arr=Object.entries(m).sort((a,b)=>b[1]-a[1]);
  return arr.length?arr.map(([k,v])=>`${k}${v}`).join(' / '):'—';
}
function timeBand(s){
  const h=parseInt(String(s.startTime||'').slice(11,13));
  if(h<12)return '上午';
  if(h<18)return '下午';
  return '晚上';
}
function searchHit(q,...values){
  if(!q)return true;
  const keyword=String(q).toLowerCase().trim();
  return values.some(v=>String(v||'').toLowerCase().includes(keyword));
}
function setDateInputValue(inputId,value){
  const input=document.getElementById(inputId);
  if(input)input.value=value||'';
}
function syncDateButton(inputId,buttonId,emptyLabel){
  const input=document.getElementById(inputId),btn=document.getElementById(buttonId);
  if(btn)btn.textContent=input?.value||emptyLabel;
}
function closeGlobalDatePicker(){
  const pop=document.getElementById('globalDatePicker');
  if(pop)pop.classList.remove('open');
  globalDatePickerState.targetInputId='';
  globalDatePickerState.targetButtonId='';
  globalDatePickerState.label='';
}
function moveGlobalDatePickerMonth(step,event){
  if(event){event.preventDefault();event.stopPropagation();}
  const base=dtObj(globalDatePickerState.viewDate)||new Date();
  globalDatePickerState.viewDate=dateKey(addMonths(base,step));
  renderGlobalDatePicker();
}
function pickGlobalDate(dateValue,event){
  if(event){event.preventDefault();event.stopPropagation();}
  if(!globalDatePickerState.targetInputId)return;
  const {targetInputId,targetButtonId,label}=globalDatePickerState;
  setDateInputValue(targetInputId,dateValue);
  syncDateButton(targetInputId,targetButtonId,label);
  closeGlobalDatePicker();
  const input=document.getElementById(targetInputId);
  if(input&&typeof input.onchange==='function')input.onchange();
  else if(input)input.dispatchEvent(new Event('change',{bubbles:true}));
}
function renderGlobalDatePicker(){
  const pop=document.getElementById('globalDatePicker');
  if(!pop||!globalDatePickerState.targetButtonId)return;
  const base=dtObj(globalDatePickerState.viewDate)||new Date();
  const monthStartDate=new Date(base.getFullYear(),base.getMonth(),1);
  const monthEndDate=new Date(base.getFullYear(),base.getMonth()+1,0);
  const lead=(monthStartDate.getDay()+6)%7;
  const startCell=addDays(monthStartDate,-lead);
  const activeValue=document.getElementById(globalDatePickerState.targetInputId)?.value||'';
  const rect=document.getElementById(globalDatePickerState.targetButtonId)?.getBoundingClientRect();
  if(rect){
    pop.style.top=`${Math.min(window.innerHeight-320,rect.bottom+8)}px`;
    pop.style.left=`${Math.max(12,Math.min(window.innerWidth-304,rect.left))}px`;
  }
  const cells=Array.from({length:42},(_,idx)=>{
    const d=addDays(startCell,idx);
    const value=dateKey(d);
    const muted=d<monthStartDate||d>monthEndDate;
    return `<button class="coach-picker-day${muted?' muted':''}${value===today()?' today':''}${value===activeValue?' active':''}" onclick="pickGlobalDate('${value}',event)">${d.getDate()}</button>`;
  }).join('');
  pop.innerHTML=`<div class="coach-picker-head"><button class="coach-picker-move" type="button" onclick="moveGlobalDatePickerMonth(-1,event)">&lt;</button><div class="coach-picker-title">${base.getFullYear()} 年 ${base.getMonth()+1} 月</div><button class="coach-picker-move" type="button" onclick="moveGlobalDatePickerMonth(1,event)">&gt;</button></div><div class="coach-picker-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div class="coach-picker-grid">${cells}</div>`;
}
function toggleGlobalDatePicker(event,inputId,buttonId,label=''){
  if(event){event.preventDefault();event.stopPropagation();}
  const btn=document.getElementById(buttonId);
  const pop=document.getElementById('globalDatePicker');
  const nextLabel=label||btn?.textContent||'选择日期';
  const isSame=globalDatePickerState.targetInputId===inputId&&pop?.classList.contains('open');
  if(isSame){closeGlobalDatePicker();return;}
  globalDatePickerState={targetInputId:inputId,targetButtonId:buttonId,label:nextLabel,viewDate:document.getElementById(inputId)?.value||today()};
  renderGlobalDatePicker();
  pop?.classList.add('open');
}
function jsArg(v){return JSON.stringify(String(v||'')).replace(/"/g,'&quot;').replace(/</g,'\\u003c');}
function findStudentForCourt(c){
  if(!c)return null;
  const ids=parseArr(c.studentIds);
  if(ids.length){
    const byIds=ids.map(id=>students.find(s=>s.id===id)).filter(Boolean);
    if(byIds.length)return byIds[0];
    return null;
  }
  if(c.studentId){
    const byId=students.find(s=>s.id===c.studentId);
    if(byId)return byId;
    return null;
  }
  return null;
}
function courtsForStudent(stu){
  if(!stu)return[];
  return courts.filter(c=>{
    const ids=parseArr(c.studentIds);
    if(ids.includes(stu.id))return true;
    if(c.studentId===stu.id)return true;
    const linked=findStudentForCourt(c);
    return linked?.id===stu.id;
  });
}
function latestCourtUseDateForStudent(stu){
  const rows=courtsForStudent(stu).flatMap(c=>parseArr(c.history).filter(h=>h.type==='消费'&&h.date));
  rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return rows[0]?.date||'';
}
function studentAccountSummaryHtml(stu){
  const linkedCourts=courtsForStudent(stu);
  if(!linkedCourts.length)return '<div style="color:var(--td);font-size:12px">暂无关联订场账户</div>';
  return linkedCourts.map(c=>{const f=courtFinanceLocal(c);return `<div style="font-size:12px;color:var(--tb);margin:3px 0">${esc(c.name)}：余额 ¥${fmt(f.balance)}，累计消费 ¥${fmt(f.spentAmount)}</div>`;}).join('');
}
function membershipStatusText(status){
  return ({active:'正常',extended:'延续期',expired:'已到期',cleared:'已清零',voided:'已作废',inactive:'未启用'}[status]||status||'—');
}
function membershipStatusTagMeta(input){
  const status=typeof input==='string'?input:(input?.status||'');
  const text=typeof input==='string'?membershipStatusText(status):membershipDisplayStatus(input);
  if(status==='voided')return {text,tagClass:'tms-tag-red'};
  if(status==='cleared'||status==='expired'||status==='inactive')return {text,tagClass:'tms-tag-tier-slate'};
  if(status==='extended')return {text,tagClass:'tms-tag-tier-blue'};
  return {text,tagClass:'tms-tag-green'};
}
function membershipPlanStatusMeta(plan){
  if(!plan)return {text:'-',tagClass:'tms-tag-tier-slate'};
  if(plan.status==='draft')return {text:'草稿',tagClass:'tms-tag-tier-slate'};
  if(plan.status==='inactive')return {text:'停售',tagClass:'tms-tag-red'};
  if(plan.saleEndDate&&plan.saleEndDate<today())return {text:'已结束',tagClass:'tms-tag-tier-slate'};
  return {text:'上架',tagClass:'tms-tag-green'};
}
function membershipPlanSaleWindowText(plan){
  if(!plan)return '-';
  return [renderCourtEmptyText(plan.saleStartDate||''),renderCourtEmptyText(plan.saleEndDate||'')].join(' ~ ');
}
function membershipPlanTierTagClass(value=''){
  const raw=String(value||'').toLowerCase();
  if(/钻|diamond/.test(raw))return 'tms-tag-tier-teal';
  if(/金|gold/.test(raw))return 'tms-tag-tier-gold';
  if(/银|silver/.test(raw))return 'tms-tag-tier-slate';
  if(/白金|铂金|plat/.test(raw))return 'tms-tag-tier-blue';
  return 'tms-tag-tier-blue';
}
function canDeleteMembershipPlan(plan){
  return !!plan&&plan.status!=='active';
}
function membershipDisplayStatus(account){
  if(!account)return '未开卡';
  if(account.status==='voided')return '已作废';
  if(account.status==='cleared')return '已清零';
  if(account.status==='extended')return '延续期';
  if(account.status==='active'&&account.validUntil){
    const diff=Math.ceil((new Date(account.validUntil)-new Date(today()))/86400000);
    if(diff>=0&&diff<=30)return '30天内到期';
  }
  return membershipStatusText(account.status);
}
function membershipValidityHint(account){
  if(!account)return '暂无会员账户';
  return `余额有效期至 ${account.validUntil||'—'}，最晚清零 ${account.hardExpireAt||'—'}`;
}
function courtMembershipAccount(courtId){
  const rows=membershipAccounts.filter(a=>a.courtId===courtId);
  if(!rows.length)return null;
  const activeRow=rows.find(a=>a.status!=='voided');
  if(activeRow)return activeRow;
  return rows.sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null;
}
function membershipOrdersForAccount(accountId){
  return membershipOrders.filter(o=>o.membershipAccountId===accountId).sort((a,b)=>String(b.purchaseDate||'').localeCompare(String(a.purchaseDate||'')));
}
function normalizeMembershipBenefitSource(source){
  if(!source||typeof source!=='object')return {};
  const rawTemplate=source?.benefitTemplate&&typeof source.benefitTemplate==='object'?source.benefitTemplate:source;
  const template={};
  [
    ['publicLessonCount','publicLesson','大师公开课'],
    ['stringingLaborCount','stringingLabor','穿线免手工费'],
    ['ballMachineCount','ballMachine','发球机免费'],
    ['level2PartnerCount','level2Partner','国家二级运动员陪打'],
    ['designatedCoachPartnerCount','designatedCoachPartner','指定教练陪打']
  ].forEach(([field,code,label])=>{
    const count=parseInt(source?.[field]??rawTemplate?.[code]?.count)||0;
    if(count<=0)return;
    template[code]={label:rawTemplate?.[code]?.label||label,unit:rawTemplate?.[code]?.unit||'次',count};
    if(code==='designatedCoachPartner'){
      const designatedCoachIds=parseArr(source?.designatedCoachIds??rawTemplate?.[code]?.designatedCoachIds);
      if(designatedCoachIds.length)template[code].designatedCoachIds=designatedCoachIds;
    }
  });
  const customBenefits=parseArr(source?.customBenefits??rawTemplate?.customBenefits).map(item=>{
    const count=parseInt(item?.count)||0;
    if(count<=0)return null;
    return {label:item.label||'自定义权益',unit:item.unit||'次',count};
  }).filter(Boolean);
  if(customBenefits.length)template.customBenefits=customBenefits;
  return Object.keys(template).length?template:null;
}
function effectiveMembershipBenefitSource(...sources){
  for(const source of sources){
    const normalized=normalizeMembershipBenefitSource(source);
    if(normalized&&Object.keys(normalized).length)return normalized;
  }
  return {};
}
function membershipOrderHasDealBenefitSnapshot(order){
  return order?.benefitSnapshotCustomized===true||(order?.benefitSnapshot&&typeof order.benefitSnapshot==='object'&&!Array.isArray(order.benefitSnapshot)&&Object.keys(order.benefitSnapshot).length>0);
}
function membershipOrderEffectiveBenefitSource(order,plan={}){
  if(membershipOrderHasDealBenefitSnapshot(order))return normalizeMembershipBenefitSource(order?.benefitSnapshot)||{};
  return effectiveMembershipBenefitSource(order,order?.planBenefitTemplateSnapshot,plan);
}
function membershipBenefitSummaryForOrder(order){
  const plan=membershipPlans.find(p=>p.id===order?.membershipPlanId)||{};
  const snap=membershipOrderEffectiveBenefitSource(order,plan);
  const items=[];
  Object.entries(snap).forEach(([code,v])=>{if(code!=='customBenefits'&&(parseInt(v?.count)||0)>0)items.push({code,label:v.label||code,unit:v.unit||'次',total:parseInt(v.count)||0});});
  parseArr(snap.customBenefits).forEach((v,i)=>{if((parseInt(v?.count)||0)>0)items.push({code:`custom_${i+1}`,label:v.label||`自定义权益${i+1}`,unit:v.unit||'次',total:parseInt(v.count)||0});});
  return items.map(item=>{
    const rows=membershipBenefitLedger.filter(l=>l.membershipOrderId===order.id&&l.benefitCode===item.code&&l.action!=='grant');
    const positiveDelta=rows.filter(l=>(parseInt(l.delta)||0)>0).reduce((n,l)=>n+(parseInt(l.delta)||0),0);
    const negativeDelta=rows.filter(l=>(parseInt(l.delta)||0)<0).reduce((n,l)=>n+(parseInt(l.delta)||0),0);
    const total=(item.total||0)+positiveDelta;
    const benefitValidUntil=order?.benefitValidUntil||'';
    const expired=benefitValidUntil&&benefitValidUntil<today();
    return {...item,total,membershipOrderId:order.id,benefitValidUntil,remaining:expired?0:Math.max(0,total+negativeDelta),expired,designatedCoachIds:parseArr(snap?.[item.code]?.designatedCoachIds)};
  });
}
function membershipBenefitRowsForAccount(account){
  if(['voided','cleared'].includes(account?.status))return [];
  if(!account)return [];
  const rows={};
  membershipOrdersForAccount(account.id).forEach(order=>{
    membershipBenefitSummaryForOrder(order).forEach(item=>{
      if(!rows[item.code])rows[item.code]={code:item.code,label:item.label,unit:item.unit,total:0,remaining:0,batches:[],designatedCoachIds:[]};
      rows[item.code].total+=item.total||0;
      rows[item.code].remaining+=item.remaining||0;
      rows[item.code].batches.push({membershipOrderId:item.membershipOrderId,total:item.total,remaining:item.remaining,benefitValidUntil:item.benefitValidUntil,expired:item.expired});
      rows[item.code].designatedCoachIds=[...new Set([...rows[item.code].designatedCoachIds,...parseArr(item.designatedCoachIds)])];
    });
  });
  return Object.values(rows).sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''),'zh-CN'));
}
function membershipBenefitUsedCount(row){
  return Math.max(0,(parseInt(row?.total)||0)-(parseInt(row?.remaining)||0));
}
function membershipBenefitBatchCardsHtml(account){
  if(!account)return '<div style="font-size:12px;color:var(--td)">暂无权益批次</div>';
  const orders=membershipOrdersForAccount(account.id);
  if(!orders.length)return '<div style="font-size:12px;color:var(--td)">暂无权益批次</div>';
  return orders.map(order=>{
    const items=membershipBenefitSummaryForOrder(order);
    const lines=items.length?items.map(item=>{
      const supplementCount=membershipBenefitLedger
        .filter(l=>l.membershipOrderId===order.id&&l.benefitCode===item.code&&parseInt(l.delta)>0&&l.action!=='grant')
        .reduce((sum,l)=>sum+(parseInt(l.delta)||0),0);
      return `<div style="font-size:12px;color:var(--tb);margin-top:4px">${esc(item.label)}：${item.remaining}/${item.total}${esc(item.unit)}${supplementCount>0?` · 含补发 +${supplementCount}`:''}</div>`;
    }).join(''):'<div style="font-size:12px;color:var(--td);margin-top:4px">本批次无权益</div>';
    return `<div style="border:0.5px solid rgba(180,83,9,0.12);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,0.4)"><div style="font-size:12px;color:var(--ts)">购买日期：${esc(order.purchaseDate)||'—'} · 方案名：${esc(order.membershipPlanName)||'—'} · 批次到期：${esc(order.benefitValidUntil)||'—'}</div>${lines}</div>`;
  }).join('');
}
function membershipBenefitBatchRows(account){
  if(!account)return [];
  return membershipOrdersForAccount(account.id).flatMap(order=>membershipBenefitSummaryForOrder(order).map(item=>({
    membershipOrderId:order.id,
    courtId:order.courtId||account.courtId,
    courtName:order.courtName||'—',
    purchaseDate:order.purchaseDate||'—',
    membershipPlanName:order.membershipPlanName||'—',
    benefitCode:item.code,
    benefitLabel:item.label,
    unit:item.unit,
    total:item.total,
    remaining:item.remaining,
    benefitValidUntil:item.benefitValidUntil,
    expired:item.expired
  })));
}
function membershipBenefitLabelForCode(code,account){
  return membershipBenefitRowsForAccount(account).find(x=>x.code===code)?.label||code;
}
function membershipBenefitNote(row){
  const coachNames=parseArr(row.designatedCoachIds).map(id=>coaches.find(c=>c.id===id)?.name||id).filter(Boolean);
  return coachNames.length?`（${coachNames.join('、')}）`:'';
}
function membershipActionVisibility(account){
  if(!account)return {firstOpen:true};
  if(['voided','cleared'].includes(account.status))return {reopen:true,ledger:true};
  return {renew:true,consume:true,supplement:true,ledger:true,void:true};
}
function membershipNumericValue(value){
  const n=parseFloat(value);
  return Number.isFinite(n)&&n!==0?String(Number.isInteger(n)?n:n):'';
}
function membershipStepperHtml(inputId,value='',step=1,placeholder=''){
  return `<input class="finput tms-form-control" id="${inputId}" type="number" step="${step}" value="${esc(membershipNumericValue(value))}" placeholder="${esc(placeholder)}">`;
}
function membershipCoachSelectorHtml(containerId,selectedIds=[]){
  const selected=new Set(parseArr(selectedIds).map(x=>String(x||'')));
  if(!coaches.length)return `<div id="${containerId}" style="font-size:12px;color:var(--td)">暂无可选教练</div>`;
  return `<div id="${containerId}" style="display:flex;flex-wrap:wrap;gap:8px">${coaches.map(c=>`<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:0.5px solid rgba(180,83,9,0.16);border-radius:8px;background:rgba(255,255,255,0.45);font-size:12px;color:var(--tb)"><input type="checkbox" class="membership-coach-cb" value="${esc(c.id)}" ${selected.has(String(c.id))?'checked':''}>${esc(c.name)}</label>`).join('')}</div>`;
}
function membershipCoachSelectorValues(containerId){
  return [...document.querySelectorAll(`#${containerId} .membership-coach-cb:checked`)].map(cb=>cb.value).filter(Boolean);
}
function toggleMembershipCoachSelector(countInputId,wrapId){
  const input=document.getElementById(countInputId);
  const wrap=document.getElementById(wrapId);
  if(!input||!wrap)return;
  const count=parseInt(input.value)||0;
  wrap.style.display=count>0?'block':'none';
  if(count<=0)wrap.querySelectorAll('.membership-coach-cb').forEach(cb=>{cb.checked=false;});
}
function membershipOrderPlanById(planId){
  return membershipPlans.find(x=>x.id===planId)||null;
}
function membershipOrderDraftFromPlan(planId){
  const plan=membershipPlans.find(x=>x.id===planId)||{};
  return {
    bonusAmount:parseFloat(plan.bonusAmount)||0,
    publicLessonCount:parseInt(plan.publicLessonCount)||0,
    stringingLaborCount:parseInt(plan.stringingLaborCount)||0,
    ballMachineCount:parseInt(plan.ballMachineCount)||0,
    level2PartnerCount:parseInt(plan.level2PartnerCount)||0,
    designatedCoachPartnerCount:parseInt(plan.designatedCoachPartnerCount)||0,
    designatedCoachIds:parseArr(plan.designatedCoachIds).join(',')
  };
}
function membershipDiscountText(rate){
  const value=parseFloat(rate);
  return value?`${Math.round(value*100)/10} 折`:'—';
}
function membershipTierCodeValue(raw=''){
  return String(raw||'').trim().toLowerCase().replace(/\s+/g,'-');
}
function membershipPlanPreviewHtml(input={}){
  const benefitLines=[
    ['大师公开课',parseInt(input.publicLessonCount)||0],
    ['穿线免手工费',parseInt(input.stringingLaborCount)||0],
    ['发球机免费',parseInt(input.ballMachineCount)||0],
    ['国家二级运动员陪打',parseInt(input.level2PartnerCount)||0],
    ['指定教练陪打',parseInt(input.designatedCoachPartnerCount)||0]
  ].filter(x=>x[1]>0).map(x=>`${x[0]} ${x[1]}次`).join('；')||'暂无赠送权益';
  const statusMeta=membershipPlanStatusMeta(input);
  return `<div style="font-size:12px;color:var(--tb);line-height:1.7"><div><strong style="color:var(--th)">${esc(input.name||'未命名方案')}</strong></div><div>会员档位：${esc(renderCourtEmptyText(input.tierCode||input.name||''))}</div><div>充值金额：¥${fmt(parseFloat(input.rechargeAmount)||0)}</div><div>赠送金额：¥${fmt(parseFloat(input.bonusAmount)||0)}</div><div>折扣：${esc(membershipDiscountText(input.discountRate)||'—')}</div><div>售卖时间：${esc(membershipPlanSaleWindowText(input))}</div><div>方案状态：${esc(statusMeta.text)}</div><div>赠送权益：${esc(benefitLines)}</div></div>`;
}
function refreshMembershipPlanPreview(){
  const name=document.getElementById('mp_name')?.value.trim()||'';
  const data={
    name,
    tierCode:document.getElementById('mp_tier')?.value.trim()||'',
    rechargeAmount:document.getElementById('mp_recharge')?.value||0,
    discountRate:document.getElementById('mp_discount')?.value||0,
    bonusAmount:document.getElementById('mp_bonus')?.value||0,
    saleStartDate:document.getElementById('mp_saleStartDate')?.value||'',
    saleEndDate:document.getElementById('mp_saleEndDate')?.value||'',
    status:document.getElementById('mp_status')?.value||'active',
    publicLessonCount:document.getElementById('mp_publicLesson')?.value||0,
    stringingLaborCount:document.getElementById('mp_stringingLabor')?.value||0,
    ballMachineCount:document.getElementById('mp_ballMachine')?.value||0,
    level2PartnerCount:document.getElementById('mp_level2Partner')?.value||0,
    designatedCoachPartnerCount:document.getElementById('mp_designatedCoachPartner')?.value||0
  };
  const host=document.getElementById('membershipPlanPreview');
  if(host)host.innerHTML=membershipPlanPreviewHtml(data);
}
function membershipOrderPreview({court,account,plan,rechargeAmount,bonusAmount,purchaseDate}){
  const startDate=purchaseDate||today();
  const currentQualified=parseFloat(account?.lastQualifiedRechargeAmount)||0;
  const amount=parseFloat(rechargeAmount)||parseFloat(plan?.rechargeAmount)||0;
  const inTerm=account&&['active','extended'].includes(account.status)&&account.validUntil&&startDate<=account.validUntil;
  const resetsValidity=!account||account.status==='cleared'||(inTerm&&(!currentQualified||amount>=currentQualified));
  const nextValidUntil=resetsValidity?dateKey(new Date(new Date(startDate).setMonth(new Date(startDate).getMonth()+12)-86400000)):account?.validUntil||'—';
  const nextHardExpireAt=resetsValidity?dateKey(new Date(new Date(startDate).setMonth(new Date(startDate).getMonth()+24)-86400000)):account?.hardExpireAt||'—';
  const benefitDraft=membershipOrderDraftFromPlan(plan?.id);
  const addedBenefits=[
    ['大师公开课',parseInt(benefitDraft.publicLessonCount)||0],
    ['穿线免手工费',parseInt(benefitDraft.stringingLaborCount)||0],
    ['发球机免费',parseInt(benefitDraft.ballMachineCount)||0],
    ['国家二级运动员陪打',parseInt(benefitDraft.level2PartnerCount)||0],
    ['指定教练陪打',parseInt(benefitDraft.designatedCoachPartnerCount)||0]
  ].filter(x=>x[1]>0).map(x=>`${x[0]} ${x[1]}次`).join('；')||'无新增权益';
  const lowTierWarning=account&&inTerm&&!resetsValidity?'低于原合规档位续充：折扣会变化，原有权益保留，但本次不重置有效期。若要保持现有有效期重置资格，请选择不低于原档位的方案。':'';
  return {
    currentStatus: account?`${account.memberLabel||'—'} · ${membershipDisplayStatus(account)} · ${membershipValidityHint(account)}`:'当前无会员账户',
    nextDiscountText: membershipDiscountText(plan?.discountRate),
    resetsValidity,
    nextValidUntil,
    nextHardExpireAt,
    keepsExistingBenefits: !!account,
    addedBenefits,
    bonusAmount: parseFloat(bonusAmount)||parseFloat(plan?.bonusAmount)||0,
    warning: lowTierWarning
  };
}
function applyMembershipOrderDraft(planId){
  const draft=membershipOrderDraftFromPlan(planId);
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val;};
  const plan=membershipOrderPlanById(planId);
  set('mo_systemAmount',membershipNumericValue(plan?.rechargeAmount));
  set('mo_recharge',membershipNumericValue(plan?.rechargeAmount));
  set('mo_bonus',membershipNumericValue(draft.bonusAmount));
  set('mo_publicLesson',membershipNumericValue(draft.publicLessonCount));
  set('mo_stringingLabor',membershipNumericValue(draft.stringingLaborCount));
  set('mo_ballMachine',membershipNumericValue(draft.ballMachineCount));
  set('mo_level2Partner',membershipNumericValue(draft.level2PartnerCount));
  set('mo_designatedCoachPartner',membershipNumericValue(draft.designatedCoachPartnerCount));
  const coachWrap=document.getElementById('mo_designatedCoachWrap');
  if(coachWrap)coachWrap.innerHTML=membershipCoachSelectorHtml('mo_designatedCoachIdsWrap',parseArr(plan?.designatedCoachIds));
  toggleMembershipCoachSelector('mo_designatedCoachPartner','mo_designatedCoachSection');
}
function membershipOrderBenefitSummaryHtml(order){
  const plan=membershipPlans.find(p=>p.id===order?.membershipPlanId)||{};
  const planSnap=effectiveMembershipBenefitSource(order?.planBenefitTemplateSnapshot,plan);
  const items=membershipBenefitSummaryForOrder(order);
  const itemMap=new Map(items.map(item=>[item.code,item]));
  Object.entries(planSnap||{}).forEach(([code,value])=>{
    if(code==='customBenefits'||itemMap.has(code))return;
    const count=parseInt(value?.count)||0;
    if(count>0)itemMap.set(code,{code,label:value.label||code,unit:value.unit||'次',total:0,remaining:0});
  });
  const list=[...itemMap.values()];
  if(!list.length)return '无赠送权益';
  const lines=list.map(item=>{
    const planCount=parseInt(planSnap?.[item.code]?.count)||0;
    const delta=item.total-planCount;
    return `${item.label} 基础 ${planCount}${item.unit}${delta>0?`，额外赠送 +${delta}`:delta<0?`，较方案 ${delta}`:''}，合计 ${item.total}${item.unit}`;
  });
  return lines.join('；');
}
function membershipOrderAdjustmentText(order){
  const plan=membershipPlans.find(p=>p.id===order?.membershipPlanId)||{};
  const planSnap=effectiveMembershipBenefitSource(order?.planBenefitTemplateSnapshot,plan);
  if(order?.benefitSnapshotCustomized===true)return '个性化调整';
  const items=membershipBenefitSummaryForOrder(order);
  const itemMap=new Map(items.map(item=>[item.code,item.total]));
  const changed=items.some(item=>(parseInt(planSnap?.[item.code]?.count)||0)!==(parseInt(item.total)||0));
  const removed=Object.entries(planSnap||{}).some(([code,value])=>code!=='customBenefits'&&(parseInt(value?.count)||0)>0&&!itemMap.has(code));
  return changed||removed?'个性化调整':'标准权益';
}
function courtMembershipBenefitRowsHtml(court){
  const account=courtMembershipAccount(court?.id);
  const rows=membershipBenefitRowsForAccount(account);
  if(!rows.length)return '<div style="font-size:12px;color:var(--td)">暂无赠送权益</div>';
  return rows.map(row=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:0.5px solid rgba(180,83,9,0.12)"><div style="min-width:0"><div style="font-size:13px;color:var(--th);font-weight:600">${esc(row.label)}${esc(membershipBenefitNote(row))}</div><div style="font-size:12px;color:var(--ts)">剩余 ${row.remaining}/${row.total}${esc(row.unit)}${row.batches.some(x=>x.benefitValidUntil)?` · 最早到期 ${esc(row.batches.filter(x=>x.remaining>0&&x.benefitValidUntil).sort((a,b)=>String(a.benefitValidUntil).localeCompare(String(b.benefitValidUntil)))[0]?.benefitValidUntil||'—')}`:''}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn-sec" onclick="openMembershipBenefitActionModal('${court.id}','${row.code}','consume')">消耗</button><button class="btn-sec" onclick="openMembershipBenefitActionModal('${court.id}','${row.code}','supplement')">补发</button><button class="btn-sec" onclick="openMembershipBenefitHistoryModal('${court.id}','${row.code}')">查看明细</button></div></div>`).join('');
}
function membershipBenefitConsumePreview(account,benefitCode,count){
  const need=Math.max(1,parseInt(count)||1);
  const batches=membershipBenefitBatchRows(account)
    .filter(row=>row.benefitCode===benefitCode&&row.remaining>0&&!row.expired)
    .sort((a,b)=>{
      const av=String(a.benefitValidUntil||'9999-99-99');
      const bv=String(b.benefitValidUntil||'9999-99-99');
      if(av!==bv)return av.localeCompare(bv);
      return String(a.membershipOrderId||'').localeCompare(String(b.membershipOrderId||''));
    });
  let remaining=need;
  const allocations=[];
  batches.forEach(batch=>{
    if(remaining<=0)return;
    const delta=Math.min(remaining,parseInt(batch.remaining)||0);
    if(delta<=0)return;
    allocations.push({membershipOrderId:batch.membershipOrderId,benefitValidUntil:batch.benefitValidUntil,delta});
    remaining-=delta;
  });
  return {totalRemaining:batches.reduce((sum,row)=>sum+(parseInt(row.remaining)||0),0),allocations};
}
function courtMembershipSummary(court){
  const account=courtMembershipAccount(court?.id);
  const finance=courtFinanceLocal(court||{history:[]});
  if(!account)return {account:null,accountType:finance.balance>0?'储值':'普通',memberLabel:'—',tierLabel:'-',status:'未开卡',discount:'—',validUntil:'—'};
  if(['voided','cleared'].includes(account.status)){
    return {account,accountType:'历史会员',memberLabel:'-',tierLabel:'-',status:membershipDisplayStatus(account),discount:'-',validUntil:'-'};
  }
  return {account,accountType:['active','extended'].includes(account.status)?'会员':'历史会员',memberLabel:account.memberLabel||'—',tierLabel:courtMembershipTierLabel(account),status:membershipDisplayStatus(account),discount:account.discountRate?`${Math.round((parseFloat(account.discountRate)||1)*100)/10} 折`:'—',validUntil:account.validUntil||'—'};
}
function courtMembershipTierLabel(account){
  if(!account)return '-';
  const latestOrder=membershipOrdersForAccount(account.id)[0]||null;
  const plan=membershipPlans.find(p=>p.id===(latestOrder?.membershipPlanId||account.membershipPlanId))||{};
  return account.tierCode||latestOrder?.tierCode||plan.tierCode||'-';
}
function courtMembershipTierTagClass(tierLabel){
  const text=String(tierLabel||'').toLowerCase();
  if(!text||text==='-')return '';
  if(text.includes('金')||text.includes('gold'))return 'tms-tag-tier-gold';
  if(text.includes('钻')||text.includes('diamond')||text.includes('铂')||text.includes('platinum'))return 'tms-tag-tier-blue';
  if(text.includes('银')||text.includes('silver'))return 'tms-tag-tier-slate';
  return 'tms-tag-tier-teal';
}
function studentMembershipSummaryHtml(stu){
  const linked=courtsForStudent(stu);
  if(!linked.length)return '<div style="font-size:12px;color:var(--td)">暂无关联订场账户会员摘要</div>';
  return linked.map(c=>{const m=courtMembershipSummary(c);return `<div style="font-size:12px;color:var(--tb);margin:3px 0">关联订场账户会员摘要：${esc(c.name)} · ${m.accountType} · ${esc(m.memberLabel)} · ${m.status} · ${m.discount} · 到期 ${m.validUntil}</div>`;}).join('');
}
function studentClasses(stu){
  return classes.filter(c=>parseArr(c.studentIds).includes(stu?.id));
}
function studentActiveClasses(stu){
  return studentClasses(stu).filter(c=>c.status==='已排班');
}
function studentPrimaryClass(stu){
  const active=studentActiveClasses(stu);
  if(active.length)return active[0];
  const all=studentClasses(stu);
  return all[0]||null;
}
function daysAgoText(dateStr){
  if(!dateStr)return '—';
  const days=Math.max(0,Math.floor((Date.now()-new Date(dateStr))/(86400000)));
  return `${dateStr} · ${days}天前`;
}
function lessonQty(value){
  const num=Number(value)||0;
  return Number.isInteger(num)?String(num):String(Math.round(num*10)/10);
}
function lessonValue(value,fallback=0){
  const num=Number(value);
  return Number.isFinite(num)?num:fallback;
}
function studentCoachSummary(stu){
  const coachSet=[...new Set([stu?.primaryCoach,...studentActiveClasses(stu).map(c=>String(c.coach||'').trim())].filter(Boolean))];
  if(!coachSet.length)return '—';
  if(coachSet.length===1)return coachSet[0];
  return `${coachSet[0]} 等${coachSet.length}位`;
}
function studentPrimaryCoachText(stu){
  return String(stu?.primaryCoach||'').trim()||'未分配';
}
function studentPackageLessonMeta(stu){
  const rows=entitlements.filter(e=>e.studentId===stu?.id&&e.status!=='voided');
  if(!rows.length)return {hasPackage:false,remaining:0,total:0,text:'-'};
  const total=rows.reduce((sum,row)=>sum+(Number(row.totalLessons)||0),0);
  const remaining=rows.reduce((sum,row)=>sum+(Number(row.remainingLessons)||0),0);
  if(total<=0)return {hasPackage:false,remaining:0,total:0,text:'-'};
  return {hasPackage:true,remaining,total,text:`${lessonQty(remaining)}/${lessonQty(total)}`,pct:Math.max(0,Math.min(100,Math.round((remaining/total)*100)))};
}
function studentPackageLessonSummary(stu){
  const meta=studentPackageLessonMeta(stu);
  return meta.hasPackage?meta.text:'-';
}
function studentPackageLessonMiniBar(stu){
  const meta=studentPackageLessonMeta(stu);
  if(!meta.hasPackage)return renderCourtCellText('-',false);
  const remaining=meta.remaining,total=meta.total;
  const text=`${lessonQty(remaining)}/${lessonQty(total)}`;
  return `<div class="tms-mini-bar student-package-mini" title="${text} 节"><div class="tms-mini-bar-bg" style="width:100%"></div><div class="tms-mini-bar-fill" style="width:${meta.pct}%"></div><div class="tms-mini-bar-text">${text}</div></div>`;
}
function studentBookingMembershipSummary(stu){
  const linked=courtsForStudent(stu);
  if(!linked.length)return '未关联';
  const hasMembership=linked.some(c=>!!courtMembershipAccount(c.id));
  return hasMembership?'已关联订场 · 有会员':'已关联订场';
}
function productTypeTagClass(type){
  const normalized=normalizeCourseType(type);
  if(normalized==='私教课')return 'tms-tag-tier-gold';
  if(normalized==='体验课')return 'tms-tag-tier-blue';
  if(normalized==='训练营')return 'tms-tag-green';
  if(normalized==='大师课')return 'tms-tag-tier-slate';
  return 'tms-tag-tier-slate';
}
function classDisplayName(cls){
  if(!cls)return '—';
  const classNo=String(cls.classNo||'').trim();
  const rawName=String(cls.className||'').trim();
  const productName=String(cls.productName||products.find(p=>p.id===cls.productId)?.name||'').trim();
  if(rawName&&rawName!=='-')return rawName;
  if(classNo&&productName)return `${classNo}-${productName}`;
  if(classNo)return classNo;
  if(productName)return productName;
  return '—';
}
function classDisplayStatus(cls){
  if(!cls)return '—';
  const base=String(cls.status||'已排班');
  if(base!=='已排班')return base;
  const startDate=String(cls.startDate||'').trim();
  if(startDate&&startDate>today())return '未开始';
  return '已排班';
}
function studentStatusMeta(stu){
  const activeClasses=studentActiveClasses(stu);
  const recentSchedule=schedules.filter(x=>scheduleHasStudent(x,stu)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  const lastLesson=recentSchedule?.startTime?.slice(0,10)||'';
  const hasBooking=courtsForStudent(stu).length>0;
  const hasPackage=studentHasPurchaseOrConsumption(stu);
  if(activeClasses.length||recentSchedule&&((Date.now()-new Date(recentSchedule.startTime))/(86400000)<=30))return {label:'上课中',badge:'b-green'};
  if(hasBooking&&!activeClasses.length&&!lastLesson)return {label:'仅订场',badge:'b-blue'};
  if(lastLesson&&((Date.now()-new Date(lastLesson))/(86400000)>30))return {label:'沉默30天',badge:'b-red'};
  if(studentNeedsConversion(stu))return {label:'待转化',badge:'b-amber'};
  return {label:'无班次',badge:'b-gray'};
}
function studentCompletedTrialRows(stu){
  return schedules.filter(s=>scheduleHasStudent(s,stu)&&scheduleIsTrial(s)&&effectiveScheduleStatus(s)==='已结束');
}
function studentHasPurchaseOrConsumption(stu){
  if(!stu)return false;
  if(purchases.some(p=>p.status!=='voided'&&String(p.studentId||'')===String(stu.id)))return true;
  const entRows=entitlements.filter(e=>e.studentId===stu.id&&e.status!=='voided');
  if(entRows.length)return true;
  const entIds=new Set(entRows.map(e=>e.id));
  return entitlementLedger.some(l=>entIds.has(l.entitlementId));
}
function studentNeedsConversion(stu){
  return studentCompletedTrialRows(stu).length>0&&!studentHasPurchaseOrConsumption(stu);
}
function studentNoteSummary(stu){
  const note=String(stu?.notes||'').trim();
  if(note)return note;
  const recentFeedback=studentRecentFeedbacks(stu,1)[0];
  if(recentFeedback?.needOpsFollowUp)return recentFeedback.opsFollowUpSuggestion||'需要运营跟进';
  if(recentFeedback?.conversionIntent)return `转化意向：${recentFeedback.conversionIntent}`;
  return '—';
}
function studentClassSummaryHtml(stu){
  const cls=studentClasses(stu);
  if(!cls.length)return '<div style="color:var(--td);font-size:12px">暂无班次</div>';
  return cls.map(c=>`<div style="font-size:12px;color:var(--tb);margin:3px 0">${esc(c.className)}：${lessonQty(c.usedLessons)}/${lessonQty(c.totalLessons)}，${esc(c.coach)||'未分配教练'}</div>`).join('');
}
function entitlementStatusText(e){
  if(e.status==='voided')return '已作废';
  if(e.status==='depleted')return '已用完';
  if(e.validUntil&&today()>e.validUntil)return '已过期';
  return '正常';
}
function purchaseStatusText(p){
  return p?.status==='voided'?'已作废':'正常';
}
function findEntitlementForSchedule(s){
  const ids=parseArr(s?.entitlementIds);
  const firstId=ids[0]||s?.entitlementId;
  return firstId?entitlements.find(e=>e.id===firstId):null;
}
function scheduleLessonChargeStatus(s){
  if(!s||effectiveScheduleStatus(s)==='已取消')return '不扣课';
  if(lessonValue(s.lessonCount)<=0)return '不扣课';
  const ids=parseArr(s.entitlementIds);
  const checkIds=ids.length?ids:(s.entitlementId?[s.entitlementId]:[]);
  if(!checkIds.length)return '未扣课';
  const used=checkIds.every(id=>entitlementLedger.some(l=>l.scheduleId===s.id&&l.entitlementId===id&&lessonValue(l.lessonDelta)<0));
  return used?'已扣课':'扣课异常';
}
function scheduleHasEntitlementLedger(s){
  return entitlementLedger.some(l=>l.scheduleId===s?.id);
}
function scheduleCanDeleteMistake(s){
  return !hasScheduleFeedback(s)&&!scheduleHasEntitlementLedger(s);
}
function scheduleEntitlementSummary(s){
  const ids=parseArr(s?.entitlementIds);
  const charge=scheduleLessonChargeStatus(s);
  if(ids.length>1)return `${ids.length}个课包 · ${charge}`;
  const ent=findEntitlementForSchedule(s);
  if(!ent)return charge;
  return `${ent.packageName||'—'} · ${charge} · 剩余 ${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} 节`;
}
function studentEntitlementSummaryHtml(stu){
  const rows=entitlements.filter(e=>e.studentId===stu?.id).sort((a,b)=>String(a.validUntil||'9999-12-31').localeCompare(String(b.validUntil||'9999-12-31')));
  if(!rows.length)return '<div style="color:var(--td);font-size:12px">暂无已购课包</div>';
  return rows.map(e=>{
    const used=Number(e.usedLessons)||0;
    return `<div style="border-top:0.5px solid rgba(180,83,9,.12);padding:7px 0;font-size:12px;color:var(--tb)"><div style="font-weight:700;color:var(--th)">${esc(e.packageName)||'—'} <span class="badge b-amber" style="font-size:10px">${esc(e.courseType)||'—'}</span></div><div style="margin-top:3px">剩余 ${lessonQty(e.remainingLessons)}/${lessonQty(e.totalLessons)} 节；已扣 ${lessonQty(used)} 节；有效至 ${esc(e.validUntil)||'—'}；${esc(e.timeBand)||'全天'}；${entitlementStatusText(e)}</div></div>`;
  }).join('');
}
function isHistoricalImportedLedgerRow(row){
  return !!historicalImportedLedgerMonthKey(row);
}
function entitlementLedgerSortDate(row){
  return row?.relatedDate||row?.scheduleTime||row?.createdAt||'';
}
function entitlementLedgerDisplayDate(row){
  const raw=entitlementLedgerSortDate(row);
  return raw?String(raw).slice(0,16).replace('T',' '):'-';
}
function historicalImportedLedgerMonthKey(row){
  const sourceMonth=String(row?.sourceMonth||'').trim();
  if(sourceMonth)return sourceMonth;
  if(row?.scheduleId||Number(row?.lessonDelta)>=0)return '';
  const reason=String(row?.reason||'').trim();
  const match=reason.match(/^历史导入\s*(\d{1,2})月消课$/);
  if(!match)return '';
  const year=String(row?.relatedDate||row?.createdAt||'').slice(0,4);
  if(!/^\d{4}$/.test(year))return '';
  return `${year}-${String(match[1]).padStart(2,'0')}`;
}
function importedLedgerMonthlyGroupKey(row){
  const monthKey=historicalImportedLedgerMonthKey(row);
  if(!monthKey)return '';
  return [row.entitlementId,row.purchaseId,row.reason||'',monthKey].join('|');
}
function isCurrentImportedLedgerRow(row){
  return !!(historicalImportedLedgerMonthKey(row)&&String(row?.sourceMonth||'').trim()&&String(row?.seedTag||'').startsWith('mabao-finance-seed-')&&String(row?.studentId||'').trim());
}
function filterImportedLedgerRowsForDisplay(rows){
  const grouped=new Map();
  const passthrough=[];
  (rows||[]).forEach(row=>{
    const key=importedLedgerMonthlyGroupKey(row);
    if(!key){
      passthrough.push(row);
      return;
    }
    const list=grouped.get(key)||[];
    list.push(row);
    grouped.set(key,list);
  });
  const filtered=[...passthrough];
  grouped.forEach(list=>{
    const currentRows=list.filter(isCurrentImportedLedgerRow);
    filtered.push(...(currentRows.length?currentRows:list));
  });
  return filtered;
}
function dedupeEntitlementLedgerForDisplay(rows){
  const seen=new Set();
  return filterImportedLedgerRowsForDisplay(rows).filter(row=>{
    const monthKey=historicalImportedLedgerMonthKey(row);
    const key=monthKey
      ? [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          row.lessonDelta,
          row.action||'',
          row.reason||'',
          monthKey,
          row.sourceSheet||'',
          row.notes||''
        ].join('|')
      : [
          row.entitlementId,
          row.purchaseId,
          row.studentId,
          row.scheduleId||'',
          row.lessonDelta,
          row.action||'',
          row.reason||'',
          row.relatedDate||'',
          row.sourceMonth||'',
          row.sourceSheet||'',
          row.notes||''
        ].join('|');
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
function aggregateHistoricalMonthlyLedgerRows(rows){
  const monthlyMap=new Map();
  const result=[];
  (rows||[]).forEach(row=>{
    const monthKey=historicalImportedLedgerMonthKey(row);
    if(!monthKey){
      result.push(row);
      return;
    }
    const key=[row.entitlementId,row.purchaseId,row.studentId,row.reason||'',monthKey].join('|');
    const current=monthlyMap.get(key);
    if(!current){
      monthlyMap.set(key,{...row,sourceMonth:row.sourceMonth||monthKey});
      return;
    }
    const nextDelta=(Number(current.lessonDelta)||0)+(Number(row.lessonDelta)||0);
    monthlyMap.set(key,{
      ...current,
      lessonDelta:nextDelta,
      relatedDate:String(row.relatedDate||'')>String(current.relatedDate||'')?row.relatedDate:current.relatedDate,
      createdAt:String(row.createdAt||'')>String(current.createdAt||'')?row.createdAt:current.createdAt
    });
  });
  return [...result,...monthlyMap.values()];
}
function historicalImportedLessonUnitsForStudent(stu){
  return dedupeEntitlementLedgerForDisplay(entitlementLedger.filter(row=>row.studentId===stu?.id))
    .filter(row=>!!historicalImportedLedgerMonthKey(row))
    .reduce((sum,row)=>sum+Math.abs(Math.min(0,Number(row.lessonDelta)||0)),0);
}
function studentEntitlementLedgerHtml(stu){
  const entMap=new Map(entitlements.filter(e=>e.studentId===stu?.id).map(e=>[e.id,e]));
  const rows=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger.filter(l=>entMap.has(l.entitlementId)))).sort((a,b)=>String(entitlementLedgerSortDate(b)||'').localeCompare(String(entitlementLedgerSortDate(a)||''))).slice(0,10);
  if(!rows.length)return '<div style="color:var(--td);font-size:12px">暂无扣课记录</div>';
  return rows.map(l=>{
    const ent=entMap.get(l.entitlementId)||{};
    const count=Math.abs(Number(l.lessonDelta)||0);
    const action=(Number(l.lessonDelta)||0)>0?'退回':'扣减';
    const dateText=entitlementLedgerDisplayDate(l);
    return `<div style="border-top:0.5px solid rgba(180,83,9,.12);padding:7px 0;font-size:12px;color:var(--tb)"><div style="font-weight:700;color:var(--th)">${action} ${lessonQty(count)} 节 · ${esc(ent.packageName)||'课包'}</div><div style="margin-top:3px">${esc(l.reason)||'—'} · ${dateText||'—'}</div></div>`;
  }).join('');
}
function classScheduleSummaryHtml(cls){
  if(!cls)return '';
  const rows=classSchedules(cls);
  const recent=classLastLesson(cls);
  const next=classNextLesson(cls);
  const tags=classRiskTags(cls);
  return `<div class="fgrid" style="margin-bottom:0"><div class="fg"><div class="flabel">最近上课</div><div class="finput">${recent?.startTime?fmtDt(recent.startTime):'—'}</div></div><div class="fg"><div class="flabel">下次课</div><div class="finput">${next?.startTime?fmtDt(next.startTime):'—'}</div></div><div class="fg"><div class="flabel">关联排课</div><div class="finput">${rows.length} 次</div></div><div class="fg"><div class="flabel">风险标签</div><div class="finput">${tags.length?tags.map(t=>`<span class="badge b-amber" style="font-size:10px;margin-right:4px">${esc(t)}</span>`).join(''):'—'}</div></div><div class="fg full"><button class="btn-sec" onclick="openClassScheduleList('${cls.id}')">去排课页查看</button><button class="btn-sec" style="margin-left:6px" onclick="openClassStudentList('${cls.id}')">去学员页查看</button></div></div>`;
}
function classSummaryPanelHtml(cls,readonly=false){
  if(!cls)return '';
  const rows=classSchedules(cls);
  const recent=classLastLesson(cls);
  const next=classNextLesson(cls);
  const tags=classRiskTags(cls);
  const total=lessonValue(cls.totalLessons);
  const used=lessonValue(cls.usedLessons);
  const remaining=Math.max(0,total-used);
  const studentCount=parseArr(cls.studentIds).length;
  const tagsHtml=tags.length?tags.map(t=>`<span class="tms-tag tms-tag-tier-slate">${esc(t)}</span>`).join(''):'<span style="color:var(--td);font-size:12px">当前无风险标签</span>';
  const links=readonly?'':`<div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">快捷跳转</label><div class="finput tms-form-control" style="height:auto;min-height:54px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="tms-action-link" onclick="openClassScheduleList('${cls.id}')">查看关联排课</span><span class="tms-action-link" onclick="openClassStudentList('${cls.id}')">查看关联学员</span></div></div></div>`;
  return `<div class="tms-section-header" style="margin-top:0;">班次摘要</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">最近上课</label><input class="finput tms-form-control" value="${recent?.startTime?fmtDt(recent.startTime):'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">下次课</label><input class="finput tms-form-control" value="${next?.startTime?fmtDt(next.startTime):'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">关联排课</label><input class="finput tms-form-control" value="${rows.length} 次" readonly></div><div class="tms-form-item"><label class="tms-form-label">关联学员</label><input class="finput tms-form-control" value="${studentCount} 人" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课时进度</label><input class="finput tms-form-control" value="已上 ${lessonQty(used)} / 应上 ${lessonQty(total)} / 剩余 ${lessonQty(remaining)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">风险标签</label><div class="finput tms-form-control" style="height:auto;min-height:54px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">${tagsHtml}</div></div></div>${links}`;
}
function studentOpts(sel){
  return '<option value="">— 不关联 —</option>'+students.map(s=>`<option value="${s.id}"${sel===s.id?' selected':''}>${esc(s.name)}${s.phone?' · '+esc(s.phone):''}</option>`).join('');
}
function studentChecks(ids){
  ids=parseArr(ids);
  return students.map(s=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${s.id}" class="tms-checkbox court-stu-cb" ${ids.includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无学员</span>';
}
function courtStudentSelect(sel){
  return '<option value="">— 不关联 —</option>'+students.map(s=>`<option value="${s.id}"${sel===s.id?' selected':''}>${esc(s.name)}</option>`).join('');
}
function courtStudentNames(c){
  const ids=parseArr(c?.studentIds);
  const names=ids.map(id=>students.find(s=>s.id===id)?.name).filter(Boolean);
  if(names.length)return names.join('、');
  const st=findStudentForCourt(c);
  return st?.name||'';
}
function courtDisplayName(court){
  const raw=String(court?.name||'').trim();
  if(raw)return raw;
  return courtStudentNames(court)||String(court?.phone||'').trim()||'未命名订场用户';
}
function isActiveCourtRecord(court){
  const status=String(court?.status||'active').trim();
  return status!=='inactive'&&status!=='deleted'&&!court?.deletedAt&&!court?.mergedIntoCourtId;
}
function resolveStudentIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const byId=students.find(s=>s.id===raw);
  if(byId)return byId.id;
  const byPhone=students.find(s=>String(s.phone||'').trim()===raw);
  if(byPhone)return byPhone.id;
  const byName=students.find(s=>String(s.name||'').trim()===raw);
  return byName?byName.id:'';
}
function resolveUniqueStudentIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return {id:'',reason:'学员未匹配'};
  const hits=students.filter(s=>s.id===raw||String(s.phone||'').trim()===raw||String(s.name||'').trim()===raw);
  if(hits.length===1)return {id:hits[0].id,reason:''};
  if(hits.length>1)return {id:'',reason:'学员匹配到多个，请用手机号'};
  return {id:'',reason:'学员未匹配'};
}
function resolveUniquePackageIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return {id:'',reason:'课包未匹配'};
  const byId=packages.filter(p=>p.id===raw);
  if(byId.length===1)return {id:byId[0].id,reason:''};
  const byName=packages.filter(p=>String(p.name||'').trim()===raw);
  if(byName.length===1)return {id:byName[0].id,reason:''};
  if(byName.length>1)return {id:'',reason:'课包匹配到多个，请用课包ID'};
  return {id:'',reason:'课包未匹配'};
}
function productHasReferences(productId){
  return classes.some(c=>c.productId===productId)||packages.some(p=>p.productId===productId);
}
function packageHasPurchases(packageId){
  return purchases.some(p=>p.packageId===packageId);
}
function normalizeCourtHistoryLocal(history){
  return parseArr(history).map(h=>{
    const raw=parseFloat(h.amount)||0;
    const type=h.type||'消费';
    return {...h,type,payMethod:h.payMethod||(type==='消费'&&raw<0?'储值扣款':''),category:h.category||'其他',studentId:h.studentId||'',amount:Math.abs(raw),bonusAmount:parseFloat(h.bonusAmount)||0};
  });
}
function courtFinanceLocal(c){
  const currentHistory=normalizeCourtHistoryLocal(c?.history);
  const hist=currentHistory.length?currentHistory:courtBaseHistoryForSave(c);
  if(!hist.length)return{balance:parseFloat(c?.balance)||0,totalDeposit:parseFloat(c?.totalDeposit)||0,spentAmount:parseFloat(c?.spentAmount)||0,receivedAmount:parseFloat(c?.receivedAmount??c?.totalDeposit)||0,storedValueSpent:parseFloat(c?.storedValueSpent)||0,directPaidSpent:parseFloat(c?.directPaidSpent)||0};
  const t={balance:0,totalDeposit:0,spentAmount:0,receivedAmount:0,storedValueSpent:0,directPaidSpent:0};
  hist.forEach(h=>{
    const amount=parseFloat(h.amount)||0,bonus=parseFloat(h.bonusAmount)||0;
    const isInternal=String(h.category||'').includes('内部占用');
    if(h.type==='充值'){t.totalDeposit+=amount;t.receivedAmount+=amount;t.balance+=amount+bonus;}
    else if(h.type==='消费'){if(isInternal)return;t.spentAmount+=amount;if(h.payMethod==='储值扣款'){t.storedValueSpent+=amount;t.balance-=amount;}else{t.directPaidSpent+=amount;t.receivedAmount+=amount;}}
    else if(h.type==='退款'){if(h.payMethod==='储值退款')t.balance-=amount;t.receivedAmount-=amount;}
    else if(h.type==='冲正'){t.spentAmount-=amount;if(h.payMethod==='储值扣款'){t.storedValueSpent-=amount;t.balance+=amount;}else{t.directPaidSpent-=amount;t.receivedAmount-=amount;}}
  });
  Object.keys(t).forEach(k=>t[k]=Math.round(t[k]*100)/100);
  return t;
}
function courtFinanceRevenueSummaryLocal(c){
  const hist=normalizeCourtHistoryLocal(c?.history);
  const t={storedValueBooking:0,onsiteBooking:0,proxyBooking:0,matchBooking:0,internalOccupancyCount:0,internalOccupancyAmount:0,cashReceived:0,confirmedRevenue:0,pendingRevenue:0,bookingUsageAmount:0,paidBookingCount:0};
  hist.forEach(h=>{
    if(!['消费','退款','冲正'].includes(h.type))return;
    const category=String(h.category||'');
    const payMethod=String(h.payMethod||'').trim();
    if(category.includes('内部占用')){if(h.type==='消费')t.internalOccupancyCount+=1;return;}
    if(!category.includes('订场'))return;
    const amount=parseFloat(h.amount)||0;
    const signed=h.type==='消费'?amount:-amount;
    if(h.type==='消费')t.paidBookingCount+=1;
    if(h.sourceCategory==='约球订场')t.matchBooking+=signed;
    if(payMethod==='储值扣款')t.storedValueBooking+=signed;
    else if(payMethod==='代用户订场')t.proxyBooking+=signed;
    else t.onsiteBooking+=signed;
  });
  t.cashReceived=t.onsiteBooking+t.proxyBooking;
  t.confirmedRevenue=t.storedValueBooking+t.onsiteBooking;
  t.pendingRevenue=t.proxyBooking;
  t.bookingUsageAmount=t.storedValueBooking+t.onsiteBooking+t.proxyBooking;
  Object.keys(t).forEach(k=>t[k]=Math.round(t[k]*100)/100);
  return t;
}
function membershipBookingCount(court){
  return normalizeCourtHistoryLocal(court?.history).filter(h=>h.type==='消费'&&String(h.payMethod||'').trim()==='储值扣款'&&String(h.category||'').includes('订场')).length;
}
function csvEscapeCell(value){
  const text=String(value??'');
  return `"${text.replace(/"/g,'""')}"`;
}
function decodeCourtCsvText(buf){
  try{
    return new TextDecoder('utf-8',{fatal:true}).decode(buf);
  }catch(e){
    for(const enc of ['gb18030','gbk']){
      try{return new TextDecoder(enc).decode(buf);}catch{ }
    }
    throw e;
  }
}
function extractDepositAmountFromText(text){
  const m=String(text||'').match(/已储值\s*([0-9]+(?:\.[0-9]+)?)/);
  return m?parseFloat(m[1])||0:0;
}
function importMoney(value){
  const n=parseFloat(String(value??'').replace(/,/g,''));
  return Number.isFinite(n)?n:0;
}
function hasImportValue(value){
  return value!==undefined&&value!==null&&String(value).trim()!=='';
}
function courtBaseHistoryForSave(c){
  const hist=normalizeCourtHistoryLocal(c?.history);
  if(hist.length||!c)return hist;
  const total=parseFloat(c.totalDeposit)||0,balance=parseFloat(c.balance)||0,spent=parseFloat(c.spentAmount)||0,date=c.joinDate||today();
  const stored=Math.max(0,total-balance),direct=Math.max(0,spent-stored);
  const rows=[];
  if(total>0)rows.push({id:'legacy-deposit-'+(c.id||uid()),date,type:'充值',category:'历史储值',payMethod:'历史导入',amount:total,note:'期初导入汇总',source:'import'});
  if(stored>0)rows.push({id:'legacy-stored-spent-'+(c.id||uid()),date,type:'消费',category:'历史消费',payMethod:'储值扣款',amount:stored,note:'期初导入汇总',source:'import'});
  if(direct>0)rows.push({id:'legacy-direct-spent-'+(c.id||uid()),date,type:'消费',category:'历史消费',payMethod:'历史导入',amount:direct,note:'期初导入汇总',source:'import'});
  return rows;
}
function getCourtDuplicateCandidates(input,editingId=''){
  const name=String(input?.name||'').trim();
  const phone=normalizeImportPhone(input?.phone);
  const campus=String(input?.campus||'').trim();
  return courts.filter(c=>{
    if(editingId&&c.id===editingId)return false;
    const courtPhone=normalizeImportPhone(c.phone);
    if(phone)return courtPhone&&courtPhone===phone;
    return !!name&&!!campus&&String(c.name||'').trim()===name&&String(c.campus||'').trim()===campus;
  });
}
function courtFinanceConfirmText(h,studentId){
  const st=studentId?students.find(s=>s.id===studentId):null;
  const target=st?`，关联学员：${st.name}`:'，未关联具体学员';
  if(h.type==='充值')return `确认充值 ¥${fmt(h.amount)}？这笔钱会进入当前余额，以后订场可选择“储值扣款”使用${target}。`;
  if(h.type==='退款')return h.payMethod==='储值退款'?`确认从储值余额退款 ¥${fmt(h.amount)}？会减少当前余额${target}。`:`确认退款 ¥${fmt(h.amount)}？用于记录已退回的单次付款${target}。`;
  if(h.type==='冲正')return h.payMethod==='储值扣款'?`确认冲正 ¥${fmt(h.amount)}？用于撤回一笔录错的储值扣款，余额会加回${target}。`:`确认冲正 ¥${fmt(h.amount)}？用于撤回一笔录错的单次支付消费${target}。`;
  if(String(h.category||'').includes('内部占用'))return `确认记录内部占用？该记录只占用场地时间，不计入累计消费和累计实收${h.internalReason?`，原因：${h.internalReason}`:''}。`;
  if(h.payMethod==='储值扣款')return `确认用储值余额支付 ¥${fmt(h.amount)}？会从当前余额扣除${target}。`;
  return `确认记录单次支付 ¥${fmt(h.amount)}？适用于微信、支付宝、现金或转账现场收款${target}。`;
}
