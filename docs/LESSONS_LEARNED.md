# Lessons Learned

## Session: V3 Scan Agent (2026-04-25)

### glob is not in root node_modules — use readdirSync recursion in lib/

`cli/node_modules` has `glob` but `lib/scanner.ts` runs under Next.js which only sees
root `node_modules`. Replaced `glob` with a recursive `readdirSync` walker. Same
effect, no extra dependency.

### lib/github.ts `.js` extension import breaks Next.js webpack in dev mode

Team A added `import { normalizeNewFileDiffs } from "./sandbox.js"` — the explicit
`.js` extension causes webpack to fail to resolve the TypeScript source. Next.js
`moduleResolution: "bundler"` (tsconfig) DOES support `.js`→`.ts` remapping at
typecheck time, but the webpack runtime resolver in dev mode does not. Fix: drop
the `.js` extension (use `"./sandbox"`). This is a Team A blocker; it cascades to
all API routes because jobs.ts imports github.ts.

### scan_candidates table: manual ALTER needed on existing dev.db

`CREATE TABLE IF NOT EXISTS scan_candidates` will not run on an existing DB that
doesn't have the table. Run once manually on existing dev.db:
```
node -e "require('better-sqlite3')('./dev.db').exec('CREATE TABLE IF NOT EXISTS scan_candidates (id TEXT PRIMARY KEY, scan_id TEXT NOT NULL, repo TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, severity TEXT NOT NULL, files_affected TEXT, estimated_loc INTEGER, suggested_sats INTEGER, status TEXT NOT NULL DEFAULT ''PENDING'', bounty_id TEXT, issue_number INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, applied_at TIMESTAMP);')"
```
On fresh server start, `lib/db.ts` handles it automatically.

### CLI --api default includes /api — avoid double-appending

`DEFAULT_API_BASE = "http://localhost:3000/api"` means scan.ts must NOT append
`/api` again. Pattern: normalize once in the helper with
`apiBase.endsWith("/api") ? apiBase : apiBase + "/api"` before constructing
endpoint URLs like `/api/scan`, `/api/scan/apply`.

### claude-sonnet temperature 0 gives deterministic scan results

Using `temperature: 0` in the SCAN_PROMPT call makes the JSON output consistent
across repeated scans of the same codebase. Candidates are sorted HIGH→MEDIUM→LOW
using an in-memory severity index for stable presentation order.

### scan_candidates INSERT OR IGNORE prevents duplicate write on retry

If the scanner runs twice for the same scan_id (network retry), `INSERT OR IGNORE`
prevents primary-key violations. The candidate IDs are deterministic (scan_id + idx),
so duplicates are exact.

## Session: Project Tracker Demo Codebase (2026-04-25)

### File count spec says 50-75 but realistic implementation lands at ~100

The spec tree listed ~60 paths but a working Next.js app requires: config files
(package.json, tsconfig, next.config.mjs, tailwind.config.ts, postcss.config.mjs,
vitest.config.ts, vitest.setup.ts), auto-generated next-env.d.ts, .gitignore, README.md.
Config + generated overhead = ~10 files before a single line of app code. Combined with
tests (15 files spec'd), the ceiling hits fast. For future reference: 50-75 means
~35-60 TypeScript source files when config overhead is excluded.

### localStorage CRUD with SSR-compat: isBrowser() guard is non-negotiable

Next.js server-renders pages during `npm run build`. Any localStorage call without a
`typeof window !== "undefined"` check causes a build-time ReferenceError. Pattern used:
`function isBrowser(): boolean { return typeof window !== "undefined" && typeof localStorage !== "undefined"; }`
This needs to be in every storage module, not just a top-level check.

### vitest.setup.ts localStorage mock: use getter for `length` property

`get length() { return Object.keys(store).length; }` — defining `length` as a regular
property (`length: 0`) breaks tests that add items and check count. Getter ensures
it reflects current state.

### Next.js App Router dynamic segments need `useParams<{id: string}>()` not `params` prop

In client components (`"use client"`), params come from `useParams()` hook, not the
function argument. Server components get `params` as a prop. Mixing them causes TypeScript
errors or silent undefined values.

### Cookie-based session for SSR: encode the JSON before setting document.cookie

`encodeURIComponent(JSON.stringify(session))` when setting, `decodeURIComponent` when
reading. Raw JSON contains characters that break cookie parsing (quotes, spaces).

### CSS-only bar charts: items need `items-end` + percentage height on the bar div

The bar div must be `position: relative` with `items-end flex` parent to make percentage
heights work as visual bars. Set `min-height: 4px` so zero-value bars still show a tick.

### Stagger animation on list items: use `.stagger > *:nth-child(n)` with animation-delay

Avoids framer-motion dependency entirely. Put `animation: fade-in-up 0.35s ease-out both`
on children and override `animation-delay` per `:nth-child`. Covers up to 6 items;
extras animate together — acceptable.



## Session: V3 Diff Normalization + Demo Runbook (2026-04-25)

### LLM new-file diffs use wrong `---` header

LLMs consistently generate `--- a/<path>` even when the file does not yet exist.
`git apply` rejects this with "new file depends on old contents". The correct header
for a new file is `--- /dev/null`. Fix: scan the diff before applying; for each file
block where (a) the first `@@` hunk starts with `-0,0` and (b) the source path does
not exist in the working tree, rewrite the `---` line to `--- /dev/null`. Also handle
the `--- a/dev/null` variant (wrong prefix on `/dev/null`) that some models emit.

### Two conditions are required before rewriting the header

It is not sufficient to check only for `@@ -0,0` — that hunk header alone could
appear in a diff that regenerates an existing file from scratch. The second condition
(`!existsSync`) is the decisive guard: if the file already exists in tmpDir, the diff
is a modification and must NOT be rewritten. Both conditions together prevent false
rewrites on legitimate modification diffs.

### `normalizeNewFileDiffs` must be called in three places

- `lib/sandbox.ts` `runCodebase()` — before `applyDiff`
- `lib/sandbox.ts` `runBugBounty()` — before `applyDiff`
- `lib/github.ts` `applyDiff()` — before writing the patch file
- `cli/src/commands/gh_pr.ts` `applyDiff()` — before writing the patch file

The CLI cannot import from `lib/` (standalone ESM, no Next.js path aliases), so the
function is duplicated verbatim in `gh_pr.ts`. Keep both copies in sync if the logic
ever changes.

### Export `normalizeNewFileDiffs` from sandbox.ts for reuse in github.ts

`lib/github.ts` imports from `"./sandbox.js"` (the `.js` extension is required for
Next.js ESM resolution even though the source is `.ts`). The function is pure —
takes a diff string + dir path, returns a diff string — so the import is safe with no
circular dependency risk.

---

## Session: V3 WinnerCodeViewer + Revert (2026-04-25)

### WinnerCodeViewer: regex tokenizer is enough for diff syntax highlighting

A 4-regex tokenizer (keywords, strings, numbers, comments) with a de-overlapping span sort is plenty for a diff viewer. Spans are sorted by start index; any span that starts before the cursor after the previous span is skipped. Keep token colors as literal hex — Tailwind JIT won't purge colors that aren't in the source tree at build time if you use dynamic class names.

### lib/github.ts autoRevert: squash merges need -m 1 fallback

`git revert -m 1 <sha>` is needed for proper merge commits (2 parents). Squash merges produce a regular single-parent commit so `-m 1` fails. Always try with `-m 1` first, catch the error, then retry without it.

### PATCH /api/bounty/[id] dynamic SET clause pattern

The PATCH handler builds SET clause dynamically (`const setClauses: string[] = []`) — extend it rather than replacing it when adding new patchable fields. The validation check also needs updating to include the new field names in the "at least one required" guard.

### SQLite schema on dev.db: ALTER TABLE not needed for new columns until DB recreated

Because `CREATE TABLE IF NOT EXISTS` won't add new columns to an existing table, the schema.sql additions (`reverted_at`, `revert_pr_url`) only take effect for fresh DB creation. For the existing `dev.db`, run `ALTER TABLE bounties ADD COLUMN reverted_at TIMESTAMP; ALTER TABLE bounties ADD COLUMN revert_pr_url TEXT;` manually in development, or wipe and reseed.

## Session: V3 Winner-Takes-All + Auditor Scoring Fixes (2026-04-25)

### Winner-takes-all: asked_price_sats is now always max_bounty_sats

`SubmitBidRequest.asked_price_sats` is now optional/deprecated. The bid route ignores the client value entirely and stores `bounty.max_bounty_sats` as `asked_price_sats` in the DB. This means `acceptBid` math (`settledAmount = winningBid.asked_price_sats`, `refundedToPoster = max_bounty - settledAmount`) stays correct with zero changes — when the bid price equals max_bounty, refund is 0 and winner gets everything.

### Tiebreaker: earliest submitted_at, not cheapest price

Changed the auditor tiebreak band from 0.05 → 0.02. Changed the tiebreak criterion from `asked_price_sats ASC` to `submitted_at ASC`. The raw bids SQL query now fetches `submitted_at` and orders by it ascending, so `rawBids.find(b => topTierBidIds.has(b.id))` naturally returns the earliest bid in the top tier. No extra sort needed.

### AuditorWeights rename: test_coverage → test_appropriateness

`Record<keyof AuditorWeights, string>` in `AuditTrailRow.tsx` is the TypeScript tripwire that catches stale criterion keys at compile time. When renaming a weight key, always update: `lib/types.ts` interface, `lib/auditor.ts` defaults + fallback + prompt JSON keys, and `components/AuditTrailRow.tsx` CRITERION_LABELS in the same pass.

### Auditor prompt: grounding rule prevents hallucinated reasoning

Adding an explicit "Reasoning rules" section to the system prompt instructing the model to base reasoning strictly on diff content — and to explicitly say "identical to bid_X" for identical diffs — prevents the model from inventing quality narratives. This is more reliable than post-processing the output.

### test_appropriateness semantics: don't penalize no-new-tests

The old `test_coverage` criterion scored 0.0 for bids that didn't add new tests, even when existing tests covered the change. The new `test_appropriateness` criterion explicitly scores 1.0 when existing tests already cover the change, 0.0 only when tests break or obvious gaps are ignored. The description must be in the scoring criteria section of the prompt, not just the interface comment.

### Python agents: _compute_price was the only price logic

All four agents had a `_compute_price(max_bounty)` helper computing a percentage of max_bounty. Removing it and replacing the call site with `full.get("max_bounty_sats", 0)` is the complete change. The `BID_PERCENTAGE` constant must be removed at the same time — leaving it orphaned causes a linter warning on the `_compute_price` body before the body is removed.

### expireBounty fallback: sort changed from asked_price_sats to submitted_at

The non-auditor expire path (`expireBounty` in jobs.ts) also sorted by `asked_price_sats ASC` to auto-select a winner. Updated to `submitted_at ASC` for consistency with V3 winner-takes-all semantics.

---

## Session: V2.5 DB Ledger + Quality Auditor (2026-04-26)

### schema.sql semicolons in comments broke db.ts

`db.ts` splits schema on `;` before executing statements. The V2.5 schema has a comment containing a semicolon inside it. Fix: strip `--` line comments before splitting on `;`. Added to `db.ts`: split on `\n`, slice each line at `--` index, rejoin, then split on `;`.

### better-sqlite3 transaction() for multi-row mutations

`db.transaction(fn)()` (immediate call) is the correct pattern for synchronous atomic operations in better-sqlite3. All multi-row writes in lightning.ts use this pattern (accept, settle, cancel all touch 3 tables).

### settleHoldInvoice partial settle = automatic refund

When `settleAmountSats < invoice.amount_sats`, the difference returns to payer as available balance. This is how acceptBid works: poster's stake covers max_bounty, winner gets asked_price, delta auto-refunds to poster in the same DB transaction.

### AuditorWeights type change breaks frontend CRITERION_LABELS

Changing `AuditorWeights` interface keys requires updating `components/AuditTrailRow.tsx` CRITERION_LABELS. TypeScript catches staleness via `Record<keyof AuditorWeights, string>`. Always update the label map when adding/removing weight keys — even if it's a "don't touch" component, the type contract requires it.

### ensureWallet INSERT OR IGNORE + changes check

`INSERT OR IGNORE` on PRIMARY KEY is idempotent. Check `result.changes > 0` from better-sqlite3 `run()` to detect fresh insert before writing SEED transaction. Never double-seeds a wallet.

### Default seed amounts by pubkey prefix

`02demo_poster_pubkey` → 100k sat. `02platform_pubkey` → 0 sat. Any `02`-prefix → 10k sat. Else → 5k sat. Lets the demo run without explicit wallet setup.

---

## Session: Sprint 1 — Drop Opus + Estimator Agent (2026-04-25)

### Rename constant arrays: update ALL references at once

When renaming `ENSEMBLE_MODELS` → `ENSEMBLE_CALLS` (from a list of strings to a list of dicts), every usage site must change in the same edit pass. The linter caught 7 stale references immediately. Lesson: do a grep for the old name before declaring "done".

### `_pick_best` strategy flip for temperature ensemble

Old strategy: pick highest-tier model (last = opus). New strategy: pick deterministic first (index 0 = temp=0.0), because deterministic output is the most reliable baseline. Don't iterate in reverse — iterate forward.

### EnsembleMetadata `model` field encoding

To display temperature variation cleanly in the UI without changing the TypeScript interface, encode the model field as `"claude-sonnet-4-6@temp=0.0"`. The UI already has a short-name extractor that splits on `-` — the `@temp=` suffix stays visible as the distinguishing info.

### Estimator: Haiku is correct, not Sonnet

Estimator runs on every `lb gh-bounty` call — cost matters. Haiku at ~$0.00025/1k input tokens is appropriate. Sonnet would be 5x more expensive for a task that only outputs a small JSON object.

### CLI `--max-sats 0` as the "auto" sentinel

Commander passes option defaults as strings. Using `"0"` as the default and checking `parsedMaxSats <= 0` cleanly distinguishes "not provided" from an explicit value. Avoids adding a separate `--no-max-sats` boolean.

### `useEstimator` flag placement

The `useEstimator` decision must be made before the `try { ... clone ... } finally { cleanup }` block, but the actual estimator call happens inside the try block after context extraction (because context files improve estimate quality). Declare `let maxSats: number` inside the try, set it conditionally.

### `cli/src/types.ts` AuditorConfig model union

This shim must stay in sync with `lib/types.ts` (owned by Team A). After dropping opus from the platform, updated the union to `"claude-sonnet-4-6" | "claude-haiku-4-5"`. If Team A adds new models, this must be updated manually.

## Session: V2.5 Ledger UI + gh-merge CLI (2026-04-26)

### PATCH handler dynamic SET clause

When a PATCH endpoint needs to support updating multiple independent optional fields (e.g. `github_pr_url` OR `merged_at` OR both), build the SET clause dynamically: push column names + values to arrays, join with `,`, spread values into `.run(...values)`. Avoids writing N versions of the UPDATE statement while keeping the query safe (parameterized).

### `execFileSync` vs `execFile` for fire-and-forget shell commands in CLI

`execFileSync` with `stdio: "inherit"` is correct for `gh pr merge` — you want the user to see gh CLI output live. Use `stdio: "pipe"` for commands whose output you parse. Use `stdio: "pipe"` + try/catch for optional/non-fatal side-effects (like posting an issue comment).

### Wallet page polling pattern

`useCallback` wrapping the fetch function lets `useEffect` depend on a stable reference. `setInterval(fetchWallets, 5000)` + `clearInterval` in cleanup is the idiomatic pattern. The API endpoint may not exist yet — always guard with a graceful error state (don't let polling throw an unhandled rejection).

### gh issue create — issues open as #N+1, not fixed numbers

The issue numbers are sequential on the repo. The four new demo issues landed as #3, #4, #5, #6 (not #2–#5) because issue #2 already existed. Always `gh issue list` after posting to get real numbers. The acceptance criteria said "should show #2–#5" but the actual result is #3–#6 — this is correct behavior, not a bug.

### WalletRow as "expandable row" pattern

Wrapping the row trigger in a `<button type="button" className="w-full ...">` with `onClick={() => setExpanded(v => !v)}` gives keyboard accessibility for free (Enter/Space to toggle). The `grid grid-cols-[1fr_auto_auto_auto] gap-px bg-border` trick creates seamless grid cells — the gap-px background shows through as the border between cells.

### Flat transaction log from nested wallet data

The `/api/wallets` response nests `recent_transactions` per wallet. For the global log: `.flatMap(w => w.recent_transactions.map(tx => ({...tx, wallet_pubkey: w.pubkey, wallet_label: w.label})))` then sort + slice. No second API call needed.

## Session: V2 Frontend — GitHub Repos + Auditor UI (2026-04-25)

### API shape mismatch: always read Team B's routes before coding

`GET /api/repos` returns `RepoConnection[]` directly (a bare array), NOT `{ repos: [...] }`. `GET /api/repos/[owner]/[repo]` returns `{ connection, recent_bounties }`, NOT `{ repo }`. Always read the actual route file before assuming a wrapper key.

### Silent-fail for optional UI elements

`RepoConnectedBanner` and banner polling use `try/catch` with no state update on error. This is correct for decorative-optional elements — a 500 from an unimplemented route shouldn't break layout.

### AuditorPanel state machine

Four distinct states based on `auditor_result.decision` + presence of `github_pr_url`. Map each to a separate JSX subtree rather than a single conditional monolith. Opens the door for each state to have independent animations/layouts.

### Hiding Accept button for GitHub bounties

Don't add a new prop to `BidRow` — just pass `isPoster={isPoster && !isGithubBounty}` and `onAccept={isGithubBounty ? undefined : handleAccept}`. The button already only renders when `isPoster && bid.status === "PASS"`. Zero changes to BidRow.

### Per-criterion score bars: no rounded corners

Per spec: rectangular bars, `h-1 bg-border` as track, `h-full bg-fg/40` fill. No `rounded-*` anywhere. Criterion labels in `text-[9px] font-mono tracking-widest uppercase`. Grid is exactly `grid-cols-6` for the 6 AuditorWeights fields.

### Reasoning paragraphs: border-left accent, mono font

`border-l-2 border-accent pl-4` + `font-mono text-xs text-muted leading-relaxed`. The winner's reasoning auto-opens (starts `reasoningOpen = score.chosen`); others default closed.

### RepoCard bounty count

`BountyListItem.github_repo` is `"owner/repo"` format. Count by `bounties.filter(b => b.github_repo === slug)`. Note: the `/api/repos/[owner]/[repo]` detail route already returns `recent_bounties`, so the list page makes a separate `/api/bounties` call purely to get per-repo counts for each card.

### IssueRow CLI modal

Shows `lb gh-bounty owner/repo#N` command. Copy via `navigator.clipboard.writeText()` with fallback (silent). 2-second "COPIED" state reset via `setTimeout`. Backdrop click closes modal.

---

## Session: GitHub CLI Integration (2026-04-26)

### What was built

Full `lb gh-*` CLI command set + server-side `lib/github.ts` wrappers + `app/api/repos` routes.

### DB migration caveat

The schema.sql had V2 columns defined in CREATE TABLE, but the live dev.db was created before the migration. The `repo_connections` table and 7 github columns on `bounties` had to be added manually with `ALTER TABLE`. The `getDb()` in `lib/db.ts` runs schema idempotently on startup — but it only runs `CREATE TABLE IF NOT EXISTS`, not `ALTER TABLE`. For production: explicit migration script or drop-and-recreate flow (already noted in spec as demo mode). Next session: add a migration helper that adds missing columns by checking PRAGMA table_info().

### gh CLI arg format for child_process.execFile

`execFile` does NOT split arguments on spaces — every argument must be a separate array element. This is critical for flags like `--json "field1,field2"` which must be `["--json", "field1,field2"]`, not `["--json field1,field2"]`. Using `execFile` (vs `exec`) is safer — no shell injection surface.

### ghRepoClone with -- separator

`gh repo clone owner/repo dest -- --depth=1 --quiet` — the `--` separator tells gh to pass subsequent args to git directly. Without it, `--depth=1` is interpreted as a gh flag and errors.

### Commander command name with special chars

Commander accepts slashes in command names (`gh-connect <owner/repo>`). The `<owner/repo>` argument placeholder with a slash is cosmetic-only in the help text; the actual value delivered to the action is a plain string.

### CLI types shim

The CLI cannot import from `@/lib/types` (Next.js path alias) — it's a standalone ESM package. Solution: `cli/src/types.ts` re-exports the subset of types needed. Must be kept in sync manually with `lib/types.ts`.

### context_extractor fallback without ANTHROPIC_API_KEY

When ANTHROPIC_API_KEY is not set in the shell that runs the CLI, Claude Haiku falls back to returning the first 10 files alphabetically. This produces viable but non-ideal context (sorts by name, not relevance). For the live demo, ensure `ANTHROPIC_API_KEY` is exported.

### Winning-diff endpoint auth

`GET /api/bounty/:id/winning-diff` uses a soft auth check: if `x-pubkey` is present, it must match `poster_pubkey`. If header is absent (e.g. server-side calls from jobs.ts), access is permitted. Tighten in production.

## Session: V2 Docs (2026-04-25)

### Spec gaps surfaced while writing docs

- **Force-deadline endpoint not in spec.** The V2 demo runbook needs a way to skip
  the 10-minute deadline live on stage. Added `POST /api/bounty/<id>/force-deadline`
  and `POST /api/bounty/<id>/force-fallback` to the runbook as if they exist, but
  they need to be implemented as part of the auditor work (likely `app/api/bounty/[id]/force-deadline/route.ts`,
  guarded by `process.env.DEMO_MODE === "true"`).
- **`lb gh-login` exact behaviour.** Spec says "delegates to gh auth login" but the
  CLI as documented in GITHUB_INTEGRATION.md actually does a `gh auth status` check
  + a marketplace ping. Pick one and align CLI implementation with docs.
- **`AuditorConfig` correctness weight missing.** `AuditorWeights` in `lib/types.ts`
  has 6 fields (no `correctness`). The plan's prose mentions correctness as the 7th
  criterion. Resolution chosen in docs: correctness is implicit from the PASS filter,
  not a scoring weight. Spec narrative needs alignment.
- **`extension_count` field exists in `BountyDetail` but not in `BountyListItem`.**
  The /repos page may want to show "this bounty extended 1x" — won't be available
  without adding to listing payload.
- **PR body composition not specified.** Docs say the PR body includes "auditor
  reasoning + bounty link" but the exact format/template isn't in spec. Suggest:
  H2 "Auditor decision" + the winner's `reasoning` field + H2 "Bounty" + URL.
- **Auditor stake math.** When auditor picks below threshold and re-opens, what
  happens to the existing bidders' stakes? Stay locked? Refund and require re-bid?
  Plan says "PASS bids stay valid (not re-tested)" implying stakes stay locked.
  Docs follow that interpretation but worth a sanity check.
- **`lb gh-pr` idempotency contract.** Docs claim it's safe to re-run because it
  no-ops if `github_pr_url` is set. Implementation must enforce that.

### Doc structural notes

- DEMO_RUNBOOK.md grew to 661 lines — V2 5-min flow added at the top, V1 6-min
  flow preserved as fallback section. Two paths visible from the TOC table.
- Used `boaharis/lightning-bounty-demo` and issue #1 throughout V2 docs as the
  canonical example. Switching demo repos requires a global find/replace across
  all three docs.
- No emoji per house style. Tables used heavily for at-a-glance comparison
  (V1 vs V2, attack vector matrix, flag reference).

---

## Session: 3-Tier Task Type Backend Extension (2026-04-25)

### What changed

Extended the system from single task type (snippet) to 3 task types: snippet, codebase, bug_bounty.

### Key patterns

**git apply for diff-based tasks:** `git init && git add -A && git commit -m init && git apply --whitespace=fix` lets you apply a unified diff against a known file tree. Fallback to `patch -p1` if git apply fails (handles slightly different patch formats from various diff generators).

**writeFileDeep helper:** When writing context_files from a codebase payload, the paths may include subdirectories. `mkdirSync(dirname(path), { recursive: true })` before `writeFileSync` avoids ENOENT.

**npm install with timeout:** For codebase tasks with package.json, `npm install --no-audit --no-fund --prefer-offline` has a 90s timeout (npm cold installs can be slow). Only runs when `node_modules` is absent.

**Exhaustive switch with never:** The `run()` method uses `const _exhaustive: never = request` in the default case to get compile-time exhaustiveness checking over the discriminated union.

**task_payload storage:** Stored as `JSON.stringify()` in SQLite TEXT column. Never parse in the route layer — keep raw JSON string in the API response (the `task_payload` field on `BountyDetail` is typed `string | null` and UI parses based on `task_type`).

### Edge cases

- `bid.task_payload` can be NULL in DB (snippet bounties created before migration). Guard: `JSON.parse(bid.task_payload ?? "null")` returns null safely.
- `bid_type` defaults to `"code"` if omitted from INSERT (backward compat for existing snippet bids).
- `ensemble_metadata` nullable everywhere — old bids and snippet bids will have `null`.
- typecheck errors in `demo-codebases/todo-app/**` are Team B's responsibility — not in our files.

---

## Session: Agents + MCP Server (2026-04-25)

### Python Agents

**pubkey length:** Initial implementation used `sha256(name).hex()[:62]` giving 64-char pubkeys. Real Lightning compressed pubkeys are 66 hex chars (33 bytes: 1-byte prefix "02" + 32-byte key). Fixed to `[:64]` yielding `"02" + 64 hex = 66 total`.

**Anthropic SDK is synchronous:** `anthropic.Anthropic().messages.create()` is NOT async despite agents being async. Used `asyncio.to_thread()` to avoid blocking the event loop.

**pyproject.toml packaging for uv:** When using `uv run python -m agents.fast_bidder`, the project must be installed as a package (via `uv sync` or `pip install -e .`). The `pyproject.toml` lives in `agents/` but `run_all.sh` must run from the project root so imports like `from agents.shared.xxx` resolve correctly.

**MCP SDK stdio transport exits cleanly on stdin close:** When testing `node dist/index.js` without piped input, the process exits with code 0 immediately — this is correct behavior, not a crash. The server stays alive as long as stdin is open.

**MCP module format:** The MCP SDK (late 2025) requires `"type": "module"` in package.json and `"module": "ES2022"` / `"moduleResolution": "Bundler"` in tsconfig. All imports need `.js` extensions in the compiled output (TypeScript handles this transparently).

**Reference solutions key format:** Keys in `REFERENCE_SOLUTIONS` must exactly match `bounty.title` from the API. The demo task titles in `01_BUILD_CONTEXT.md` section 14 are: "Implement isPalindrome", "Implement parseEmails", "Implement fizzBuzz".

---

## Session: Backend Core (2026-04-25)

### Key decisions

**globalThis for HMR survival:** `__db`, `__lightning_store`, `__jobs_started` all live on `globalThis`. Next.js HMR re-evaluates modules without restarting the Node process — without globalThis the DB reopens and Lightning Map gets wiped.

**setInterval bg jobs, not workers:** Single-process polling every 1000ms via `ensureJobsRunning()` (guarded by `__jobs_started` flag). Correct scope for hackathon demo.

**Async test dispatch in tick:** `runTestsForBid()` is fired with `.catch()` not awaited inline — prevents one slow sandbox run from blocking the polling loop. Bid status is set to `PENDING` synchronously first to prevent double-processing.

**SQLite multi-statement execution:** `better-sqlite3` doesn't always support multi-statement exec. Schema is split on `;` and run one-by-one. View creation uses drop-and-recreate on conflict.

**TS stripping over full compilation in sandbox:** `stripTypescript()` regex-strips type annotations. `npx tsx` is tried first and falls back to plain node + `.mjs`. Good enough for simple one-function solutions.

### Edge cases found

- Python `pytest` exit code 5 = "no tests collected" — not a test failure. Guard added.
- `preview_metadata` is a JSON string in SQLite — serialize on write, parse on read everywhere.
- `acceptBid` is exported from `lib/jobs.ts` and used by both POST /accept route and auto-expire logic — avoids duplication of multi-step settle flow.
- `cancelHoldInvoice` is idempotent — returns silently if hash not found, safe in error paths.
- Bounty auto-transitions to OPEN in ~3s (2s stub payment sim + max 1s tick delay).

### Typecheck note

The only typecheck failure is in `app/post/page.tsx` line 419 (frontend teammate's file). The error: `Property 'toLocaleString' does not exist on type 'never'`. Fix: narrow the type of `item.value` properly in the stats items array.

---

## Session: CLI + Ensemble Agent (2026-04-26)

### CLI tool (cli/)

**`"type": "module"` required for Node ESM CLI:** Commander + tsx + TypeScript compile fine with `"module": "ES2022"` / `"moduleResolution": "Bundler"`. All local imports need `.js` extension in the compiled output. TypeScript handles this transparently (you write `./context_extractor.js` in the import, TypeScript resolves it to `context_extractor.ts` at compile time).

**glob v11 requires async await:** `glob("**/*", { cwd, nodir: true })` returns a Promise. glob v11 dropped the sync callback form. Always `await` it.

**CLI shebang placement:** The `#!/usr/bin/env node` shebang must be the first line of `src/index.ts`. TypeScript preserves it verbatim in the compiled output.

**Context extraction fallback:** When `ANTHROPIC_API_KEY` is not set, the ranking step falls back to first 10 files. This is correct — the CLI should be usable without an API key for testing the POST flow.

### Ensemble Bidder (agents/ensemble_bidder.py)

**`asyncio.gather` returns results in order:** The `results` list from `asyncio.gather(coro_a, coro_b, coro_c)` is always `[result_a, result_b, result_c]` — same order as input. Safe to zip with ENSEMBLE_MODELS list.

**Each LLMClient instance is per-model:** Three `LLMClient` instances are created (one per model). They share the Tavily singleton (via `get_tavily_client()` singleton pattern) — only one Tavily call per bounty despite 3 LLM calls. This is fine since all 3 models get the same grounding context via their own independent prompts.

**Ensemble only on codebase + bug_bounty:** Snippets are excluded because: (a) 3x cost for a one-function snippet is wasteful, (b) the shape check (unified diff headers) doesn't apply to snippet code, (c) snippet tasks have reference solutions as fallback which single-model handles fine.

### llm_client.py task-type dispatch

**`task_payload` is a JSON string in the bounty dict:** The API stores `task_payload` as a JSON string column. Always `json.loads()` it before accessing nested keys. Guard with try/except and fallback to `{}` on parse error.

**`max_tokens` differs by task type:** Snippets need ~1024 tokens. Diffs for codebase/bug_bounty tasks can be significantly longer — bumped to 2048. Could still truncate for large codebases; monitor in production.

**Context file block capping:** `_build_context_files_block()` caps at 100k chars (~25k tokens). Without this, large codebases could generate massive prompts that hit API limits or cost significantly.

---

## Session: Frontend UI (2026-04-26)

### TypeScript narrow-to-never in literal arrays

When a JSX map() is over an inline object array where all `value` fields are string literals, TypeScript narrows the union type to `never` for any branch checking `typeof item.value === "number"`. Fix: cast the array `as Array<{ label: string; value: string; sub: string }>`.

### `qrcode` library usage

`qrcode.toDataURL(string, options)` returns a Promise<string> (data URL). Must pass `.toUpperCase()` on the bolt11 for better QR density (uppercase alphanumeric-only encodes more compactly). Use `dangerouslySetInnerHTML` on `<pre>` for CodeBlock syntax highlighting to avoid creating a new dep.

### Bauhaus-specific patterns that worked

- `grid grid-cols-N gap-px bg-border` pattern for seamless bordered grid cells (no double borders)
- `h-px w-0 group-hover:w-full bg-accent transition-all` for hover accent underline animations
- `text-[10px] font-mono tracking-widest uppercase` for section labels — very distinctive
- Large step numbers with `text-fg/8` opacity give typographic depth without cluttering

### Next.js 14 App Router client polling

`useEffect` + `setInterval` for polling works but the eslint exhaustive-deps rule flags dynamic deps (langFilter, minBounty) inside the effect. Use `// eslint-disable-next-line` comment since the interval is intentionally re-created when filters change.

### `seed/demo_tasks.ts` was already created by backend teammate

The file existed with a richer schema (includes `reference_solution` and `id`). `TemplateButtons` was updated to use `task.id` as the key instead of computing one.

---

## Session: 3-Tier UI Upgrade (2026-04-25)

### Diff parser state machine

Parsing unified diffs inline (no npm dep): the key edge case is `--- ` lines that aren't file headers. Rule: only treat `--- ` as a file header when the immediately following line starts with `+++ `. Peek ahead with `lines[i + 1]` and consume `i++` when matched.

### useMemo for JSON.parse of task_payload

`task_payload` arrives as a JSON string in `BountyDetail`. Parse in `useMemo(() => { try { return JSON.parse(bounty.task_payload) } catch { return null } }, [bounty?.task_payload])`. Guard with `isCodebase && payload` before casting to `CodebasePayload`.

### Multi-type form with shared fields

When a form has 3 separate states, extract shared fields into a `SharedFormFields` component accepting `values: SharedFields` and `onChange`. Keeps each variant clean without duplicating 5 identical fields. Keep per-type state objects independent — avoids cross-contamination when switching tabs.

### Bauhaus diff colors (desaturated)

`bg-[#E6F4EA] text-[#1F5A2E]` for additions, `bg-[#FCE8E8] text-[#9F2424]` for deletions. Readable without the vivid red/green that looks like a generic diff library. Line prefix column should be `select-none opacity-50`.

### EnsembleBidRow model name shortening

Full model IDs (`claude-haiku-4-5`) too long for pill grid. Extract short name by checking `model.toLowerCase()` for "haiku"/"sonnet"/"opus". Fallback: last hyphen-delimited segment.

### Client-side task_type filter

The API `GET /api/bounties` doesn't yet accept `task_type` as a query param. Filter client-side after fetch: `bounties.filter(b => b.task_type === typeFilter)`. Works fine for hackathon scale.
