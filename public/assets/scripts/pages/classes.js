// ===== 班次管理 =====
let clsCounter=0;
function initClsCounter(){const nums=classes.map(c=>{const m=(c.classNo||'').match(/CLS(\d+)/);return m?parseInt(m[1]):0;});clsCounter=nums.length?Math.max(...nums):0;}
function nextClassNo(){clsCounter++;return 'CLS'+String(clsCounter).padStart(4,'0');}
function classSchedules(cls){return schedules.filter(s=>s.classId===cls?.id&&s.status!=='已取消'&&s.startTime).sort((a,b)=>new Date(a.startTime)-new Date(b.startTime));}
function classHasSchedules(cls){return schedules.some(s=>s.classId===cls?.id);}
function classLastLesson(cls){
  const now=Date.now();
  return classSchedules(cls).filter(s=>new Date(String(s.startTime).replace(' ','T')).getTime()<=now).pop()||null;
}
function classNextLesson(cls){
  const now=Date.now();
  return classSchedules(cls).find(s=>new Date(String(s.startTime).replace(' ','T')).getTime()>=now)||null;
}
function classHasNextLessonWithinDays(cls,days){
  const now=Date.now(),limit=now+(parseInt(days)||0)*86400000;
  return classSchedules(cls).some(s=>{const t=new Date(String(s.startTime).replace(' ','T')).getTime();return t>=now&&t<=limit;});
}
function classRemainingLessons(cls){return lessonValue(cls?.totalLessons)-lessonValue(cls?.usedLessons);}
function classRiskTags(cls){
  const tags=[],status=cls?.status||'已排班',total=lessonValue(cls?.totalLessons),rem=classRemainingLessons(cls),last=classLastLesson(cls),now=Date.now();
  const alreadyStarted=!cls?.startDate||String(cls.startDate)<=today();
  if(status==='已排班'&&total>0&&rem<=3)tags.push('即将结课');
  if(status==='已排班'&&!classHasNextLessonWithinDays(cls,7))tags.push('未安排下次课');
  if(status==='已排班'&&alreadyStarted&&(!last||now-new Date(String(last.startTime).replace(' ','T')).getTime()>14*86400000))tags.push('长期未上课');
  return tags;
}
function classTagBadges(cls){
  const tags=classRiskTags(cls);
  return tags.length?tags.map(t=>`<span class="badge b-amber" style="font-size:10px;margin:1px">${esc(t)}</span>`).join(' '):'<span style="color:var(--td);font-size:12px">—</span>';
}
function openClassScheduleList(classId){
  const cls=classes.find(c=>c.id===classId);if(!cls)return;
  closeModal();goPage('schedule');
  const el=document.getElementById('schSearch');if(el){el.value=cls.className||cls.classNo||'';schPage=1;renderSchedule();}
}
function openClassStudentList(classId){
  const cls=classes.find(c=>c.id===classId);if(!cls)return;
  const keyword=parseArr(cls.studentIds).map(id=>students.find(s=>s.id===id)?.name).filter(Boolean)[0]||'';
  closeModal();goPage('students');
  const el=document.getElementById('stuSearch');if(el){el.value=keyword||cls.className||'';stuPage=1;renderStudents();}
}
function syncClassFilterOptions(){
  const statusValue=document.getElementById('clsStatusFilter')?.value||'';
  const campusValue=document.getElementById('clsCampusFilter')?.value||'';
  const coachValue=document.getElementById('clsCoachFilter')?.value||'';
  const typeValue=document.getElementById('clsTypeFilter')?.value||'';
  const statusOptions=[{value:'',label:'全部状态'},{value:'已排班',label:'已排班'},{value:'已取消',label:'已取消'},{value:'已结课',label:'已结课'}];
  const campusOptions=[{value:'',label:'全部校区'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
  const coachOptions=[{value:'',label:'全部教练'},...activeCoachNames().map(c=>({value:c,label:c}))];
  const typeOptions=[{value:'',label:'全部课程'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const wrapMap=[
    ['clsStatusFilterHost','clsStatusFilter','全部状态',statusOptions,statusValue],
    ['clsCampusFilterHost','clsCampusFilter','全部校区',campusOptions,campusValue],
    ['clsCoachFilterHost','clsCoachFilter','全部教练',coachOptions,coachValue],
    ['clsTypeFilterHost','clsTypeFilter','全部课程',typeOptions,typeValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderClasses');
  });
}
function renderClasses(){
  syncClassFilterOptions();
  const q=(document.getElementById('clsSearch')?.value||'').toLowerCase();
  const sf=document.getElementById('clsStatusFilter')?.value||'';
  const cf=document.getElementById('clsCampusFilter')?.value||'';
  const coachF=document.getElementById('clsCoachFilter')?.value||'';
  const typeF=document.getElementById('clsTypeFilter')?.value||'';
  let list=classes.filter(c=>{
    if(sf&&c.status!==sf)return false;
    if(cf&&c.campus!==cf)return false;
    if(coachF&&c.coach!==coachF)return false;
    const ids=parseArr(c.studentIds);
    const stuText=ids.map(sid=>{const st=students.find(x=>x.id===sid);return [st?.name||sid,st?.phone||'',courtsForStudent(st).map(x=>`${x.name} ${x.phone||''}`).join(' ')].join(' ');}).join(' ');
    const prod=products.find(x=>x.id===c.productId);
    if(typeF&&prod?.type!==typeF)return false;
    const tags=classRiskTags(c);
    return searchHit(q,c.className,c.classNo,c.coach,c.productName,prod?.type,prod?.lessons,prod?.price,c.status,c.notes,c.opsNote,c.sourceType,cn(c.campus),stuText,tags.join(' '));
  });
  const active=classes.filter(c=>c.status==='已排班').length,ending=classes.filter(c=>classRiskTags(c).includes('即将结课')).length,noNext=classes.filter(c=>classRiskTags(c).includes('未安排下次课')).length,silent=classes.filter(c=>classRiskTags(c).includes('长期未上课')).length;
  document.getElementById('classStatsRow').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">班次总数</div><div class="tms-stat-value">${classes.length}<span>个</span></div><div class="tms-stat-sub">进行中 ${active}</div></div><div class="tms-stat-card"><div class="tms-stat-label">即将结课</div><div class="tms-stat-value">${ending}<span>个</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">未排下次课</div><div class="tms-stat-value">${noNext}<span>个</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">长期未上</div><div class="tms-stat-value">${silent}<span>个</span></div></div>`;
  const total=list.length,pages=Math.ceil(total/PAGE_SIZE);
  if(clsPage>Math.max(pages,1))clsPage=1;
  const slice=list.slice((clsPage-1)*PAGE_SIZE,clsPage*PAGE_SIZE);
  const pager=document.querySelector('#page-classes .tms-pagination');
  if(pager)pager.style.display=pages>1?'flex':'none';
  document.getElementById('clsPagerInfo').textContent=`共 ${total} 条`;
  document.getElementById('clsPagerBtns').innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<div class="tms-page-btn${i+1===clsPage?' active':''}" onclick="clsPage=${i+1};renderClasses()">${i+1}</div>`).join('');
  const ss={'未开始':'tms-tag-tier-gold','已排班':'tms-tag-tier-blue','已取消':'tms-tag-tier-slate','已结课':'tms-tag-green'};
  document.getElementById('clsTbody').innerHTML=slice.length?slice.map(c=>{
    const prod=products.find(x=>x.id===c.productId);
    const ids=parseArr(c.studentIds);
    const names=ids.map(sid=>{const st=students.find(x=>x.id===sid);return st?esc(st.name):esc(sid);}).join('、')||'—';
    const days=parseArr(c.scheduleDays).join(' ')||'—';
    const tl=lessonValue(c.totalLessons),ul=lessonValue(c.usedLessons),rem=tl-ul;
    const pct=tl>0?Math.round(rem/tl*100):0,pc=pct>40?'pf-gold':pct>15?'pf-warn':'pf-red';
    const last=classLastLesson(c),next=classNextLesson(c);
    const displayName=classDisplayName(c);
    const displayStatus=classDisplayStatus(c);
    const typeText=prod?.type||c.sourceType||'-';
    return `<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(displayName)}</div></td><td>${renderCourtCellText(c.classNo,false)}</td><td><div class="tms-text-primary">${esc(prod?.name||c.productName||'-')}</div></td><td><span class="tms-tag ${productTypeTagClass(typeText)}">${esc(typeText)}</span></td><td>${renderCourtCellText(c.startDate,false)}</td><td>${renderCourtCellText(c.endDate,false)}</td><td>${renderCourtCellText(cn(c.campus))}</td><td><div class="tms-text-remark" title="${names}">${names}</div></td><td>${renderCourtCellText(c.coach)}</td><td>${renderCourtCellText(days)}</td><td>${renderCourtCellText(last?.startTime?fmtDt(last.startTime):'-',false)}</td><td>${renderCourtCellText(next?.startTime?fmtDt(next.startTime):'-',false)}</td><td><div class="prog-wrap"><div class="prog-track"><div class="prog-fill ${pc}" style="width:${Math.max(0,Math.min(100,pct))}%"></div></div><span class="prog-txt">${lessonQty(ul)}/${lessonQty(tl)} 剩${lessonQty(rem)}</span></div></td><td><span class="tms-tag ${ss[displayStatus]||'tms-tag-tier-slate'}">${displayStatus}</span></td><td class="tms-sticky-r tms-action-cell" style="width:160px;padding-right:20px"><span class="tms-action-link" onclick="openClassDetail('${c.id}')">查看</span><span class="tms-action-link" onclick="openClassModal('${c.id}')">编辑</span><span class="tms-action-link" onclick="confirmDel('${c.id}','${esc(displayName)}','class')">删除</span></td></tr>`;
  }).join(''):'<tr><td colspan="15"><div class="empty"><div class="empty-ico">📋</div><p>暂无班次</p></div></td></tr>';
}
function openClassDetail(id){
  const c=classes.find(x=>x.id===id);if(!c)return;
  const prod=products.find(x=>x.id===c.productId);
  const studentText=parseArr(c.studentIds).map(sid=>students.find(s=>s.id===sid)?.name||sid).join('、')||'—';
  const body=`${classSummaryPanelHtml(c,true)}<div class="tms-section-header">班次信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">班次名称</label><input class="finput tms-form-control" value="${esc(c.className)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次编号</label><input class="finput tms-form-control" value="${esc(c.classNo)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">关联课程</label><input class="finput tms-form-control" value="${esc(prod?.name||c.productName)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">课程类型</label><input class="finput tms-form-control" value="${esc(prod?.type||c.sourceType)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所属校区</label><input class="finput tms-form-control" value="${cn(c.campus)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">预设教练</label><input class="finput tms-form-control" value="${esc(c.coach)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">开始日期</label><input class="finput tms-form-control" value="${esc(c.startDate)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">结束日期</label><input class="finput tms-form-control" value="${esc(c.endDate)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">上课日</label><input class="finput tms-form-control" value="${esc(parseArr(c.scheduleDays).join('、'))||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">状态</label><input class="finput tms-form-control" value="${esc(c.status)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">${esc(studentText)}</div></div><div class="tms-form-item"><label class="tms-form-label">班次来源/类型</label><input class="finput tms-form-control" value="${esc(c.sourceType)||'—'}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">运营备注</label><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${esc(c.opsNote)||'—'}</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-primary" onclick="openClassModal('${c.id}')">编辑班次</button>`;
  setCourtModalFrame('查看班次',body,footer,'modal-wide');
}
function openClassModal(id){
  editId=id;const c=id?classes.find(x=>x.id===id):null;
  const sIds=c?parseArr(c.studentIds):[];const days=c?parseArr(c.scheduleDays):[];
  const locked=!!(c&&classHasSchedules(c));
  const rem=classRemainingLessons(c);
  const sourceTypes=['新签','续班','体验转化','老学员加课','其他'];
  document.getElementById('mTitle').textContent=id?'编辑班次':'新建班次';
  const po=products.map(p=>`<option value="${p.id}"${rv(c,'productId')===p.id?' selected':''}>${esc(p.name)}（${p.type}，${p.lessons}节）</option>`).join('');
  const co=activeCoachNames().map(x=>`<option value="${x}"${rv(c,'coach')===x?' selected':''}>${x}</option>`).join('');
  const sc=students.map(s=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${s.id}" class="tms-checkbox cls-stu-cb" ${sIds.includes(s.id)?'checked':''}${locked?' disabled':''}><span>${esc(s.name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无学员</span>';
  const dc=WEEKDAYS.map(d=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${d}" class="tms-checkbox cls-day-cb" ${days.includes(d)?'checked':''}><span>${d}</span></label>`).join('');
  const previewName=c?esc(c.className):'<span style="color:var(--td)">先选择课程产品，保存后自动生成班次编号和名称</span>';
  const noProductHint=products.length?'':`<div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.2);border-radius:9px;padding:10px 13px;font-size:12px;color:var(--ts);margin-bottom:12px">请先到「课程产品」创建课程产品，再回来创建班次。<button class="btn-sec" style="display:inline-flex;margin-left:8px;padding:5px 10px" onclick="closeModal();goPage('products')">去创建</button></div>`;
  const lockHint=locked?`<div style="background:rgba(220,38,38,0.06);border:0.5px solid rgba(220,38,38,0.18);border-radius:9px;padding:10px 13px;font-size:12px;color:#b91c1c;margin-bottom:12px">该班次已有排课，课程、学员、教练、校区和总课时已锁定，避免影响历史排课和课时口径。</div>`:'';
  const detail=id?classSummaryPanelHtml(c,false):'';
  const sourceOpts=sourceTypes.map(t=>`<option value="${t}"${rv(c,'sourceType')===t?' selected':''}>${t}</option>`).join('');
  const productOptions=[{value:'',label:'— 选择 —'},...products.map(p=>({value:p.id,label:`${p.name}（${p.type}，${p.lessons}节）`}))];
  const coachOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(x=>({value:x,label:x}))];
  const campusOptions=[...campuses.map(ca=>({value:ca.code||ca.id,label:ca.name||ca.code||ca.id}))];
  const statusOptions=CLS_STATUSES.map(t=>({value:t,label:t}));
  const sourceOptions=[{value:'',label:'— 未设置 —'},...sourceTypes.map(t=>({value:t,label:t}))];
  const body=`${noProductHint}${lockHint}${detail}<div class="tms-section-header" style="margin-top:${id?'18px':'0'};">班次信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">班次名称</label><div id="cls_name_preview" class="finput tms-form-control" style="min-height:52px;background:#FDF7F2;display:flex;align-items:center;line-height:1.6">${previewName}</div><div style="margin-top:8px;font-size:12px;color:var(--ts)">班次编号和班次名称在保存时生成，格式为「班次编号-课程名」。</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">关联课程产品 *</label>${renderCourtDropdownHtml('cls_prodId','选择课程产品',productOptions,rv(c,'productId'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">选择学员（多选）</label><div class="tms-checkbox-matrix">${sc}</div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">预设教练</label>${renderCourtDropdownHtml('cls_coach','预设教练',coachOptions,rv(c,'coach'),true)}</div><div class="tms-form-item"><label class="tms-form-label">所属校区</label>${renderCourtDropdownHtml('cls_campus','校区',campusOptions,rv(c,'campus'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">开始日期</label>${courtDateButtonHtml('cls_start',rv(c,'startDate',today()),'开始日期')}</div><div class="tms-form-item"><label class="tms-form-label">结束日期</label>${courtDateButtonHtml('cls_end',rv(c,'endDate',''),'结束日期')}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">上课日（多选）</label><div class="tms-checkbox-matrix" id="cls_days_wrap">${dc}</div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">应上课时</label><input type="number" class="finput tms-form-control" id="cls_total" value="${rv(c,'totalLessons',0)}"${locked?' readonly':''}></div><div class="tms-form-item"><label class="tms-form-label">已上课时</label><input type="number" class="finput tms-form-control" id="cls_used" value="${rv(c,'usedLessons',0)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">剩余课时</label><input type="text" class="finput tms-form-control" id="cls_remaining" value="${Math.max(0,rem||0)} 节" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">课时说明</label><div class="finput tms-form-control" style="height:auto;min-height:52px;white-space:normal;line-height:1.7">已上课时由排课自动累加，剩余课时会跟着自动计算。这里不开放手动输入，避免和排课、学习计划的课时口径打架。</div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('cls_status','状态',statusOptions,rv(c,'status','已排班'),true)}</div><div class="tms-form-item"><label class="tms-form-label">班次来源/类型</label>${renderCourtDropdownHtml('cls_source','班次来源/类型',sourceOptions,rv(c,'sourceType'),true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">运营备注</label><textarea class="finput tms-form-control" id="cls_ops_note" placeholder="例如：家长已沟通续班、待拼班、暂停原因、需要运营跟进">${esc(rv(c,'opsNote'))}</textarea></div></div>`;
  const footer=`<div style="display:flex;gap:12px;margin-left:auto;"><button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="classSaveBtn" onclick="saveClass()">保存</button></div>`;
  setCourtModalFrame(id?'编辑班次':'新建班次',body,footer,'modal-wide');
  if(locked){
    ['cls_prodId_dropdown','cls_coach_dropdown','cls_campus_dropdown'].forEach(dropdownId=>{
      const el=document.getElementById(dropdownId);
      if(el){el.style.pointerEvents='none';el.style.opacity='0.6';}
    });
  }
  // 课程变更 → 自动更新班次名称预览 + 课时
  const prodEl=document.getElementById('cls_prodId');
  prodEl.addEventListener('change',function(){
    const p=products.find(x=>x.id===this.value);
    updateClsNamePreview();
    if(p&&!id){
      document.getElementById('cls_total').value=p.lessons||0;
      syncClassLessonPreview();
    }
  });
  // 开始日期变更 → 自动勾选对应星期
  document.getElementById('cls_start').addEventListener('change',function(){
    if(!this.value)return;
    const d=new Date(this.value);const dayIdx=d.getDay();
    const wdMap=[6,0,1,2,3,4,5]; // JS Sunday=0 → 周日=index6, Monday=1 → 周一=index0
    const targetDay=WEEKDAYS[wdMap[dayIdx]];
    document.querySelectorAll('.cls-day-cb').forEach(cb=>{if(cb.value===targetDay)cb.checked=true;});
  });
  // 新建时如已选课程，立即预览
  document.getElementById('cls_total')?.addEventListener('input',syncClassLessonPreview);
  if(!id)updateClsNamePreview();
  syncClassLessonPreview();
}
function updateClsNamePreview(){
  const el=document.getElementById('cls_name_preview');if(!el)return;
  const prodId=document.getElementById('cls_prodId').value;
  const prod=products.find(x=>x.id===prodId);
  if(prod){
    const existing=editId?classes.find(x=>x.id===editId):null;
    const no=existing?.classNo||'保存后生成编号';
    el.innerHTML=`<span style="font-weight:600">${esc(no)}-${esc(prod.name)}</span>`;
  }else{
    el.innerHTML='<span style="color:var(--td)">先选择课程产品，保存后自动生成班次编号和名称</span>';
  }
}
function syncClassLessonPreview(){
  const total=parseInt(document.getElementById('cls_total')?.value)||0;
  const used=parseInt(document.getElementById('cls_used')?.value)||0;
  const remaining=Math.max(0,total-used);
  const el=document.getElementById('cls_remaining');
  if(el)el.value=`${remaining} 节`;
}
function normalizeClassRecord(cls,data={}){
  if(!cls)return cls;
  const productName=cls.productName||data.productName||products.find(p=>p.id===(cls.productId||data.productId))?.name||'';
  const classNo=cls.classNo||'';
  const className=(String(cls.className||'').trim()&&String(cls.className||'').trim()!=='-')
    ?cls.className
    :(classNo&&productName?`${classNo}-${productName}`:cls.className||'');
  return {...cls,productName,className};
}
async function saveClass(){
  const productId=document.getElementById('cls_prodId').value;
  if(!productId){toast('请选择课程产品','warn');return;}
  const btn=document.getElementById('classSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const studentIds=[...document.querySelectorAll('.cls-stu-cb:checked')].map(cb=>cb.value);
  const scheduleDays=[...document.querySelectorAll('.cls-day-cb:checked')].map(cb=>cb.value);
  const prod=products.find(p=>p.id===productId);
  const existing=editId?classes.find(x=>x.id===editId):null;
  const totalLessons=parseInt(document.getElementById('cls_total').value)||0;
  if(prod?.maxStudents&&studentIds.length>(parseInt(prod.maxStudents)||0)){toast('选择学员数超过课程产品人数上限','warn');btn.disabled=false;btn.textContent='保存';return;}
  const startDate=document.getElementById('cls_start').value,endDate=document.getElementById('cls_end').value;
  if(endDate&&startDate&&endDate<startDate){toast('结束日期不能早于开始日期','warn');btn.disabled=false;btn.textContent='保存';return;}
  const data={productId,productName:prod?prod.name:'',studentIds,coach:document.getElementById('cls_coach').value,campus:document.getElementById('cls_campus').value,startDate,endDate,scheduleDays,totalLessons,status:document.getElementById('cls_status').value,sourceType:document.getElementById('cls_source')?.value||'',opsNote:document.getElementById('cls_ops_note')?.value.trim()||'',updatedBy:currentUser?.name||''};
  try{
    let res;
    if(editId){
      res=await apiCall('PUT','/classes/'+editId,data);
      const saved=normalizeClassRecord(res.class||res,data);
      const i=classes.findIndex(x=>x.id===editId);
      classes[i]=saved;
    }
    else{
      res=await apiCall('POST','/classes',data);
      classes.unshift(normalizeClassRecord(res.class||res,data));
    }
    if(Array.isArray(res?.plans)){
      res.plans.forEach(p=>{const i=plans.findIndex(x=>x.id===p.id);if(i>=0)plans[i]=p;else plans.unshift(p);});
    }
    closeModal();toast(editId?'班次修改成功 ✓':'班次创建成功 ✓','success');renderClasses();renderPlans();renderStudents();
  }catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
