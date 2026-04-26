/**
 * [lib/scan_candidates] DB operations for the scan_candidates table.
 *
 * All operations use the singleton better-sqlite3 instance from lib/db.ts.
 */
import { getDb } from "@/lib/db";
import type { ScanCandidate } from "@/lib/scanner";

// ---------------------------------------------------------------------------
// DB row shape (matches schema.sql scan_candidates table)
// ---------------------------------------------------------------------------

interface ScanCandidateRow {
  id: string;
  scan_id: string;
  repo: string;
  title: string;
  body: string;
  severity: string;
  files_affected: string | null;
  estimated_loc: number | null;
  suggested_sats: number | null;
  status: string;
  bounty_id: string | null;
  issue_number: number | null;
  created_at: string;
  applied_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToCandidate(row: ScanCandidateRow): ScanCandidateRow & {
  files_affected_parsed: string[];
} {
  return {
    ...row,
    files_affected_parsed: row.files_affected
      ? (JSON.parse(row.files_affected) as string[])
      : [],
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * [lib/scan_candidates][saveCandidates] Persists an array of ScanCandidate
 * objects to the DB. Idempotent — uses INSERT OR IGNORE.
 */
export function saveCandidates(candidates: ScanCandidate[]): void {
  if (candidates.length === 0) return;

  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO scan_candidates
      (id, scan_id, repo, title, body, severity, files_affected,
       estimated_loc, suggested_sats, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
  `);

  const insertMany = db.transaction((items: ScanCandidate[]) => {
    for (const c of items) {
      insert.run(
        c.id,
        c.scan_id,
        c.repo,
        c.title,
        c.body,
        c.severity,
        JSON.stringify(c.files_affected),
        c.estimated_loc,
        c.suggested_sats,
      );
    }
  });

  try {
    insertMany(candidates);
  } catch (err) {
    throw new Error(
      `[lib/scan_candidates][saveCandidates] DB insert error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * [lib/scan_candidates][getCandidates] Returns all candidates for a given
 * scan_id, ordered by severity (HIGH first).
 */
export function getCandidates(scanId: string): ScanCandidateRow[] {
  const db = getDb();

  try {
    const rows = db
      .prepare(
        `SELECT * FROM scan_candidates WHERE scan_id = ?
         ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END`,
      )
      .all(scanId) as ScanCandidateRow[];

    return rows;
  } catch (err) {
    throw new Error(
      `[lib/scan_candidates][getCandidates] DB query error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * [lib/scan_candidates][getLatestScanId] Returns the most recent scan_id
 * for the given repo. Returns null if no scans exist.
 */
export function getLatestScanId(repo: string): string | null {
  const db = getDb();

  try {
    const row = db
      .prepare(
        `SELECT scan_id FROM scan_candidates WHERE repo = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(repo) as { scan_id: string } | undefined;

    return row?.scan_id ?? null;
  } catch (err) {
    throw new Error(
      `[lib/scan_candidates][getLatestScanId] DB query error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * [lib/scan_candidates][getCandidatesByIds] Fetches specific candidates by
 * their primary-key IDs.
 */
export function getCandidatesByIds(ids: string[]): ScanCandidateRow[] {
  if (ids.length === 0) return [];

  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");

  try {
    const rows = db
      .prepare(
        `SELECT * FROM scan_candidates WHERE id IN (${placeholders})`,
      )
      .all(...ids) as ScanCandidateRow[];

    return rows;
  } catch (err) {
    throw new Error(
      `[lib/scan_candidates][getCandidatesByIds] DB query error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * [lib/scan_candidates][markApplied] Updates a candidate to APPLIED status
 * with the bounty_id and issue_number created during apply.
 */
export function markApplied(
  candidateId: string,
  bountyId: string,
  issueNumber: number,
): void {
  const db = getDb();

  try {
    db.prepare(
      `UPDATE scan_candidates
       SET status = 'APPLIED', bounty_id = ?, issue_number = ?,
           applied_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(bountyId, issueNumber, candidateId);
  } catch (err) {
    throw new Error(
      `[lib/scan_candidates][markApplied] DB update error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * [lib/scan_candidates][markRejected] Updates a candidate to REJECTED status.
 */
export function markRejected(candidateId: string): void {
  const db = getDb();

  try {
    db.prepare(
      `UPDATE scan_candidates SET status = 'REJECTED' WHERE id = ?`,
    ).run(candidateId);
  } catch (err) {
    throw new Error(
      `[lib/scan_candidates][markRejected] DB update error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export type { ScanCandidateRow };
