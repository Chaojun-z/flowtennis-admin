const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

assert.match(html, /nrPriceMode/, 'court finance modal should expose price mode');
assert.match(html, /nrChannelProductId/, 'court finance modal should expose channel product selector');
assert.match(html, /id="nrSystemAmount"/, 'court finance modal should show system quoted amount');
assert.match(html, /id="nrFinalAmount"/, 'court finance modal should expose final transaction amount');
assert.match(html, /id="nrOverrideReason"/, 'court finance modal should require override reason when price changes');
assert.match(html, /function refreshCourtFinanceQuote/, 'court finance modal should quote price automatically');
assert.match(html, /function courtPayMethodOptions\([\s\S]*PAYMENT_METHODS\|\|PAY_METHODS/, 'court finance payment dropdown should use the shared standard payment methods');
assert.match(html, /priceMode[\s\S]*pricePlanId[\s\S]*systemAmount[\s\S]*finalAmount[\s\S]*overrideReason/, 'saved court finance row should include price snapshot fields');
assert.match(html, /COURT_FINANCE_TRANSACTION_TYPES=\['收款','消耗','退款','废弃'\]/, 'court finance modal should use the standard transaction types');
assert.match(html, /COURT_FINANCE_BUSINESS_TYPES=\['会员订场','散客订场','课程订场','领导订场','内部使用','约球局'\]/, 'court finance modal should use field business subtypes');
assert.match(html, /renderStandardDropdownHtml\('nrType','交易类型'/, 'court finance modal first dropdown should be transaction type');
assert.match(html, /renderStandardDropdownHtml\('nrCategory','业务类型'/, 'court finance modal second dropdown should be field business subtype');
assert.match(html, /renderStandardDropdownHtml\('nrPayMethod','支付方式'/, 'court finance modal third dropdown should be payment method');
assert.doesNotMatch(html, /renderStandardDropdownHtml\('nrType','类型'|renderStandardDropdownHtml\('nrCategory','项目'|renderStandardDropdownHtml\('nrPayMethod','支付'/, 'court finance modal should not keep old dropdown labels');
assert.doesNotMatch(html, /\{value:'充值',label:'充值'\}|\{value:'订场',label:'订场'\}|\{value:'内部占用',label:'内部占用'\}|\{value:'冲正',label:'冲正'\}/, 'court finance modal should not expose old finance categories');

console.log('court price view tests passed');
