// Local sandbox that actually executes code using a minimal test harness.
// No E2B or external services needed — pure local execution via child_process.
// TypeScript: custom node runner with Jest-compatible describe/test/expect API.
// Python: pytest runner with fallback to raw python3.
import { execFile } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import type {
  Language,
  SandboxClient,
  SandboxRunRequest,
  TestRunResult,
  CodebasePayload,
  BugBountyPayload,
} from "./types";

const TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 90_000;

// TS runner script injected into tmp dir alongside solution + test_suite.
// Defines global describe/test/expect then dynamically imports the test file.
const TS_RUNNER = `
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let _passCount = 0;
let _failCount = 0;
const _results = [];

global.describe = function(name, fn) {
  try { fn(); } catch(e) { /* let inner test handle */ }
};

global.test = async function(name, fn) {
  try {
    await fn();
    _passCount++;
    _results.push({ name, status: 'PASS' });
    console.log('  ✓ ' + name);
  } catch(e) {
    _failCount++;
    _results.push({ name, status: 'FAIL', error: e.message });
    console.log('  ✗ ' + name + ': ' + e.message);
  }
};

global.it = global.test;

global.expect = function(actual) {
  const positive = {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
      }
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error('Expected ' + b + ' but got ' + a);
      }
    },
    toBeNull() {
      if (actual !== null) throw new Error('Expected null but got ' + JSON.stringify(actual));
    },
    toBeUndefined() {
      if (actual !== undefined) throw new Error('Expected undefined but got ' + JSON.stringify(actual));
    },
    toBeDefined() {
      if (actual === undefined) throw new Error('Expected defined but got undefined');
    },
    toBeTruthy() {
      if (!actual) throw new Error('Expected truthy but got ' + JSON.stringify(actual));
    },
    toBeFalsy() {
      if (actual) throw new Error('Expected falsy but got ' + JSON.stringify(actual));
    },
    toContain(expected) {
      if (typeof actual === 'string') {
        if (!actual.includes(expected)) throw new Error('Expected "' + actual + '" to contain ' + JSON.stringify(expected));
      } else if (Array.isArray(actual)) {
        if (!actual.includes(expected)) throw new Error('Expected array to contain ' + JSON.stringify(expected));
      } else {
        throw new Error('toContain requires string or array');
      }
    },
    toHaveLength(expected) {
      if (actual?.length !== expected) throw new Error('Expected length ' + expected + ' but got ' + actual?.length);
    },
  };
  // Generic not-proxy: every positive matcher gets a .not variant automatically.
  const negate = {};
  for (const key of Object.keys(positive)) {
    negate[key] = function(...args) {
      let threw = false;
      try { positive[key].apply(null, args); } catch (_) { threw = true; }
      if (!threw) throw new Error('Expected NOT to ' + key + ', but it matched');
    };
  }
  return Object.assign({}, positive, { not: negate });
};

// Dynamic import the test file (which imports solution.mjs)
const testFile = pathToFileURL(join(__dirname, 'solution.test.mjs')).href;
await import(testFile);

// Give async tests a tick to complete
await new Promise(r => setTimeout(r, 100));

console.log('\\n' + (_failCount === 0 ? 'PASS' : 'FAIL') + ': ' + _passCount + ' passed, ' + _failCount + ' failed');
process.exit(_failCount > 0 ? 1 : 0);
`;

// Python runner: writes runner.py to the tmp dir, which imports solution and runs test_ functions.
const PY_RUNNER = `
import importlib.util, sys, traceback, inspect

spec = importlib.util.spec_from_file_location("solution", "./solution.py")
sol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sol)

spec2 = importlib.util.spec_from_file_location("tests", "./test_solution.py")
test_mod = importlib.util.module_from_spec(spec2)
# inject solution symbols into test module namespace
for name in dir(sol):
    if not name.startswith('_'):
        setattr(test_mod, name, getattr(sol, name))
spec2.loader.exec_module(test_mod)

pass_count = 0
fail_count = 0

for name in dir(test_mod):
    if name.startswith("test_"):
        fn = getattr(test_mod, name)
        try:
            fn()
            print("  ✓ " + name)
            pass_count += 1
        except Exception as e:
            print("  ✗ " + name + ": " + str(e))
            fail_count += 1

result = "PASS" if fail_count == 0 else "FAIL"
print("\\n" + result + ": " + str(pass_count) + " passed, " + str(fail_count) + " failed")
sys.exit(1 if fail_count > 0 else 0)
`;

function execAsync(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = execFile(
      cmd,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
        });
      }
    );
    // Suppress unhandled error — the callback handles it.
    proc.on("error", () => {});
  });
}

// Normalize import paths to point at our solution file (tsx resolves .ts automatically).
function rewriteImports(testSuite: string): string {
  return testSuite.replace(
    /from\s+['"]\.\/solution(?:\.[mc]?[jt]s)?['"]/g,
    "from './solution.ts'"
  );
}

// Write a file creating intermediate directories as needed.
function writeFileDeep(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

// Apply a unified diff in the given directory.
// Strategy: patch CLI first (more lenient with LLM-generated diffs), then git apply.
async function applyDiff(
  tmpDir: string,
  patchContent: string
): Promise<{ success: boolean; output: string }> {
  // LLM-generated diffs often miss the trailing newline that POSIX patch tools require.
  // Normalize: ensure exactly one trailing \n.
  const normalized = patchContent.endsWith("\n") ? patchContent : patchContent + "\n";
  writeFileSync(join(tmpDir, "_changes.patch"), normalized, "utf8");

  // Try patch CLI first (no git state needed), then fall back to git apply.
  // patch is more lenient with LLM-generated diffs by default.
  const patchAttempts = [
    ["-p1", "-l", "--fuzz=3", "--input=_changes.patch"],
    ["-p1", "-l", "--fuzz=5", "--ignore-whitespace", "--input=_changes.patch"],
    ["-p1", "-l", "--fuzz=5", "--ignore-whitespace", "-F", "5", "--input=_changes.patch"],
  ];

  let lastErr = "";
  for (const args of patchAttempts) {
    const r = await execAsync("patch", args, tmpDir, 10_000);
    console.log(`[sandbox][applyDiff] patch ${args.join(" ")} → exit=${r.exitCode}${r.stderr ? " stderr=" + r.stderr.slice(0, 80) : ""}`);
    if (r.exitCode === 0) {
      return { success: true, output: `patch ${args.join(" ")} → OK\n${r.stdout}${r.stderr}` };
    }
    lastErr = r.stderr || r.stdout;
  }

  // Final fallback: git apply with --recount (handles off-by-one line counts)
  const gitAttempts = [
    ["apply", "--whitespace=fix", "--recount", "_changes.patch"],
    ["apply", "--whitespace=fix", "--recount", "--ignore-whitespace", "--ignore-space-change", "_changes.patch"],
  ];

  for (const args of gitAttempts) {
    const r = await execAsync("git", args, tmpDir, 10_000);
    console.log(`[sandbox][applyDiff] git ${args.join(" ")} → exit=${r.exitCode}${r.stderr ? " stderr=" + r.stderr.slice(0, 80) : ""}`);
    if (r.exitCode === 0) {
      return { success: true, output: `git ${args.join(" ")} → OK\n${r.stdout}${r.stderr}` };
    }
    lastErr = r.stderr;
  }

  return { success: false, output: lastErr };
}

// Parse test output from jest/vitest/pytest/custom runners.
function parseTestOutput(
  exitCode: number,
  combined: string
): "PASS" | "FAIL" {
  if (exitCode === 0) return "PASS";
  // jest: "Tests: X passed" with no failures
  if (combined.includes("Tests:") && !combined.includes("failed")) return "PASS";
  // vitest: "Test Files  X passed" with no failures
  if (combined.includes("Test Files") && !combined.includes("failed")) return "PASS";
  // custom runner
  if (combined.includes("\nPASS:")) return "PASS";
  // pytest
  if (combined.includes("passed") && !combined.includes("failed") && !combined.includes("error")) return "PASS";
  return "FAIL";
}

async function runTypeScript(
  code: string,
  testSuite: string
): Promise<TestRunResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-ts-"));
  const start = Date.now();

  try {
    // tsx handles TypeScript natively — no manual stripping (regex strippers
    // corrupt content inside string literals). Just hand tsx the .ts files.
    const normalizedTest = rewriteImports(testSuite);

    // package.json with "type":"module" so tsx treats .ts as ESM (needed for top-level await in runner)
    writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}', "utf8");
    writeFileSync(join(tmpDir, "solution.ts"), code, "utf8");
    writeFileSync(join(tmpDir, "solution.test.ts"), normalizedTest, "utf8");
    writeFileSync(join(tmpDir, "runner.ts"), TS_RUNNER.replace("solution.test.mjs", "solution.test.ts"), "utf8");

    const result = await execAsync(
      "npx",
      ["--yes", "tsx", "runner.ts"],
      tmpDir,
      TIMEOUT_MS
    );

    const runtime_ms = Date.now() - start;
    const combined = (result.stdout + "\n" + result.stderr).trim();
    const passed = result.exitCode === 0 || combined.includes("\nPASS:");

    return {
      status: passed ? "PASS" : "FAIL",
      output: combined || "(no output)",
      metrics: { runtime_ms, mem_mb: null },
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

async function runPython(
  code: string,
  testSuite: string
): Promise<TestRunResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-py-"));
  const start = Date.now();

  try {
    writeFileSync(join(tmpDir, "solution.py"), code, "utf8");
    writeFileSync(join(tmpDir, "test_solution.py"), testSuite, "utf8");
    writeFileSync(join(tmpDir, "runner.py"), PY_RUNNER, "utf8");

    // Try pytest first, fall back to custom runner
    let result = await execAsync(
      "python3",
      ["-m", "pytest", "test_solution.py", "--tb=short", "-q"],
      tmpDir,
      TIMEOUT_MS
    );

    if (result.exitCode !== 0 && !result.stdout.includes("passed") && !result.stdout.includes("failed")) {
      // pytest not available or crashed — use our runner
      result = await execAsync("python3", ["runner.py"], tmpDir, TIMEOUT_MS);
    }

    const runtime_ms = Date.now() - start;
    const combined = (result.stdout + "\n" + result.stderr).trim();

    // pytest exit 0 = all passed, exit 1 = some failed, exit 5 = no tests collected
    const passed =
      result.exitCode === 0 ||
      combined.includes("\nPASS:") ||
      (combined.includes("passed") && !combined.includes("failed") && !combined.includes("error"));

    return {
      status: passed ? "PASS" : "FAIL",
      output: combined || "(no output)",
      metrics: { runtime_ms, mem_mb: null },
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

// Run a codebase task: write context files, apply diff, run test_command.
async function runCodebase(
  diff: string,
  payload: CodebasePayload
): Promise<TestRunResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-codebase-"));
  const start = Date.now();

  try {
    // Write all context files at their relative paths
    for (const file of payload.context_files) {
      writeFileDeep(join(tmpDir, file.path), file.content);
    }

    // Init a git repo so git apply works
    await execAsync("git", ["init", "-q"], tmpDir, 10_000);
    await execAsync("git", ["add", "-A"], tmpDir, 10_000);
    await execAsync(
      "git",
      ["commit", "-q", "-m", "init", "--allow-empty"],
      tmpDir,
      10_000
    );

    // Apply bidder's diff
    const patchResult = await applyDiff(tmpDir, diff);
    if (!patchResult.success) {
      const runtime_ms = Date.now() - start;
      return {
        status: "FAIL",
        output: `[sandbox] diff apply failed:\n${patchResult.output}`,
        metrics: { runtime_ms, mem_mb: null },
      };
    }

    // Dependency strategy: if a pre-warmed node_modules exists at
    // demo-codebases/<codebase_id>/node_modules, symlink it instead of
    // running npm install (~17s → instant). This makes demo runs reliable.
    if (
      existsSync(join(tmpDir, "package.json")) &&
      !existsSync(join(tmpDir, "node_modules"))
    ) {
      const warmModules = join(
        process.cwd(),
        "demo-codebases",
        payload.codebase_id,
        "node_modules"
      );
      if (existsSync(warmModules)) {
        console.log(`[sandbox][codebase] symlinking warm node_modules from ${warmModules}`);
        const { symlinkSync } = await import("fs");
        symlinkSync(warmModules, join(tmpDir, "node_modules"), "dir");
      } else {
        console.log(`[sandbox][codebase] running npm install in ${tmpDir} (no warm cache)`);
        await execAsync(
          "npm",
          ["install", "--no-audit", "--no-fund", "--prefer-offline"],
          tmpDir,
          INSTALL_TIMEOUT_MS
        );
      }
    }

    // Run the test command (e.g. "npm test")
    const [cmd, ...cmdArgs] = payload.test_command.split(" ");
    const testResult = await execAsync(cmd, cmdArgs, tmpDir, TIMEOUT_MS);

    const runtime_ms = Date.now() - start;
    const combined = (testResult.stdout + "\n" + testResult.stderr).trim();
    const status = parseTestOutput(testResult.exitCode, combined);

    return {
      status,
      output: combined || "(no output)",
      metrics: { runtime_ms, mem_mb: null },
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

// Run a bug_bounty task: write buggy target_code, apply diff fix, run hidden_test_suite.
async function runBugBounty(
  diff: string,
  payload: BugBountyPayload
): Promise<TestRunResult> {
  const tmpDir = mkdtempSync(join(tmpdir(), "lb-bug-"));
  const start = Date.now();

  try {
    const isTs = payload.language === "typescript";
    const solutionFile = isTs ? "solution.ts" : "solution.py";
    const testFile = isTs ? "solution.test.ts" : "test_solution.py";

    writeFileSync(join(tmpDir, solutionFile), payload.target_code, "utf8");

    if (isTs) {
      writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}', "utf8");
    }

    // Init git so we can apply a diff
    await execAsync("git", ["init", "-q"], tmpDir, 10_000);
    await execAsync("git", ["add", "-A"], tmpDir, 10_000);
    await execAsync(
      "git",
      ["commit", "-q", "-m", "init", "--allow-empty"],
      tmpDir,
      10_000
    );

    // Apply bidder's fix diff
    const patchResult = await applyDiff(tmpDir, diff);
    if (!patchResult.success) {
      const runtime_ms = Date.now() - start;
      return {
        status: "FAIL",
        output: `[sandbox] diff apply failed:\n${patchResult.output}`,
        metrics: { runtime_ms, mem_mb: null },
      };
    }

    // Write hidden test suite
    writeFileSync(join(tmpDir, testFile), payload.hidden_test_suite, "utf8");

    let result;
    if (isTs) {
      const normalizedTest = rewriteImports(payload.hidden_test_suite);
      writeFileSync(join(tmpDir, testFile), normalizedTest, "utf8");
      writeFileSync(
        join(tmpDir, "runner.ts"),
        TS_RUNNER.replace("solution.test.mjs", "solution.test.ts"),
        "utf8"
      );
      result = await execAsync(
        "npx",
        ["--yes", "tsx", "runner.ts"],
        tmpDir,
        TIMEOUT_MS
      );
    } else {
      writeFileSync(join(tmpDir, "runner.py"), PY_RUNNER, "utf8");
      // Try pytest first
      result = await execAsync(
        "python3",
        ["-m", "pytest", testFile, "--tb=short", "-q"],
        tmpDir,
        TIMEOUT_MS
      );
      if (result.exitCode !== 0 && !result.stdout.includes("passed") && !result.stdout.includes("failed")) {
        result = await execAsync("python3", ["runner.py"], tmpDir, TIMEOUT_MS);
      }
    }

    const runtime_ms = Date.now() - start;
    const combined = (result.stdout + "\n" + result.stderr).trim();
    const status = parseTestOutput(result.exitCode, combined);

    return {
      status,
      output: combined || "(no output)",
      metrics: { runtime_ms, mem_mb: null },
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

// Minimal TypeScript stripper: removes type annotations enough to run in Node ESM.
// Handles: `: Type`, `: Type[]`, `<T>`, `as Type`, `interface X {}`, `type X = ...`
// Not a full TS compiler — good enough for simple function solutions.
function stripTypescript(code: string): string {
  let out = code;

  // Remove TypeScript-only top-level constructs
  out = out.replace(/^export\s+type\s+[^;]+;?\s*$/gm, "");
  out = out.replace(/^export\s+interface\s+\w+[^{]*\{[^}]*\}\s*$/gms, "");
  out = out.replace(/^interface\s+\w+[^{]*\{[^}]*\}\s*$/gms, "");
  out = out.replace(/^type\s+\w+\s*=\s*[^;]+;?\s*$/gm, "");

  // Remove return type annotations: ): ReturnType {  →  ) {
  out = out.replace(/\):\s*[\w\[\]<>,\s|&]+\s*(?=\{)/g, ") ");

  // Remove parameter type annotations: param: Type  →  param
  // Handle arrays, generics, unions — simple pass
  out = out.replace(/(\w+)\s*\??\s*:\s*[\w\[\]<>,\s|&.'"]+(?=[,)\s])/g, (match, name) => {
    // Don't strip ternary colons (we can't easily distinguish, but keep it safe)
    return name;
  });

  // Remove type assertions: as Type
  out = out.replace(/\s+as\s+[\w\[\]<>,\s|&]+/g, "");

  // Remove generic type parameters from function calls/declarations: func<T>(  →  func(
  out = out.replace(/<[A-Z][\w,\s]*>/g, "");

  return out;
}

class LocalSandboxClient implements SandboxClient {
  // New unified entry point — switches on request.kind
  async run(request: SandboxRunRequest): Promise<TestRunResult> {
    switch (request.kind) {
      case "snippet":
        return this.runTests(request.language, request.code, request.test_suite);

      case "codebase":
        try {
          return await runCodebase(request.diff, request.payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[sandbox][codebase] unexpected error:", err);
          return {
            status: "FAIL",
            output: `[sandbox] internal error: ${msg}`,
            metrics: { runtime_ms: 0, mem_mb: null },
          };
        }

      case "bug_bounty":
        try {
          return await runBugBounty(request.diff, request.payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[sandbox][bug_bounty] unexpected error:", err);
          return {
            status: "FAIL",
            output: `[sandbox] internal error: ${msg}`,
            metrics: { runtime_ms: 0, mem_mb: null },
          };
        }

      default: {
        const _exhaustive: never = request;
        return {
          status: "FAIL",
          output: `[sandbox] unknown kind: ${(_exhaustive as SandboxRunRequest).kind}`,
          metrics: { runtime_ms: 0, mem_mb: null },
        };
      }
    }
  }

  // Legacy path — delegates to run() for backward compat
  async runTests(
    language: Language,
    code: string,
    testSuite: string
  ): Promise<TestRunResult> {
    if (language === "typescript") {
      return runTypeScript(code, testSuite);
    } else if (language === "python") {
      return runPython(code, testSuite);
    }
    return {
      status: "FAIL",
      output: `[sandbox] unsupported language: ${language}`,
      metrics: { runtime_ms: 0, mem_mb: null },
    };
  }
}

let _client: LocalSandboxClient | null = null;

export function getSandboxClient(): SandboxClient {
  if (!_client) _client = new LocalSandboxClient();
  return _client;
}
