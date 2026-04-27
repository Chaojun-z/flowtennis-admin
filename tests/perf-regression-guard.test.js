const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /async function timedEndpointMetric\(name,fn,meta=\{\}\)/, '后端必须提供统一接口耗时统计 helper');
assert.match(apiSource, /timedEndpointMetric\('auth\.login'/, '登录必须进入性能统计');
assert.match(apiSource, /timedEndpointMetric\('pageData\.workbench'/, '教练工作台必须进入性能统计');
assert.match(apiSource, /timedEndpointMetric\('schedule\.save'/, '排课保存必须进入性能统计');
assert.match(apiSource, /timedEndpointMetric\('feedback\.save'/, '反馈保存必须进入性能统计');

console.log('perf regression guard tests passed');
