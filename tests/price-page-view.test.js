const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

assert.match(html, /goPage\('prices',this\)[\s\S]*?价格管理/, 'sidebar should expose price management page');
assert.match(html, /id="page-prices"/, 'price management page section should exist');
assert.match(html, /id="priceTbody"/, 'price page should render one unified price table');
assert.doesNotMatch(html, /id="priceVenueTbody"/, 'price page should not render a separate venue table');
assert.doesNotMatch(html, /id="priceChannelTbody"/, 'price page should not render a separate channel table');
assert.match(html, /id="priceTypeFilterHost"/, 'price page should expose a type filter dropdown host');
assert.match(html, /id="priceProductTypeFilterHost"/, 'price page should expose a product type filter dropdown host');
assert.match(html, /function renderPrices/, 'price page script should expose renderPrices');
assert.match(html, /function syncPriceFilterOptions/, 'price page script should sync the type filter dropdown');
assert.match(html, /function openPriceModal/, 'price page script should expose openPriceModal');
assert.match(html, /function savePricePlan/, 'price page script should expose savePricePlan');
assert.match(html, /导入默认马坡价格/, 'price page should expose default Mabao price import');
assert.match(html, /新增价格/, 'price page should expose one generic create button');
assert.match(html, /tms-btn-ghost" onclick="importDefaultMabaoPrices/, 'price import button should match student page secondary action style');
assert.match(html, /tms-btn-primary" onclick="openPriceModal/, 'price create button should match student page primary action style');
assert.match(html, /日期类型[\s\S]*?商品类型[\s\S]*?关联业务[\s\S]*?时长/, 'price table should split date type, product type, business type and duration');
assert.match(html, /price-table/, 'price table should use compact page-specific table sizing');
assert.match(html, /function importDefaultMabaoPrices/, 'price page script should import default Mabao prices');

console.log('price page view tests passed');
