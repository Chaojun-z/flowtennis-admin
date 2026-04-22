const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const api = require('../api');
const rules = api._test;

const prefix = `it-${Date.now()}`;
const ids = {
  creator: `${prefix}-creator`,
  userA: `${prefix}-a`,
  userB: `${prefix}-b`,
  userC: `${prefix}-c`,
  preUser: `${prefix}-pre`
};

function futureDate(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

async function insertUser(pool, id, phone) {
  await pool.query(
    'INSERT INTO match_users(id,openid,unionid,nickName,avatarUrl,phone,ntrpLevel,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) ON CONFLICT(id) DO NOTHING',
    [id, `openid-${id}`, '', id, '', phone, '3.0']
  );
}

async function cleanup(pool) {
  const rows = await pool.query('SELECT id FROM match_posts WHERE id LIKE $1 OR creatorUserId LIKE $1', [`${prefix}%`]);
  for (const row of rows.rows) {
    await pool.query('DELETE FROM match_posts WHERE id=$1', [row.id]);
  }
  await pool.query('DELETE FROM match_users WHERE id LIKE $1', [`${prefix}%`]);
  if (rules.removeMatchCourtFinanceRowsForTest) {
    await rules.removeMatchCourtFinanceRowsForTest(prefix);
  }
}

async function main() {
  const pool = rules.getMatchSqlPool();
  await cleanup(pool);
  try {
    for (const [id, phone] of [
      [ids.creator, '13800000001'],
      [ids.userA, '13800000002'],
      [ids.userB, '13800000003'],
      [ids.userC, '13800000004'],
      [ids.preUser, '13800000005']
    ]) {
      await insertUser(pool, id, phone);
    }

    const match = await rules.createMatchForUser(ids.creator, {
      title: `${prefix} 约球联调`,
      matchType: 'double',
      targetHeadcount: 4,
      startTime: futureDate(2),
      endTime: futureDate(4),
      venueName: '马坡网球馆',
      venueAddress: '马坡',
      ntrpMin: 2.5,
      ntrpMax: 3.5,
      genderPreference: '不限',
      estimatedCourtFee: 480
    });
    assert.equal(match.currentHeadcount, 0, 'creator should not auto-register');

    await rules.registerMatchUser(match.id, ids.userA);
    await rules.registerMatchUser(match.id, ids.userB);
    const afterRegister = await rules.getMatchForViewer(match.id, ids.userA);
    assert.equal(afterRegister.currentHeadcount, 2, 'headcount should come from registered rows');
    assert.equal(afterRegister.viewerJoined, true, 'viewer registration should be reflected');

    await rules.adminBookMatch(match.id, 'dandan', {
      venueNameFinal: '马坡网球馆',
      courtNo: '3',
      finalCourtFee: 500,
      bookingStatus: 'booked'
    });

    await rules.adminHandleBookedWithdrawal(match.id, ids.userB, 'dandan', {
      financialResponsibility: 'charge',
      reason: '临时退赛，仍需 AA'
    });

    await pool.query("INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending','attended','attended',NOW())", [`${prefix}-att-a`, match.id, ids.userA]);
    await rules.generateMatchFeeLedger(match.id, 'dandan');
    const splits = await pool.query('SELECT userId,amount,payStatus FROM match_fee_splits WHERE matchId=$1 ORDER BY userId', [match.id]);
    assert.deepEqual(splits.rows.map(row => Number(row.amount)).sort((a, b) => b - a), [250, 250], 'AA should include charged booked withdrawal and stay balanced');
    assert.equal(splits.rows.reduce((sum, row) => sum + Number(row.amount), 0), 500, 'split total should equal final court fee');

    const paid = await rules.markMatchFeeSplit(match.id, ids.userA, 'dandan', { payStatus: 'paid' });
    assert.equal(paid.financeSync.synced, true, 'paid split should sync into court finance ledger');

    const financeAccount = await rules.getCourtRecordForTest('match-court-finance');
    assert.ok(financeAccount, 'match court finance account should exist');
    const financeRow = (financeAccount.history || []).find(row => row.matchId === match.id && row.matchUserId === ids.userA);
    assert.ok(financeRow, 'court finance history should contain paid match split');
    assert.equal(financeRow.category, '订场');
    assert.equal(financeRow.sourceCategory, '约球订场');
    assert.equal(Number(financeRow.amount), 250);

    await assert.rejects(
      () => rules.markMatchFeeSplit(match.id, ids.userA, 'dandan', { payStatus: 'refunded' }),
      /请填写原因/,
      'refund should require operator reason'
    );
    const refunded = await rules.markMatchFeeSplit(match.id, ids.userA, 'dandan', { payStatus: 'refunded', note: '测试退款' });
    assert.equal(refunded.financeSync.synced, true, 'refunded split should sync refund into court finance ledger');
    const financeAfterRefund = await rules.getCourtRecordForTest('match-court-finance');
    const refundRow = (financeAfterRefund.history || []).find(row => row.matchId === match.id && row.matchUserId === ids.userA && row.type === '退款');
    assert.ok(refundRow, 'court finance history should contain refunded match split');
    assert.equal(refundRow.category, '订场');
    assert.equal(refundRow.sourceCategory, '约球订场');
    assert.equal(Number(refundRow.amount), 250);

    const raceMatch = await rules.createMatchForUser(ids.creator, {
      title: `${prefix} 并发抢位`,
      matchType: 'single',
      targetHeadcount: 2,
      startTime: futureDate(3),
      endTime: futureDate(5),
      venueName: '马坡网球馆',
      venueAddress: '马坡',
      ntrpMin: 2.5,
      ntrpMax: 3.5,
      genderPreference: '不限',
      estimatedCourtFee: 300
    });
    await rules.registerMatchUser(raceMatch.id, ids.preUser);
    const results = await Promise.allSettled([
      rules.registerMatchUser(raceMatch.id, ids.userA),
      rules.registerMatchUser(raceMatch.id, ids.userC)
    ]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1, 'only one user can win the last slot');
    assert.equal(results.filter(row => row.status === 'rejected').length, 1, 'one user should be rejected for the last slot');
    const finalRace = await rules.getMatchForViewer(raceMatch.id, ids.creator);
    assert.equal(finalRace.currentHeadcount, 2, 'race match should not oversell');
  } finally {
    await cleanup(pool);
  }
}

main().then(() => {
  console.log('match real link test passed');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
