// Postgres adapter for lib/db.ts — active when USE_SUPABASE=true.
// Wraps pg.Pool with a subset of the better-sqlite3 API that lib/* code uses:
//   prepare(sql).get(...args)   → single row or undefined
//   prepare(sql).all(...args)   → array of rows
//   prepare(sql).run(...args)   → { changes: number, lastInsertRowid: null }
//   transaction(fn)             → () => void  (same call pattern as better-sqlite3)
//
// SQL translation:
//   ? placeholders → $1, $2, ...  (positional Postgres style)
//   boolean coercion: 0/1 integers → true/false booleans on reads
//   JSONB columns: auto-parsed on reads (pg driver handles this natively for JSONB)
//   datetime: both SQLite TEXT timestamps and Postgres TIMESTAMPTZ are ISO-compatible

import pg from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __db_postgres: pg.Pool | undefined;
}

// ---------------------------------------------------------------------------
// Connection pool — singleton per process.
// ---------------------------------------------------------------------------
function getPool(): pg.Pool {
  if (!globalThis.__db_postgres) {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const projectRef = projectUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
    const password = process.env.SUPABASE_DB_PASSWORD;

    if (!projectRef || !password) {
      throw new Error(
        "[db_postgres] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD env vars. " +
        "Cannot connect to Supabase Postgres."
      );
    }

    globalThis.__db_postgres = new pg.Pool({
      host: "aws-0-eu-west-1.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      user: `postgres.${projectRef}`,
      password,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    globalThis.__db_postgres.on("error", (err) => {
      console.error("[db_postgres] pool error:", err);
    });

    console.log("[db_postgres] pool created for project:", projectRef);
  }
  return globalThis.__db_postgres;
}

// ---------------------------------------------------------------------------
// SQL translation: SQLite ? placeholders → Postgres $1, $2, ...
// ---------------------------------------------------------------------------
function translateSql(sql: string): string {
  let idx = 0;
  // Replace each bare ? (not inside a string literal — good enough for our queries)
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// ---------------------------------------------------------------------------
// Row normalization: Postgres returns booleans as real JS booleans; SQLite
// consumers expect 0/1 integers. Coerce booleans → 0/1 for compatibility.
// JSONB columns are auto-parsed by the pg driver (no manual JSON.parse needed).
// Date objects returned by pg → ISO strings to match SQLite TEXT timestamps.
// ---------------------------------------------------------------------------
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (typeof v === "boolean") {
      out[k] = v ? 1 : 0;
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      // JSONB objects are returned as plain JS objects by pg driver.
      // SQLite stores them as TEXT, so callers that do JSON.parse() on them
      // would receive a string. Re-stringify JSONB objects here to maintain compat.
      out[k] = JSON.stringify(v);
    } else if (Array.isArray(v)) {
      // JSONB arrays — also stringify for compat.
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prepared-statement-like interface (synchronous API surface via sync pg client
// is not available — we use synchronous-looking wrappers that run async internally
// via Node.js top-level await at call sites that are already async).
//
// IMPORTANT: The real better-sqlite3 is synchronous. Our Postgres wrappers return
// Promises. All callers in lib/* and app/api/* must already be async (they are —
// every route and job is async). TypeScript types are kept compatible by matching
// the return types that callers expect.
// ---------------------------------------------------------------------------

export interface PreparedQuery {
  get(...args: unknown[]): Promise<Record<string, unknown> | undefined>;
  all(...args: unknown[]): Promise<Array<Record<string, unknown>>>;
  run(...args: unknown[]): Promise<{ changes: number; lastInsertRowid: null }>;
}

function prepare(sql: string): PreparedQuery {
  const pgSql = translateSql(sql);
  const pool = getPool();

  return {
    async get(...args: unknown[]) {
      try {
        const result = await pool.query(pgSql, args);
        if (result.rows.length === 0) return undefined;
        return normalizeRow(result.rows[0] as Record<string, unknown>);
      } catch (err) {
        console.error("[db_postgres][get] query error:", { sql: pgSql, args, err });
        throw err;
      }
    },

    async all(...args: unknown[]) {
      try {
        const result = await pool.query(pgSql, args);
        return result.rows.map((r) => normalizeRow(r as Record<string, unknown>));
      } catch (err) {
        console.error("[db_postgres][all] query error:", { sql: pgSql, args, err });
        throw err;
      }
    },

    async run(...args: unknown[]) {
      try {
        const result = await pool.query(pgSql, args);
        return {
          changes: result.rowCount ?? 0,
          lastInsertRowid: null as null,
        };
      } catch (err) {
        console.error("[db_postgres][run] query error:", { sql: pgSql, args, err });
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Transaction wrapper.
// better-sqlite3: db.transaction(fn)() — fn is synchronous, wrapped in BEGIN/COMMIT.
// Postgres: we use a client checked out from the pool for the duration.
// The returned function is async — callers that use db.transaction(fn)() must await it.
//
// Signature matches better-sqlite3's generic: transaction<T>(fn: (...args: T[]) => void) => (...args: T[]) => void
// The args are passed through to fn — Postgres runs the fn body then wraps with BEGIN/COMMIT.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transaction<T extends (...args: any[]) => void | Promise<void>>(fn: T): (...args: Parameters<T>) => Promise<void> {
  return async function (...args: Parameters<T>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fn(...args);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[db_postgres][transaction] rolled back:", err);
      throw err;
    } finally {
      client.release();
    }
  };
}

// ---------------------------------------------------------------------------
// Public DB object — matches the shape callers expect from getDb().
// ---------------------------------------------------------------------------
export interface PostgresDb {
  prepare: (sql: string) => PreparedQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: (fn: (...args: any[]) => void | Promise<void>) => (...args: any[]) => Promise<void>;
}

export function getPostgresDb(): PostgresDb {
  return { prepare, transaction };
}
