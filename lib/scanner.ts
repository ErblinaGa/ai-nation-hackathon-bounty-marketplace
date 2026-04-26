/**
 * [lib/scanner] Scans a codebase directory and uses claude-sonnet to draft
 * N improvement-issue candidates with title, body, severity, and suggested sats.
 *
 * Flow:
 *  1. Walk codebase — reuse SKIP_DIRS/SKIP_EXTENSIONS from context_extractor logic
 *  2. Cap at 30 files with ~500-char previews each
 *  3. Call claude-sonnet-4-6 with SCAN_PROMPT
 *  4. Parse JSON array of candidates
 *  5. Sort by severity DESC (HIGH > MEDIUM > LOW)
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, extname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface ScanCandidate {
  id: string;
  scan_id: string;
  repo: string;
  title: string;
  body: string;
  severity: ScanSeverity;
  files_affected: string[];
  estimated_loc: number;
  suggested_sats: number;
}

// Raw shape returned by claude (before we enrich with id/scan_id/repo)
interface RawCandidate {
  title: string;
  body: string;
  severity: string;
  files_affected?: string[];
  estimated_loc?: number;
  suggested_sats?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".cache",
  "coverage",
  ".turbo",
  ".vercel",
]);

const SKIP_EXTENSIONS = new Set([
  ".lock",
  ".log",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".db",
  ".sqlite",
  ".sqlite3",
]);

const MAX_FILES = 30;
const MAX_FILE_PREVIEW_CHARS = 500;
const MAX_FILE_BYTES = 200_000;

// Severity → sats mid-point mapping
const SEVERITY_SATS: Record<ScanSeverity, number> = {
  HIGH: 60_000,    // mid of 40k-80k
  MEDIUM: 27_000,  // mid of 15k-40k
  LOW: 10_000,     // mid of 5k-15k
};

const SEVERITY_ORDER: Record<ScanSeverity, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

// ---------------------------------------------------------------------------
// Walker (self-contained — no CLI import to avoid ESM boundary issues)
// ---------------------------------------------------------------------------

export async function walkCodebase(rootDir: string): Promise<string[]> {
  const eligible: string[] = [];

  function recurse(dir: string): void {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = join(dir, entry.name);
      const relPath = relative(rootDir, absPath);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        recurse(absPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (SKIP_EXTENSIONS.has(ext)) continue;
        try {
          const stat = statSync(absPath);
          if (stat.size > MAX_FILE_BYTES) continue;
        } catch {
          continue;
        }
        eligible.push(relPath);
      }
    }
  }

  recurse(rootDir);
  return eligible;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SCAN_PROMPT = `You are an expert software engineer performing a code review. Review the codebase files provided and identify 5-10 specific, actionable improvements.

For each improvement, output a JSON object with these exact fields:
- "title": short issue title (under 80 chars), actionable verb first (e.g. "Add error handling to...", "Refactor...", "Fix...")
- "body": markdown issue body (2-4 paragraphs: problem, impact, suggested approach, affected files)
- "severity": exactly "HIGH", "MEDIUM", or "LOW"
  - HIGH = security risk, data loss, crash, or critical missing error handling
  - MEDIUM = maintainability, duplication, missing validation, performance
  - LOW = style, minor refactor, docs, tests
- "files_affected": array of file paths that need changes
- "estimated_loc": estimated lines of code to change (integer)
- "suggested_sats": bounty in satoshis (HIGH: 40000-80000, MEDIUM: 15000-40000, LOW: 5000-15000)

Return ONLY a JSON array. No markdown fences. No explanation. No text before or after the array.

Example:
[
  {
    "title": "Add error handling to database connection in lib/db.ts",
    "body": "## Problem\\n\\nThe database initialization in \`lib/db.ts\` does not handle connection failures gracefully...",
    "severity": "HIGH",
    "files_affected": ["lib/db.ts"],
    "estimated_loc": 15,
    "suggested_sats": 55000
  }
]

Codebase files:`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * [lib/scanner][scanRepo] Walks a cloned repo, asks claude-sonnet to find
 * N improvement candidates, and returns them sorted by severity DESC.
 */
export async function scanRepo(
  rootDir: string,
  githubRepo: string,
  maxCandidates = 8,
): Promise<ScanCandidate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("[lib/scanner][scanRepo] ANTHROPIC_API_KEY is not set");
  }

  console.log("[scan] Walking codebase...");
  const allFiles = await walkCodebase(rootDir);
  console.log(`[scan] Found ${allFiles.length} eligible files`);

  if (allFiles.length === 0) {
    throw new Error("[lib/scanner][scanRepo] No eligible files found in codebase");
  }

  // Build file previews — cap at MAX_FILES
  const filesToScan = allFiles.slice(0, MAX_FILES);
  const filePreviews: string[] = [];

  for (const relPath of filesToScan) {
    const absPath = join(rootDir, relPath);
    let preview = "";
    try {
      const content = readFileSync(absPath, "utf-8");
      preview = content.slice(0, MAX_FILE_PREVIEW_CHARS);
    } catch {
      preview = "(unreadable)";
    }
    filePreviews.push(`=== ${relPath} ===\n${preview}`);
  }

  const fileContext = filePreviews.join("\n\n");

  const fullPrompt = `${SCAN_PROMPT}\n\n${fileContext}\n\nReturn a JSON array of ${Math.min(maxCandidates, 10)} improvement candidates:`;

  console.log(`[scan] Asking claude-sonnet to review (model: sonnet, temp: 0.0)...`);

  let rawText: string;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: "user", content: fullPrompt }],
    });

    rawText =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";
  } catch (err) {
    throw new Error(
      `[lib/scanner][scanRepo] Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Strip markdown fences if present
  const clean = rawText.startsWith("```")
    ? rawText.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "").trim()
    : rawText;

  let rawCandidates: RawCandidate[];
  try {
    const parsed: unknown = JSON.parse(clean);
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not a JSON array");
    }
    rawCandidates = parsed as RawCandidate[];
  } catch (err) {
    throw new Error(
      `[lib/scanner][scanRepo] Failed to parse Claude response as JSON: ${err instanceof Error ? err.message : String(err)}\nRaw: ${rawText.slice(0, 500)}`,
    );
  }

  console.log(`[scan] Found ${rawCandidates.length} candidates. Drafting issue title + body for each...`);

  // Enrich with ids, defaults, validated severity
  const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const candidates: ScanCandidate[] = rawCandidates
    .slice(0, maxCandidates)
    .map((raw, idx) => {
      const severity = (["HIGH", "MEDIUM", "LOW"].includes(raw.severity?.toUpperCase() ?? "")
        ? raw.severity.toUpperCase()
        : "MEDIUM") as ScanSeverity;

      return {
        id: `cand_${scanId}_${idx}`,
        scan_id: scanId,
        repo: githubRepo,
        title: (raw.title ?? "Untitled improvement").slice(0, 120),
        body: raw.body ?? "",
        severity,
        files_affected: Array.isArray(raw.files_affected) ? raw.files_affected : [],
        estimated_loc: typeof raw.estimated_loc === "number" ? raw.estimated_loc : 0,
        suggested_sats:
          typeof raw.suggested_sats === "number" && raw.suggested_sats > 0
            ? raw.suggested_sats
            : SEVERITY_SATS[severity],
      };
    });

  // Sort HIGH → MEDIUM → LOW
  candidates.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return candidates;
}
