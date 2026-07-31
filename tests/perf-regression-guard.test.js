const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const authRoutesSource = fs.readFileSync(path.join(__dirname, '../server/auth-routes.js'), 'utf8');
const scheduleRoutesSource = fs.readFileSync(path.join(__dirname, '../server/schedule-routes.js'), 'utf8');
const feedbackRoutesSource = fs.readFileSync(path.join(__dirname, '../server/feedbacks-routes.js'), 'utf8');
const corePageDataSource = fs.readFileSync(path.join(__dirname, '../server/page-data/core-pages.js'), 'utf8');

assert.match(apiSource, /async function timedEndpointMetric\(name,fn,meta=\{\}\)/, '后端必须提供统一接口耗时统计 helper');
assert.match(authRoutesSource, /timedEndpointMetric\('auth\.login'/, '登录必须进入性能统计');
assert.match(corePageDataSource, /timedEndpointMetric\('pageData\.workbench'/, '教练工作台必须进入性能统计');
assert.match(scheduleRoutesSource, /timedEndpointMetric\('schedule\.save'/, '排课保存必须进入性能统计');
assert.match(feedbackRoutesSource, /timedEndpointMetric\('feedback\.save'/, '反馈保存必须进入性能统计');

console.log('perf regression guard tests passed');
