/**
 * [cli/bid_test] `lb bid test <bounty-id> <diff-file>`
 *
 * Pre-flight check: runs the sandbox locally WITHOUT submitting.
 *
 * Flow:
 *  1. Fetch bounty (context_files + test_command)
 *  2. Write context_files to temp dir
 *  3. Apply the diff (reuse normalizeNewFileDiffs + applyDiff from gh_pr.ts)
 *  4. Run test_command in that dir
 *  5. Print PASS/FAIL with output
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { getApiBase, withAuth } from "../auth.js";

interface ContextFile {
  path: string;
  content: string;
}

interface CodebasePayload {
  codebase_id: string;
  context_files: ContextFile[];
  test_command: string;
  task_description: string;
}

interface BountyDetail {
  id: string;
  title: string;
  task_type: string;
  language: string;
  task_payload: string | null;
  test_suite: string | null;
}

export interface BidTestOpts {
  api?: string;
}

// ---------------------------------------------------------------------------
// Diff helpers (mirror of gh_pr.ts — CLI cannot import from lib/)
// ---------------------------------------------------------------------------

function normalizeNewFileDiffs(diff: string, dir: string): string {
  const lines = diff.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("--- ")) {
      const minusLine = line;
      const plusLine = lines[i + 1] ?? "";

      if (plusLine.startsWith("+++ ")) {
        const minusPath = minusLine.slice(4).trim();

        let relPath: string | null = null;
        if (minusPath.startsWith("a/")) {
          relPath = minusPath.slice(2);
        } else if (minusPath === "/dev/null" || minusPath === "a/dev/null") {
          relPath = null;
        }

        let firstHunkIdx = -1;
        for (let j = i + 2; j < lines.length; j++) {
          if (lines[j].startsWith("@@ ")) {
            firstHunkIdx = j;
            break;
          }
          if (lines[j].startsWith("--- ") && (lines[j + 1] ?? "").startsWith("+++ ")) {
            break;
          }
        }

        const firstHunk = firstHunkIdx >= 0 ? lines[firstHunkIdx] : "";
        const isNewFileHunk = /^@@ -0(,0)? \+/.test(firstHunk);
        const isWrongDevNull = minusPath === "a/dev/null";

        if (isNewFileHunk && relPath !== null && !existsSync(join(dir, relPath))) {
          result.push("--- /dev/null");
        } else if (isWrongDevNull) {
          result.push("--- /dev/null");
        } else {
          result.push(minusLine);
        }

        i++;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}

function applyDiff(repoDir: string, diff: string): void {
  const patchFile = join(repoDir, ".lb-patch.diff");
  const withFixedHeaders = normalizeNewFileDiffs(diff, repoDir);
  const normalized = withFixedHeaders.endsWith("\n") ? withFixedHeaders : withFixedHeaders + "\n";
  writeFileSync(patchFile, normalized, "utf-8");

  const attempts: Array<{ cmd: string; args: string[] }> = [
    { cmd: "patch", args: ["-p1", "-l", "--fuzz=3", "--input", patchFile] },
    { cmd: "patch", args: ["-p1", "-l", "--fuzz=5", "--ignore-whitespace", "--input", patchFile] },
    { cmd: "git", args: ["apply", "--whitespace=fix", "--recount", patchFile] },
    { cmd: "git", args: ["apply", "--whitespace=fix", "--recount", "--ignore-whitespace", "--ignore-space-change", patchFile] },
  ];

  let lastErr: unknown = null;
  for (const { cmd, args } of attempts) {
    try {
      execFileSync(cmd, args, { cwd: repoDir, stdio: "pipe" });
      try { rmSync(patchFile); } catch { /* non-fatal */ }
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `[bid-test][applyDiff] Failed to apply diff: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runBidTest(bountyId: string, diffFile: string, opts: BidTestOpts): Promise<void> {
  if (!bountyId?.trim()) {
    console.error("[bid test] bounty-id is required");
    process.exit(1);
  }
  if (!diffFile?.trim()) {
    console.error("[bid test] diff-file is required");
    process.exit(1);
  }

  const diffPath = resolve(process.cwd(), diffFile);
  if (!existsSync(diffPath)) {
    console.error(`[bid test] diff file not found: ${diffPath}`);
    process.exit(1);
  }

  const apiBase = opts.api ?? getApiBase();

  // Fetch bounty
  let bounty: BountyDetail;
  try {
    const res = await fetch(`${apiBase}/bounty/${bountyId}`, {
      headers: withAuth(),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    bounty = (await res.json()) as BountyDetail;
  } catch (err) {
    console.error(
      `[bid test] Failed to fetch bounty: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  if (bounty.task_type !== "codebase" && bounty.task_type !== "bug_bounty") {
    console.error(`[bid test] Only codebase and bug_bounty tasks support local sandbox testing (task_type: ${bounty.task_type})`);
    process.exit(1);
  }

  if (!bounty.task_payload) {
    console.error("[bid test] Bounty has no task_payload (context files)");
    process.exit(1);
  }

  let payload: CodebasePayload;
  try {
    payload = JSON.parse(bounty.task_payload) as CodebasePayload;
  } catch {
    console.error("[bid test] Failed to parse task_payload JSON");
    process.exit(1);
  }

  if (!payload.context_files?.length) {
    console.error("[bid test] Bounty has no context_files in payload");
    process.exit(1);
  }

  const diff = readFileSync(diffPath, "utf-8");
  if (!diff.trim()) {
    console.error("[bid test] Diff file is empty");
    process.exit(1);
  }

  console.log(`\nlb bid test`);
  console.log(`  bounty     : ${bounty.id} — ${bounty.title}`);
  console.log(`  diff       : ${diffPath}`);
  console.log(`  test cmd   : ${payload.test_command}`);
  console.log(`  files      : ${payload.context_files.length}`);
  console.log(``);

  // Write context files to temp dir
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-bid-test-"));

  try {
    console.log(`[bid test] Writing context files to ${tmpDir}...`);

    // Initialize git repo so git apply works
    execFileSync("git", ["init"], { cwd: tmpDir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "lb@test.local"], { cwd: tmpDir, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "lb-test"], { cwd: tmpDir, stdio: "pipe" });

    for (const f of payload.context_files) {
      const destPath = join(tmpDir, f.path);
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, f.content, "utf-8");
    }

    // Initial commit so git apply has a base
    execFileSync("git", ["add", "-A"], { cwd: tmpDir, stdio: "pipe" });
    try {
      execFileSync("git", ["commit", "--no-gpg-sign", "-m", "init"], { cwd: tmpDir, stdio: "pipe" });
    } catch {
      // Nothing to commit if files are empty — still ok for patch
    }

    // Apply diff
    console.log(`[bid test] Applying diff...`);
    try {
      applyDiff(tmpDir, diff);
    } catch (err) {
      console.error(`\nFAIL — diff did not apply cleanly:`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    console.log(`[bid test] Diff applied.`);

    // Run test command
    console.log(`[bid test] Running: ${payload.test_command}\n`);
    const [cmd, ...args] = payload.test_command.split(" ");

    let exitCode = 0;
    let testOutput = "";

    try {
      testOutput = execFileSync(cmd, args, {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 120_000,
      });
    } catch (err) {
      exitCode = (err as NodeJS.ErrnoException & { status?: number }).status ?? 1;
      testOutput = [
        ((err as NodeJS.ErrnoException & { stdout?: string }).stdout) ?? "",
        ((err as NodeJS.ErrnoException & { stderr?: string }).stderr) ?? "",
      ].join("\n").trim();
    }

    // Print output
    if (testOutput) {
      const preview = testOutput.slice(0, 4000);
      for (const line of preview.split("\n")) {
        console.log(`  ${line}`);
      }
      if (testOutput.length > 4000) {
        console.log(`  ... (${testOutput.length - 4000} more chars truncated)`);
      }
    }

    console.log(``);
    if (exitCode === 0) {
      console.log(`PASS (exit code 0)`);
    } else {
      console.log(`FAIL (exit code ${exitCode})`);
      process.exit(1);
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* non-fatal */ }
  }
}
