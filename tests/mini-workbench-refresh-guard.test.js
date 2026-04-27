const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../wechat-miniprogram/miniprogram/pages/schedule/schedule.js'), 'utf8');

function fnBody(name) {
  const start = source.indexOf(`  ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  assert.notStrictEqual(bodyStart, -1, `${name} should have body`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} body not closed`);
}

const onShowBody = fnBody('onShow');
const saveFeedbackBody = fnBody('async saveFeedback');

assert.match(
  onShowBody,
  /if \(this\.shouldRefreshOnShow\(\)\) this\.load\(\{ keepLoading: true \}\);/,
  'onShow 应只在显式判定需要刷新时才整包重拉'
);

assert.doesNotMatch(
  saveFeedbackBody,
  /await this\.load\(\{ keepLoading: true \}\);/,
  '保存反馈后不应再 await 整包重拉'
);

assert.match(
  saveFeedbackBody,
  /const savedFeedback = await saveCoachFeedback\(/,
  '保存反馈后应拿到返回的反馈记录做本地 patch'
);

assert.match(
  saveFeedbackBody,
  /this\.applyFeedbackPatch\(selectedClass, savedFeedback\);/,
  '保存反馈后应走本地 patch，而不是整包重拉'
);

console.log('mini workbench refresh guard tests passed');
