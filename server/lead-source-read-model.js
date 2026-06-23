const LEAD_SOURCE_READ_LIMIT = 2000;

async function readLeadSourceRows({
  isProductionRuntime = () => false,
  scanFirstRows,
  getCachedScan,
  table,
  columns = []
} = {}) {
  if (!table) throw new Error('缺少线索表名');
  if (isProductionRuntime()) {
    if (typeof scanFirstRows !== 'function') throw new Error('缺少生产线索读取方法');
    return scanFirstRows(table, {
      limit: LEAD_SOURCE_READ_LIMIT,
      columns,
      detectOverflow: true
    });
  }
  if (typeof getCachedScan !== 'function') throw new Error('缺少线索缓存读取方法');
  return getCachedScan(table, { columns });
}

module.exports = {
  LEAD_SOURCE_READ_LIMIT,
  readLeadSourceRows
};
