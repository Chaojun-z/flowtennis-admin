const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./helpers/read-index-bundle');

const coreSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'components.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core', 'bootstrap.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'courts.js'), 'utf8');

function fnBody(source, name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

[
  'openStandardModal',
  'renderStandardModalActionsHtml',
  'renderStandardModalFormSectionHtml',
  'setStandardActionLoading',
  'runStandardMutation',
  'openStandardDetailDrawer',
  'renderStandardDetailHeaderHtml',
  'renderStandardDetailTabsHtml',
  'renderStandardDetailCardHtml',
  'renderStandardDetailTimelineHtml',
  'renderStandardDetailFormCardHtml'
].forEach(name => {
  assert.match(coreSource, new RegExp(`function ${name}\\(`), `${name} should be defined in the global core component layer`);
  assert.match(appSource, new RegExp(`${name}`), `${name} should be bundled globally`);
});

assert.doesNotMatch(coreSource, /function openDetailSideDrawer\(/, 'legacy drawer entry should be removed after page migration');
assert.doesNotMatch(courtsSource, /function setCourtModalFrame\(/, 'legacy court modal entry should be removed after page migration');
assert.match(fnBody(coreSource, 'openStandardModal'), /ov\.classList\.remove\('schedule-drawer-overlay'\)[\s\S]*ov\.classList\.remove\('student-drawer-overlay'\)/, 'standard modal should clear drawer overlay classes');
assert.match(fnBody(coreSource, 'openStandardModal'), /modal\.className=`modal modal-court \$\{extraClass\}`\.trim\(\)/, 'standard modal should keep one global modal class rule');
assert.match(fnBody(coreSource, 'openStandardDetailDrawer'), /modalClass='modal modal-court modal-schedule-drawer'/, 'standard drawer should keep one global drawer class rule');
assert.match(fnBody(coreSource, 'setStandardActionLoading'), /dataset\.standardLoading/, 'standard action loading should be tracked on the button');
assert.match(fnBody(coreSource, 'runStandardMutation'), /try[\s\S]*await task\(\)[\s\S]*catch[\s\S]*toast\([\s\S]*return null[\s\S]*finally/, 'standard mutation helper should keep failures open and always clear loading');
assert.match(fnBody(coreSource, 'runStandardMutation'), /onSuccess[\s\S]*refresh[\s\S]*formatError/, 'standard mutation helper should own success callbacks, refresh callbacks, and page-specific error formatting');
assert.doesNotMatch(fnBody(bootstrapSource, 'toast'), /innerHTML[\s\S]*msg/, 'toast should render message as text, not HTML');
assert.match(fnBody(bootstrapSource, 'toast'), /textContent=String\(msg\?\?''\)/, 'toast should put untrusted messages into textContent');
assert.match(bootstrapSource, /function safeConfirmHtml\(/, 'appConfirm html mode should use one sanitizer entry');
assert.match(fnBody(bootstrapSource, 'appConfirm'), /desc\.innerHTML=safeConfirmHtml\(message\)/, 'appConfirm html mode should sanitize before innerHTML');
assert.match(fnBody(bootstrapSource, 'appConfirm'), /desc\.textContent=message/, 'appConfirm default mode should remain plain text');

console.log('standard overlay component tests passed');
