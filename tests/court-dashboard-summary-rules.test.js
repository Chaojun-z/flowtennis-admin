const assert = require('assert');
const fs = require('fs');
const path = require('path');

const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');

function fnBody(name){
  const start = courtsSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = courtsSource.indexOf('\nfunction ', start + 1);
  return courtsSource.slice(start, next === -1 ? courtsSource.length : next);
}

const body = fnBody('summarizeCourtAccountListItems');

assert.match(body, /totalBookingHours:items\.reduce\(\(sum,item\)=>sum\+\(Number\(item\?\.bookingHours\)\|\|0\),0\)/, '订场总时长应按当前列表逐条累加');
assert.match(body, /const totalBookingAmount=items\.reduce\(\(sum,item\)=>sum\+\(Number\(item\?\.bookingAmount\)\|\|0\),0\);[\s\S]*const totalMemberBookingAmount=items\.reduce\(\(sum,item\)=>sum\+\(Number\(item\?\.memberBookingAmount\)\|\|0\),0\);[\s\S]*totalGuestBookingAmount:Math\.max\(0,totalBookingAmount-totalMemberBookingAmount\)/, '散客金额应按总订场金额减会员订场金额计算');

console.log('court dashboard summary rules test passed');
