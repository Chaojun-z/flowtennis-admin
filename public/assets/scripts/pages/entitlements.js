function syncEntitlementFilters(){
  const statusValue=document.getElementById('entStatusFilter')?.value||'';
  const statusOptions=[{value:'',label:'全部状态'},...ENTITLEMENT_STATUS_OPTIONS];
  const host=document.getElementById('entStatusFilterHost');
  if(host)host.innerHTML=renderStandardDropdownHtml('entStatusFilter','全部状态',statusOptions,statusValue,false,'renderEntitlements');
}
function renderEntitlements(){
  syncEntitlementFilters();
  const q=(document.getElementById('entSearch')?.value||'').toLowerCase();
  const sf=document.getElementById('entStatusFilter')?.value||'';
  const list=entitlementUnifiedRows().filter(e=>{const status=e.status||'active';if(!searchHit(q,e.studentName,e.packageName,e.courseType,e.timeBand,e.validUntil))return false;if(sf&&status!==sf)return false;return true;}).sort((a,b)=>String(a.validUntil||'9999-12-31').localeCompare(String(b.validUntil||'9999-12-31')));
  document.getElementById('entitlementTbody').innerHTML=list.length?list.map(e=>`<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(e.studentName)||'—'}</div></td><td><div class="tms-text-primary">${esc(standardPackageLabel(e,true)||e.packageName||'—')}</div></td><td>${renderStandardCellText(e.courseType,false)}</td><td>${renderStandardCellText(`${parseInt(e.remainingLessons)||0}/${parseInt(e.totalLessons)||0} 节`,false)}</td><td>${renderStandardCellText(`${e.validFrom||'—'} ~ ${e.validUntil||'—'}`,false)}</td><td>${renderStandardCellText(e.timeBand||'全天',false)}</td><td class="tms-sticky-r" style="padding-right:20px"><span class="tms-tag ${e.status==='voided'?'tms-tag-tier-slate':e.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green'}">${entitlementStatusText(e)}</span></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty"><p>暂无课包余额</p></div></td></tr>';
  renderEntitlementMobileCards(list);
}
function renderEntitlementMobileCards(list){
  const host=document.getElementById('entitlementMobileCards');
  if(!host)return;
  if(!list.length){
    host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无课包余额</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div>';
    return;
  }
  host.innerHTML=list.map(e=>`<article class="admin-h5-list-card admin-h5-entitlement-card">
    <div class="admin-h5-card-head">
      <div><strong>${esc(e.studentName||'—')}</strong><span>${esc(standardPackageLabel(e,true)||e.packageName||'—')}</span></div>
      <span class="tms-tag ${e.status==='voided'?'tms-tag-tier-slate':e.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green'}">${esc(entitlementStatusText(e))}</span>
    </div>
    <div class="admin-h5-card-grid">
      <span><b>课程类型</b>${esc(e.courseType||'-')}</span>
      <span><b>课时余额</b>${esc(`${parseInt(e.remainingLessons)||0}/${parseInt(e.totalLessons)||0} 节`)}</span>
      <span><b>有效期</b>${esc(`${e.validFrom||'—'} ~ ${e.validUntil||'—'}`)}</span>
      <span><b>时段</b>${esc(e.timeBand||'全天')}</span>
    </div>
  </article>`).join('');
}
