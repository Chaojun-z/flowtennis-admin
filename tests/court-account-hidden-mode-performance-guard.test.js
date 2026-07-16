const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(
  stateSource,
  /async function loadCourtReadModelGuardData\(\{force=false\}=\{\}\)\{[\s\S]*const view=await DATASET_LOADERS\.courtAccountListViewPage\(\{fresh:force\}\);/,
  '隐藏模式应保留单独的首屏主列表读模型加载函数'
);
assert.doesNotMatch(
  stateSource,
  /Promise\.all\(\[DATASET_LOADERS\.courtAccountListViewPage\(\),DATASET_LOADERS\.courtAccountListViewComparePage\(\)\]\)/,
  '隐藏模式首屏不应并发等待 compare 返回后再出页面'
);
assert.match(
  stateSource,
  /async function loadCourtReadModelCompareData\(\{force=false\}=\{\}\)\{[\s\S]*const compare=await DATASET_LOADERS\.courtAccountListViewComparePage\(\);/,
  '隐藏模式应把 compare 拆成独立后台加载函数'
);
assert.match(
  stateSource,
  /await loadCourtReadModelGuardData\(\{force\}\);[\s\S]*loadCourtReadModelCompareData\(\{force:false\}\)\.then/,
  '订场用户页应先完成首屏主数据渲染，再后台补拉 compare'
);
assert.match(
  stateSource,
  /if\(\(pg==='courts'\|\|pg==='memberships'\|\|pg==='membership-orders'\|\|pg==='membership-ledger'\)&&shouldUseCourtReadModelByDefault\(\)\)\{\s*return courtAccountListViewData&&courtAccountListViewDataIsCurrent\(\)\?\[\]:\['courtAccountListViewPage'\];\s*\}/,
  '订场用户页和会员管理页首屏门禁应改为统一读模型数据，不应继续等旧 courts/memberships 聚合数据'
);

console.log('court account hidden mode performance guard tests passed');
