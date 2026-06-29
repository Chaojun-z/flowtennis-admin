const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

function fnBody(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(html, /function csvEscapeCell\(/, 'court csv helpers should escape fields consistently');
assert.match(html, /function decodeCourtCsvText\(/, 'court import should decode csv text through a dedicated helper');
assert.match(html, /new TextDecoder\('utf-8',\s*\{fatal:true\}\)/, 'court import should try fatal utf-8 decoding first');
assert.match(html, /for\(const enc of \['gb18030','gbk'\]\)/, 'court import should fall back to gb18030 and gbk');
assert.match(html, /exportCourtCSV\([\s\S]*csvEscapeCell/, 'court export should use shared CSV escaping');
assert.doesNotMatch(`${fnBody('exportCourtCSV')}\n${fnBody('normalizeCourtImportRows')}\n${fnBody('renderCourtImportPreview')}`, /末次跟进日期|下次跟进日期|熟悉程度/, 'court import/export should remove deprecated profile fields');
assert.match(html, /normalizeCourtImportRows\([\s\S]*跟进人/, 'court import normalization should read the standard follower field');

console.log('court import export tests passed');
