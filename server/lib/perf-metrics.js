const perfMetrics = [];

function recordPerfMetric(name, durationMs, meta = {}) {
  perfMetrics.push({
    name,
    durationMs,
    meta,
    createdAt: new Date().toISOString()
  });
  if (perfMetrics.length > 500) perfMetrics.shift();
}

function listPerfMetrics() {
  return perfMetrics.slice();
}

module.exports = {
  recordPerfMetric,
  listPerfMetrics
};
