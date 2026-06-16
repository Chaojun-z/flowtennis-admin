#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');
const seed = require('../server/seeds/mabao-finance-seed.json');

const TABLES = {
  packages: 'ft_packages',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements'
};

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const DEFAULT_STATS_CSV = '/Users/shaobaolu/Downloads/网球兄弟·马坡私教名单 - 私教课课时统计 (1).csv';
const DEFAULT_CONFIRMATION_CSV = '/Users/shaobaolu/Downloads/导入数据确认 - 课包归属人工确认.csv';
const OLD_PACKAGE_IDS = new Set([
  'seed-package-adult-1v1-10',
  'seed-package-adult-1v1-history',
  'seed-package-adult-1v2-history',
  'seed-package-youth-1v1-10',
  'seed-package-youth-1v1-history',
  'seed-package-youth-1v2-20',
  'seed-package-youth-1v2-40'
]);

const TARGET_SPECS = {
  '成人1v1 朝珺黄金10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '黄金时间', maxStudents: 1, ownerCoach: '朝珺', coachNames: ['朝珺'] },
  '成人1v1 朝珺非黄金10课时': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1, ownerCoach: '朝珺', coachNames: ['朝珺'] },
  '成人1v1 朝珺非黄金10课时（历史）': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1, ownerCoach: '朝珺', coachNames: ['朝珺'] },
  '成人1v1 非黄时间10课时': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '成人1v1 非黄时间10课时（历史）': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '成人1v1 黄金时间20课时': { lessons: 20, price: 12000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '成人1v1 黄金时间10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '成人1v1 非黄时间20课时（历史）': { lessons: 20, price: 10000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '成人1v1 非黄时间50课时（历史）': { lessons: 50, price: 25000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '青少年1v1 黄金时间20课时（历史）': { lessons: 20, price: 12000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '青少年1v1 非黄时间10课时': { lessons: 10, price: 4000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '青少年1v1 非黄时间10课时（历史）': { lessons: 10, price: 4000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '青少年1v1 黄金时间10课时': { lessons: 10, price: 4800, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '青少年1v1 黄金时间10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '成人1v2 黄金时间10课时': { lessons: 10, price: 7000, courseType: '私教课', productName: '成人1v2私教课', timeBand: '黄金时间', maxStudents: 2 },
  '青少年1v2 黄金时间10课时（历史）': { lessons: 10, price: 7000, courseType: '私教课', productName: '青少年1v2私教课', timeBand: '黄金时间', maxStudents: 2 },
  '青少年1v2 非黄时间10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '青少年1v2私教课', timeBand: '非黄时间', maxStudents: 2 }
};

const PURCHASE_TARGETS = {
  'seed-purchase-001': '青少年1v1 黄金时间20课时（历史）',
  'seed-purchase-002': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-003': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-005': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-006': '成人1v1 黄金时间10课时（历史）',
  'seed-renewal-006': '成人1v1 非黄时间50课时（历史）',
  'seed-purchase-007': '青少年1v1 非黄时间10课时',
  'seed-renewal-007': '青少年1v1 黄金时间10课时',
  'seed-purchase-008': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-009': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-010': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-011': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-014': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-015': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-016': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-017': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-018': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-019': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-020': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-021': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-022': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-023': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-024': '成人1v1 非黄时间20课时（历史）',
  'seed-purchase-025': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-026': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-027': '青少年1v1 黄金时间10课时',
  'seed-purchase-028': '青少年1v1 黄金时间10课时',
  'seed-purchase-029': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-030': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-031': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-032': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-033': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-034': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-035': '成人1v1 非黄时间10课时',
  'seed-purchase-036': '成人1v1 朝珺非黄金10课时',
  'seed-purchase-037': '青少年1v1 黄金时间10课时',
  'seed-purchase-038': '成人1v1 非黄时间10课时',
  'seed-renewal-038': '成人1v1 非黄时间20课时（历史）',
  'seed-purchase-039': '成人1v1 非黄时间10课时',
  'seed-purchase-040': '成人1v1 黄金时间20课时',
  'seed-purchase-041': '成人1v1 非黄时间10课时',
  'seed-purchase-042': '成人1v1 非黄时间10课时',
  'seed-purchase-043': '成人1v1 非黄时间10课时',
  'seed-purchase-044': '成人1v1 非黄时间10课时',
  'seed-purchase-045': '成人1v1 非黄时间10课时'
};

const NOT_IN_SYSTEM = new Set(['seed-purchase-012', 'seed-purchase-013']);

const SPLIT_PURCHASES = {
  'seed-purchase-004': [
    { suffix: 'gold', targetName: '青少年1v2 黄金时间10课时（历史）', lessons: 10, amountPaid: 5500 },
    { suffix: 'nonprime', targetName: '青少年1v2 非黄时间10课时（历史）', lessons: 10, amountPaid: 5500 }
  ]
};

const MANUAL_CONFIRMATION_ROWS = [
  { studentName: '佑佑', targetName: '青少年1v1 黄金时间20课时（历史）', source: '用户文本历史补充' },
  { studentName: 'misha', targetName: '成人1v1 朝珺黄金10课时（历史）', source: '用户文本历史补充' },
  { studentName: '黄总', targetName: '成人1v1 朝珺黄金10课时（历史）', source: '用户文本历史补充' },
  { studentName: '线熙宇（哈库呐玛塔塔）', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '李嵚', targetName: '成人1v1 黄金时间10课时（历史）', match: { idOrContains: 'initial:2026-01-15' }, source: '用户文本历史补充' },
  { studentName: '李嵚', targetName: '成人1v1 非黄时间50课时（历史）', match: { idOrContains: 'renew:2026-03-07' }, source: '用户文本历史补充' },
  { studentName: '丫丫', targetName: '青少年1v1 非黄时间10课时', match: { id: 'seed-purchase-007' }, source: '用户文本历史补充' },
  { studentName: '丫丫', targetName: '青少年1v1 黄金时间10课时', match: { id: 'seed-renewal-007' }, source: '用户文本历史补充' },
  { studentName: '润瑾', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '朦朦', targetName: '成人1v1 黄金时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '简先生', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '纪宁（vii）', targetName: '成人1v1 黄金时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '永阳', targetName: '成人1v1 朝珺黄金10课时（历史）', source: '用户文本历史补充' },
  { studentName: '马杰', targetName: '成人1v1 朝珺黄金10课时（历史）', source: '用户文本历史补充' },
  { studentName: '小土豆的姐姐', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '朱一龙', targetName: '成人1v1 朝珺黄金10课时（历史）', source: '用户文本历史补充' },
  { studentName: 'Oliver', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '·J ·', targetName: '成人1v1 黄金时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '袁博', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '余晓溪', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '葡萄', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '赵新阳 田秀楠', targetName: '成人1v1 非黄时间20课时（历史）', source: '用户文本历史补充' },
  { studentName: '王玺宁', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: 'Caranee', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '张佳良老大', targetName: '青少年1v1 黄金时间10课时', source: '用户文本历史补充' },
  { studentName: '张佳良老二', targetName: '青少年1v1 黄金时间10课时', source: '用户文本历史补充' },
  { studentName: '闫瀚珑AceYan', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '高老师（暖暖爸爸）', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '杨子一', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '魏平涛 18600803917', targetName: '成人1v1 黄金时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '袁冶', targetName: '成人1v1 非黄时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: '小林、德德', targetName: '成人1v1 黄金时间10课时（历史）', source: '用户文本历史补充' },
  { studentName: 'W.Jing', targetName: '成人1v1 非黄时间20课时（历史）', match: { sourceKeyIncludes: '|renew|' }, source: '用户文本历史补充' },
  { studentName: '暴晓燕', targetName: '成人1v2 黄金时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '宋缇缇', targetName: '成人1v1 朝珺非黄金10课时', source: '课包归属人工确认CSV' },
  { studentName: '淇淇（ZT）', targetName: '青少年1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: 'W.Jing', targetName: '成人1v1 非黄时间10课时', match: { sourceKeyIncludes: '|initial|' }, source: '课包归属人工确认CSV' },
  { studentName: 'W.Jing朋友', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '是锤锤呀', targetName: '成人1v1 黄金时间20课时', source: '课包归属人工确认CSV' },
  { studentName: '张昊', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '李鹏昊', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '宗钰', targetName: '成人1v1 朝珺非黄金10课时', source: '课包归属人工确认CSV' },
  { studentName: '李先生（李俊泽）', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '马晨', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: 'kRyst4l', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '莱因哈特', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: 'mjh（小胡）', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '吕瑜 黄晴', targetName: '成人1v2 黄金时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '小土豆的姐姐的朋友', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '晓曼-马坡', targetName: '成人1v1 朝珺黄金10课时（历史）', source: '课包归属人工确认CSV' },
  { studentName: '熊', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '莲儿（连女士）', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '艾女士', targetName: '成人1v1 朝珺非黄金10课时', source: '课包归属人工确认CSV' },
  { studentName: '芦先生', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: 'LKY（苏女士）', targetName: '成人1v2 黄金时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '刘贺', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '笑笑', targetName: '青少年1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '璇', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '王麦枘', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: 'M.Z', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '🐲L.（瑶瑶）', targetName: '成人1v1 朝珺非黄金10课时', source: '课包归属人工确认CSV' },
  { studentName: '葛超、Madison He', targetName: '成人1v2 黄金时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '暴躁壹壹', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '暴躁壹壹男朋友', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV' },
  { studentName: '宋曦', targetName: '成人1v1 朝珺非黄金10课时', source: '课包归属人工确认CSV' },
  { studentName: '子杰', targetName: '成人1v1 非黄时间10课时', source: '课包归属人工确认CSV', missingInCurrentBackup: true }
];

function inferTargetName(purchase = {}) {
  const studentName = String(purchase.studentName || '').trim();
  const packageName = String(purchase.packageName || '').trim();
  const lessons = Number(purchase.packageLessons) || 0;
  if (studentName === '朦朦') return '成人1v1 黄金时间10课时（历史）';
  if (studentName === '简先生') return '成人1v1 非黄时间10课时（历史）';
  if (/淇淇/.test(studentName) || /张佳良/.test(studentName)) return '青少年1v1 黄金时间10课时';
  if (/青少年1v1/.test(packageName)) return '青少年1v1 黄金时间10课时';
  if (/成人1v1/.test(packageName) && lessons === 20) return '成人1v1 黄金时间20课时';
  if (/成人1v1/.test(packageName)) return '成人1v1 非黄时间10课时';
  return '';
}

function nowInChinaTime() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 19)}+08:00`;
}

function slug(value) {
  return String(value || '').replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function packageIdForName(name) {
  return `fix-20260521-${slug(name)}`.slice(0, 120);
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeCoachName(value) {
  const text = normalizeName(value);
  if (/chaojun|朝珺|甄朝珺/i.test(text)) return '朝珺';
  if (/siren/i.test(text)) return 'Siren';
  return text;
}

function normalizePackageTimeBand(value) {
  const text = normalizeName(value);
  if (text === '黄金时间' || text === '黄金') return '黄金时段';
  if (text === '非黄时间' || text === '非黄金时间' || text === '非黄金') return '非黄金时段';
  return text || '全天';
}

function packageDailyTimeWindows(timeBand) {
  const band = normalizePackageTimeBand(timeBand);
  if (band === '黄金时段') return [
    { label: '工作日', startTime: '16:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
    { label: '周六日', startTime: '09:00', endTime: '22:00', daysOfWeek: [6, 7] }
  ];
  if (band === '非黄金时段') return [
    { label: '工作日', startTime: '09:00', endTime: '16:00', daysOfWeek: [1, 2, 3, 4, 5] }
  ];
  return [
    { label: '工作日', startTime: '09:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
    { label: '周六日', startTime: '09:00', endTime: '22:00', daysOfWeek: [6, 7] }
  ];
}

function normalizeMatchName(value) {
  return normalizeName(value)
    .replace(/[？?]/g, '')
    .replace(/（小胡）/g, '小胡')
    .replace(/（李俊泽）/g, '')
    .replace(/-马坡/g, '')
    .replace(/\s*\d{11}\s*/g, '')
    .toLowerCase();
}

function parseCsvLine(line) {
  const row = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(current.replace(/^\uFEFF/, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  row.push(current.replace(/^\uFEFF/, ''));
  return row;
}

function parseCsvFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length)
    .map(parseCsvLine);
}

function toNumber(value) {
  const num = Number(String(value || '').trim().replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function normalizeSourceDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (match) return `2026-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})月(\d{1,2})$/);
  if (match) return `2026-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return text;
}

function findUniquePackage(packages, name) {
  const matches = (packages || []).filter((row) => normalizeName(row.name) === normalizeName(name));
  if (matches.length > 1) return { error: `目标课包重名：${name}` };
  return { package: matches[0] || null };
}

function targetNameForPurchase(purchase = {}) {
  const explicit = PURCHASE_TARGETS[purchase.id] || '';
  if (explicit) return explicit;
  const studentName = normalizeName(purchase.studentName);
  const matched = MANUAL_CONFIRMATION_ROWS.find((row) => {
    if (normalizeName(row.studentName) !== studentName) return false;
    if (!row.match) return true;
    return Object.entries(row.match).every(([key, value]) => {
      if (key === 'sourceKeyIncludes') return String(purchase.sourceKey || '').includes(String(value));
      if (key === 'idOrContains') return String(purchase.id || '') === String(value) || String(purchase.id || '').includes(String(value));
      return String(purchase[key] || '') === String(value);
    });
  });
  return matched?.targetName || inferTargetName(purchase);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(headers.map((key) => csvEscape(row[key])).join(',')));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function buildPackage(name, now) {
  const spec = TARGET_SPECS[name];
  if (!spec) throw new Error(`缺少目标课包规格：${name}`);
  const sourceProduct = (seed.products || []).find((row) => row.name === spec.productName) || {};
  return {
    id: packageIdForName(name),
    name,
    productId: sourceProduct.id || '',
    productName: spec.productName || '',
    courseType: spec.courseType || '',
    lessons: spec.lessons || 0,
    price: spec.price || 0,
    validDays: spec.validDays || 0,
    saleStartDate: '',
    saleEndDate: '',
    usageStartDate: '',
    usageEndDate: '',
    dailyTimeWindows: packageDailyTimeWindows(spec.timeBand),
    timeBand: normalizePackageTimeBand(spec.timeBand),
    ownerCoach: spec.ownerCoach || '',
    coachIds: spec.coachNames || [],
    coachNames: spec.coachNames || [],
    campusIds: ['mabao'],
    maxStudents: spec.maxStudents || 1,
    status: /（历史）/.test(name) ? 'inactive' : 'active',
    sourceType: 'package_ownership_fix_20260521',
    createdAt: now,
    updatedAt: now
  };
}

function normalizeExistingTargetPackage(row, name, now) {
  const base = buildPackage(name, now);
  return {
    ...row,
    ...base,
    id: row.id || base.id,
    createdAt: row.createdAt || base.createdAt,
    updatedAt: now
  };
}

function applyPackageSnapshot(row, targetPackage, sourcePackage, now, kind) {
  const next = {
    ...row,
    packageId: targetPackage.id,
    packageName: targetPackage.name || '',
    productId: targetPackage.productId || row.productId || '',
    productName: targetPackage.productName || row.productName || '',
    courseType: targetPackage.courseType || row.courseType || '',
    timeBand: kind === 'entitlement' ? (normalizePackageTimeBand(targetPackage.timeBand) || row.timeBand || '') : row.timeBand,
    packageTimeBand: kind === 'purchase' ? (normalizePackageTimeBand(targetPackage.timeBand) || row.packageTimeBand || '') : row.packageTimeBand,
    dailyTimeWindows: targetPackage.dailyTimeWindows || [],
    coachIds: targetPackage.coachIds || row.coachIds || [],
    coachNames: targetPackage.coachNames || row.coachNames || [],
    ownerCoach: row.ownerCoach || targetPackage.ownerCoach || '',
    campusIds: targetPackage.campusIds || row.campusIds || [],
    maxStudents: targetPackage.maxStudents || row.maxStudents || 1,
    originalPackageId: row.originalPackageId || row.packageId || sourcePackage?.id || '',
    originalPackageName: row.originalPackageName || row.packageName || sourcePackage?.name || '',
    packageOwnershipFixedAt: now,
    updatedAt: now
  };
  if (kind === 'purchase') {
    next.packagePrice = Number(targetPackage.price) || Number(row.packagePrice) || 0;
    next.systemAmount = Number(targetPackage.price) || Number(row.systemAmount) || 0;
    next.priceSource = 'package';
    next.priceSourceId = targetPackage.id;
    next.priceSourceName = targetPackage.name || '';
    next.priceOverridden = Number(next.systemAmount || 0) !== Number(next.amountPaid || next.finalAmount || 0);
    if (next.priceOverridden && !next.overrideReason) next.overrideReason = '历史导入实际成交价';
  }
  return next;
}

function allocateSplitLessons(totalUsed, index, count) {
  const used = Number(totalUsed) || 0;
  const base = Math.floor(used / count);
  const extra = index < (used % count) ? 1 : 0;
  return base + extra;
}

function buildSplitRows(purchase, entitlements, targetByName, sourcePackage, now) {
  const rules = SPLIT_PURCHASES[purchase.id] || [];
  const sourceEntitlements = (entitlements || []).filter((row) => String(row.purchaseId || '') === String(purchase.id || ''));
  const sourceEntitlement = sourceEntitlements[0] || {};
  const purchaseUpdates = [];
  const entitlementUpdates = [];
  rules.forEach((rule, index) => {
    const targetPackage = targetByName.get(rule.targetName);
    if (!targetPackage) return;
    const purchaseId = `${purchase.id}-${rule.suffix}`;
    purchaseUpdates.push(applyPackageSnapshot({
      ...purchase,
      id: purchaseId,
      packageLessons: rule.lessons,
      amountPaid: rule.amountPaid,
      finalAmount: rule.amountPaid,
      splitFromPurchaseId: purchase.id
    }, targetPackage, sourcePackage, now, 'purchase'));
    if (sourceEntitlement.id) {
      const usedLessons = allocateSplitLessons(sourceEntitlement.usedLessons, index, rules.length);
      entitlementUpdates.push(applyPackageSnapshot({
        ...sourceEntitlement,
        id: `${sourceEntitlement.id}-${rule.suffix}`,
        purchaseId,
        totalLessons: rule.lessons,
        usedLessons,
        remainingLessons: Math.max(0, rule.lessons - usedLessons),
        splitFromEntitlementId: sourceEntitlement.id
      }, targetPackage, sourcePackage, now, 'entitlement'));
    }
  });
  const voidedPurchase = {
    ...purchase,
    packageId: '',
    packageName: `${purchase.packageName || ''}（已拆分）`.trim(),
    status: 'voided',
    voidReason: '课包归属修正：拆分为黄金/非黄两条订单',
    voidedAt: now,
    packageOwnershipFixedAt: now,
    updatedAt: now
  };
  const voidedEntitlements = sourceEntitlements.map((row) => ({
    ...row,
    packageId: '',
    packageName: `${row.packageName || ''}（已拆分）`.trim(),
    status: 'voided',
    voidReason: '课包归属修正：拆分为黄金/非黄两条权益',
    voidedAt: now,
    packageOwnershipFixedAt: now,
    updatedAt: now
  }));
  return { purchaseUpdates: [voidedPurchase, ...purchaseUpdates], entitlementUpdates: [...voidedEntitlements, ...entitlementUpdates] };
}

function buildVoidedRowsForNotInSystem(purchase, entitlements, now) {
  return {
    purchaseUpdates: [{
      ...purchase,
      packageId: '',
      packageName: `${purchase.packageName || ''}（不进系统）`.trim(),
      status: 'voided',
      voidReason: '不录入系统：情况复杂，课包归属清理',
      voidedAt: now,
      packageOwnershipFixedAt: now,
      updatedAt: now
    }],
    entitlementUpdates: (entitlements || []).filter((row) => String(row.purchaseId || '') === String(purchase.id || '')).map((row) => ({
      ...row,
      packageId: '',
      packageName: `${row.packageName || ''}（不进系统）`.trim(),
      status: 'voided',
      voidReason: '不录入系统：情况复杂，课包归属清理',
      voidedAt: now,
      packageOwnershipFixedAt: now,
      updatedAt: now
    }))
  };
}

function buildPackageOwnershipPlan({ packages = [], purchases = [], entitlements = [], now = nowInChinaTime() } = {}) {
  const plan = { creates: [], purchaseUpdates: [], entitlementUpdates: [], packageDeletes: [], blockers: [], skips: [] };
  const packageById = new Map((packages || []).map((row) => [String(row.id || ''), row]));
  const targetByName = new Map();
  const requiredTargetNames = new Set([
    ...Object.values(PURCHASE_TARGETS),
    ...MANUAL_CONFIRMATION_ROWS.map((row) => row.targetName),
    ...Object.values(SPLIT_PURCHASES).flat().map((rule) => rule.targetName)
  ]);

  for (const name of requiredTargetNames) {
    const found = findUniquePackage(packages, name);
    if (found.error) {
      plan.blockers.push(found.error);
      continue;
    }
    if (found.package) {
      targetByName.set(name, found.package);
    } else {
      const created = buildPackage(name, now);
      targetByName.set(name, created);
      plan.creates.push(created);
    }
  }

  for (const purchase of purchases || []) {
    if (!OLD_PACKAGE_IDS.has(String(purchase.packageId || ''))) continue;
    if (NOT_IN_SYSTEM.has(String(purchase.id || ''))) {
      const voided = buildVoidedRowsForNotInSystem(purchase, entitlements, now);
      plan.purchaseUpdates.push(...voided.purchaseUpdates);
      plan.entitlementUpdates.push(...voided.entitlementUpdates);
      plan.skips.push(`${purchase.studentName || purchase.id} 不进系统，作废旧订单/权益`);
      continue;
    }
    if (SPLIT_PURCHASES[purchase.id]) {
      const sourcePackage = packageById.get(String(purchase.packageId || '')) || {};
      const split = buildSplitRows(purchase, entitlements, targetByName, sourcePackage, now);
      plan.purchaseUpdates.push(...split.purchaseUpdates);
      plan.entitlementUpdates.push(...split.entitlementUpdates);
      continue;
    }
    const targetName = targetNameForPurchase(purchase);
    if (!targetName) {
      plan.blockers.push(`未明确归属：${purchase.id} ${purchase.studentName || ''} ${purchase.packageName || ''}`.trim());
      continue;
    }
    const targetPackage = targetByName.get(targetName);
    if (!targetPackage) continue;
    const sourcePackage = packageById.get(String(purchase.packageId || '')) || {};
    plan.purchaseUpdates.push(applyPackageSnapshot(purchase, targetPackage, sourcePackage, now, 'purchase'));
    for (const entitlement of (entitlements || []).filter((row) => String(row.purchaseId || '') === String(purchase.id || ''))) {
      plan.entitlementUpdates.push(applyPackageSnapshot(entitlement, targetPackage, sourcePackage, now, 'entitlement'));
    }
  }

  const nextPurchasePackageIds = new Set((purchases || []).map((row) => {
    const updated = plan.purchaseUpdates.find((next) => next.id === row.id);
    return String((updated || row).packageId || '');
  }));
  const nextEntitlementPackageIds = new Set((entitlements || []).map((row) => {
    const updated = plan.entitlementUpdates.find((next) => next.id === row.id);
    return String((updated || row).packageId || '');
  }));

  for (const pkg of packages || []) {
    if (!OLD_PACKAGE_IDS.has(String(pkg.id || ''))) continue;
    if (nextPurchasePackageIds.has(String(pkg.id)) || nextEntitlementPackageIds.has(String(pkg.id))) {
      plan.blockers.push(`旧课包仍有引用，不能删除：${pkg.name || pkg.id}`);
    } else {
      plan.packageDeletes.push(pkg);
    }
  }

  return plan;
}

function printPlan(plan) {
  console.log(`创建课包：${plan.creates.length}`);
  plan.creates.forEach((row) => console.log(`+ ${row.name}`));
  console.log(`迁移订单：${plan.purchaseUpdates.length}`);
  console.log(`迁移权益：${plan.entitlementUpdates.length}`);
  console.log(`可删除旧课包：${plan.packageDeletes.length}`);
  plan.packageDeletes.forEach((row) => console.log(`- ${row.name}`));
  if (plan.skips.length) console.log(`跳过：${plan.skips.join('；')}`);
  if (plan.blockers.length) {
    console.log('阻塞：');
    plan.blockers.forEach((item) => console.log(`! ${item}`));
  }
}

function parseStatsCsvRows(filePath = DEFAULT_STATS_CSV) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsvFile(filePath).slice(2).map((row, index) => ({
    sourceRowNo: index + 3,
    studentName: normalizeName(row[1]),
    audience: normalizeName(row[2]),
    classSize: normalizeName(row[3]),
    purchaseType: normalizeName(row[4]),
    lessons: toNumber(row[5]),
    paidAmount: toNumber(row[6]),
    purchaseDate: normalizeSourceDate(row[7]),
    ownerCoach: normalizeName(row[8]),
    notes: normalizeName(row[22])
  })).filter((row) => row.studentName);
}

function buildStatsRowsFromSeedPurchases(purchases = []) {
  return (purchases || []).map((purchase, index) => ({
    sourceRowNo: index + 1,
    studentName: normalizeName(purchase.studentName),
    audience: /青少年/.test(purchase.productName || purchase.packageName || '') ? '青少年' : '成人',
    classSize: /1v2/.test(purchase.productName || purchase.packageName || '') ? '1v2' : '1v1',
    purchaseType: /renewal|renew/.test(String(purchase.id || '')) ? '续报' : '首次',
    lessons: Number(purchase.packageLessons) || 0,
    paidAmount: Number(purchase.amountPaid ?? purchase.finalAmount) || 0,
    purchaseDate: normalizeSourceDate(purchase.purchaseDate),
    ownerCoach: normalizeName(purchase.ownerCoach || (purchase.coachNames || [])[0] || ''),
    notes: normalizeName(purchase.notes)
  })).filter((row) => row.studentName);
}

function parseConfirmationCsvRows(filePath = DEFAULT_CONFIRMATION_CSV) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsvFile(filePath).slice(1).map((row) => ({
    studentName: normalizeName(row[0]),
    purchaseType: '首次',
    lessons: toNumber(row[3]),
    paidAmount: toNumber(row[5]),
    purchaseDate: normalizeSourceDate(row[6]),
    ownerCoach: normalizeName(row[7]),
    targetName: normalizeTargetPackageName(row[8])
  })).filter((row) => row.studentName && row.targetName);
}

function normalizeTargetPackageName(value) {
  const text = normalizeName(value);
  if (!text) return '';
  if (text === '成人1v1 非黄时间10课时（朝珺）') return '成人1v1 朝珺非黄金10课时';
  if (text === '成人1v1 黄金时间10课时（朝珺）') return '成人1v1 朝珺黄金10课时（历史）';
  return text;
}

function statsRowKey(row) {
  const purchaseDate = normalizeSourceDate(row.purchaseDate || row[7]);
  return [
    normalizeMatchName(row.studentName),
    row.purchaseType || row[4] || '',
    Number(row.lessons) || 0,
    Number(row.paidAmount) || 0,
    purchaseDate
  ].join('|');
}

function purchaseKey(row) {
  return [
    normalizeMatchName(row.studentName),
    /renewal|renew/.test(String(row.id || '')) ? '续报' : '首次',
    Number(row.packageLessons) || 0,
    Number(row.amountPaid ?? row.finalAmount) || 0,
    normalizeSourceDate(row.purchaseDate)
  ].join('|');
}

function buildPurchaseIndexes(purchases = []) {
  const exact = new Map();
  const byName = new Map();
  for (const purchase of purchases) {
    exact.set(purchaseKey(purchase), purchase);
    const name = normalizeMatchName(purchase.studentName);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(purchase);
  }
  return { exact, byName };
}

function findPurchaseForStatsRow(row, indexes) {
  const exact = indexes.exact.get(statsRowKey(row));
  if (exact) return exact;
  const candidates = indexes.byName.get(normalizeMatchName(row.studentName)) || [];
  return candidates.find((item) => (
    Number(item.packageLessons) === Number(row.lessons)
    && Number(item.amountPaid ?? item.finalAmount) === Number(row.paidAmount)
  )) || candidates.find((item) => Number(item.packageLessons) === Number(row.lessons)) || null;
}

function targetNameFromStatsRow(row, confirmationByKey, options = {}) {
  const name = normalizeName(row.studentName);
  if (/Halena|Willian|Lam|Loon/i.test(name)) return '';
  if (name === '佑佑') return '青少年1v1 黄金时间20课时（历史）';
  if (['misha', '黄总', '永阳', '马杰', '朱一龙'].includes(name)) return '成人1v1 朝珺黄金10课时（历史）';
  if (['宋缇缇', '宗钰', '艾女士', '🐲L.（瑶瑶）', '宋曦'].includes(name)) return '成人1v1 朝珺非黄金10课时';
  if (name === '晓曼') return '成人1v1 朝珺黄金10课时（历史）';
  if (name === '赵新阳 田秀楠') return '成人1v1 非黄时间20课时（历史）';
  if (name === '袁冶') return '成人1v1 非黄时间10课时（历史）';
  if (name === '小林、德德') return '成人1v1 黄金时间10课时（历史）';
  const confirmed = confirmationByKey.get(statsRowKey(row));
  if (confirmed) return confirmed.targetName;
  if (name === '赵雨桐、赵雨晴') return '青少年1v2 黄金时间10课时（历史） + 青少年1v2 非黄时间10课时（历史）';
  if (row.audience === '青少年' && row.classSize === '1v2') return row.purchaseType === '续报' ? '青少年1v2 黄金时间10课时' : '青少年1v2 黄金时间10课时（历史）';
  if (row.audience === '成人' && row.classSize === '1v2') return '成人1v2 黄金时间10课时';
  if (name === '李嵚' && row.purchaseType === '续报') return '成人1v1 非黄时间50课时（历史）';
  if (name === '李嵚') return '成人1v1 黄金时间10课时（历史）';
  if (name === '丫丫' && row.purchaseType === '首次') return '青少年1v1 非黄时间10课时 + 青少年1v1 黄金时间10课时';
  if (name === '丫丫' && /非黄/.test(row.notes)) return '青少年1v1 非黄时间10课时';
  if (name === '丫丫' && /黄金/.test(row.notes)) return '青少年1v1 黄金时间10课时';
  const legacy = options.legacy !== false && row.sourceRowNo < 36;
  if (row.audience === '青少年') {
    if (row.lessons >= 20) return legacy ? '青少年1v1 黄金时间20课时（历史）' : '青少年1v1 黄金时间10课时';
    return legacy ? '青少年1v1 黄金时间10课时（历史）' : '青少年1v1 黄金时间10课时';
  }
  if (row.lessons === 20) return row.purchaseType === '续报' ? '成人1v1 非黄时间20课时（历史）' : '成人1v1 黄金时间20课时';
  if (row.lessons === 50) return '成人1v1 非黄时间50课时（历史）';
  if (['朦朦', '纪宁（vii）', '·J ·', '魏平涛', '小林、德德'].includes(name)) return '成人1v1 黄金时间10课时（历史）';
  return legacy && row.purchaseType === '首次' ? '成人1v1 非黄时间10课时（历史）' : '成人1v1 非黄时间10课时';
}

function packageTargetsForReport(targetName) {
  return String(targetName || '').split(' + ').map((name) => normalizeName(name)).filter(Boolean);
}

function packageField(targetName, getter) {
  return packageTargetsForReport(targetName).map((name) => getter(name, TARGET_SPECS[name] || {})).filter(Boolean).join(' + ');
}

function buildMappingRowsFromSourceCsv({ packages = [], purchases = [] } = {}, options = {}) {
  const statsRows = options.statsRows || parseStatsCsvRows(options.statsCsv || DEFAULT_STATS_CSV);
  const confirmationRows = parseConfirmationCsvRows(options.confirmationCsv || DEFAULT_CONFIRMATION_CSV);
  const confirmationByKey = new Map(confirmationRows.map((row) => [statsRowKey(row), row]));
  const packageByName = new Map((packages || []).map((row) => [normalizeName(row.name), row]));
  const purchaseIndexes = buildPurchaseIndexes(purchases);
  return statsRows.map((row) => {
    const targetName = targetNameFromStatsRow(row, confirmationByKey, options);
    const purchase = findPurchaseForStatsRow(row, purchaseIndexes);
    const targets = packageTargetsForReport(targetName);
    const notInSystem = /Halena|Willian|Lam|Loon/i.test(row.studentName);
    const pkgIds = targets.map((name) => (packageByName.get(normalizeName(name)) || {}).id || packageIdForName(name));
    return {
      sourceRowNo: row.sourceRowNo,
      studentName: row.studentName,
      purchaseId: purchase?.id || '',
      targetPackageName: targetName || '不录入系统',
      targetPackageId: pkgIds.join(' + '),
      currentPackageName: purchase?.packageName || '',
      currentPackageId: purchase?.packageId || '',
      lessons: row.lessons,
      paidAmount: row.paidAmount,
      purchaseDate: row.purchaseDate,
      audience: row.audience,
      classSize: row.classSize,
      timeBand: packageField(targetName, (name, spec) => normalizePackageTimeBand(spec.timeBand || (/黄金/.test(name) ? '黄金时间' : /非黄/.test(name) ? '非黄时间' : ''))),
      ownerCoach: packageField(targetName, (name, spec) => spec.ownerCoach) || normalizeCoachName(row.ownerCoach),
      campus: packageField(targetName, (_name, spec) => (spec.campusIds || ['mabao']).join('|')) || 'mabao',
      maxStudents: packageField(targetName, (_name, spec) => spec.maxStudents),
      status: notInSystem ? '不录入系统' : (targets.some((name) => /（历史）/.test(name)) ? '已停售' : '售卖中'),
      source: `${path.basename(options.statsCsv || DEFAULT_STATS_CSV)}#${row.sourceRowNo}${purchase ? '' : '；当前线上未找到订单'}`
    };
  });
}

function buildMappingRows({ packages = [], purchases = [] } = {}) {
  const packageByName = new Map((packages || []).map((row) => [normalizeName(row.name), row]));
  const rows = [];
  const seenPurchaseIds = new Set();
  const addRow = (purchase, targetName, source) => {
    if (!targetName) return;
      const spec = TARGET_SPECS[targetName] || {};
      const pkg = packageByName.get(normalizeName(targetName)) || {};
      rows.push({
        studentName: purchase?.studentName || '',
        purchaseId: purchase?.id || '',
        targetPackageName: targetName,
        targetPackageId: pkg.id || packageIdForName(targetName),
        currentPackageName: purchase?.packageName || '',
        currentPackageId: purchase?.packageId || '',
        lessons: spec.lessons || purchase?.packageLessons || '',
        paidAmount: purchase?.amountPaid ?? purchase?.finalAmount ?? '',
        timeBand: normalizePackageTimeBand(spec.timeBand),
        ownerCoach: spec.ownerCoach || purchase?.ownerCoach || '',
        campus: (spec.campusIds || pkg.campusIds || ['mabao']).join('|'),
        maxStudents: spec.maxStudents || '',
        status: /（历史）/.test(targetName) ? '已停售' : '售卖中',
        source
      });
      if (purchase?.id) seenPurchaseIds.add(String(purchase.id));
  };
  for (const purchase of purchases || []) {
    if (NOT_IN_SYSTEM.has(String(purchase.id || ''))) continue;
    if (SPLIT_PURCHASES[purchase.id]) SPLIT_PURCHASES[purchase.id].forEach((rule) => addRow(purchase, rule.targetName, '历史订单拆分'));
  }
  for (const row of MANUAL_CONFIRMATION_ROWS) {
    const purchase = (purchases || []).find((item) => normalizeName(item.studentName) === normalizeName(row.studentName)
      && (!row.match || Object.entries(row.match).every(([key, value]) => {
        if (key === 'sourceKeyIncludes') return String(item.sourceKey || '').includes(String(value));
        if (key === 'idOrContains') return String(item.id || '') === String(value) || String(item.id || '').includes(String(value));
        return String(item[key] || '') === String(value);
      })));
    if (purchase && seenPurchaseIds.has(String(purchase.id || ''))) continue;
    addRow(purchase || { studentName: row.studentName }, row.targetName, row.missingInCurrentBackup ? `${row.source}；当前备份未找到订单` : row.source);
  }
  return rows.sort((a, b) => String(a.studentName).localeCompare(String(b.studentName), 'zh-Hans-CN')
    || String(a.targetPackageName).localeCompare(String(b.targetPackageName), 'zh-Hans-CN'));
}

function purchaseMatchScore(purchase, row) {
  if (normalizeMatchName(purchase.studentName) !== normalizeMatchName(row.studentName)) return -1;
  let score = 10;
  if (Number(purchase.packageLessons) === Number(row.lessons)) score += 8;
  if (Number(purchase.amountPaid ?? purchase.finalAmount) === Number(row.paidAmount)) score += 8;
  if (normalizeSourceDate(purchase.purchaseDate) === normalizeSourceDate(row.purchaseDate)) score += 8;
  const purchaseType = /renewal|renew/.test(String(purchase.id || purchase.sourceType || '')) ? '续报' : '首次';
  if (purchaseType === row.purchaseType) score += 4;
  return score;
}

function findBestPurchaseForSourceRow(row, purchases, usedIds) {
  const candidates = (purchases || []).filter((purchase) => !usedIds.has(String(purchase.id || ''))
    && String(purchase.status || 'active') !== 'voided'
    && normalizeMatchName(purchase.studentName) === normalizeMatchName(row.studentName));
  return candidates.map((purchase) => ({ purchase, score: purchaseMatchScore(purchase, row) }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)[0]?.purchase || null;
}

function findCompositePurchaseForRows(rows, purchases, usedIds) {
  if (!rows.length) return null;
  const name = normalizeMatchName(rows[0].studentName);
  const lessons = rows.reduce((sum, row) => sum + (Number(row.lessons) || 0), 0);
  const paidAmount = rows.reduce((sum, row) => sum + (Number(row.paidAmount) || 0), 0);
  return (purchases || []).find((purchase) => !usedIds.has(String(purchase.id || ''))
    && String(purchase.status || 'active') !== 'voided'
    && normalizeMatchName(purchase.studentName) === name
    && Number(purchase.packageLessons) === lessons
    && Number(purchase.amountPaid ?? purchase.finalAmount) === paidAmount) || null;
}

function targetPackageForName(targetByName, name) {
  return targetByName.get(normalizeName(name)) || targetByName.get(name) || null;
}

function applySourcePackageSnapshot(row, targetPackage, sourceRow, now, kind) {
  const next = applyPackageSnapshot(row, targetPackage, null, now, kind);
  next.ownerCoach = targetPackage.ownerCoach || normalizeCoachName(sourceRow.ownerCoach) || next.ownerCoach || '';
  next.coachNames = targetPackage.coachNames?.length ? targetPackage.coachNames : (next.ownerCoach ? [next.ownerCoach] : next.coachNames || []);
  next.coachIds = next.coachNames;
  next.allowedCoaches = next.coachNames;
  next.campusIds = targetPackage.campusIds || ['mabao'];
  if (kind === 'purchase') {
    next.packageName = targetPackage.name || '';
    next.packageId = targetPackage.id || '';
    next.packageTimeBand = normalizePackageTimeBand(targetPackage.timeBand);
    next.packageOwnershipFixedAt = now;
    next.updatedAt = now;
  } else {
    next.packageName = targetPackage.name || '';
    next.packageId = targetPackage.id || '';
    next.timeBand = normalizePackageTimeBand(targetPackage.timeBand);
    next.packageOwnershipFixedAt = now;
    next.updatedAt = now;
  }
  return next;
}

function buildSourceCsvOwnershipPlan({ packages = [], purchases = [], entitlements = [], now = nowInChinaTime() } = {}, options = {}) {
  const statsRows = options.statsRows || parseStatsCsvRows(options.statsCsv || DEFAULT_STATS_CSV);
  const confirmationRows = parseConfirmationCsvRows(options.confirmationCsv || DEFAULT_CONFIRMATION_CSV);
  const confirmationByKey = new Map(confirmationRows.map((row) => [statsRowKey(row), row]));
  const targetNames = new Set();
  for (const row of statsRows) {
    packageTargetsForReport(targetNameFromStatsRow(row, confirmationByKey, options)).forEach((name) => targetNames.add(name));
  }
  const packageByName = new Map((packages || []).map((row) => [normalizeName(row.name), row]));
  const targetByName = new Map();
  const plan = { packageUpdates: [], creates: [], purchaseUpdates: [], entitlementUpdates: [], blockers: [], skips: [] };
  for (const name of targetNames) {
    if (!TARGET_SPECS[name]) {
      plan.blockers.push(`缺少目标课包规格：${name}`);
      continue;
    }
    const existing = packageByName.get(normalizeName(name));
    if (existing) {
      const fixed = normalizeExistingTargetPackage(existing, name, now);
      targetByName.set(normalizeName(name), fixed);
      plan.packageUpdates.push(fixed);
    } else {
      const created = buildPackage(name, now);
      targetByName.set(normalizeName(name), created);
      plan.creates.push(created);
    }
  }
  const usedPurchaseIds = new Set();
  for (let idx = 0; idx < statsRows.length; idx += 1) {
    const row = statsRows[idx];
    const targetName = targetNameFromStatsRow(row, confirmationByKey, options);
    const targets = packageTargetsForReport(targetName);
    if (!targets.length) {
      plan.skips.push(`${row.studentName} 不录入系统`);
      continue;
    }
    if (targets.length > 1) {
      plan.skips.push(`${row.studentName} 复合课包需保留已拆分/已有记录`);
      continue;
    }
    const nextRow = statsRows[idx + 1];
    if (nextRow && normalizeMatchName(nextRow.studentName) === normalizeMatchName(row.studentName) && normalizeSourceDate(nextRow.purchaseDate) === normalizeSourceDate(row.purchaseDate)) {
      const nextTargets = packageTargetsForReport(targetNameFromStatsRow(nextRow, confirmationByKey, options));
      const compositePurchase = findCompositePurchaseForRows([row, nextRow], purchases, usedPurchaseIds);
      if (compositePurchase && targets.length === 1 && nextTargets.length === 1) {
        const sourceEntitlements = (entitlements || []).filter((item) => String(item.purchaseId || '') === String(compositePurchase.id || ''));
        plan.purchaseUpdates.push({
          ...compositePurchase,
          packageId: '',
          packageName: `${compositePurchase.packageName || ''}（已拆分）`.trim(),
          status: 'voided',
          voidReason: '课包归属修正：按来源表拆分黄金/非黄订单',
          voidedAt: now,
          packageOwnershipFixedAt: now,
          updatedAt: now
        });
        plan.entitlementUpdates.push(...sourceEntitlements.map((entitlement) => ({
          ...entitlement,
          packageId: '',
          packageName: `${entitlement.packageName || ''}（已拆分）`.trim(),
          status: 'voided',
          voidReason: '课包归属修正：按来源表拆分黄金/非黄权益',
          voidedAt: now,
          packageOwnershipFixedAt: now,
          updatedAt: now
        })));
        [row, nextRow].forEach((sourceRow) => {
          const sourceTargetName = targetNameFromStatsRow(sourceRow, confirmationByKey, options);
          const sourcePackage = targetPackageForName(targetByName, packageTargetsForReport(sourceTargetName)[0]);
          if (!sourcePackage) return;
          const suffix = normalizePackageTimeBand(sourcePackage.timeBand) === '黄金时段' ? 'gold' : 'nonprime';
          const purchaseId = `${compositePurchase.id}-${suffix}`;
          plan.purchaseUpdates.push(applySourcePackageSnapshot({
            ...compositePurchase,
            id: purchaseId,
            packageLessons: sourceRow.lessons,
            amountPaid: sourceRow.paidAmount,
            finalAmount: sourceRow.paidAmount,
            splitFromPurchaseId: compositePurchase.id
          }, sourcePackage, sourceRow, now, 'purchase'));
          if (sourceEntitlements[0]) {
            const usedLessons = allocateSplitLessons(sourceEntitlements[0].usedLessons, suffix === 'gold' ? 1 : 0, 2);
            plan.entitlementUpdates.push(applySourcePackageSnapshot({
              ...sourceEntitlements[0],
              id: `${sourceEntitlements[0].id}-${suffix}`,
              purchaseId,
              totalLessons: sourceRow.lessons,
              usedLessons,
              remainingLessons: Math.max(0, sourceRow.lessons - usedLessons),
              splitFromEntitlementId: sourceEntitlements[0].id
            }, sourcePackage, sourceRow, now, 'entitlement'));
          }
        });
        usedPurchaseIds.add(String(compositePurchase.id || ''));
        idx += 1;
        continue;
      }
    }
    const targetPackage = targetPackageForName(targetByName, targets[0]);
    if (!targetPackage) continue;
    const purchase = findBestPurchaseForSourceRow(row, purchases, usedPurchaseIds);
    if (!purchase) {
      plan.skips.push(`${row.studentName} 当前线上未找到订单`);
      continue;
    }
    usedPurchaseIds.add(String(purchase.id || ''));
    plan.purchaseUpdates.push(applySourcePackageSnapshot(purchase, targetPackage, row, now, 'purchase'));
    for (const entitlement of (entitlements || []).filter((item) => String(item.purchaseId || '') === String(purchase.id || ''))) {
      plan.entitlementUpdates.push(applySourcePackageSnapshot(entitlement, targetPackage, row, now, 'entitlement'));
    }
  }
  return plan;
}

function maybeWriteMappingReport(argv, data) {
  const outputArg = argv.find((item) => item.startsWith('--mapping-csv='));
  if (!outputArg) return;
  const outputPath = outputArg.split('=').slice(1).join('=');
  const statsCsvArg = argv.find((item) => item.startsWith('--stats-csv='));
  const confirmationCsvArg = argv.find((item) => item.startsWith('--confirmation-csv='));
  const rows = buildMappingRowsFromSourceCsv(data, {
    statsCsv: statsCsvArg ? statsCsvArg.split('=').slice(1).join('=') : DEFAULT_STATS_CSV,
    confirmationCsv: confirmationCsvArg ? confirmationCsvArg.split('=').slice(1).join('=') : DEFAULT_CONFIRMATION_CSV
  });
  writeCsv(path.resolve(outputPath), [
    'sourceRowNo',
    'studentName',
    'purchaseId',
    'targetPackageName',
    'targetPackageId',
    'currentPackageName',
    'currentPackageId',
    'lessons',
    'paidAmount',
    'purchaseDate',
    'audience',
    'classSize',
    'timeBand',
    'ownerCoach',
    'campus',
    'maxStudents',
    'status',
    'source'
  ], rows);
  console.log(`映射表：${rows.length} 条 -> ${path.resolve(outputPath)}`);
}

function loadEnvFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`找不到环境变量文件：${resolved}`);
  dotenv.config({ path: resolved, override: true });
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const offlineSeed = argv.includes('--offline-seed');
  const sourceCsvPlan = argv.includes('--source-csv-plan');
  const envArg = argv.find((item) => item.startsWith('--env-file='));
  loadEnvFile(envArg ? envArg.split('=').slice(1).join('=') : '');

  let data;
  if (offlineSeed) {
    data = { packages: seed.packages, purchases: seed.purchases, entitlements: seed.entitlements };
  } else {
    await assertProductionTarget();
    const client = createClientFromEnv();
    data = {
      packages: await scanTable(client, TABLES.packages),
      purchases: await scanTable(client, TABLES.purchases),
      entitlements: await scanTable(client, TABLES.entitlements),
      client
    };
  }

  const plan = sourceCsvPlan ? buildSourceCsvOwnershipPlan(data) : buildPackageOwnershipPlan(data);
  if (sourceCsvPlan) {
    console.log(`修正课包主表：${plan.packageUpdates.length}`);
    console.log(`创建课包：${plan.creates.length}`);
    console.log(`修正订单：${plan.purchaseUpdates.length}`);
    console.log(`修正权益：${plan.entitlementUpdates.length}`);
    if (plan.skips.length) console.log(`跳过：${plan.skips.join('；')}`);
    if (plan.blockers.length) {
      console.log('阻塞：');
      plan.blockers.forEach((item) => console.log(`! ${item}`));
    }
  } else {
    printPlan(plan);
  }
  maybeWriteMappingReport(argv, data);
  if (plan.blockers.length) throw new Error('存在阻塞项，未写入');
  if (!write) return plan;
  if (offlineSeed) throw new Error('offline-seed 不允许写入');

  for (const row of plan.packageUpdates || []) await putRow(data.client, TABLES.packages, row);
  for (const row of plan.creates) await putRow(data.client, TABLES.packages, row);
  for (const row of plan.purchaseUpdates) await putRow(data.client, TABLES.purchases, row);
  for (const row of plan.entitlementUpdates) await putRow(data.client, TABLES.entitlements, row);
  for (const row of plan.packageDeletes || []) await deleteRow(data.client, TABLES.packages, row.id);
  console.log('写入完成');
  return plan;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  OLD_PACKAGE_IDS,
  TARGET_SPECS,
  PURCHASE_TARGETS,
  SPLIT_PURCHASES,
  NOT_IN_SYSTEM,
  MANUAL_CONFIRMATION_ROWS,
  buildPackageOwnershipPlan,
  buildMappingRows,
  buildMappingRowsFromSourceCsv,
  buildStatsRowsFromSeedPurchases,
  buildSourceCsvOwnershipPlan,
  applyPackageSnapshot,
  assertProductionTarget
};
