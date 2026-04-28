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
    const dandan = { id: 'chendand', role: 'editor', name: '陈丹丹', matchOps: true, matchFinance: true };
    assert.doesNotThrow(() => rules.requireMatchAdminPermission(dandan, 'match_ops'), 'dandan should have match ops permission');
    assert.doesNotThrow(() => rules.requireMatchAdminPermission(dandan, 'match_finance'), 'dandan should have match finance permission');

    for (const [id, phone] of [
      [ids.creator, '13800000001'],
      [ids.userA, '13800000002'],
      [ids.userB, '13800000003'],
      [ids.userC, '13800000004'],
      [ids.preUser, '13800000005']
    ]) {
      await insertUser(pool, id, phone);
    }

    await assert.rejects(
      () => rules.createMatchForUser(ids.creator, {
        title: `${prefix} 普通用户发起`,
        matchType: 'double',
        targetHeadcount: 4,
        startTime: futureDate(2),
        endTime: futureDate(4),
        venueName: '马坡网球馆',
        venueAddress: '马坡',
        venueLatitude: 40.123,
        venueLongitude: 116.456,
        ntrpMin: 2.5,
        ntrpMax: 3.5,
        genderPreference: '不限',
        estimatedCourtFee: 480
      }),
      /仅管理员可发起约球/,
      'plain match users should no longer be able to create matches'
    );

    const matchId = `${prefix}-match-main`;
    const createdAt = new Date().toISOString();
    await pool.query(
      `INSERT INTO match_posts(
        id,creatorUserId,title,matchType,targetHeadcount,startTime,endTime,
        venueName,venueAddress,venueLatitude,venueLongitude,ntrpMin,ntrpMax,
        levelMode,genderPreference,estimatedCourtFee,status,formationStatus,createdAt,updatedAt
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,$19::timestamptz,$19::timestamptz
      )`,
      [
        matchId, ids.creator, `${prefix} 约球联调`, 'double', 4, futureDate(2), futureDate(4),
        '马坡网球馆', '马坡', 40.123, 116.456, 2.5, 3.5,
        'preset', '不限', 480, 'open', 'free_open', createdAt
      ]
    );
    const match = await rules.getMatchForViewer(matchId, ids.creator);
    assert.equal(match.currentHeadcount, 0, 'creator should not auto-register');

    await rules.registerMatchUser(match.id, ids.userA);
    await rules.registerMatchUser(match.id, ids.userB);
    const afterRegister = await rules.getMatchForViewer(match.id, ids.userA);
    assert.equal(afterRegister.currentHeadcount, 2, 'headcount should come from registered rows');
    assert.equal(afterRegister.viewerJoined, true, 'viewer registration should be reflected');

    await rules.adminBookMatch(match.id, dandan.id, {
      venueNameFinal: '马坡网球馆',
      courtNo: '3',
      finalCourtFee: 500,
      bookingStatus: 'booked'
    });

    await rules.adminHandleBookedWithdrawal(match.id, ids.userB, dandan.id, {
      financialResponsibility: 'charge',
      reason: '临时退赛，仍需 AA'
    });

    await assert.rejects(
      () => rules.generateMatchFeeLedger(match.id, dandan.id),
      /请先完成全部到场确认，再生成AA/,
      'AA generation should wait until every active player has creator-confirmed attendance'
    );

    await pool.query("INSERT INTO match_attendance(id,matchId,userId,selfStatus,creatorStatus,finalStatus,updatedAt) VALUES($1,$2,$3,'pending','attended','attended',NOW())", [`${prefix}-att-a`, match.id, ids.userA]);
    await rules.generateMatchFeeLedger(match.id, dandan.id);
    await assert.rejects(
      () => rules.creatorConfirmMatchAttendance(match.id, ids.creator, 'missing-registration', 'attended'),
      /已生成AA，不能再修改到场名单/,
      'creator confirmation should refuse any further edits once AA is locked'
    );
    const splits = await pool.query('SELECT userId,amount,payStatus FROM match_fee_splits WHERE matchId=$1 ORDER BY userId', [match.id]);
    assert.deepEqual(splits.rows.map(row => Number(row.amount)).sort((a, b) => b - a), [250, 250], 'AA should include charged booked withdrawal and stay balanced');
    assert.equal(splits.rows.reduce((sum, row) => sum + Number(row.amount), 0), 500, 'split total should equal final court fee');

    const regA = await pool.query("SELECT * FROM match_registrations WHERE matchId=$1 AND userId=$2", [match.id, ids.userA]);
    await assert.rejects(
      () => rules.creatorConfirmMatchAttendance(match.id, ids.creator, regA.rows[0].id, 'absent'),
      /已生成AA，不能再修改到场名单/,
      'attendance should lock once AA has been generated'
    );

    const paid = await rules.markMatchFeeSplit(match.id, ids.userA, dandan.id, { payStatus: 'paid' });
    assert.equal(paid.financeSync.synced, true, 'paid split should sync into court finance ledger');

    const financeAccount = await rules.getCourtRecordForTest('match-court-finance');
    assert.ok(financeAccount, 'match court finance account should exist');
    const financeRow = (financeAccount.history || []).find(row => row.matchId === match.id && row.matchUserId === ids.userA);
    assert.ok(financeRow, 'court finance history should contain paid match split');
    assert.equal(financeRow.category, '订场');
    assert.equal(financeRow.sourceCategory, '约球订场');
    assert.equal(Number(financeRow.amount), 250);

    await assert.rejects(
      () => rules.markMatchFeeSplit(match.id, ids.userA, dandan.id, { payStatus: 'refunded' }),
      /请填写原因/,
      'refund should require operator reason'
    );
    const refunded = await rules.markMatchFeeSplit(match.id, ids.userA, dandan.id, { payStatus: 'refunded', note: '测试退款' });
    assert.equal(refunded.financeSync.synced, true, 'refunded split should sync refund into court finance ledger');
    const financeAfterRefund = await rules.getCourtRecordForTest('match-court-finance');
    const refundRow = (financeAfterRefund.history || []).find(row => row.matchId === match.id && row.matchUserId === ids.userA && row.type === '退款');
    assert.ok(refundRow, 'court finance history should contain refunded match split');
    assert.equal(refundRow.category, '订场');
    assert.equal(refundRow.sourceCategory, '约球订场');
    assert.equal(Number(refundRow.amount), 250);

    const dailyReport = await rules.getMatchFinanceDailyReportForAdmin(new Date().toISOString().slice(0, 10));
    assert.equal(dailyReport.summary.diff, 0, 'dandan daily finance report should reconcile with court ledger');
    assert.ok(dailyReport.summary.receivable >= 500, 'dandan daily report should include generated AA receivable');

    const raceMatchId = `${prefix}-match-race`;
    await pool.query(
      `INSERT INTO match_posts(
        id,creatorUserId,title,matchType,targetHeadcount,startTime,endTime,
        venueName,venueAddress,venueLatitude,venueLongitude,ntrpMin,ntrpMax,
        levelMode,genderPreference,estimatedCourtFee,status,formationStatus,createdAt,updatedAt
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,NOW(),NOW()
      )`,
      [
        raceMatchId, ids.creator, `${prefix} 并发抢位`, 'single', 2, futureDate(3), futureDate(5),
        '马坡网球馆', '马坡', 40.123, 116.456, 2.5, 3.5,
        'preset', '不限', 300, 'open', 'free_open'
      ]
    );
    const raceMatch = await rules.getMatchForViewer(raceMatchId, ids.creator);
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
