const axios = require('axios');
const NodeFormData = require('form-data');

const POSTER_FONT_FAMILY='Noto Sans SC';

function posterFontAttr(){
  return `font-family="${POSTER_FONT_FAMILY}"`;
}

function posterFontFiles(){
  try{
    return [
      require.resolve('@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf'),
      require.resolve('@expo-google-fonts/noto-sans-sc/500Medium/NotoSansSC_500Medium.ttf'),
      require.resolve('@expo-google-fonts/noto-sans-sc/600SemiBold/NotoSansSC_600SemiBold.ttf'),
      require.resolve('@expo-google-fonts/noto-sans-sc/700Bold/NotoSansSC_700Bold.ttf')
    ];
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
  const date=year&&month&&day?new Date(Date.UTC(year,month-1,day,12)):new Date();
  const weekday=date.getUTCDay();
  return {
    month:month||date.getUTCMonth()+1,
    day:day||date.getUTCDate(),
    weekdayCn:weekdaysCn[weekday]
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

function posterLessonStudentName(schedule={}){
  return posterShortText(schedule.studentName||parseArr(schedule.studentNames).join('、')||'学员',12);
}

function posterCoachDisplayName(value=''){
  return posterShortText(String(value||'教练').replace(/教练$/,'').trim()||'教练',5);
}

function posterCourseTypeClass(type=''){
  if(String(type).includes('体验'))return {fill:'#FEF7EE',color:'#C8832B'};
  if(String(type).includes('专项'))return {fill:'#F0F6F8',color:'#3B6B8A'};
  return {fill:'#F0F5F2',color:'#386A4C'};
}

function posterCourtText(schedule={}){
  const raw=String(schedule.venue||schedule.externalVenueName||schedule.externalCourtName||'场地待定').trim();
  const match=raw.match(/([0-9一二三四五六七八九十]+)\s*号场/);
  return match?`${match[1]}号场`:posterShortText(raw.replace(/\s+/g,''),5);
}

function buildCoachDailyDigestPosterSvg(item={}){
  const rows=(item.schedules||[]).slice().sort((a,b)=>dateMs(a.startTime)-dateMs(b.startTime));
  const dateParts=posterScheduleDateParts(item.digestDate);
  const lessonCount=Number(item.lessonCount||rows.length)||0;
  const totalHours=rows.reduce((sum,row)=>sum+posterLessonHours(row),0);
  const lessonTop=157;
  const lessonGap=67;
  const height=Math.max(476,lessonTop+Math.max(lessonCount,1)*lessonGap+51);
  const coachName=posterCoachDisplayName(item.coachName);
  const lessonSvg=rows.map((schedule,index)=>{
    const y=lessonTop+index*lessonGap;
    const start=String(schedule.startTime||'').slice(11,16)||'--:--';
    const end=String(schedule.endTime||'').slice(11,16)||'--:--';
    const type=posterShortText(schedule.courseType||'课程',5);
    const badge=posterCourseTypeClass(type);
    const badgeWidth=Math.max(45,type.length*16+14);
    const badgeX=292;
    const court=posterCourtText(schedule);
    const divider=index<rows.length-1?`<line x1="30" y1="${y+43}" x2="390" y2="${y+43}" stroke="#F0F0F0" stroke-width="1"/>`:'';
    return `
      <g>
        <text x="30" y="${y}" ${posterFontAttr()} font-size="13" font-weight="500" fill="#444444">${posterXmlText(`${start}-${end}`)}<tspan fill="#999999" font-weight="400"> · ${posterXmlText(posterHoursText(posterLessonHours(schedule)))}h</tspan></text>
        <text x="139" y="${y}" ${posterFontAttr()} font-size="13" font-weight="600" fill="#111111">${posterXmlText(posterLessonStudentName(schedule))}</text>
        <rect x="${badgeX}" y="${y-14}" width="${badgeWidth}" height="20" rx="4" fill="${badge.fill}"/>
        <text x="${badgeX+badgeWidth/2}" y="${y}" text-anchor="middle" ${posterFontAttr()} font-size="11" font-weight="600" fill="${badge.color}">${posterXmlText(type)}</text>
        <text x="390" y="${y}" text-anchor="end" ${posterFontAttr()} font-size="13" font-weight="400" fill="#999999">${posterXmlText(court)}</text>
        ${divider}
      </g>`;
  }).join('');
  const emptySvg=rows.length?'':`<text x="30" y="${lessonTop}" ${posterFontAttr()} font-size="13" font-weight="500" fill="#999999">明日暂无排课</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="${Math.round(height*1170/420)}" viewBox="0 0 420 ${height}">
    <rect width="420" height="${height}" fill="#FFFFFF"/>
    <text x="30" y="82" ${posterFontAttr()} font-size="32" font-weight="700" letter-spacing="2" fill="#111111">${posterXmlText(coachName)}</text>
    <text x="${42+coachName.length*34}" y="82" ${posterFontAttr()} font-size="13" font-weight="400" fill="#999999">教练</text>
    <text x="390" y="62" text-anchor="end" ${posterFontAttr()} font-size="24" font-weight="500" fill="#111111">${posterXmlText(`${dateParts.month}/${dateParts.day}`)}<tspan font-size="13" font-weight="400">  ${posterXmlText(dateParts.weekdayCn)}</tspan></text>
    <text x="390" y="82" text-anchor="end" ${posterFontAttr()} font-size="12" font-weight="400" letter-spacing="1" fill="#999999">${posterXmlText(`共 ${lessonCount} 节 · ${posterHoursText(totalHours)} 课时`)}</text>
    <line x1="30" y1="105" x2="390" y2="105" stroke="#222222" stroke-width="2"/>
    ${lessonSvg}${emptySvg}
    <text x="210" y="${height-37}" text-anchor="middle" ${posterFontAttr()} font-size="12" font-weight="400" letter-spacing="3" fill="#DDDDDD">FLOWTENNIS</text>
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
