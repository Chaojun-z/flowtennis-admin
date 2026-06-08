const assert = require('assert');
const { html } = require('./helpers/read-index-bundle');

const placeholders = [...html.matchAll(/class="tms-search-input"[^>]*placeholder="([^"]*)"/g)].map(match => match[1]);

assert.ok(placeholders.length > 0, 'should find page search inputs');
assert.deepStrictEqual([...new Set(placeholders)], ['搜索姓名、手机号'], 'all page search inputs should use the unified placeholder');

console.log('search placeholder view tests passed');
