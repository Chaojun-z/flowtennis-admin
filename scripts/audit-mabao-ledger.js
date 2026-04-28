#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv){
  const args = {};
  for(let i=0;i<argv.length;i++){
    const token = argv[i];
    if(!token.startsWith('--'))continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if(!next || next.startsWith('--'))args[key] = true;
    else{
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requireArg(args, key){
  const value = args[key];
  if(!value)throw new Error(`缺少参数 --${key}`);
  return value;
}

function requireArgAlias(args, keys){
  for(const key of keys){
    const value = args[key];
    if(value)return value;
  }
  throw new Error(`缺少参数 ${keys.map(key=>`--${key}`).join(' / ')}`);
}

function ensureDir(dir){
  fs.mkdirSync(dir, { recursive: true });
}

function readText(filePath){
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function parseCsvLine(line){
  const row = [];
  let current = '';
  let inQuotes = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQuotes && line[i + 1] === '"'){
        current += '"';
        i += 1;
      }else{
        inQuotes = !inQuotes;
      }
    }else if(ch === ',' && !inQuotes){
      row.push(current);
      current = '';
    }else{
      current += ch;
    }
  }
  row.push(current);
  return row;
}

function parseCsvFile(filePath){
  return readText(filePath)
    .split(/\r?\n/)
    .filter(line=>line.length)
    .map(parseCsvLine);
}

function toNumber(value){
  const text = String(value || '').trim().replace(/,/g, '');
  if(!text)return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function buildIsoDate(year, month, day){
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if(!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))return '';
  if(m < 1 || m > 12 || d < 1 || d > 31)return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeDateText(raw, fallbackYear='2026'){
  const text = String(raw || '').trim();
  if(!text)return '';
  if(/^周[一二三四五六日天]$/.test(text))return '';
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if(match)return buildIsoDate(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if(match)return buildIsoDate(fallbackYear, match[1], match[2]);
  return text;
}

function monthKey(dateText){
  return String(dateText || '').slice(0, 7);
}

function csvEscape(value){
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, headers, rows){
  const lines = [headers.map(csvEscape).join(',')];
  for(const row of rows){
    lines.push(headers.map(key=>csvEscape(row[key])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function detectBusinessType(incomeType='', payMethod=''){
  const income = String(incomeType).trim();
  const pay = String(payMethod).trim();
  if(/约球/.test(income))return '约球局';
  if(/领导订场/.test(income))return '内部占用';
  if(/定场|订场|发球机/.test(income)){
    if(/储值/.test(pay))return '会员订场';
    return '散客订场';
  }
  return '课程';
}

function detectEventType(incomeType='', payMethod=''){
  const businessType = detectBusinessType(incomeType, payMethod);
  if(businessType === '内部占用')return 'ignore';
  if(businessType === '课程' && /课包划扣/.test(payMethod))return 'lesson_consume';
  if(businessType === '会员订场')return 'stored_value_consume';
  if(businessType === '课程')return 'course_cash';
  return 'booking_cash';
}

function normalizePayMethod(payMethod=''){
  const text = String(payMethod).trim();
  if(/课包划扣/.test(text))return '课包划扣';
  if(/储值/.test(text))return '储值扣款';
  if(/小程序/.test(text))return '小程序';
  if(/大众点评/.test(text))return '大众点评';
  if(/转账|微信/.test(text))return '微信转账';
  return text || '未填写';
}

function parseBookingBottomTable(filePath){
  const rows = parseCsvFile(filePath);
  const header = rows[0] || [];
  const ix = Object.fromEntries(header.map((name, idx)=>[name, idx]));
  const facts = [];
  let currentDate = '';
  for(let i=1;i<rows.length;i++){
    const row = rows[i];
    const primaryDate = normalizeDateText(String(row[ix['日期']] || '').trim());
    const secondaryDate = normalizeDateText(String(row[ix['星期']] || '').trim());
    const dateValue = primaryDate || secondaryDate;
    if(dateValue)currentDate = dateValue;
    const incomeType = String(row[ix['收入类型']] || '').trim();
    const payMethod = String(row[ix['支付方式']] || '').trim();
    const customerName = String(row[ix['客户']] || '').trim();
    const actualAmount = toNumber(row[ix['实际收入（元）']]);
    const eventType = detectEventType(incomeType, payMethod);
    if(eventType === 'ignore')continue;
    if(!currentDate || !customerName || (!actualAmount && eventType !== 'lesson_consume'))continue;
    const businessType = detectBusinessType(incomeType, payMethod);
    facts.push({
      source_file: path.basename(filePath),
      source_row_no: i + 1,
      source_id: `booking-bottom-${i + 1}`,
      event_type: eventType,
      business_date: currentDate,
      campus_actual: '顺义马坡',
      customer_name: customerName,
      student_names: customerName,
      coach_name: String(row[ix['收款人']] || '').trim(),
      business_type_norm: businessType,
      action_norm: eventType === 'lesson_consume' ? '已入账' : '收款',
      pay_method_norm: normalizePayMethod(payMethod),
      cash_amount: eventType === 'lesson_consume' || eventType === 'stored_value_consume' ? 0 : actualAmount,
      recognized_amount: eventType === 'booking_cash' || eventType === 'course_cash' || eventType === 'lesson_consume' || eventType === 'stored_value_consume' ? actualAmount : 0,
      lesson_delta: 0,
      package_lessons: 0,
      package_amount_paid: 0,
      package_name: '',
      notes: String(row[ix['备注']] || '').trim(),
      match_key: [currentDate, String(row[ix['时间']] || '').trim(), customerName, incomeType, actualAmount].join('|')
    });
  }
  return facts;
}

function parsePrivateStudentPurchases(filePath){
  const rows = parseCsvFile(filePath);
  const facts = [];
  for(let i=2;i<rows.length;i++){
    const row = rows[i];
    const name = String(row[1] || '').trim();
    if(!name)continue;
    const purchaseLessons = toNumber(row[5]);
    const purchaseAmount = toNumber(row[6]);
    const purchaseDate = normalizeDateText(String(row[7] || '').trim());
    const coach = String(row[8] || '').trim();
    const notes = String(row[9] || '').trim();
    if(purchaseLessons || purchaseAmount){
      facts.push({
        source_file: path.basename(filePath),
        source_row_no: i + 1,
        source_id: `purchase-${i + 1}-initial`,
        event_type: 'purchase',
        business_date: purchaseDate,
        campus_actual: '顺义马坡',
        customer_name: name,
        student_names: name,
        coach_name: coach,
        business_type_norm: '课程',
        action_norm: '收款',
        pay_method_norm: '未知',
        cash_amount: purchaseAmount,
        recognized_amount: 0,
        lesson_delta: 0,
        package_lessons: purchaseLessons,
        package_amount_paid: purchaseAmount,
        package_name: `${row[2] || ''}${row[3] || ''}`.trim(),
        notes,
        match_key: [name, purchaseDate, purchaseLessons, purchaseAmount, coach, 'initial'].join('|')
      });
    }
    const renewLessons = toNumber(row[11]);
    const renewAmount = toNumber(row[12]);
    const renewDate = normalizeDateText(String(row[13] || '').trim());
    const renewCoach = String(row[14] || '').trim() || coach;
    if(renewLessons || renewAmount){
      facts.push({
        source_file: path.basename(filePath),
        source_row_no: i + 1,
        source_id: `purchase-${i + 1}-renew`,
        event_type: 'renewal',
        business_date: renewDate,
        campus_actual: '顺义马坡',
        customer_name: name,
        student_names: name,
        coach_name: renewCoach,
        business_type_norm: '课程',
        action_norm: '收款',
        pay_method_norm: '未知',
        cash_amount: renewAmount,
        recognized_amount: 0,
        lesson_delta: 0,
        package_lessons: renewLessons,
        package_amount_paid: renewAmount,
        package_name: `${row[2] || ''}${row[3] || ''}`.trim(),
        notes,
        match_key: [name, renewDate, renewLessons, renewAmount, renewCoach, 'renew'].join('|')
      });
    }
  }
  return facts;
}

function parseMonthlyLessonStats(filePath){
  const rows = parseCsvFile(filePath);
  const monthLabels = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];
  const facts = [];
  for(let i=2;i<rows.length;i++){
    const row = rows[i];
    const name = String(row[1] || '').trim();
    if(!name)continue;
    const coach = String(row[8] || '').trim();
    const notes = String(row[22] || '').trim();
    for(let monthIdx=0; monthIdx<12; monthIdx++){
      const lessonCount = toNumber(row[9 + monthIdx]);
      if(!lessonCount)continue;
      const month = monthLabels[monthIdx];
      facts.push({
        source_file: path.basename(filePath),
        source_row_no: i + 1,
        source_id: `lesson-month-${i + 1}-${month}`,
        event_type: 'lesson_consume',
        business_date: `${month}-28`,
        campus_actual: '顺义马坡',
        customer_name: name,
        student_names: name,
        coach_name: coach,
        business_type_norm: '课程',
        action_norm: '已入账',
        pay_method_norm: '课包划扣',
        cash_amount: 0,
        recognized_amount: 0,
        lesson_delta: -lessonCount,
        package_lessons: 0,
        package_amount_paid: 0,
        package_name: '',
        notes,
        source_month: month,
        match_key: [name, month, lessonCount, coach].join('|')
      });
    }
  }
  return facts;
}

function parseDetailLessonFile(filePath){
  const rows = parseCsvFile(filePath);
  const facts = [];
  for(let i=1;i<rows.length;i++){
    const row = rows[i];
    const dateText = normalizeDateText(String(row[0] || '').trim());
    const timeText = String(row[1] || '').trim();
    const studentNames = [String(row[2] || '').trim(), String(row[3] || '').trim()].filter(Boolean);
    if(!dateText || !studentNames.length)continue;
    const payMethod = String(row[4] || '').trim();
    const charged = String(row[5] || '').trim() === '是';
    const amount = toNumber(row[6]);
    const coach = String(row[8] || '').trim();
    const notes = String(row[7] || '').trim();
    if(payMethod === '课包划扣'){
      for(const studentName of studentNames){
        facts.push({
          source_file: path.basename(filePath),
          source_row_no: i + 1,
          source_id: `lesson-detail-${i + 1}-${studentName}`,
          event_type: 'lesson_consume',
          business_date: dateText,
          campus_actual: '顺义马坡',
          customer_name: studentName,
          student_names: studentName,
          coach_name: coach,
          business_type_norm: '课程',
          action_norm: '已入账',
          pay_method_norm: '课包划扣',
          cash_amount: 0,
          recognized_amount: amount / studentNames.length,
          lesson_delta: -1,
          package_lessons: 0,
          package_amount_paid: 0,
          package_name: '',
          notes,
          match_key: [studentName, dateText, timeText, coach, '课包划扣'].join('|')
        });
      }
    }else if(charged && amount){
      facts.push({
        source_file: path.basename(filePath),
        source_row_no: i + 1,
        source_id: `lesson-detail-cash-${i + 1}`,
        event_type: 'course_cash',
        business_date: dateText,
        campus_actual: '顺义马坡',
        customer_name: studentNames.join('、'),
        student_names: studentNames.join('、'),
        coach_name: coach,
        business_type_norm: '课程',
        action_norm: '收款',
        pay_method_norm: normalizePayMethod(payMethod),
        cash_amount: amount,
        recognized_amount: amount,
        lesson_delta: 0,
        package_lessons: 0,
        package_amount_paid: 0,
        package_name: '',
        notes,
        match_key: [dateText, timeText, studentNames.join('|'), amount, payMethod].join('|')
      });
    }
  }
  return facts;
}

async function loadSystemData(args){
  if(args['system-json']){
    return JSON.parse(readText(path.resolve(args['system-json'])));
  }
  if(args['seed-json']){
    return JSON.parse(readText(path.resolve(args['seed-json'])));
  }
  if(args['base-url'] && args.token){
    const baseUrl = String(args['base-url']).replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/api/load-all`, {
      headers: {
        Authorization: `Bearer ${args.token}`
      }
    });
    if(!res.ok)throw new Error(`拉取系统数据失败：${res.status} ${res.statusText}`);
    return await res.json();
  }
  throw new Error('需要提供 --system-json，或提供 --base-url 和 --token，或用 --seed-json 做离线对照');
}

function normalizeSystemFacts(systemData){
  const facts = [];
  const purchases = Array.isArray(systemData.purchases) ? systemData.purchases : [];
  for(const row of purchases){
    facts.push({
      source_file: 'system:purchases',
      source_row_no: '',
      source_id: row.id,
      event_type: row.sourceType === 'renewal' ? 'renewal' : 'purchase',
      business_date: String(row.purchaseDate || '').slice(0, 10),
      campus_actual: row.campus || '',
      customer_name: row.studentName || '',
      student_names: row.studentName || '',
      coach_name: row.ownerCoach || '',
      business_type_norm: '课程',
      action_norm: '收款',
      pay_method_norm: row.payMethod || '',
      cash_amount: toNumber(row.amountPaid),
      recognized_amount: 0,
      lesson_delta: 0,
      package_lessons: toNumber(row.packageLessons),
      package_amount_paid: toNumber(row.amountPaid),
      package_name: row.packageName || '',
      notes: row.notes || '',
      match_key: [row.studentName || '', String(row.purchaseDate || '').slice(0, 10), toNumber(row.packageLessons), toNumber(row.amountPaid), row.ownerCoach || '', row.sourceType === 'renewal' ? 'renew' : 'initial'].join('|')
    });
  }

  const entitlementLedger = Array.isArray(systemData.entitlementLedger) ? systemData.entitlementLedger : [];
  for(const row of entitlementLedger){
    const lessonDelta = toNumber(row.lessonDelta);
    if(!lessonDelta)continue;
    const studentName = row.studentName || row.customerName || row.studentId || '';
    const when = String(row.relatedDate || row.createdAt || '').slice(0, 10);
    const sourceMonth = row.sourceMonth || monthKey(when);
    facts.push({
      source_file: 'system:entitlementLedger',
      source_row_no: '',
      source_id: row.id,
      event_type: 'lesson_consume',
      business_date: when,
      campus_actual: row.campus || '',
      customer_name: studentName,
      student_names: studentName,
      coach_name: row.coach || '',
      business_type_norm: '课程',
      action_norm: lessonDelta < 0 ? '已入账' : '退回',
      pay_method_norm: '课包划扣',
      cash_amount: 0,
      recognized_amount: 0,
      lesson_delta: lessonDelta,
      package_lessons: 0,
      package_amount_paid: 0,
      package_name: row.packageName || '',
      notes: row.notes || row.reason || '',
      source_month: sourceMonth,
      match_key: row.sourceMonth
        ? [studentName, sourceMonth, Math.abs(lessonDelta), row.coach || ''].join('|')
        : [studentName, when, row.coach || '', Math.abs(lessonDelta), row.reason || ''].join('|')
    });
  }

  const courts = Array.isArray(systemData.courts) ? systemData.courts : [];
  for(const court of courts){
    const history = Array.isArray(court.history) ? court.history : [];
    for(const row of history){
      const category = String(row.category || '');
      if(/内部占用/.test(category))continue;
      const payMethod = normalizePayMethod(row.payMethod || '');
      const amount = toNumber(row.amount);
      const signed = ['退款', '冲正'].includes(row.type) ? -amount : amount;
      const businessType = detectBusinessType(category, payMethod);
      if(!signed)continue;
      facts.push({
        source_file: 'system:courts.history',
        source_row_no: '',
        source_id: `${court.id}:${row.id || row.date || row.createdAt || facts.length}`,
        event_type: businessType === '会员订场' ? 'stored_value_consume' : 'booking_cash',
        business_date: normalizeDateText(String(row.date || row.occurredDate || '').trim()),
        campus_actual: court.campus || '',
        customer_name: court.name || court.id,
        student_names: court.name || court.id,
        coach_name: row.operator || row.createdBy || '',
        business_type_norm: businessType,
        action_norm: businessType === '会员订场' ? '已入账' : '收款',
        pay_method_norm: payMethod,
        cash_amount: businessType === '会员订场' ? 0 : signed,
        recognized_amount: signed,
        lesson_delta: 0,
        package_lessons: 0,
        package_amount_paid: 0,
        package_name: '',
        notes: row.note || category,
        match_key: [normalizeDateText(String(row.date || row.occurredDate || '').trim()), court.name || court.id, signed, businessType, payMethod].join('|')
      });
    }
  }
  return facts;
}

function keyCounter(rows, keyField){
  const map = new Map();
  for(const row of rows){
    const key = String(row[keyField] || '');
    if(!key)continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function rowsMissingByKey(sourceRows, systemRows, keyField='match_key'){
  const systemCount = keyCounter(systemRows, keyField);
  const sourceCount = new Map();
  const missing = [];
  for(const row of sourceRows){
    const key = String(row[keyField] || '');
    const current = (sourceCount.get(key) || 0) + 1;
    sourceCount.set(key, current);
    if(!key || current > (systemCount.get(key) || 0))missing.push(row);
  }
  return missing;
}

function summarizeByMonthAndType(rows){
  const map = new Map();
  for(const row of rows){
    const key = [monthKey(row.business_date), row.business_type_norm].join('|');
    const current = map.get(key) || {
      month: monthKey(row.business_date),
      business_type_norm: row.business_type_norm,
      cash_amount: 0,
      recognized_amount: 0,
      lesson_delta_abs: 0
    };
    current.cash_amount += toNumber(row.cash_amount);
    current.recognized_amount += toNumber(row.recognized_amount);
    if(toNumber(row.lesson_delta) < 0)current.lesson_delta_abs += Math.abs(toNumber(row.lesson_delta));
    map.set(key, current);
  }
  return map;
}

function buildSummaryDiff(tableRows, systemRows){
  const tableMap = summarizeByMonthAndType(tableRows);
  const systemMap = summarizeByMonthAndType(systemRows);
  const keys = [...new Set([...tableMap.keys(), ...systemMap.keys()])].sort();
  return keys.map(key=>{
    const table = tableMap.get(key) || { month: key.split('|')[0], business_type_norm: key.split('|')[1], cash_amount: 0, recognized_amount: 0, lesson_delta_abs: 0 };
    const system = systemMap.get(key) || { cash_amount: 0, recognized_amount: 0, lesson_delta_abs: 0 };
    return {
      month: table.month,
      business_type_norm: table.business_type_norm,
      table_cash_amount: table.cash_amount,
      system_cash_amount: system.cash_amount,
      diff_cash_amount: table.cash_amount - system.cash_amount,
      table_recognized_amount: table.recognized_amount,
      system_recognized_amount: system.recognized_amount,
      diff_recognized_amount: table.recognized_amount - system.recognized_amount,
      table_consumed_lessons: table.lesson_delta_abs,
      system_consumed_lessons: system.lesson_delta_abs,
      diff_consumed_lessons: table.lesson_delta_abs - system.lesson_delta_abs
    };
  });
}

function buildStudentBalanceCheck(purchaseRows, consumeRows){
  const map = new Map();
  for(const row of purchaseRows){
    const key = row.customer_name;
    const current = map.get(key) || { student_name: key, table_purchase_lessons: 0, table_purchase_amount: 0, table_consumed_lessons: 0, table_remaining_lessons: 0, system_purchase_lessons: 0, system_purchase_amount: 0, system_consumed_lessons: 0, system_remaining_lessons: 0 };
    if(String(row.source_file || '').startsWith('system:')){
      current.system_purchase_lessons += toNumber(row.package_lessons);
      current.system_purchase_amount += toNumber(row.package_amount_paid);
    }else{
      current.table_purchase_lessons += toNumber(row.package_lessons);
      current.table_purchase_amount += toNumber(row.package_amount_paid);
    }
    map.set(key, current);
  }
  for(const row of consumeRows){
    const key = row.customer_name;
    const current = map.get(key) || { student_name: key, table_purchase_lessons: 0, table_purchase_amount: 0, table_consumed_lessons: 0, table_remaining_lessons: 0, system_purchase_lessons: 0, system_purchase_amount: 0, system_consumed_lessons: 0, system_remaining_lessons: 0 };
    if(String(row.source_file || '').startsWith('system:')){
      current.system_consumed_lessons += Math.abs(Math.min(0, toNumber(row.lesson_delta)));
    }else{
      current.table_consumed_lessons += Math.abs(Math.min(0, toNumber(row.lesson_delta)));
    }
    map.set(key, current);
  }
  return [...map.values()].map(row=>({
    ...row,
    table_remaining_lessons: row.table_purchase_lessons - row.table_consumed_lessons,
    system_remaining_lessons: row.system_purchase_lessons - row.system_consumed_lessons,
    diff_remaining_lessons: (row.table_purchase_lessons - row.table_consumed_lessons) - (row.system_purchase_lessons - row.system_consumed_lessons)
  })).sort((a,b)=>Math.abs(b.diff_remaining_lessons) - Math.abs(a.diff_remaining_lessons));
}

async function main(){
  const args = parseArgs(process.argv.slice(2));
  const bookingFile = requireArgAlias(args, ['booking-file', 'booking-csv']);
  const studentFile = requireArgAlias(args, ['student-file', 'purchase-csv', 'student-csv']);
  const statsFile = requireArgAlias(args, ['stats-file', 'stats-csv']);
  const detailFileA = requireArgAlias(args, ['detail-file-a', 'detail-csv']);
  const detailFileB = requireArgAlias(args, ['detail-file-b', 'detail-csv-2']);
  const outputDir = path.resolve(args['output-dir'] || path.join(process.cwd(), 'tmp', `mabao-audit-${Date.now()}`));

  ensureDir(outputDir);

  const tableFacts = [
    ...parseBookingBottomTable(path.resolve(bookingFile)),
    ...parsePrivateStudentPurchases(path.resolve(studentFile)),
    ...parseMonthlyLessonStats(path.resolve(statsFile)),
    ...parseDetailLessonFile(path.resolve(detailFileA)),
    ...parseDetailLessonFile(path.resolve(detailFileB))
  ];
  const systemData = await loadSystemData(args);
  const systemFacts = normalizeSystemFacts(systemData);

  const tablePurchases = tableFacts.filter(row=>['purchase','renewal'].includes(row.event_type));
  const systemPurchases = systemFacts.filter(row=>['purchase','renewal'].includes(row.event_type));
  const tableConsume = tableFacts.filter(row=>row.event_type === 'lesson_consume' && toNumber(row.lesson_delta) < 0);
  const systemConsume = systemFacts.filter(row=>row.event_type === 'lesson_consume' && toNumber(row.lesson_delta) < 0);
  const tableBooking = tableFacts.filter(row=>['booking_cash','stored_value_consume'].includes(row.event_type));
  const systemBooking = systemFacts.filter(row=>['booking_cash','stored_value_consume'].includes(row.event_type));

  const purchaseMissing = rowsMissingByKey(tablePurchases, systemPurchases);
  const lessonMissing = rowsMissingByKey(tableConsume, systemConsume);
  const bookingMissing = rowsMissingByKey(tableBooking, systemBooking);
  const summaryDiff = buildSummaryDiff(tableFacts, systemFacts);
  const studentBalance = buildStudentBalanceCheck([...tablePurchases, ...systemPurchases], [...tableConsume, ...systemConsume]);

  writeCsv(path.join(outputDir, 'purchase_missing_in_system.csv'), [
    'source_file','source_row_no','customer_name','business_date','package_lessons','package_amount_paid','coach_name','match_key','notes'
  ], purchaseMissing);
  writeCsv(path.join(outputDir, 'lesson_consume_missing_in_system.csv'), [
    'source_file','source_row_no','customer_name','business_date','source_month','lesson_delta','coach_name','recognized_amount','match_key','notes'
  ], lessonMissing);
  writeCsv(path.join(outputDir, 'booking_cash_missing_in_system.csv'), [
    'source_file','source_row_no','customer_name','business_date','business_type_norm','pay_method_norm','cash_amount','recognized_amount','match_key','notes'
  ], bookingMissing);
  writeCsv(path.join(outputDir, 'summary_diff_by_month_and_type.csv'), [
    'month','business_type_norm','table_cash_amount','system_cash_amount','diff_cash_amount','table_recognized_amount','system_recognized_amount','diff_recognized_amount','table_consumed_lessons','system_consumed_lessons','diff_consumed_lessons'
  ], summaryDiff);
  writeCsv(path.join(outputDir, 'student_balance_check.csv'), [
    'student_name','table_purchase_lessons','system_purchase_lessons','table_consumed_lessons','system_consumed_lessons','table_remaining_lessons','system_remaining_lessons','diff_remaining_lessons','table_purchase_amount','system_purchase_amount'
  ], studentBalance);
  writeCsv(path.join(outputDir, 'reconcile_fact_rows.csv'), [
    'source_file','source_row_no','source_id','event_type','business_date','campus_actual','customer_name','student_names','coach_name','business_type_norm','action_norm','pay_method_norm','cash_amount','recognized_amount','lesson_delta','package_lessons','package_amount_paid','package_name','match_key','notes','source_month'
  ], [...tableFacts, ...systemFacts]);

  const summary = {
    outputDir,
    tableFactRows: tableFacts.length,
    systemFactRows: systemFacts.length,
    purchaseMissing: purchaseMissing.length,
    lessonConsumeMissing: lessonMissing.length,
    bookingCashMissing: bookingMissing.length
  };
  fs.writeFileSync(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err=>{
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
