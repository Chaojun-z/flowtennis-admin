function courtDateFilterQuickOptions(){
  return ['全部','今日','本周','本月','自定义'];
}
function formatCourtDateRangeValue(start,end){
  if(!start||!end)return '全部时间';
  return `${start} 至 ${end}`;
}
function courtVenueOptionsForCampus(campusCode,currentValue=''){
  const rows=activeCampusVenueRows(campusCode);
  if(!rows.length){
    const fallback=VENUES.map(v=>({value:v,label:v}));
    if(currentValue&&!fallback.some(v=>v.value===currentValue))fallback.unshift({value:currentValue,label:currentValue});
    return fallback;
  }
  const options=rows.map(v=>({value:v.id,label:v.name}));
  const hit=rows.find(v=>String(v.id)===String(currentValue||'')||String(v.name)===String(currentValue||''));
  if(currentValue&&!hit)options.unshift({value:currentValue,label:currentValue});
  return options;
}
function courtVenueByValue(campusCode,value){
  return campusVenueByValue(campusCode,value);
}
function handleCourtFinanceCampusChange(){
  const campusValue=document.getElementById('nrCampus')?.value||'';
  const host=document.getElementById('nrVenueFieldHost');
  if(host){
    const options=courtVenueOptionsForCampus(campusValue);
    host.innerHTML=renderStandardDropdownHtml('nrVenue','场地',options,options[0]?.value||'',true);
  }
  refreshCourtFinanceQuote();
}
async function createCourtCompanionSchedule(court,record,companionCoach){
  if(!companionCoach||record.type!=='消费'||!String(record.category||'').includes('订场'))return null;
  const student=students.find(s=>s.id===record.studentId);
  const studentIds=record.studentId?[record.studentId]:[];
  return apiCall('POST','/schedule',{
    startTime:`${record.date} ${record.startTime}`,
    endTime:`${record.date} ${record.endTime}`,
    classId:'',
    studentIds,
    expectedStudentIds:studentIds,
    absentStudentIds:[],
    studentName:student?.name||courtDisplayName(court),
    courseType:record.courseType||'陪打',
    coach:companionCoach,
    coachId:companionCoach,
    venue:record.venue,
    venueId:record.venueId||'',
    venueSpaceType:record.venueSpaceType||'',
    campus:record.campus,
    lessonCount:0,
    status:'已排课',
    entitlementId:'',
    packageName:'',
    purchaseId:'',
    timeBand:'',
    cancelReason:'',
    notifyStatus:'未通知',
    confirmStatus:'待确认',
    scheduleSource:record.scheduleSource||'订场陪打',
    notes:record.note?`订场陪打：${record.note}`:'订场陪打'
  });
}
function courtBookingRecordsTableHtml(hist){
  const rows=(Array.isArray(hist)?hist:[]).filter(h=>String(h.category||h.businessTypeLevel2||'').includes('订场')||h.category==='内部占用');
  return renderDetailDrawerTable({
    minWidth:'660px',
    columns:[
      {label:'订场日期',key:'date',width:'90px',render:h=>h.bookingDate||h.occurredDate||h.date||'-'},
      {label:'时间',key:'time',width:'150px',render:h=>h.startTime&&h.endTime?`${h.startTime}-${h.endTime}`:'-'},
      {label:'场地',key:'venue',width:'70px',render:h=>h.venue||'-'},
      {label:'类型',key:'category',width:'80px',render:h=>h.category||h.businessTypeLevel2||'-'},
      {label:'支付方式',key:'payMethod',width:'80px',render:h=>h.payMethod||'-'},
      {label:'金额',key:'amount',width:'70px',render:h=>`¥${fmt(Math.abs(parseFloat(h.amount)||0))}`},
      {label:'备注',key:'note',width:'120px',cellClassName:'membership-booking-note-cell',render:h=>courtBookingHumanNote(h)}
    ],
    rows,
    emptyText:'暂无订场记录'
  });
}
function courtBookingHumanNote(record){
  const raw=String(record?.note||'').trim();
  if(!raw)return '-';
  const systemPattern=/(订场收入细项修数|修数|会员订场修正|会员订场补录|订场补录|马坡补账|私教课CSV.*导入|正确表|确认表|系统|导入|修正|补账|补录|历史迁移|数据修复)/;
  const importSummaryPattern=/(（\d+(?:\.\d+)?次，\d+(?:\.\d+)?元）#\d+|#\d+\s*\/\s*\d{4}-\d{2}-\d{2}|网球兄弟.*csv#\d+|来源\s*[^；;]*\.csv#\d+)/;
  if(systemPattern.test(raw)||importSummaryPattern.test(raw))return '-';
  const parts=raw.split(/[\/｜|]/).map(x=>x.trim()).filter(Boolean);
  if(parts.length>1){
    const humanParts=parts.filter(part=>!systemPattern.test(part));
    return humanParts.join(' / ')||'-';
  }
  return systemPattern.test(raw)?'-':raw;
}
function courtRowHistoryForFilter(row){
  return Array.isArray(row?.history)?row.history:[];
}
function courtDateKeyForFilter(value){
  const text=String(value||'').trim();
  if(!text)return '';
  const match=text.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if(match)return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
  const shortMatch=text.match(/(^|[^\d])(\d{1,2})[月./-](\d{1,2})(?:日)?/);
  if(shortMatch){
    const fallbackYear=String(today()).slice(0,4);
    return `${fallbackYear}-${String(shortMatch[2]).padStart(2,'0')}-${String(shortMatch[3]).padStart(2,'0')}`;
  }
  const parsed=new Date(text.replace(' ','T'));
  if(Number.isNaN(parsed.getTime()))return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
}
function courtDateWithinRange(date,start,end){
  const raw=courtDateKeyForFilter(date);
  if(!raw)return false;
  if(start&&raw<start)return false;
  if(end&&raw>end)return false;
  return true;
}
function courtHistoryDate(row){
  return courtDateKeyForFilter(row?.occurredDate||row?.date||row?.businessDate||row?.bookingDate||row?.startDate||row?.consumedAt||row?.usedAt||row?.operationAt||row?.recordedAt||row?.createdAt||row?.startTime||'');
}
function courtDateMatchedBookingHistory(row,start,end){
  if(!courtDateWithinRange(courtHistoryDate(row),start,end))return false;
  if(typeof isCourtBookingHistoryRow==='function')return isCourtBookingHistoryRow(row);
  return String(row?.category||'').includes('订场')||!!(row?.startTime&&row?.endTime);
}
function applyCourtDateRangeFilter(items=[],range={}){
  const start=String(range?.startDate||'').trim();
  const end=String(range?.endDate||'').trim();
  if(!start&&!end)return items;
  return (items||[]).map(item=>{
    const rawHistory=courtRowHistoryForFilter(item);
    const history=typeof normalizeCourtHistoryLocal==='function'?normalizeCourtHistoryLocal(rawHistory):rawHistory;
    const filteredHistory=history.filter(row=>courtDateWithinRange(courtHistoryDate(row),start,end));
    const filteredBookingHistory=history.filter(row=>courtDateMatchedBookingHistory(row,start,end));
    const hasBookingMetrics=Number(item?.bookingCount)||Number(item?.bookingAmount)||Number(item?.bookingHours);
    const fallbackBookingMatched=courtDateWithinRange(item?.lastBookingDate,start,end)&&hasBookingMetrics;
    const shouldFallbackToItemMetrics=!filteredBookingHistory.length&&fallbackBookingMatched;
    const booking=shouldFallbackToItemMetrics
      ? {
          count:Number(item?.bookingCount)||0,
          amount:Number(item?.bookingAmount)||0,
          hours:Number(item?.bookingHours)||0,
          memberCount:Number(item?.memberBookingCount)||0,
          memberAmount:Number(item?.memberBookingAmount)||0,
          guestCount:Number(item?.guestBookingCount)||Math.max(0,(Number(item?.bookingCount)||0)-(Number(item?.memberBookingCount)||0)),
          guestAmount:Number(item?.guestBookingAmount)||Math.max(0,(Number(item?.bookingAmount)||0)-(Number(item?.memberBookingAmount)||0)),
          lastDate:String(item?.lastBookingDate||'').trim()
        }
      : courtBookingSummary({history:filteredBookingHistory});
    if(!booking.lastDate){
      booking.lastDate=filteredBookingHistory.map(courtHistoryDate).filter(Boolean).sort().pop()||'';
    }
    const hasDateMatchedHistory=filteredBookingHistory.length>0;
    const hasDateMatchedBooking=shouldFallbackToItemMetrics;
    return {
      ...item,
      history:shouldFallbackToItemMetrics?history:filteredHistory,
      bookingCount:booking.count,
      bookingHours:booking.hours,
      memberBookingCount:booking.memberCount,
      memberBookingAmount:booking.memberAmount,
      guestBookingCount:booking.guestCount,
      guestBookingAmount:booking.guestAmount,
      bookingAmount:booking.amount,
      lastBookingDate:booking.lastDate||item?.lastBookingDate||'',
      __hasDateMatchedHistory:hasDateMatchedHistory||hasDateMatchedBooking
    };
  }).filter(item=>item.__hasDateMatchedHistory);
}
