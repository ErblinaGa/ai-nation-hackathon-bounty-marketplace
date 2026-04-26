// SQLite adapter — extracted from lib/db.ts so getDb() can dispatch based on USE_SUPABASE.
// Uses better-sqlite3. Survives Next.js HMR via globalThis singleton.
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

declare global {
  // eslint-disable-next-line no-var
  var __db_sqlite: Database.Database | undefined;
}

function createSqliteDb(): Database.Database {
  const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "./dev.db";
  const db = new Database(dbPath);

  // WAL mode — better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run schema (idempotent — all CREATE TABLE IF NOT EXISTS)
  const schemaPath = join(process.cwd(), "lib", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");

  // Execute each statement separately.
  // Strip single-line SQL comments first so semicolons inside comments don't create false split points.
  const schemaNoComments = schema
    .split("\n")
    .map((line) => {
      const commentIdx = line.indexOf("--");
      return commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    })
    .join("\n");

  const statements = schemaNoComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      db.exec(stmt + ";");
    } catch (err) {
      // View creation may fail if view already exists with different def in SQLite —
      // drop and recreate silently for demo mode.
      if (
        stmt.toLowerCase().includes("create view") &&
        (err as Error).message.includes("already exists")
      ) {
        const viewName = stmt.match(/create view if not exists (\S+)/i)?.[1];
        if (viewName) {
          db.exec(`DROP VIEW IF EXISTS ${viewName};`);
          db.exec(stmt + ";");
        }
      } else {
        throw err;
      }
    }
  }

  // V4 migration: add evaluation_mode column to existing dev.db if missing.
  // CREATE TABLE IF NOT EXISTS won't add columns to an already-existing table.
  // This keeps local dev.db forward-compatible without requiring a full wipe.
  try {
    const columns = db.prepare("PRAGMA table_info(bounties)").all() as Array<{ name: string }>;
    const hasEvaluationMode = columns.some((c) => c.name === "evaluation_mode");
    if (!hasEvaluationMode) {
      db.exec("ALTER TABLE bounties ADD COLUMN evaluation_mode TEXT NOT NULL DEFAULT 'strict_tests';");
      console.log("[db_sqlite] migrated: added evaluation_mode column to bounties");
    }
  } catch (err) {
    // bounties table may not exist yet on a completely fresh DB — safe to ignore
    console.warn("[db_sqlite] migration check skipped:", (err as Error).message);
  }

  return db;
}

export function getSqliteDb(): Database.Database {
  if (!globalThis.__db_sqlite) {
    globalThis.__db_sqlite = createSqliteDb();
  }
  return globalThis.__db_sqlite;
}
