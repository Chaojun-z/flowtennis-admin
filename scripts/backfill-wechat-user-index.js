const path = require('path');
const TableStore = require('tablestore');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TS_ENDPOINT = process.env.TS_ENDPOINT || '';
const TS_INSTANCE = process.env.TS_INSTANCE || 'flowtennis';
const TS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.TS_KEY_ID || '';
const TS_KEY_SEC = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.TS_KEY_SEC || '';

const USERS_TABLE = process.env.WECHAT_USER_SOURCE_TABLE || 'ft_users';
const INDEX_TABLE = process.env.WECHAT_USER_INDEX_TABLE || 'ft_user_wechat_index';

let tsClient;

function assertEnv() {
  const missing = [];
  if (!TS_ENDPOINT) missing.push('TS_ENDPOINT');
  if (!TS_INSTANCE) missing.push('TS_INSTANCE');
  if (!TS_KEY_ID) missing.push('ALIBABA_CLOUD_ACCESS_KEY_ID');
  if (!TS_KEY_SEC) missing.push('ALIBABA_CLOUD_ACCESS_KEY_SECRET');
  if (missing.length) {
    throw new Error(`缺少 TableStore 配置: ${missing.join(', ')}`);
  }
}

function gc() {
  if (!tsClient) {
    tsClient = new TableStore.Client({
      accessKeyId: TS_KEY_ID,
      secretAccessKey: TS_KEY_SEC,
      endpoint: TS_ENDPOINT,
      instancename: TS_INSTANCE,
      maxRetries: 3
    });
  }
  return tsClient;
}

function isTransientStorageError(err) {
  const msg = String(err && err.message ? err.message : err || '');
  return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(msg);
}

async function withStorageRetry(fn, maxAttempts = 2) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientStorageError(err) || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 200));
    }
  }
  throw lastErr;
}

function decodeAttributes(attributes = []) {
  const row = {};
  for (const attribute of attributes) {
    try {
      row[attribute.columnName] = JSON.parse(attribute.columnValue);
    } catch {
      row[attribute.columnName] = attribute.columnValue;
    }
  }
  return row;
}

async function mkTable(tableName) {
  return new Promise((resolve) => {
    gc().createTable(
      {
        tableMeta: {
          tableName,
          primaryKey: [{ name: 'id', type: TableStore.PrimaryKeyType.STRING }]
        },
        reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
        tableOptions: { timeToLive: -1, maxVersions: 1 }
      },
      (err) => resolve(err ? 'exists' : 'ok')
    );
  });
}

async function scan(tableName) {
  return withStorageRetry(
    () =>
      new Promise((resolve, reject) => {
        const rows = [];
        function fetchPage(startKey) {
          gc().getRange(
            {
              tableName,
              direction: TableStore.Direction.FORWARD,
              inclusiveStartPrimaryKey: startKey || [{ id: TableStore.INF_MIN }],
              exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
              maxVersions: 1,
              limit: 500
            },
            (err, data) => {
              if (err) return reject(err);
              for (const item of data.rows || []) {
                if (!item.primaryKey) continue;
                rows.push({
                  id: item.primaryKey[0].value,
                  ...decodeAttributes(item.attributes || [])
                });
              }
              if (data.nextStartPrimaryKey) {
                fetchPage(data.nextStartPrimaryKey);
                return;
              }
              resolve(rows);
            }
          );
        }
        fetchPage();
      })
  );
}

async function get(tableName, id) {
  return withStorageRetry(
    () =>
      new Promise((resolve, reject) => {
        gc().getRow({ tableName, primaryKey: [{ id: String(id) }], maxVersions: 1 }, (err, data) => {
          if (err) return reject(err);
          if (!data.row || !data.row.primaryKey) return resolve(null);
          resolve({
            id: data.row.primaryKey[0].value,
            ...decodeAttributes(data.row.attributes || [])
          });
        });
      })
  );
}

async function put(tableName, id, attrs) {
  return withStorageRetry(
    () =>
      new Promise((resolve, reject) => {
        gc().putRow(
          {
            tableName,
            condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
            primaryKey: [{ id: String(id) }],
            attributeColumns: Object.entries(attrs)
              .filter(([key]) => key !== 'id')
              .map(([key, value]) => ({
                [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
              }))
          },
          (err, data) => (err ? reject(err) : resolve(data))
        );
      })
  );
}

function normalizeOpenId(value) {
  return String(value || '').trim();
}

function selectUser(users) {
  return [...users].sort((left, right) => {
    const leftRole = String(left.role || '') === 'editor' ? 0 : 1;
    const rightRole = String(right.role || '') === 'editor' ? 0 : 1;
    if (leftRole !== rightRole) return leftRole - rightRole;
    return String(left.id || '').localeCompare(String(right.id || ''));
  })[0] || null;
}

async function main() {
  assertEnv();
  const tableStatus = await mkTable(INDEX_TABLE);
  const users = await scan(USERS_TABLE);
  const grouped = new Map();

  for (const user of users) {
    const openid = normalizeOpenId(user.wechatOpenId);
    if (!openid) continue;
    if (!grouped.has(openid)) grouped.set(openid, []);
    grouped.get(openid).push(user);
  }

  const summary = {
    usersScanned: users.length,
    boundUsers: 0,
    mappingsCreated: 0,
    mappingsUpdated: 0,
    mappingsUnchanged: 0,
    duplicateOpenIds: 0
  };

  for (const [openid, matchedUsers] of grouped.entries()) {
    summary.boundUsers += matchedUsers.length;
    if (matchedUsers.length > 1) {
      summary.duplicateOpenIds += 1;
      console.warn(
        `[duplicate-openid] ${openid} -> ${matchedUsers.map((item) => item.id).join(', ')}; 采用 ${selectUser(matchedUsers).id}`
      );
    }

    const selectedUser = selectUser(matchedUsers);
    const nextRow = {
      openid,
      userId: String(selectedUser.id || ''),
      role: String(selectedUser.role || ''),
      coachId: String(selectedUser.coachId || ''),
      coachName: String(selectedUser.coachName || selectedUser.name || ''),
      updatedAt: new Date().toISOString()
    };
    const existing = await get(INDEX_TABLE, openid).catch(() => null);
    if (existing && String(existing.userId || '') === nextRow.userId) {
      summary.mappingsUnchanged += 1;
      continue;
    }
    await put(INDEX_TABLE, openid, nextRow);
    if (existing) summary.mappingsUpdated += 1;
    else summary.mappingsCreated += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        sourceTable: USERS_TABLE,
        indexTable: INDEX_TABLE,
        tableStatus,
        ...summary
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('[backfill-wechat-user-index] failed');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
