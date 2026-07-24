(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FlowTennisCampus=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CAMPUS_DISPLAY_NAMES={
    shunyi_mapo:'顺义马坡',
    shilipu:'朝阳十里堡',
    guowang:'国家网球中心',
    langang:'蓝色港湾',
    chaojun:'朝珺私教'
  };
  const CAMPUS_ALIASES={
    shunyi_mapo:'shunyi_mapo',
    mabao:'shunyi_mapo',
    '顺义马坡':'shunyi_mapo',
    '马坡':'shunyi_mapo',
    '马宝':'shunyi_mapo',
    shilipu:'shilipu',
    '朝阳十里堡':'shilipu',
    '十里堡':'shilipu',
    guowang:'guowang',
    '国家网球中心':'guowang',
    '国网':'guowang',
    '朝阳国网':'guowang',
    langang:'langang',
    '蓝色港湾':'langang',
    '朝阳蓝色港湾':'langang',
    '蓝港':'langang',
    chaojun:'chaojun',
    '朝珺私教':'chaojun',
    '朝珺':'chaojun'
  };
  function text(value){
    return String(value??'').trim();
  }
  function normalizeCampusValue(value){
    const raw=text(value);
    return CAMPUS_ALIASES[raw]||raw;
  }
  function displayCampusName(value){
    const raw=text(value);
    if(!raw||raw==='undefined'||raw==='null')return '';
    if(raw==='__external__'||raw==='external')return '外部场馆';
    const key=normalizeCampusValue(raw);
    return CAMPUS_DISPLAY_NAMES[key]||raw;
  }
  function sameCampusValue(a,b){
    return normalizeCampusValue(a)===normalizeCampusValue(b);
  }
  function buildCampusNameMap(campuses=[]){
    const map=new Map();
    Object.entries(CAMPUS_DISPLAY_NAMES).forEach(([code,name])=>map.set(code,name));
    (campuses||[]).forEach(row=>{
      const code=normalizeCampusValue(row?.code||row?.id||row?.name||'');
      const name=displayCampusName(row?.name||row?.code||row?.id||'');
      if(code&&name)map.set(code,name);
      [row?.id,row?.code,row?.name,row?.displayName].map(normalizeCampusValue).filter(Boolean).forEach(alias=>map.set(alias,name||displayCampusName(alias)));
    });
    return map;
  }
  return {
    CAMPUS_DISPLAY_NAMES,
    CAMPUS_ALIASES,
    normalizeCampusValue,
    displayCampusName,
    sameCampusValue,
    buildCampusNameMap
  };
});
