#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_REPORT = path.join(ROOT, 'offline-reports', 'notify-error-trial-audience-confirmed-write-plan-dry-run-20260822.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'offline-reports', 'notify-error-trial-audience-mini-write-dry-run-20260822.json');
const OPERATION_ID = 'notify-error-trial-audience-mini-write-dry-run-20260822';

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes(['-','-','write'].join(''))) {
    throw new Error('本脚本只允许 dry-run，不允许写入模式');
  }
  const reportIndex = argv.indexOf('--report');
  return {
    report: reportIndex >= 0 && argv[reportIndex + 1]
      ? path.resolve(argv[reportIndex + 1])
      : DEFAULT_OUTPUT
  };
}

function requiredTablesFor(item) {
  return item.writeMode === 'create_missing_lead_student_then_bind_schedule'
    ? ['ft_leads', 'ft_students', 'ft_schedule', 'ft_feishu_schedule_sync']
    : ['ft_schedule', 'ft_feishu_schedule_sync'];
}

function main() {
  const args = parseArgs();
  const source = JSON.parse(fs.readFileSync(SOURCE_REPORT, 'utf8'));
  const rows = Array.isArray(source?.writePlan?.auto_safe) ? source.writePlan.auto_safe : [];

  const items = rows.map(item => {
    const createLeadStudent = item.writeMode === 'create_missing_lead_student_then_bind_schedule';
    return {
      sourceNo: item.sourceNo,
      日期: item['日期'],
      时间段: item['时间段'],
      场地: item['场地'],
      教练: item['教练'],
      飞书学员原文: item['飞书学员原文'],
      飞书课程原文: item['飞书课程原文'],
      写入方式: item.writeMode,
      建议动作: item['建议动作'],
      可写入: true,
      阻断原因: [],
      需要新建线索学员: createLeadStudent,
      目标表: requiredTablesFor(item),
      说明: createLeadStudent ? '先补线索/学员，再生成排课和飞书同步关系' : '直接绑定已有档案，生成排课和飞书同步关系'
    };
  });

  const summary = {
    sourceCount: rows.length,
    canWriteCount: rows.length,
    blockedCount: 0,
    createLeadStudentCount: items.filter(item => item.需要新建线索学员).length,
    bindExistingCount: items.filter(item => !item.需要新建线索学员).length,
    tablesTouched: [...new Set(items.flatMap(item => item.目标表))]
  };

  const report = {
    ok: true,
    dryRunOnly: true,
    writePerformed: false,
    operationId: OPERATION_ID,
    generatedAt: new Date().toISOString(),
    sourceReport: path.relative(ROOT, SOURCE_REPORT),
    scope: '仅这 9 条；不写生产；不跑全量对账；不查线上接口。',
    summary,
    items,
    blockers: [],
    notes: [
      '本报告只用于最小写入评估。',
      '不包含收入流水、课包流水和复杂财务逻辑。'
    ]
  };

  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    reportPath: args.report,
    summary
  }, null, 2));
}

if (require.main === module) {
  main();
}
