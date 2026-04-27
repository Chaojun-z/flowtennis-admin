const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const databaseUrl = process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('缺少 MATCH_DATABASE_URL 或 DATABASE_URL');
  process.exit(1);
}

async function main() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.MATCH_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
  try {
    const migrationDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      await pool.query(sql);
    }
    console.log('match db migration applied');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
