const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scheduleSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/schedule.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');

assert.match(scheduleSource, /const schEntitlementCache=new Map\(\)/, '排课课包推荐必须加短缓存');
assert.match(scheduleSource, /clearTimeout\(schEntitlementRefreshTimer\)/, '排课课包推荐必须先清掉上一次定时请求');
assert.match(scheduleSource, /schEntitlementRefreshTimer=setTimeout\(async \(\)=>\{[\s\S]*\/entitlements\/recommend/, '排课课包推荐必须做延迟合并请求');
assert.match(scheduleSource, /if\(cached&&\(now-cached\.at\)<30000\)/, '排课课包推荐必须复用 30 秒内结果');
assert.match(scheduleSource, /if\(refreshSeq!==schEntitlementRefreshSeq\)return;/, '排课课包推荐必须忽略过期返回');

assert.match(courtsSource, /const courtFinanceQuoteCache=new Map\(\)/, '订场报价必须加短缓存');
assert.match(courtsSource, /clearTimeout\(courtFinanceQuoteTimer\)/, '订场报价必须先清掉上一次定时请求');
assert.match(courtsSource, /courtFinanceQuoteTimer=setTimeout\(async \(\)=>\{[\s\S]*\/price-plans\/quote/, '订场报价必须做延迟合并请求');
assert.match(courtsSource, /if\(cached&&\(now-cached\.at\)<30000\)/, '订场报价必须复用 30 秒内结果');
assert.match(courtsSource, /if\(quoteSeq!==courtFinanceQuoteSeq\)return;/, '订场报价必须忽略过期返回');

console.log('modal request debounce tests passed');
