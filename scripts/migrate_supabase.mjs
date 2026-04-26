// Apply supabase/migrations/0001_initial.sql via direct Postgres connection.
// Uses pg with the SUPABASE_DB_URL (pooled conn) to run the schema.
import { config } from "dotenv";
import { readFileSync } from "fs";
import pg from "pg";
config();

// Project ref from URL
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const projectRef = projectUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD;

if (!projectRef || !password) {
  console.error("missing project ref or DB password");
  process.exit(1);
}

const client = new pg.Client({
  host: "aws-0-eu-west-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: `postgres.${projectRef}`,
  password,
  ssl: { rejectUnauthorized: false },
});

console.log("connecting...");
await client.connect();
console.log("connected");

const sql = readFileSync("supabase/migrations/0001_initial.sql", "utf-8");

// Run as a single transaction
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("migration applied");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}

// Verify tables exist
const verify = new pg.Client({
  host: "aws-0-eu-west-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: `postgres.${projectRef}`,
  password,
  ssl: { rejectUnauthorized: false },
});
await verify.connect();
const { rows } = await verify.query(
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
);
console.log("tables in public schema:");
for (const r of rows) console.log("  -", r.tablename);
await verify.end();
