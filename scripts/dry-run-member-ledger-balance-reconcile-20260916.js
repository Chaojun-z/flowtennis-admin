#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

const { createClientFromEnv, getRow } = require('./lib/staging-data-store');
const { createCourtFinanceRules } = require('../server/court-finance');
const { fetchMemberLedgerExportRowsForMembers } = require('../server/third-party-sync-center-routes');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SOURCE = path.join(ROOT, '_local/reports/member-targeted-refresh-result-2026-09-15T10-41-48-847Z.json');
const REPORT_DIR = path.join(ROOT, '_local/reports');
const TABLES = {
  courts: 'ft_courts'
};

function text(value) {
  return String(value ?? '').trim();
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function fromCents(value) {
  return Math.round((Number(value) || 0)) / 100;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { source: DEFAULT_SOURCE, limit: 0, only: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') args.source = path.resolve(argv[++i]);
    else if (arg === '--limit') args.limit = Number(argv[++i] || 0) || 0;
    else if (arg === '--only') {
      text(argv[++i]).split(',').map(item => item.trim()).filter(Boolean).forEach(item => args.only.add(item));
    }
  }
  return args;
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env') });
  dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });
  process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';
}

function cxeHeaders(token = '') {
  return {
    'content-type': 'application/json;charset=UTF-8',
    'CXE-Console-Channel': 'Web',
    'CXE-Console-Version': '46',
    ...(token ? { token } : {})
  };
}

async function loginChangxiaoer(env = process.env) {
  const phone = text(env.CXE_USER);
  const pwd = text(env.CXE_PASS);
  if (!phone || !pwd) throw new Error('缺少 CXE_USER / CXE_PASS，不能拉取长小二数据');
  const login = await axios.post('https://api.console.changxiaoer.cn/admin/merchantAdminLogin', { phone, pwd }, { headers: cxeHeaders() });
  const token = text(login.data?.data?.token);
  if (!token) throw new Error('长小二登录未返回 token');
  return { token, adminId: text(login.data?.data?.adminId || login.data?.data?.id) };
}

function loadTargets(sourcePath, { limit = 0, only = new Set() } = {}) {
  const payload = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const rows = payload.mismatches || payload.memberRows?.filter(row => row.matched && money(row.diff) !== 0) || [];
  const filtered = rows.filter(row => {
    if (!text(row.thirdId) || !text(row.systemId)) return false;
    if (!only.size) return true;
    return only.has(text(row.thirdId)) || only.has(text(row.phone)) || only.has(text(row.systemId)) || only.has(text(row.name));
  });
  return (limit > 0 ? filtered.slice(0, limit) : filtered).map(row => ({
    thirdId: text(row.thirdId),
    name: text(row.name),
    phone: text(row.phone),
    thirdBalance: money(row.thirdBalance),
    systemId: text(row.systemId),
    systemName: text(row.systemName),
    sourceSystemBalance: money(row.systemBalance),
    sourceDiff: money(row.diff)
  }));
}

function ledgerIdOf(row = {}) {
  return text(row.ledgerId || row.id || row.orderId || row.rawPayload?.['订单号']);
}

function parseMoneyText(value = '') {
  const m = text(value).replace(/,/g, '').match(/[+-]?\s*\d+(?:\.\d+)?/);
  return m ? money(Number(m[0].replace(/\s+/g, ''))) : 0;
}

function ledgerSignedDelta(row = {}) {
  const amountText = text(row.amount ?? row.money ?? row.rawPayload?.['金额变动']);
  const raw = parseMoneyText(amountText);
  const fullText = [
    row.transactionType,
    row.businessType,
    row.operation,
    row.description,
    row.remark,
    row.rawPayload?.['业务'],
    row.rawPayload?.['交易类型'],
    amountText
  ].map(text).filter(Boolean).join(' ');
  if (/支出|扣费|扣款|消费|消耗/.test(fullText) && !/退回|退款|冲正|撤销|取消/.test(fullText)) return -Math.abs(raw);
  if (/^[\-－]/.test(amountText)) return -Math.abs(raw);
  return Math.abs(raw);
}

function ledgerKind(row = {}) {
  const delta = ledgerSignedDelta(row);
  const fullText = [row.transactionType, row.businessType, row.description, row.remark].map(text).join(' ');
  if (delta < 0) return /订场/.test(fullText) ? '会员订场扣费' : '会员储值扣费';
  if (/退款/.test(fullText)) return '会员退款/退回';
  return '会员充值/补款';
}

function historyKeys(row = {}) {
  const raw = [
    row.id,
    row.sourceRecordId,
    row.thirdPartySourceRecordId,
    row.orderNo,
    row.orderId,
    row.ledgerId,
    row.rawPayload?.['订单号']
  ].map(text).filter(Boolean);
  const json = JSON.stringify(row);
  const digitKeys = json.match(/\d{8,}/g) || [];
  return new Set([...raw, ...digitKeys]);
}

function ledgerExistsInHistory(ledgerId, history = []) {
  if (!ledgerId) return false;
  return history.some(row => historyKeys(row).has(ledgerId));
}

function storedValueHistoryDelta(row = {}) {
  const type = text(row.type);
  const amount = money(row.amount);
  const bonus = money(row.bonusAmount);
  if (type === '充值') return amount + bonus;
  if (type === '消费' && /储值|会员余额|余额/.test(text(row.payMethod))) return -amount;
  if (type === '退款' && text(row.payMethod) === '储值退款') return -amount;
  if (type === '冲正' && /储值|会员余额|余额/.test(text(row.payMethod))) return amount;
  return 0;
}

function findSubsetByDelta(candidates = [], targetCents = 0) {
  if (!targetCents) return [];
  const sign = targetCents > 0 ? 1 : -1;
  const target = Math.abs(targetCents);
  const usable = candidates
    .map((row, index) => ({ row, index, value: Math.abs(cents(row.signedDelta)) }))
    .filter(item => item.value > 0 && Math.sign(cents(item.row.signedDelta)) === sign)
    .sort((a, b) => b.value - a.value);
  const dp = new Map([[0, []]]);
  for (const item of usable) {
    const entries = [...dp.entries()];
    for (const [sum, indexes] of entries) {
      const next = sum + item.value;
      if (next > target || dp.has(next)) continue;
      const nextIndexes = [...indexes, item.index];
      if (next === target) return nextIndexes.map(index => candidates[index]);
      dp.set(next, nextIndexes);
    }
  }
  return [];
}

function memberForExport(target) {
  return {
    id: target.thirdId,
    userId: target.thirdId,
    memberId: target.thirdId,
    realName: target.name,
    memberName: target.name,
    name: target.name,
    phone: target.phone
  };
}

function summarizeLedger(row = {}) {
  return {
    ledgerId: ledgerIdOf(row),
    time: text(row.transactionTime || row.payTime || row.createDate || row.rawPayload?.['时间']),
    kind: ledgerKind(row),
    signedDelta: money(row.signedDelta),
    amountText: text(row.amount ?? row.rawPayload?.['金额变动']),
    balanceAfter: money(row.balanceAfter),
    description: text(row.description || row.rawPayload?.['商品说明']),
    remark: text(row.remark || row.rawPayload?.['备注'])
  };
}

async function main() {
  const args = parseArgs();
  loadEnv();
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const targets = loadTargets(args.source, args);
  if (!targets.length) throw new Error('没有找到已知余额不一致会员');

  const { computeCourtFinance } = createCourtFinanceRules();
  const client = createClientFromEnv();
  const { token, adminId } = await loginChangxiaoer();
  const exportEndpoint = text(process.env.CXE_MEMBER_LEDGER_EXPORT_ENDPOINT) || 'https://api.console.changxiaoer.cn/merchantmanage/rechargeUser/recordExcel';
  const exportDelayMs = Number(process.env.CXE_MEMBER_LEDGER_EXPORT_DELAY_MS ?? 1200) || 0;

  const result = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    source: args.source,
    scope: {
      targetReason: '已知会员余额不一致',
      targetCount: targets.length,
      flowtennisReadMode: '按已知会员 systemId 逐个 getRow，不扫表',
      changxiaoerReadMode: '/merchantmanage/rechargeUser/recordExcel 逐会员导出',
      writes: 0
    },
    environment: {
      tsEndpointHost: text(process.env.TS_ENDPOINT).replace(/^https?:\/\//, '').split('/')[0],
      tsInstance: text(process.env.TS_INSTANCE || process.env.TARGET_TS_INSTANCE)
    },
    summary: {},
    members: []
  };

  let consecutiveErrors = 0;
  for (const target of targets) {
    try {
      const [court, exportResult] = await Promise.all([
        getRow(client, TABLES.courts, target.systemId),
        fetchMemberLedgerExportRowsForMembers({
          client: axios,
          token,
          adminId,
          members: [memberForExport(target)],
          endpoint: exportEndpoint,
          delayMs: exportDelayMs
        })
      ]);
      const history = Array.isArray(court?.history) ? court.history : [];
      const finance = computeCourtFinance({ ...(court || {}), history, allowNegativeBalance: true });
      const systemBalance = money(finance.balance);
      const thirdBalance = target.thirdBalance;
      const targetDelta = money(thirdBalance - systemBalance);
      const ledgers = (exportResult.rows || []).map(row => ({ ...row, signedDelta: ledgerSignedDelta(row) }));
      const unmatched = ledgers.filter(row => !ledgerExistsInHistory(ledgerIdOf(row), history));
      const suggested = findSubsetByDelta(unmatched, cents(targetDelta));
      const suggestedDelta = money(suggested.reduce((sum, row) => sum + money(row.signedDelta), 0));
      const projectedBalance = money(systemBalance + suggestedDelta);
      const thirdLedgerIds = new Set(ledgers.map(ledgerIdOf).filter(Boolean));
      const suspiciousExistingStoredValue = history
        .filter(row => storedValueHistoryDelta(row) !== 0)
        .filter(row => {
          const keys = historyKeys(row);
          const hasThirdKey = [...keys].some(key => thirdLedgerIds.has(key));
          const linkedToMember = text(row.thirdPartyMemberId) === target.thirdId || text(row.memberId) === target.thirdId || text(row.userId) === target.thirdId;
          return linkedToMember && !hasThirdKey;
        })
        .map(row => ({
          id: text(row.id),
          sourceRecordId: text(row.sourceRecordId),
          date: text(row.date || row.occurredDate || row.recordedAt),
          type: text(row.type),
          payMethod: text(row.payMethod),
          signedDelta: storedValueHistoryDelta(row),
          amount: money(row.amount),
          bonusAmount: money(row.bonusAmount)
        }));

      result.members.push({
        thirdId: target.thirdId,
        name: target.name,
        phone: target.phone,
        systemId: target.systemId,
        systemName: target.systemName,
        thirdBalance,
        systemBalance,
        targetDelta,
        exportedLedgerCount: ledgers.length,
        sourceIdMissingCount: unmatched.length,
        suggestedMissingCount: suggested.length,
        suggestedDelta,
        projectedBalance,
        equalsChangxiaoerAfterSuggestedFill: Math.abs(cents(projectedBalance - thirdBalance)) <= 1,
        suggestedMissingLedgers: suggested.map(summarizeLedger),
        sourceIdMissingLedgers: unmatched.map(summarizeLedger),
        suspiciousExistingStoredValue,
        warnings: [
          ...(exportResult.warnings || []).map(row => text(row.reason || row.type)).filter(Boolean),
          ...(!suggested.length && targetDelta ? ['未找到能精确补齐当前余额差额的缺失流水组合'] : []),
          ...(unmatched.length && !suggested.length ? ['存在 sourceId 未命中流水，但直接补入不能解释当前余额差额'] : []),
          ...(suspiciousExistingStoredValue.length ? ['FlowTennis 存在长小二导出中未命中的已入账储值流水，需人工判断是否多余/重复'] : [])
        ]
      });
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      result.members.push({
        thirdId: target.thirdId,
        name: target.name,
        phone: target.phone,
        systemId: target.systemId,
        error: err.message || String(err)
      });
      if (consecutiveErrors >= 2) {
        result.stoppedEarly = true;
        result.stopReason = '连续 2 个会员处理报错，按用户要求停止';
        break;
      }
    }
  }

  const okMembers = result.members.filter(row => !row.error);
  result.summary = {
    processed: result.members.length,
    errors: result.members.filter(row => row.error).length,
    exactAfterSuggestedFill: okMembers.filter(row => row.equalsChangxiaoerAfterSuggestedFill).length,
    stillMismatchAfterSuggestedFill: okMembers.filter(row => !row.equalsChangxiaoerAfterSuggestedFill).length,
    suggestedMissingLedgerCount: okMembers.reduce((sum, row) => sum + row.suggestedMissingCount, 0),
    suggestedDeltaTotal: money(okMembers.reduce((sum, row) => sum + row.suggestedDelta, 0)),
    sourceIdMissingLedgerCount: okMembers.reduce((sum, row) => sum + row.sourceIdMissingCount, 0),
    suspiciousExistingStoredValueCount: okMembers.reduce((sum, row) => sum + row.suspiciousExistingStoredValue.length, 0)
  };

  const reportPath = path.join(REPORT_DIR, `member-ledger-balance-dry-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath, summary: result.summary }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
