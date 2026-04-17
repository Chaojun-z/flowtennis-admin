function syncEntitlementFilters(){
  const statusValue=document.getElementById('entStatusFilter')?.value||'';
  const statusOptions=[{value:'',label:'全部状态'},{value:'active',label:'正常'},{value:'depleted',label:'已用完'},{value:'voided',label:'已作废'}];
  const host=document.getElementById('entStatusFilterHost');
  if(host)host.innerHTML=renderCourtDropdownHtml('entStatusFilter','全部状态',statusOptions,statusValue,false,'renderEntitlements');
}
function renderEntitlements(){
  syncEntitlementFilters();
  const q=(document.getElementById('entSearch')?.value||'').toLowerCase();
  const sf=document.getElementById('entStatusFilter')?.value||'';
  const list=entitlements.filter(e=>{const status=e.status||'active';if(!searchHit(q,e.studentName,e.packageName,e.courseType,e.timeBand,e.validUntil))return false;if(sf&&status!==sf)return false;return true;}).sort((a,b)=>String(a.validUntil||'9999-12-31').localeCompare(String(b.validUntil||'9999-12-31')));
  document.getElementById('entitlementTbody').innerHTML=list.length?list.map(e=>`<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(e.studentName)||'—'}</div></td><td><div class="tms-text-primary">${esc(e.packageName)||'—'}</div></td><td>${renderCourtCellText(e.courseType,false)}</td><td>${renderCourtCellText(`${parseInt(e.remainingLessons)||0}/${parseInt(e.totalLessons)||0} 节`,false)}</td><td>${renderCourtCellText(`${e.validFrom||'—'} ~ ${e.validUntil||'—'}`,false)}</td><td>${renderCourtCellText(e.timeBand||'全天',false)}</td><td class="tms-sticky-r" style="padding-right:20px"><span class="tms-tag ${e.status==='voided'?'tms-tag-tier-slate':e.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green'}">${entitlementStatusText(e)}</span></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty"><p>暂无课包余额</p></div></td></tr>';
}
