function courtDateButtonHtml(id,value,label='年 / 月 / 日',onchange=''){
  const show=value||label;
  const handler=onchange?`;${onchange}`:'';
  return `<div class="filter-date-wrap"><button class="coach-date-btn" id="${id}_btn" onclick="toggleGlobalDatePicker(event,'${id}','${id}_btn','${label}')" type="button">${esc(show)}</button><input class="filter-hidden-date" id="${id}" type="date" value="${esc(value||'')}" onchange="syncDateButton('${id}','${id}_btn','${label}')${handler}"></div>`;
}
