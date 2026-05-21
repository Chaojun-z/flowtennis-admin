const TableStore = require('tablestore');

function createClientFromEnv(env = process.env, options = {}) {
  const endpoint = String(options.endpoint || env.TS_ENDPOINT || '').trim();
  const accessKeyId = String(options.accessKeyId || env.ALIBABA_CLOUD_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(options.secretAccessKey || env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '').trim();
  const instancename = String(options.instancename || env.TS_INSTANCE || env.TARGET_TS_INSTANCE || '').trim();
  const missing = [
    ['TS_ENDPOINT', endpoint],
    ['ALIBABA_CLOUD_ACCESS_KEY_ID', accessKeyId],
    ['ALIBABA_CLOUD_ACCESS_KEY_SECRET', secretAccessKey],
    ['TS_INSTANCE', instancename]
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`缺少 TableStore 环境变量: ${missing.join(', ')}`);
  return new TableStore.Client({
    endpoint,
    accessKeyId,
    secretAccessKey,
    instancename,
    maxRetries: 3
  });
}

function decodeRow(row) {
  if (!row || !row.primaryKey) return null;
  const record = { id: row.primaryKey[0]?.value };
  (row.attributes || []).forEach((attribute) => {
    try {
      record[attribute.columnName] = JSON.parse(attribute.columnValue);
    } catch {
      record[attribute.columnName] = attribute.columnValue;
    }
  });
  return record;
}

function encodeAttributes(row) {
  return Object.entries(row || {})
    .filter(([key]) => key !== 'id')
    .map(([key, value]) => ({
      [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
    }));
}

function normalizePrimaryKey(primaryKey) {
  return (primaryKey || []).map((item) => {
    if (item && Object.prototype.hasOwnProperty.call(item, 'name')) {
      return { [item.name]: item.value };
    }
    return item;
  });
}

function scanTable(client, tableName) {
  return new Promise((resolve, reject) => {
    const rows = [];
    function next(startPrimaryKey) {
      client.getRange(
        {
          tableName,
          direction: TableStore.Direction.FORWARD,
          inclusiveStartPrimaryKey: startPrimaryKey ? normalizePrimaryKey(startPrimaryKey) : [{ id: TableStore.INF_MIN }],
          exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
          maxVersions: 1,
          limit: 500
        },
        (err, data) => {
          if (err) return reject(err);
          (data.rows || []).forEach((row) => {
            const record = decodeRow(row);
            if (record) rows.push(record);
          });
          if (data.nextStartPrimaryKey) return next(data.nextStartPrimaryKey);
          resolve(rows);
        }
      );
    }
    next();
  });
}

function putRow(client, tableName, row) {
  return new Promise((resolve, reject) => {
    client.putRow(
      {
        tableName,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey: [{ id: String(row.id) }],
        attributeColumns: encodeAttributes(row)
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

function deleteRow(client, tableName, id) {
  return new Promise((resolve, reject) => {
    client.deleteRow(
      {
        tableName,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey: [{ id: String(id) }]
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

function createTableIfMissing(client, tableName) {
  return new Promise((resolve, reject) => {
    client.createTable(
      {
        tableMeta: {
          tableName,
          primaryKey: [{ name: 'id', type: TableStore.PrimaryKeyType.STRING }]
        },
        reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
        tableOptions: { timeToLive: -1, maxVersions: 1 }
      },
      (err) => {
        if (!err) return resolve('created');
        const message = String(err.message || err || '');
        if (/exist/i.test(message)) return resolve('exists');
        reject(err);
      }
    );
  });
}

module.exports = {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow,
  createTableIfMissing
};
