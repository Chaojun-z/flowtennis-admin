const { displayCampusName } = require('../public/assets/scripts/core/campus.js');
const axios = require('axios');
const NodeFormData = require('form-data');

const POSTER_FONT_FAMILY='ZCOOL XiaoWei';

function posterFontAttr(){
  return `font-family="${POSTER_FONT_FAMILY}"`;
}

function posterFontFiles(){
  try{
    return [require.resolve('@expo-google-fonts/zcool-xiaowei/400Regular/ZCOOLXiaoWei_400Regular.ttf')];
  }catch{
    return [];
  }
}

function parseArr(v){
  if(Array.isArray(v))return v;
  if(v==null||v==='')return [];
  if(typeof v==='string'){
    try{
      const parsed=JSON.parse(v);
      if(Array.isArray(parsed))return parsed;
    }catch{}
    return v.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
  }
  return [v];
}

function dateMs(value){
  const text=String(value||'').trim();
  if(!text)return NaN;
  const normalized=text.includes('T')?text:text.replace(' ','T');
  return new Date(normalized).getTime();
}

function posterXmlText(value=''){
  return String(value||'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
}

function posterShortText(value='',max=12){
  const text=String(value||'').trim();
  return text.length>max?`${text.slice(0,Math.max(0,max-1))}…`:text;
}

function posterScheduleDateParts(dateKeyText=''){
  const parts=String(dateKeyText||'').slice(0,10).split('-').map(n=>Number(n));
  const [year,month,day]=parts;
  const weekdaysCn=['周日','周一','周二','周三','周四','周五','周六'];
  const weekdaysEn=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const date=year&&month&&day?new Date(Date.UTC(year,month-1,day,12)):new Date();
  const weekday=date.getUTCDay();
  return {
    month:month||date.getUTCMonth()+1,
    day:day||date.getUTCDate(),
    weekdayCn:weekdaysCn[weekday],
    weekdayEn:weekdaysEn[weekday]
  };
}

function posterLessonHours(schedule={}){
  const start=dateMs(schedule.startTime);
  const end=dateMs(schedule.endTime);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return (end-start)/3600000;
  return 1;
}

function posterHoursText(value){
  const num=Math.round((Number(value)||0)*10)/10;
  return Number.isInteger(num)?String(num):String(num);
}

function posterLessonStudentCount(schedule={}){
  const explicit=Number(schedule.actualStudentCount||schedule.expectedStudentCount||schedule.studentCount||0);
  if(explicit>0)return explicit;
  const ids=parseArr(schedule.studentIds);
  return Math.max(1,ids.length||0);
}

function posterLessonStudentName(schedule={}){
  return posterShortText(schedule.studentName||parseArr(schedule.studentNames).join('、')||'学员',10);
}

function buildCoachDailyDigestPosterSvg(item={}){
  const rows=(item.schedules||[]).slice().sort((a,b)=>dateMs(a.startTime)-dateMs(b.startTime));
  const dateParts=posterScheduleDateParts(item.digestDate);
  const lessonCount=Number(item.lessonCount||rows.length)||0;
  const totalHours=rows.reduce((sum,row)=>sum+posterLessonHours(row),0);
  const lessonTop=220;
  const lessonGap=78;
  const footerTop=lessonTop+Math.max(lessonCount,1)*lessonGap+10;
  const height=footerTop+116;
  const coachName=posterShortText(item.coachName||'教练',5);
  const lessonSvg=rows.map((schedule,index)=>{
    const y=lessonTop+index*lessonGap;
    const start=String(schedule.startTime||'').slice(11,16)||'--:--';
    const end=String(schedule.endTime||'').slice(11,16)||'--:--';
    const type=posterShortText(schedule.courseType||'课程',5);
    const badgeFill=type.includes('体验')?'#EEF3EF':'none';
    const campus=displayCampusName(schedule.campus);
    const venue=schedule.venue||schedule.externalVenueName||schedule.externalCourtName||'场地待定';
    const details=`${campus||'校区待定'} - ${venue}`;
    const divider=index<rows.length-1?`<line x1="134" y1="${y+54}" x2="396" y2="${y+54}" stroke="#E0E5E0" stroke-width="0.5"/>`:'';
    return `
      <g>
        <text x="24" y="${y}" ${posterFontAttr()} font-size="15" font-weight="500" fill="#113A22">${posterXmlText(`${start} - ${end}`)}</text>
        <text x="134" y="${y}" ${posterFontAttr()} font-size="16" font-weight="500" letter-spacing="1" fill="#113A22">${posterXmlText(posterLessonStudentName(schedule))}</text>
        <rect x="222" y="${y-15}" width="${Math.max(48,type.length*18)}" height="22" rx="2" fill="${badgeFill}" stroke="#A8BAAF" stroke-width="1"/>
        <text x="236" y="${y}" ${posterFontAttr()} font-size="10" letter-spacing="1.5" fill="#113A22">${posterXmlText(type)}</text>
        <text x="134" y="${y+32}" ${posterFontAttr()} font-size="12" letter-spacing="1" fill="#7B9384">${posterXmlText(details)}</text>
        <text x="286" y="${y+32}" ${posterFontAttr()} font-size="12" fill="#D1DDD5">|</text>
        <text x="312" y="${y+32}" ${posterFontAttr()} font-size="12" fill="#2D5B3F">${posterXmlText(posterLessonStudentCount(schedule))}</text>
        <text x="328" y="${y+32}" ${posterFontAttr()} font-size="12" letter-spacing="1" fill="#7B9384">人</text>
        ${divider}
      </g>`;
  }).join('');
  const emptySvg=rows.length?'':`<text x="24" y="${lessonTop}" ${posterFontAttr()} font-size="15" fill="#7B9384">明日暂无排课</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" viewBox="0 0 420 ${height}">
    <rect width="420" height="${height}" fill="#F5F7F5"/>
    <text x="24" y="56" ${posterFontAttr()} font-size="10" letter-spacing="2" fill="#7B9384">COACH SCHEDULE</text>
    <text x="24" y="108" ${posterFontAttr()} font-size="48" font-weight="900" letter-spacing="1" fill="#113A22">${posterXmlText(coachName)}</text>
    <text x="396" y="78" text-anchor="end" ${posterFontAttr()} font-size="30" font-weight="500" fill="#113A22">${posterXmlText(`${dateParts.month} / ${dateParts.day}`)}</text>
    <text x="396" y="114" text-anchor="end" ${posterFontAttr()} font-size="11" font-weight="500" letter-spacing="2" fill="#7B9384">${posterXmlText(`${dateParts.weekdayCn}  ${dateParts.weekdayEn}`)}</text>
    <text x="24" y="164" ${posterFontAttr()} font-size="13" letter-spacing="1" fill="#666666">共计</text>
    <text x="72" y="164" ${posterFontAttr()} font-size="13" font-weight="500" fill="#113A22">${posterXmlText(lessonCount)}</text>
    <text x="92" y="164" ${posterFontAttr()} font-size="13" letter-spacing="1" fill="#666666">节</text>
    <text x="120" y="164" ${posterFontAttr()} font-size="13" fill="#CCCCCC">/</text>
    <text x="144" y="164" ${posterFontAttr()} font-size="13" font-weight="500" fill="#113A22">${posterXmlText(posterHoursText(totalHours))}</text>
    <text x="166" y="164" ${posterFontAttr()} font-size="13" letter-spacing="1" fill="#666666">课时</text>
    <line x1="24" y1="188" x2="396" y2="188" stroke="#E0E5E0" stroke-width="0.5"/>
    ${lessonSvg}${emptySvg}
    <line x1="24" y1="${footerTop}" x2="396" y2="${footerTop}" stroke="#E0E5E0" stroke-width="1"/>
    <text x="210" y="${footerTop+72}" text-anchor="middle" ${posterFontAttr()} font-size="11" font-weight="500" letter-spacing="3" fill="#113A22" opacity="0.8">网球兄弟 FLOWTENNIS</text>
  </svg>`;
}

async function buildCoachDailyDigestPosterPng(item={},options={}){
  const ResvgClass=options.Resvg||require('@resvg/resvg-js').Resvg;
  const svg=buildCoachDailyDigestPosterSvg(item);
  const fontFiles=posterFontFiles();
  const renderOptions=fontFiles.length?{
    font:{
      loadSystemFonts:false,
      fontFiles,
      defaultFontFamily:POSTER_FONT_FAMILY
    }
  }:{};
  const pngData=new ResvgClass(svg,renderOptions).render().asPng();
  return Buffer.isBuffer(pngData)?pngData:Buffer.from(pngData);
}

async function readFeishuJsonResponse(response){
  if(typeof response?.text==='function'){
    const text=await response.text();
    if(text){
      try{return JSON.parse(text);}catch{return {raw:text};}
    }
  }
  if(typeof response?.json==='function')return response.json();
  return null;
}

function feishuApiErrorDetail(data){
  return [data?.code!==undefined?`code=${data.code}`:'',data?.msg||data?.message||'',data?.raw?String(data.raw).slice(0,240):''].filter(Boolean).join(' ');
}

function assertFeishuApiOk(response,data,action){
  const detail=feishuApiErrorDetail(data);
  if(!response?.ok)throw new Error(`${action} HTTP ${response?.status||'unknown'}${detail?`：${detail}`:''}`);
  if(data&&data.code!==undefined&&data.code!==0)throw new Error(`${action}失败：${detail||data.code}`);
}

function buildFeishuImageUploadForm(imageBuffer,filename='coach-schedule.png'){
  const form=new NodeFormData();
  form.append('image_type','message');
  form.append('image',imageBuffer,{filename,contentType:'image/png'});
  return form;
}

async function postFeishuImageUpload({tenantAccessToken='',form=null,fetchImpl=fetch}={}){
  const url='https://open.feishu.cn/open-apis/im/v1/images';
  const headers={authorization:`Bearer ${tenantAccessToken}`,...(form&&typeof form.getHeaders==='function'?form.getHeaders():{})};
  if(fetchImpl&&fetchImpl!==fetch)return fetchImpl(url,{method:'POST',headers,body:form});
  const response=await axios.post(url,form,{headers,maxBodyLength:Infinity,maxContentLength:Infinity,validateStatus:()=>true});
  return {
    ok:response.status>=200&&response.status<300,
    status:response.status,
    text:async()=>typeof response.data==='string'?response.data:JSON.stringify(response.data||{}),
    json:async()=>response.data
  };
}

async function uploadFeishuImage({tenantAccessToken='',imageBuffer=null,filename='coach-schedule.png',fetchImpl=fetch}={}){
  if(!Buffer.isBuffer(imageBuffer)||!imageBuffer.length)throw new Error('缺少飞书图片内容');
  const response=await postFeishuImageUpload({tenantAccessToken,form:buildFeishuImageUploadForm(imageBuffer,filename),fetchImpl});
  const data=await readFeishuJsonResponse(response);
  assertFeishuApiOk(response,data,'飞书上传图片');
  const imageKey=String(data?.data?.image_key||data?.image_key||'').trim();
  if(!imageKey)throw new Error('飞书上传图片失败：返回 image_key 为空');
  return imageKey;
}

async function sendFeishuBotImageMessage({tenantAccessToken='',openId='',imageKey='',fetchImpl=fetch}={}){
  const response=await fetchImpl('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${tenantAccessToken}`},
    body:JSON.stringify({receive_id:openId,msg_type:'image',content:JSON.stringify({image_key:String(imageKey||'')})})
  });
  const data=await readFeishuJsonResponse(response);
  assertFeishuApiOk(response,data,'飞书私发图片');
  return data;
}

async function sendFeishuCoachDigestPosterMessage({item={},fallbackText='',tenantAccessToken='',openId='',fetchImpl=fetch,buildPosterPng=buildCoachDailyDigestPosterPng,uploadImage=uploadFeishuImage,sendImage=sendFeishuBotImageMessage,sendText=null}={}){
  try{
    const imageBuffer=await buildPosterPng(item);
    const imageKey=await uploadImage({tenantAccessToken,imageBuffer,filename:`flowtennis-${item.digestDate}-${item.coachId||item.coachName}.png`,fetchImpl});
    await sendImage({tenantAccessToken,openId,imageKey,fetchImpl});
    return {poster:true,fallback:'',posterError:''};
  }catch(err){
    if(!sendText)throw err;
    const posterError=String(err?.message||err||'');
    await sendText({tenantAccessToken,openId,text:fallbackText,fetchImpl});
    return {poster:false,fallback:'text',posterError};
  }
}

module.exports={
  buildCoachDailyDigestPosterSvg,
  buildCoachDailyDigestPosterPng,
  uploadFeishuImage,
  sendFeishuBotImageMessage,
  sendFeishuCoachDigestPosterMessage
};
