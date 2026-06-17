const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const indexHtml = read('public/index.html');
const apiSource = read('api/index.js');
const corePagesSource = read('server/page-data/core-pages.js');
const stateSource = read('public/assets/scripts/core/state.js');
const componentsSource = read('public/assets/scripts/core/components.js');
const standardComponentsSource = read('public/assets/scripts/standard/components.js');

assert.doesNotMatch(indexHtml, /id="page-classes"|id="page-plans"/, '后台不应再挂载班次/学习计划页面容器');
assert.doesNotMatch(indexHtml, /assets\/scripts\/pages\/classes\.js|assets\/scripts\/pages\/plans\.js/, '后台不应再加载班次/学习计划页面脚本');
assert.ok(!fs.existsSync(path.join(root, 'public/assets/scripts/pages/classes.js')), '班次页面脚本应删除');
assert.ok(!fs.existsSync(path.join(root, 'public/assets/scripts/pages/plans.js')), '学习计划页面脚本应删除');

assert.doesNotMatch(componentsSource, /goPage\('classes'|goPage\('plans'/, '侧边栏不应保留班次/学习计划入口，包括隐藏入口');
assert.doesNotMatch(standardComponentsSource, /key:'plans'/, '标准列表壳不应保留学习计划页面配置');
assert.doesNotMatch(stateSource, /plansPage:\(\)=>apiCall\('GET','\/page-data\/plans'\)|plans:\['plansPage'\]|if\(pg==='plans'\)/, '前端状态层不应再加载学习计划聚合接口');

assert.doesNotMatch(corePagesSource, /\/page-data\/plans/, '后端不应再提供学习计划聚合 page-data 接口');
assert.doesNotMatch(apiSource, /path==='\/plans'|path\.match\(\^\\\/plans|path==='\/classes'|path\.match\(\^\\\/classes/, '后端不应再提供班次/学习计划业务接口');
assert.doesNotMatch(apiSource, /syncClassPlans|buildClassPlanRecord/, '后端不应再自动生成或同步学习计划');
assert.match(apiSource, /'classId'/, '历史兼容字段 classId 可保留，避免老排课记录断引用');

console.log('deprecated class and plan removal tests passed');
