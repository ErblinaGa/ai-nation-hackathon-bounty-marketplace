// Singleton better-sqlite3 client. Runs schema on first init.
// Uses globalThis to survive Next.js HMR without re-opening the file.
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function createDb(): Database.Database {
  const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "./dev.db";
  const db = new Database(dbPath);

  // WAL mode — better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run schema (idempotent — all CREATE TABLE IF NOT EXISTS)
  const schemaPath = join(process.cwd(), "lib", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");

  // Execute each statement separately (better-sqlite3 doesn't support multi-statement exec).
  // Strip single-line SQL comments first so semicolons inside comments don't create
  // false split points (e.g. "-- note; more note" would otherwise produce a fragment).
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

  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__db) {
    globalThis.__db = createDb();
  }
  return globalThis.__db;
}
