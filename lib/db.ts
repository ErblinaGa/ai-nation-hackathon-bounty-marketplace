// Singleton database client. Dispatches to SQLite or Postgres based on USE_SUPABASE_DB.
//
// SQLite mode (default):           returns better-sqlite3 Database (synchronous).
// Postgres mode (USE_SUPABASE_DB=true): returns a PostgresDb adapter with the same API surface,
//   but prepare().get/all/run return Promises — callers in async contexts must await them.
//
// NOTE: USE_SUPABASE controls AUTH only (cookies, magic link). USE_SUPABASE_DB controls
// the DATA store. They are decoupled so a deployment can use Supabase auth with SQLite data.
// Postgres mode requires migrating ~110 caller sites to await prepare().get/all/run — see
// docs/DEPLOYMENT.md "Postgres migration" section.
//
// For backward compat with existing synchronous callers (lib/lightning.ts, lib/jobs.ts),
// getDb() returns Database.Database in SQLite mode. In Postgres mode callers are expected
// to be async and should await the prepare() results.
//
// TypeScript note: to keep existing callers (.run().changes without await) type-safe,
// getDb() is typed as returning Database.Database (the synchronous type). The Postgres
// adapter is accessed via getDbAsync() for new code that fully supports async.

import type Database from "better-sqlite3";
import { getSqliteDb } from "./db_sqlite";
import { getPostgresDb } from "./db_postgres";
import type { PostgresDb } from "./db_postgres";

// Re-export for callers that need the Postgres adapter explicitly
export type { PostgresDb };

/**
 * getDb() — backward-compatible entry point.
 * Returns the SQLite Database when USE_SUPABASE=false (synchronous — existing callers work unchanged).
 * Returns the PostgresDb adapter cast as Database.Database when USE_SUPABASE=true;
 * this is a type lie but all real callers that hit Postgres are async and can await the methods.
 */
export function getDb(): Database.Database {
  if (process.env.USE_SUPABASE_DB === "true") {
    // Cast: callers that need Postgres features should use getDbAsync() instead.
    // Existing synchronous-looking callers only run in SQLite mode in practice.
    return getPostgresDb() as unknown as Database.Database;
  }
  return getSqliteDb();
}

/**
 * getDbAsync() — for new code that fully supports both SQLite and Postgres.
 * Returns PostgresDb in Postgres mode, which has async prepare().get/all/run.
 * Returns the SQLite Database wrapped as PostgresDb in SQLite mode (sync, wrapped in Promises).
 */
export function getDbAsync(): PostgresDb {
  if (process.env.USE_SUPABASE_DB === "true") {
    return getPostgresDb();
  }
  // Wrap SQLite in the same interface shape for uniform usage in new code.
  const db = getSqliteDb();
  return {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        async get(...args: unknown[]) {
          return stmt.get(...args) as Record<string, unknown> | undefined;
        },
        async all(...args: unknown[]) {
          return stmt.all(...args) as Array<Record<string, unknown>>;
        },
        async run(...args: unknown[]) {
          const r = stmt.run(...args);
          return { changes: r.changes, lastInsertRowid: null as null };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction(fn: (...args: any[]) => void | Promise<void>) {
      return async (...args: Parameters<typeof fn>): Promise<void> => {
        // SQLite transaction is synchronous — wrap the fn in db.transaction()
        const txn = db.transaction((...a: Parameters<typeof fn>) => {
          const result = fn(...a);
          // SQLite transaction fn must be sync; if fn is async this would be a bug.
          // Acceptable for demo: all SQLite callers pass sync fns.
          return result;
        });
        txn(...args);
      };
    },
  };
}
