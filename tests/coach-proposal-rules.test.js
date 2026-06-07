const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api/index.js');
const { appSource: source } = require('./helpers/read-index-bundle');

const rules = api._test;
const miniApi = fs.readFileSync(path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'utils', 'api.js'), 'utf8');
const miniScheduleJs = fs.readFileSync(path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'pages', 'schedule', 'schedule.js'), 'utf8');
const miniScheduleWxml = fs.readFileSync(path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'pages', 'schedule', 'schedule.wxml'), 'utf8');

assert.ok(
  rules.getRuntimeEnsuredTables().includes('ft_coach_proposals'),
  'runtime bootstrap should ensure coach proposal table'
);

assert.match(
  source,
  /let [^;]*coachProposals=\[\]/,
  'admin and coach web state should keep coach proposal rows'
);

assert.match(
  source,
  /\/coach-proposals/,
  'web app should call coach proposal API'
);

assert.match(
  source,
  /function scheduleCoachProposal\(/,
  'schedule detail should resolve proposal by schedule id'
);

assert.match(
  source,
  /教练提案[\s\S]*课程名称[\s\S]*学员级别[\s\S]*进阶逻辑/,
  'schedule detail should render coach proposal fields'
);

assert.doesNotMatch(
  source,
  /id="cp_teachingOrganization"|cp_teachingOrganization/,
  'admin coach proposal form should not require a standalone teaching organization field'
);

assert.doesNotMatch(
  source,
  /const required=\[[^\]]*cp_teachingOrganization/,
  'admin coach proposal save should not require teaching organization'
);

assert.match(
  source,
  /DATASETS_EXCLUDED_FROM_CACHE=new Set\(\[[^\]]*'coachProposals'/,
  'coach proposals should bypass local dataset cache so hard refresh shows submitted proposals'
);

assert.match(
  source,
  /coachOpsCoachFilter/,
  'coach ops should expose a coach filter dropdown'
);

assert.match(
  source,
  /coachOpsSelectedCoach/,
  'coach ops rows should filter by selected coach'
);

assert.match(
  miniApi,
  /saveCoachProposal/,
  'mini program API should expose saveCoachProposal'
);

assert.match(
  miniScheduleJs,
  /proposalFormFromRecord/,
  'mini program should build proposal form data from an existing record'
);

assert.match(
  miniScheduleWxml,
  /教练提案[\s\S]*保存提案/,
  'mini program should render coach proposal sheet'
);

assert.doesNotMatch(
  miniScheduleWxml,
  /data-field="teachingOrganization"/,
  'mini program coach proposal sheet should not ask for standalone teaching organization'
);

assert.doesNotMatch(
  miniScheduleJs,
  /const required = \[[^\]]*'teachingOrganization'/,
  'mini program coach proposal save should not require teaching organization'
);

console.log('coach proposal rules tests passed');
