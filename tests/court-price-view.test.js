const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

assert.match(html, /nrPriceMode/, 'court finance modal should expose price mode');
assert.match(html, /nrChannelProductId/, 'court finance modal should expose channel product selector');
assert.match(html, /id="nrSystemAmount"/, 'court finance modal should show system quoted amount');
assert.match(html, /id="nrFinalAmount"/, 'court finance modal should expose final transaction amount');
assert.match(html, /id="nrOverrideReason"/, 'court finance modal should require override reason when price changes');
assert.match(html, /function refreshCourtFinanceQuote/, 'court finance modal should quote price automatically');
assert.match(html, /priceMode[\s\S]*pricePlanId[\s\S]*systemAmount[\s\S]*finalAmount[\s\S]*overrideReason/, 'saved court finance row should include price snapshot fields');

console.log('court price view tests passed');
