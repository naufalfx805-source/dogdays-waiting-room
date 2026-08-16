// Loads the raw CSVs into Snowflake and materialises the aggregates.
//   node pipeline/load.mjs
// Reads credentials from .env at the repo root.
import snowflake from 'snowflake-sdk';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// tiny .env reader - avoids a dependency for six keys
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

snowflake.configure({ logLevel: 'ERROR' });

const conn = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USER,
  password: process.env.SNOWFLAKE_PASSWORD,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
  role: process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN',
});

const connect = () => new Promise((ok, bad) =>
  conn.connect((err) => (err ? bad(err) : ok())));

const run = (sqlText) => new Promise((ok, bad) =>
  conn.execute({ sqlText, complete: (err, _s, rows) => (err ? bad(err) : ok(rows)) }));

async function step(label, sql) {
  const t0 = Date.now();
  process.stdout.write(`  ${label} ... `);
  const rows = await run(sql);
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return rows;
}

const statements = readFileSync(resolve(ROOT, 'pipeline/snowflake.sql'), 'utf8')
  .split(/^;;$/m)
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)*$/.test(s));

await connect();
console.log('connected to', process.env.SNOWFLAKE_ACCOUNT);

await step('warehouse', `CREATE WAREHOUSE IF NOT EXISTS ${process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH'} WITH WAREHOUSE_SIZE='XSMALL' AUTO_SUSPEND=60 INITIALLY_SUSPENDED=FALSE`);

for (const sql of statements) {
  const label = sql.replace(/^--[^\n]*\n/gm, '').trim().split('\n')[0].slice(0, 62);

  // The CSVs have to be uploaded and copied in before anything reads the raw tables.
  if (/CREATE OR REPLACE TABLE stays/i.test(sql)) {
    for (const name of ['intakes', 'outcomes']) {
      await step(`PUT ${name}.csv`,
        `PUT file://${ROOT}/data/${name}.csv @raw_stage AUTO_COMPRESS=TRUE OVERWRITE=TRUE`);
      const [r] = await step(`COPY INTO ${name}`,
        `COPY INTO ${name} FROM @raw_stage/${name}.csv.gz FILE_FORMAT=(FORMAT_NAME=csv_fmt) ON_ERROR='CONTINUE'`);
      console.log(`     -> ${r?.rows_loaded ?? '?'} rows loaded`);
    }
  }
  await step(label, sql);
}

const [h] = await run('SELECT * FROM agg_headline');
console.log('\nheadline from Snowflake:', h);
conn.destroy(() => {});
