import snowflake from 'snowflake-sdk';

snowflake.configure({ logLevel: 'ERROR' });

export const hasSnowflake = () =>
  Boolean(process.env.SNOWFLAKE_ACCOUNT && process.env.SNOWFLAKE_USER && process.env.SNOWFLAKE_PASSWORD);

// One connection per warm lambda. Reconnecting on every request costs ~1.5s.
let pending: Promise<snowflake.Connection> | null = null;

function connect(): Promise<snowflake.Connection> {
  if (pending) return pending;
  pending = new Promise((ok, bad) => {
    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USER!,
      password: process.env.SNOWFLAKE_PASSWORD!,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'COMPUTE_WH',
      database: process.env.SNOWFLAKE_DATABASE || 'WAITING_ROOM',
      schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
      role: process.env.SNOWFLAKE_ROLE || 'ACCOUNTADMIN',
      clientSessionKeepAlive: true,
    });
    conn.connect((err) => (err ? bad(err) : ok(conn)));
  });
  // A failed connect must not poison every later request.
  pending.catch(() => { pending = null; });
  return pending;
}

export async function query<T = Record<string, unknown>>(sqlText: string): Promise<T[]> {
  const conn = await connect();
  return new Promise((ok, bad) =>
    conn.execute({ sqlText, complete: (err, _s, rows) => (err ? bad(err) : ok((rows ?? []) as T[])) }));
}

// Fixed-point columns (MEDIAN, ROUND, AVG) come back from the driver as
// strings. The charts do arithmetic on these, so coerce them - but only these,
// so a dog named "007" keeps its name.
const NUMERIC = new Set([
  'n', 'median_days', 'avg_days', 'pct_pit_bull', 'los_days', 'age_years',
  'is_pit_bull', 'intake_rows', 'outcome_rows', 'paired_stays', 'dog_stays',
  'dog_adoptions', 'pit_median', 'nonpit_median', 'black_median', 'nonblack_median',
]);

/** Snowflake returns column names upper-cased; the app speaks lower-case. */
export const lower = <T,>(rows: Record<string, unknown>[]): T[] =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => {
    const key = k.toLowerCase();
    return [key, NUMERIC.has(key) && v != null ? Number(v) : v];
  }))) as T[];
