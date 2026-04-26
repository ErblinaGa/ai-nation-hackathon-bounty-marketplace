# Demo Runbook — Lightning Bounty Marketplace

Three demo paths exist. **For AI Nation Hackathon pitch, use V3.** V2 and V1 are preserved below as fallback paths.

| Path | Length | What it shows | Use when |
|---|---|---|---|
| **V3 — Scan + bid + settle + revert** | 5 min | `lb scan` finds candidates, agents bid live, auditor decides, Lightning settles, PR opens, revert demo | Default for AI Nation Hackathon pitch. |
| **V2 — Full GitHub flow** | 5 min | Real GitHub issue posted via CLI, autonomous auditor, auto-PR | Fallback if scan stalls. |
| **V1 — 3-tier marketplace** | 6 min | Snippet, codebase, bug bounty tiers with manual Accept | Last-resort fallback. |

All three paths target the real public repo
[github.com/boaharis/lightning-bounty-demo](https://github.com/boaharis/lightning-bounty-demo).
The `gh` CLI is authenticated as `boaharis` on the demo machine.

---

# V3 Pitch Flow (5 minutes)

This is the AI Nation Hackathon pitch. Run this end-to-end at least twice before going live.

## Pre-flight checklist (run 3 minutes before going live)

Do all of these in order. Do not skip any step.

### 1. Wipe DB and restart clean

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
rm -f dev.db && touch dev.db
npm run dev
```

Wait for `Ready in Xs` on `http://localhost:3000`.

### 2. Start all four agents

Terminal 2:

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties/agents
bash run_all.sh
```

Confirm four log streams: `[fast]`, `[balanced]`, `[quality]`, `[ensemble]`. Each should print `polling marketplace...` within 10 seconds.

### 3. Verify cloudflared tunnel (or Railway URL)

If running cloudflared locally:

```bash
cloudflared tunnel run lb-demo
```

Confirm the tunnel URL is reachable from your phone. If using Railway, paste the Railway URL into the browser and confirm it responds.

### 4. Verify GitHub auth and demo repo state

Terminal 3 (the `lb` CLI terminal):

```bash
gh auth status                                          # must show: Logged in to github.com as boaharis
lb gh-login                                             # should print: auth ok
lb gh-connect boaharis/lightning-bounty-demo            # idempotent — re-confirms the connection
```

Confirm the demo repo has at least one open issue (so `lb scan` finds something):

```bash
gh issue list --repo boaharis/lightning-bounty-demo --state open
```

If zero open issues: create one now:

```bash
gh issue create --repo boaharis/lightning-bounty-demo \
  --title "Add localStorage persistence for todos" \
  --body "Todos should survive a page refresh. Store them in localStorage and rehydrate on load."
```

### 5. Seed a settled+merged bounty for the revert demo

The revert demo at [3:30] requires one bounty in SETTLED or MERGED status. Check:

```bash
curl -s http://localhost:3000/api/bounties | node -e "
  const d=require('fs').readFileSync('/dev/stdin','utf8');
  const b=JSON.parse(d);
  console.log(b.filter(x=>['SETTLED','MERGED'].includes(x.status)).map(x=>x.id+' '+x.status));
"
```

If none exist, post one with a short deadline and wait for it to settle:

```bash
lb gh-bounty boaharis/lightning-bounty-demo#1 --max-sats 5000 --deadline-minutes 1
```

Wait ~75 seconds for the full cycle (bid + auditor + settle). Then confirm again with the curl above.

### 6. Build the CLI

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties/cli
npm run build
npm link
```

Verify: `lb --version` prints the version.

### 7. Environment checks

```bash
grep USE_STUBS .env              # must be: USE_STUBS=true
grep DEMO_MODE .env              # must be: DEMO_MODE=true  (enables force-deadline endpoint)
grep ANTHROPIC_API_KEY .env      # must not be empty
```

### 8. Browser tab order (left to right, set up before you start)

1. `http://localhost:3000` — landing page
2. `http://localhost:3000/repos/boaharis/lightning-bounty-demo` — repo detail
3. `https://github.com/boaharis/lightning-bounty-demo` — GitHub repo
4. (Will open during demo) — the bounty detail page
5. (Will open during demo) — the GitHub PR page

### 9. Final checks

- Volume off. Notifications off.
- Browser zoom 110%.
- Terminal font size 16+.
- Terminal 3 has `lb scan boaharis/lightning-bounty-demo` ready in shell history (press up-arrow once).

---

## The 5 minutes

### 0:00 - 0:30 — Setup statement (no UI activity)

**On screen:** Landing page at `http://localhost:3000`.

**You say:**

> AI agents are everywhere. But who pays them? Who decides what's good?
> This marketplace is the answer. Real GitHub issues become bounties.
> Autonomous agents bid with code. An auditor picks the winner. Lightning
> settles. PR opens on your repo. You merge. Or revert.

**You do:** Stay on the landing page. Let the audience read it.

---

### 0:30 - 1:30 — Issue to bounty via scan

**On screen:** Switch to terminal 3.

**You say:**

> One command. It reads your repo and tells you what's worth posting.

**You do:**

```bash
lb scan boaharis/lightning-bounty-demo
```

Expected output (5-8 lines, one per candidate):

```
scanning boaharis/lightning-bounty-demo...
  #3  Add localStorage persistence for todos       [medium]  suggested: 40000 sats
  #4  Fix date formatting in task list             [low]     suggested: 15000 sats
  #5  Add keyboard shortcut for new task           [low]     suggested: 12000 sats
  #6  Write unit tests for TaskStore               [medium]  suggested: 35000 sats
  ...
found 5 candidates. run `lb scan --apply 1,3` to post selected bounties.
```

**You say while it runs:**

> The scanner reads every open issue and asks Claude to rank them by bounty
> potential — complexity, clarity of spec, testability. It suggests a sat
> amount based on estimated effort. I pick two.

**You do:**

```bash
lb scan --apply 1,3
```

Expected output:

```
posting bounty for issue #3: Add localStorage persistence for todos (40000 sats)
  bounty posted: abc123...
posting bounty for issue #5: Add keyboard shortcut for new task (12000 sats)
  bounty posted: def456...
done. 2 bounties live.
```

**You say:**

> Two issues. Two bounties. Agents will start bidding within seconds.

**You do:** Switch to browser tab 2 — `http://localhost:3000/repos/boaharis/lightning-bounty-demo`.

**You say:**

> Here they are in the UI. Live.

Point at the two new bounties that just appeared.

---

### 1:30 - 2:30 — Live bidding

**On screen:** Click on the first bounty (localStorage persistence). Browser opens `/bounty/<id>`.

**You say:**

> Four agents are going to compete for this. They each see the issue body,
> the repo context, and the auditor config I locked at posting time. They
> cannot see each other's bids. No price-matching. No copying.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 1:35 | bounty page | First bid lands — `[fast]`, status PENDING then PASS. |
| 1:45 | bounty page | `[balanced]` and `[quality]` bids land. |
| 1:55 | bounty page | `[ensemble]` lands. Click its row — expand `ensemble_metadata`: ran 3 models, picked the one with smallest diff. |
| 2:05 | bounty page | All 4 bids visible. Some PASS, possibly one FAIL. Point at the FAIL: "That bidder's stake just burned." |
| 2:15 | bounty page | Point at "Awaiting auditor" — no Accept button. "The buyer can't cherry-pick code they haven't paid for." |
| 2:20 | terminal 3 | Force the deadline: `curl -X POST http://localhost:3000/api/bounty/<bounty-id>/force-deadline` |
| 2:25 | bounty page | Status flips to AUDITING. Spinner: "auditor reading N PASS bids..." |

**You say while bids land:**

> No Accept button. The buyer locked an auditor config when they posted:
> scoring weights, threshold, model. That config is hashed into the bounty.
> Cannot be changed. The auditor is the only one who can pick a winner.
> Anti-cherry-pick by design.

---

### 2:30 - 3:30 — Settlement and merge

**On screen:** Bounty page auto-updates.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 2:35 | bounty page | Status flips to SETTLED. Audit trail expands. |
| 2:40 | bounty page | Each bid shows per-criterion scores (7 bars) + reasoning paragraph. Winner highlighted. |
| 2:50 | bounty page | Lightning settle banner: "N sats paid to winner, M sats refunded to poster." |
| 2:55 | bounty page | Click "View Winner Code" — diff viewer modal opens. Scroll briefly. |
| 3:00 | bounty page | Click "View PR" link. |
| 3:05 | github tab | PR titled `marketplace bounty: Add localStorage persistence for todos`. |
| 3:10 | github tab | PR body: auditor reasoning + bounty link + test output. |
| 3:20 | github tab | Click Files changed — show the diff. `lib/persistence.ts` was created, `app/page.tsx` modified. |
| 3:25 | bounty page | Click [Merge] button (or terminal: `lb gh-merge <bounty-id>`). |
| 3:30 | wallets page | Navigate to `/wallets` — winner's balance increased by the bounty amount. |

**You say:**

> The PR opened automatically the moment Lightning settled. The buyer
> reviews it exactly the way they'd review a PR from a teammate. Then
> they click Merge. Winner gets paid. The code is in the repo.
>
> No platform holding funds. No Stripe. No KYC. Lightning settled it in
> seconds.

---

### 3:30 - 4:00 — Revert demo (the safety net)

**On screen:** Navigate to an older, already-settled bounty in the list.

**You say:**

> What if the code looked fine in review and turned out to be wrong?
> There's an escape hatch.

**You do:**

Click the [Revert] button on the settled bounty. A confirmation modal appears. Confirm.

**Expected:**

- A revert PR opens on GitHub automatically.
- Bounty status changes to REVERTED with a link to the revert PR.

**You do:** Click the revert PR link. Show it on GitHub — it's a real PR that undoes the diff.

**You say:**

> No refund — the bidder did the work. But the change is reversed. This
> is the warranty period mechanism. Future versions will add a formal
> warranty window where the bidder is on the hook if the revert happens
> within 48 hours.

---

### 4:00 - 5:00 — Vision close

**On screen:** Switch terminal. Run scan again to show the cycle repeating.

```bash
lb scan boaharis/lightning-bounty-demo
```

**You say while it runs:**

> New opportunities. Still waiting.

**Closing statement:**

> Every TODO in your codebase is a bounty waiting to be filled overnight.
> Every open issue is a market. Every model that ships diffs can earn.
>
> No KYC, no bank, no Stripe. Lightning makes it work. Settled in seconds.
> Quality reviewed by AI. Reversible if wrong.
>
> We built this for AI Nation Hackathon.
> github.com/boaharis/ai-nation-hackathon-bounty-marketplace
>
> Marketplace as infrastructure. Thanks.

---

## Pre-flight summary (3 min before going live)

| Check | Command | Expected |
|---|---|---|
| Dev server up | `curl -s http://localhost:3000/api/health` | `{"ok":true}` or 200 |
| 4 agents running | `ps aux \| grep python` | 4 agent processes |
| Tunnel up | open tunnel URL in browser | landing page renders |
| DB has settled bounty | `curl /api/bounties \| jq '[.[] \| select(.status=="SETTLED")]'` | at least 1 result |
| GH CLI auth | `gh auth status` | Logged in as boaharis |
| Open issue on demo repo | `gh issue list --repo boaharis/lightning-bounty-demo --state open` | at least 1 issue |
| DEMO_MODE on | `grep DEMO_MODE .env` | `DEMO_MODE=true` |
| USE_STUBS on | `grep USE_STUBS .env` | `USE_STUBS=true` |
| CLI built | `lb --version` | prints version |

---

## Backup plans

### If `lb scan` produces 0 candidates

The scanner found no open issues (or none passed the quality bar). Fallback:

```bash
# Create a fresh issue manually and post directly
gh issue create --repo boaharis/lightning-bounty-demo \
  --title "Add localStorage persistence for todos" \
  --body "Todos should survive page refresh."

lb gh-bounty boaharis/lightning-bounty-demo#<N> --max-sats 40000
```

Frame it: "I'll use a specific issue I prepared for this demo."

### If auditor stalls after force-deadline

1. Check terminal 1 for API errors (429 / 529 = rate limit).
2. Trigger the fallback decision endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/bounty/<bounty-id>/force-fallback
   ```
   This skips the LLM call and picks the lowest-priced PASS bid. Frame it: "if the
   auditor times out, the policy falls back to lowest-price passing bid. Same result,
   different selection path."
3. If still stalled: drop to V2 script (below).

### If autoPR fails after settlement

```bash
lb gh-pr <bounty-id>
```

Most common cause: gh token rotated. Fix: `gh auth refresh -s repo` then retry.

If still failing: click the audit trail diff viewer in the UI. Say: "the PR step is
automatic in production; the diff is already in the UI."

### If all bids fail the test suite

The auditor will transition the bounty to `REOPEN_BIDDING` and extend the deadline.
Frame it: "agents failed the quality bar. The market reopens. This is the escrow
mechanism — the poster's funds stay locked until a passing bid arrives."

### If everything fails

Open the backup screen recording at `docs/demo-recording.mp4` (operator: record this
the day before the pitch). Say: "let me show you a recorded run while we restart."

---

## Post-pitch demo URLs to send to judges

After the pitch, send judges these three links:

1. **Live app** — cloudflared tunnel URL (or Railway URL if deployed)
2. **GitHub demo repo** — `https://github.com/boaharis/lightning-bounty-demo`
3. **Marketplace repo** — `https://github.com/boaharis/ai-nation-hackathon-bounty-marketplace`

---

## Failure-mode Q&A (for judges)

**"What happens if all bids fail the test suite?"**

The auditor transitions the bounty to `REOPEN_BIDDING`. The deadline extends by the
configured extension window (default: same as original deadline). Existing bidders can
revise their submissions; new bidders can enter. The poster's funds stay locked — no
refund until a valid winner is picked or the poster manually cancels.

**"Can the poster manipulate the winner choice?"**

No. The auditor config (weights, threshold, model) is hashed into the bounty at
posting time and stored immutably. No PATCH endpoint touches `auditor_config` after
posting. The auditor is called server-side with the locked config — no UI path exists
to tweak it mid-auction. Winner-takes-all removes any incentive to underpay.

**"What if the winner produces broken code? Can they be punished?"**

The poster can click Revert — a revert PR is opened automatically. The bounty
transitions to REVERTED. The winner has already been paid (no automatic refund). A
warranty period feature (time-locked clawback if revert happens within N hours) is
on the roadmap but not implemented in this prototype.

**"What stops the poster from just reading every bid diff for free?"**

Bid code is hash-committed at submission time. The full diff is server-side only.
The API `/api/bounty/:id/winning-diff` requires the poster's pubkey and only returns
the winning diff after the bounty is SETTLED. Non-winning diffs are never revealed.

**"Could a bidder collude with the auditor?"**

The auditor is a deterministic LLM call with a locked config (model, weights, prompt
template). There is no human auditor to bribe. The only manipulation surface is
injecting malicious content into the diff that biases the auditor's scoring prompt —
future mitigation: sanitize diff content before including in auditor prompt.

---

## Reset between rehearsals

```bash
# Stop agents (Ctrl+C in terminal 2)
# Stop dev server (Ctrl+C in terminal 1)
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
rm -f dev.db && touch dev.db
# Revert the demo repo working tree if a previous run applied a diff
cd /path/to/cloned/lightning-bounty-demo
git checkout -- .
git clean -fd
# Restart
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
npm run dev &
cd agents && bash run_all.sh
```

---

# V2 Pitch Flow (5 minutes) — Fallback

This is the previous default (Spiral pitch). Use as fallback if V3's scan
command stalls.

## V2 pre-pitch checklist (run 3 minutes before)

Do all of these. Do not skip any.

### 1. Wipe DB and restart everything clean

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
rm -f dev.db && touch dev.db
```

### 2. Start the dev server

Terminal 1:

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
npm run dev
```

Wait for `Ready in Xs` on `http://localhost:3000`.

### 3. Start all four agents (Fast / Balanced / Quality / Ensemble)

Terminal 2:

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties/agents
bash run_all.sh
```

Confirm four log streams: `[fast]`, `[balanced]`, `[quality]`, `[ensemble]`.

### 4. Verify GitHub auth and repo connection

Terminal 3 (the `lb` CLI terminal):

```bash
gh auth status                                       # logged in as boaharis
lb gh-login                                          # both ok
lb gh-connect boaharis/lightning-bounty-demo         # idempotent — re-confirms
```

Open `http://localhost:3000/repos` in browser tab 2. Confirm
`boaharis/lightning-bounty-demo` appears with the connection banner up top.

### 5. Warm the sandbox with one throwaway bounty

```bash
lb gh-bounty boaharis/lightning-bounty-demo#1 --max-sats 1000 --deadline-minutes 1
```

Wait ~60 seconds for agents to bid + auditor to run. The bounty will likely fail
the threshold at 1000 sats — that is fine, it pre-loads the test runner and the
auditor's prompt cache. Then wipe again:

```bash
rm -f dev.db && touch dev.db
```

Restart `npm run dev` (terminal 1) and `run_all.sh` (terminal 2).

### 6. Browser tab order (left to right)

1. `https://github.com/boaharis/lightning-bounty-demo/issues/1` — the issue you'll point at
2. `http://localhost:3000` — landing
3. `http://localhost:3000/repos` — connected repos page
4. `http://localhost:3000/repos/boaharis/lightning-bounty-demo` — repo detail
5. (Will open during demo) — the bounty detail page
6. (Will open during demo) — the GitHub PR page

### 7. Final V2 checks

- Volume off. No notifications.
- Browser zoom 110%.
- `USE_STUBS=true` in `.env` (Lightning auto-settles in stub mode).
- Confirm with: `grep USE_STUBS .env`.
- `cli/` is built: `cd cli && npm run build && npm link`.
- Terminal 3 has `lb gh-bounty` ready in shell history (press up-arrow once to recall).

---

## The V2 5 minutes

### 0:00 - 0:30 — Show the real GitHub issue

**On screen:** Browser tab 1 — `https://github.com/boaharis/lightning-bounty-demo/issues/1`.

**You say:**

> Look at this. A real GitHub repo. A real open issue. "Add dark mode toggle to
> settings page." Labelled `bounty`. This is the kind of small feature work that
> drowns every codebase — too small to plan a sprint around, too big to ship in
> the gaps. Today I'm going to send this issue to a marketplace of AI agents and
> get back a merged PR in five minutes. I never read a single line of code from
> a losing bidder. I never trust the platform. The whole thing settles on Bitcoin
> Lightning the moment an autonomous auditor picks a winner.

**You do:** Stay on the GitHub issue. Let the audience read the title.

---

### 0:30 - 1:00 — Post the bounty from the CLI

**On screen:** Switch to terminal 3.

**You say:**

> One command. Issue number, max bounty.

**You do:**

```bash
lb gh-bounty boaharis/lightning-bounty-demo#1 --max-sats 50000
```

CLI output, beat-by-beat (each line appears in ~2-3 seconds):

```
fetched issue #1: Add dark mode toggle to settings page
cloned at sha 4f8a2c1
extracted 7 files: app/settings/page.tsx, lib/theme/ThemeProvider.tsx, ...
posted bounty 7c3e... for 50000 sats, deadline 10min
invoice: lnbc500u1p... (paying via stub mode)
bounty open at http://localhost:3000/bounty/7c3e...
```

**You say while it runs:**

> The CLI fetches the issue body. Clones the repo at HEAD so the bounty is
> pinned to an exact commit. Asks Claude Haiku to rank which files are relevant
> — picks seven. Posts the bounty with an auditor config that's locked at this
> exact moment. Issues a hold-invoice on Lightning. Stub mode pays it for the
> demo.

---

### 1:00 - 2:00 — The bounty page, agents bidding live

**On screen:** Click the bounty URL from the CLI. Browser opens
`/bounty/<id>`.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 1:00 | bounty page | Page loads. **GitHub** badge top-right, links to issue #1. **CODEBASE** tier label. |
| 1:05 | bounty page | Click **Show context files** — expands the 7-file tree extracted by the CLI. Scroll briefly. |
| 1:15 | bounty page | Click **Auditor config** panel — shows the locked weights (diff_size 0.6, convention_match 0.8, security 1.0, etc) and the model (claude-opus-4-7). |
| 1:25 | bounty page | Where the Accept button would be: **"Awaiting auditor (decision after deadline)"**. Point at it. |
| 1:35 | bounty page | First bid lands — `[fast]`, ~12000 sats, status PENDING then PASS. |
| 1:45 | bounty page | `[balanced]` and `[quality]` bids land. |
| 1:55 | bounty page | `[ensemble]` lands with `ensemble_metadata` visible: ran 3 candidates, picked claude-sonnet-4-6: passed all internal tests, smallest diff. |

**You say while bids land:**

> Notice what's missing. There's no Accept button. In V1 the buyer picks the
> winner. That has three attack vectors — buyer reads the diff, walks away,
> bidder loses the work. So we removed it. The buyer locked an auditor config
> when they posted: scoring weights, threshold, model. That config is hashed
> into the bounty. It cannot be tweaked mid-auction. Four agents are bidding
> right now — Fast, Balanced, Quality, and an Ensemble that runs three models in
> parallel and submits only its best candidate. Each diff is sandboxed against
> the repo. PASS or FAIL. The auditor will only see the PASS bids.

---

### 2:00 - 3:00 — Skip the deadline, watch the auditor decide

**You do:** The default deadline is 10 minutes. For the demo we shorten it via a
debug endpoint. In terminal 3:

```bash
curl -X POST http://localhost:3000/api/bounty/<bounty-id>/force-deadline
```

**On screen:** The bounty page auto-updates within 2 seconds:

| t | screen | action |
|---|--------|--------|
| 2:05 | bounty page | Status flips to **AUDITING**. Spinner: "auditor reading 4 PASS bids..." |
| 2:25 | bounty page | Status flips to **SETTLED**. Audit trail panel expands. |
| 2:30 | bounty page | Each candidate shows: per-criterion scores (7 dimensions), total score, 1-paragraph reasoning. |
| 2:40 | bounty page | Winner highlighted (likely Ensemble or Quality). Top score, e.g. 0.78. |
| 2:50 | bounty page | Lightning settle banner appears: 38000 sats paid to winner, 12000 sats refunded to poster, losers' stakes refunded. |

**You say while the auditor runs:**

> The auditor is Claude Opus reading every passing diff. It scores each one
> against seven criteria — diff size, convention match against the existing
> codebase, no new dependencies, security smells, price, bidder track record,
> and correctness which is implicit because we already filtered out FAIL bids.
> Every score is logged. Every reasoning paragraph is logged. The buyer can
> audit the auditor after the fact. This is the audit trail that replaces the
> Accept button.

> And the moment the auditor picks — Lightning settles. No human in the loop.

---

### 3:00 - 4:00 — The PR auto-opens on GitHub

**On screen:** Bounty page now shows a **PR opened** banner with a link.

**You do:** Click the PR link. Switch to GitHub tab.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 3:05 | github | PR titled "marketplace bounty: Add dark mode toggle to settings page" |
| 3:10 | github | PR body shows: the auditor's reasoning, link back to the bounty, link to the original issue |
| 3:20 | github | Files changed tab — the actual diff. Mostly `app/settings/page.tsx` plus a new `components/DarkModeToggle.tsx`. |
| 3:35 | github | Commit message: "marketplace bounty: <issue title>" |
| 3:50 | github | Click **Files changed** → scroll the diff briefly. Looks like a normal PR. |

**You say:**

> This PR opened automatically. Branch was created, diff applied, push, gh pr
> create — all triggered by the auditor's decision settling on Lightning. The
> buyer reviews this PR exactly the way they'd review a PR from a teammate. They
> can merge it, they can close it. They already paid — the work is done either
> way. But the work landed in their normal review flow.

---

### 4:00 - 5:00 — Vision close

**On screen:** Switch back to the bounty page. Or to the landing page. Or to the GitHub repo's issues list — your call.

**Closing statement:**

> Five minutes. One real GitHub issue. Four AI agents bidding with their own
> stakes on the line. An autonomous auditor picking a winner against criteria
> the buyer locked at posting time. Lightning settling the moment the decision
> lands. A PR opening on the buyer's repo, ready to review.
>
> No platform holding funds. No human in the loop after the post. No way for
> the buyer to read code they didn't pay for. No way for the buyer to refuse to
> pay for code they asked for.
>
> Every TODO in your codebase is a bounty waiting to be filled overnight. Every
> open issue is a market. Every model that ships diffs can earn. Built on
> Lightning because Lightning is the only rail that makes sub-cent stakes and
> instant settlement possible at the same time. Built on GitHub because GitHub
> is where the work actually lives.
>
> Marketplace as infrastructure. Thanks.

---

## V2 fallback plan

### Auditor stalls (no decision after force-deadline)

1. Don't panic. Say: "the auditor's thinking — let me show you what it's
   reading." Click any PASS bid's row. The diff stays hashed (no reveal yet),
   but the metadata is visible.
2. Check terminal 1 for an Anthropic API error. If 429 / 529, the auditor model
   is rate-limited.
3. Trigger a fallback decision manually:
   ```bash
   curl -X POST http://localhost:3000/api/bounty/<bounty-id>/force-fallback
   ```
   This skips the LLM call and picks the lowest-priced PASS bid as winner with
   `decision: FALLBACK_PICK`. The audit trail will note this. Frame it as: "the
   policy: if the auditor doesn't return in time, fall back to lowest-price
   passing bid. The buyer's funds still settle, the bidders still get paid."
4. If even fallback fails: switch narrative. **"Let me show you the V1 manual
   flow as a backup."** Drop into the V1 script below at the 0:30 mark.

### PR creation fails (auto-PR step)

1. Bounty page renders the error banner: **"Lightning settled, but PR creation failed."**
2. In terminal 3:
   ```bash
   lb gh-pr <bounty-id>
   ```
3. Most common cause: gh auth token rotated. Fix:
   `gh auth refresh -s repo` then retry `lb gh-pr`.
4. If still failing: open the GitHub issue tab and say: "in production this
   opens automatically; today I'll show you the diff inline." Click the bounty's
   audit trail to read the winning diff in the UI.

### No bidders bid within 30s

1. Check terminal 2 — are all four log streams alive?
2. Restart agents: `Ctrl+C` in terminal 2, then `bash run_all.sh` again.
3. If still no bids after another 30s: the agents may not be polling the new
   bounty. Skip to the V1 fallback — it has a manual cURL bid pattern.

### Force-deadline endpoint returns 404

You forgot to enable demo mode. Set `DEMO_MODE=true` in `.env` and restart
`npm run dev`. Worst case: wait the full 10 minutes (don't — switch to V1).

---

# V1 Pitch Flow — 3-Tier Marketplace (Last-Resort Fallback)

The original V1 6-minute pitch. Use as a last resort if both V3 and V2 stall.

## The 3 tiers (memorize this)

| Tier | What you post | What the bidder returns | Stake size |
|------|---------------|-------------------------|------------|
| 1. **Snippet** | A pure function + a Jest/pytest suite | Raw source code | small (5k sats) |
| 2. **Codebase** | A repo snapshot + a test command + an English goal | A unified diff that applies cleanly | medium (50k sats) |
| 3. **Bug Bounty** | Buggy module + symptom + hidden test suite | A unified diff that fixes the bug | small-to-medium (20k sats) |

The web UI accepts all three. Bidders can be single-model or **EnsembleBidder** — multiple models race in parallel, the best passing solution is submitted with `ensemble_metadata` so the buyer sees the multi-model exploration.

---

## Pre-flight check (run 5 minutes before pitch)

Do all of these. Do not skip any.

### 1. Wipe the database for a clean run

```bash
cd lightning-bounties
rm -f dev.db && touch dev.db
```

A fresh DB means no leftover bounties from earlier rehearsals cluttering the UI.

### 2. Install demo Todo app deps (one-time, but verify)

```bash
cd lightning-bounties/demo-codebases/todo-app
npm install         # ~17s on a warm cache
npm test -- --run   # MUST currently FAIL — that's the bug the bidder fixes
```

If install takes longer than 60s, you have a network issue — fix it before the pitch.

### 3. Start the web app

In terminal 1:

```bash
cd lightning-bounties
npm run dev
```

Wait until you see `Ready in Xs` on `http://localhost:3000`. Open the browser to that URL and confirm the landing page renders.

### 4. Start the reference agents (now includes the EnsembleBidder)

In terminal 2:

```bash
cd lightning-bounties/agents
bash run_all.sh
```

You should see four log streams interleaved: `[fast]`, `[balanced]`, `[quality]`, `[ensemble]`. Each should print `polling marketplace...` within 10 seconds.

### 5. Warm the sandbox with one throwaway snippet bounty

This pre-loads the test runner so the live demo is faster. In a third terminal:

```bash
curl -X POST http://localhost:3000/api/bounty \
  -H "Content-Type: application/json" \
  -d '{
    "poster_pubkey": "02demo_warmup",
    "title": "warmup",
    "description": "warmup",
    "language": "typescript",
    "task_type": "snippet",
    "test_suite": "test(\"x\", () => expect(1).toBe(1));",
    "max_bounty_sats": 100,
    "deadline_minutes": 1
  }'
```

Wait ~15 seconds for the agents to bid on it. Then wipe the DB again:

```bash
rm -f dev.db && touch dev.db
```

The runtime caches stay warm. The DB is clean.

### 6. Browser tabs

Open these in this order so they are arranged left-to-right in your tab bar:

1. `http://localhost:3000` — landing
2. `http://localhost:3000/post` — keep this one ready, do not navigate yet
3. Terminal with the `lb` CLI checked out at `lightning-bounties/cli/`
4. Terminal with Claude Desktop or Cursor open, MCP server connected (for the closing CLI moment)

### 7. Final checks

- Volume off on laptop. No Slack notifications.
- Browser zoom at 110% so judges can read.
- Stub mode is on (`USE_STUBS=true` in `.env`) — confirm with `grep USE_STUBS .env`.
- Both terminals visible on the second screen if you have one.
- `cli/` is built: `cd cli && npm run build` then `npm link`.

---

## The V1 6 minutes

### 0:00 - 0:30 — Setup statement (no UI activity)

**On screen:** Landing page at `http://localhost:3000`.

**You say:**

> Coding agents are getting cheaper and faster, but you still cannot trust their output until you read it. The buyer carries all the risk. We built a marketplace that flips that. You post a testable task — at three different sizes. A pure function. A change to your real codebase. Or a bug you cannot find. Multiple agents bid in parallel with their solutions hash-committed. Tests run automatically. You only pay for what works. The whole thing settles atomically on Bitcoin Lightning.

**You do:** Nothing. Stay on the landing page.

---

### 0:30 - 1:30 — Tier 1 demo: Snippet (60 seconds)

**On screen:** Navigate from landing to `/post`.

**You say:**

> Tier one. The smallest task. I need an `isPalindrome` function. I post the test suite, I post a 5,000 sat bounty.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 0:30 | landing | Click **Post a Bounty** |
| 0:35 | /post | Click **Use Template: isPalindrome** — form auto-fills (snippet tier preselected) |
| 0:45 | /post | Click **Post Bounty** — Lightning hold-invoice modal appears |
| 0:48 | modal | Stub mode auto-resolves the invoice in ~2s |
| 0:55 | /bounty/<id> | Empty bid list, deadline countdown ticks down |
| 1:00 | /bounty/<id> | First bid lands — `[fast]` agent, ~4000 sats, status PENDING then PASS |
| 1:10 | /bounty/<id> | `[balanced]` and `[quality]` bids land in sequence |
| 1:20 | /bounty/<id> | Hover the cheapest passing bid → click **Accept** |
| 1:25 | /bounty/<id> | Settlement banner appears: 4000 sats paid, 1000 sats refunded, code revealed |

**You say while bids land:**

> Three single-model agents — different price strategies. Each locks a 100-sat anti-spam stake. The platform hashes their code, runs the test suite in an isolated sandbox, and shows me the hash, the result, the price — but not the code itself. I pay for what passed.

---

### 1:30 - 3:00 — Tier 2 demo: Codebase (90 seconds)

**On screen:** Switch to terminal #3 (the `lb` CLI terminal). Working directory is `lightning-bounties/demo-codebases/todo-app/`.

**You say:**

> Tier two. This is my actual repo. A small Next.js Todo app. I want to add a dark mode toggle to the settings page — there's a `ThemeProvider` in there already, I just never wired up the UI. Watch this.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 1:30 | terminal | `cd demo-codebases/todo-app && lb post-codebase --task "Add a dark mode toggle to the settings page using the existing useTheme hook"` |
| 1:35 | terminal | CLI scans the repo, snapshots ~12 files into `context_files`, prints "posting bounty for 50,000 sats, deadline 10min" |
| 1:40 | terminal | Bounty ID returned. CLI opens browser to `/bounty/<id>` |
| 1:45 | /bounty/<id> | Page badge shows **CODEBASE** tier. "Show context files" expands the snapshot |
| 1:50 | /bounty/<id> | Bids start landing — 4 of them this time |
| 2:00 | /bounty/<id> | `[fast]`, `[balanced]`, `[quality]` each submit a single-model diff |
| 2:10 | /bounty/<id> | `[ensemble]` lands with `ensemble_metadata` visible: "ran 3 candidates, picked claude-haiku-4-5: passed all internal tests, smallest diff" |
| 2:30 | /bounty/<id> | Sandbox runs `npm test -- --run` against each diff. Status flips PASS/FAIL |
| 2:40 | /bounty/<id> | Sort by passing+price. EnsembleBidder is most expensive but only one with all-green internal tests |
| 2:45 | /bounty/<id> | Click **Accept** on EnsembleBidder. Settlement banner. Diff revealed in a code block |
| 2:55 | terminal | `lb apply <bid-id>` — CLI applies the diff to the local repo. `npm test` now passes. |

**You say while bids land:**

> The bidder didn't just see the function signature. It saw the whole codebase. The EnsembleBidder ran three different models in parallel and only submitted the one that passed its own internal sandbox first. That's the public metadata you see on the right — multi-model exploration, on the open market.

---

### 3:00 - 4:00 — Tier 3 demo: Bug Bounty (60 seconds)

**On screen:** Back to browser, fresh `/post` page.

**You say:**

> Tier three. A bug I cannot find. My `parseISODate` function returns weird dates in my Tokyo user's timezone. I have a hidden test suite that proves the bug. I post the buggy module, the symptom, and the hidden tests. I do NOT post the fix because I do not have one.

**Beat-by-beat:**

| t | screen | action |
|---|--------|--------|
| 3:00 | /post | Click **Use Template: Fix parseISODate DST bug** |
| 3:05 | /post | Form fills: tier=Bug Bounty, target_code shows the buggy function, hidden_test_suite collapsed by default, 20,000 sat bounty, 8min deadline |
| 3:10 | /post | Click **Post Bounty**. Hold-invoice modal. Stub auto-resolves. |
| 3:15 | /bounty/<id> | Page renders with **BUG BOUNTY** badge. Buggy code visible. Hidden tests blurred. |
| 3:25 | /bounty/<id> | EnsembleBidder lands first this time — its multi-model approach is well-suited to debugging. ensemble_metadata shows it tried 3 hypotheses, picked the Date.UTC fix |
| 3:35 | /bounty/<id> | Two single-model bids land. One PASS, one FAIL (a model that "fixed" the regex but missed the timezone) |
| 3:45 | /bounty/<id> | Click **Accept** on the cheapest passing bid |
| 3:55 | /bounty/<id> | Settlement banner. Diff revealed. Hidden test suite un-blurs (poster owned it all along — the suite was secret to bidders, not to me) |

**You say while bids land:**

> Notice: the FAIL bid is public. Everyone can see that bidder's stake just burned. That's the anti-spam mechanism. You can't blast junk fixes at a bounty for free. And the EnsembleBidder won because it explored the hypothesis space — one of its candidates would have been wrong, but the sandbox filter caught it before submission. Real money pressure on real model selection.

---

### 4:00 - 5:00 — MCP / agent-as-customer moment

**On screen:** Switch to your terminal with Cursor or Claude Desktop open. The MCP server is already connected.

**You say:**

> Up to now, I — a human — was the buyer. But the same API, the same three tiers, are exposed over MCP. So the buyer can be an agent too.

**You do:**

1. In Claude Desktop, type:
   > Look at this codebase, find a util function I need to write, post it to the marketplace.
2. Claude reads the codebase, drafts a small task, calls `post_bounty` via MCP — automatically picks the right tier (snippet for a util, codebase for a multi-file change).
3. The MCP server hits the same REST API. A new bounty appears.
4. The reference agents (including the EnsembleBidder) pick it up and bid.
5. Claude calls `check_bid_status`, picks the winner, calls the accept endpoint.
6. The winning code is returned to Claude, which integrates it into the codebase.

**You say:**

> No account. No KYC. Just a Lightning pubkey. Agents posting work, agents bidding on it, payment settling on Bitcoin. This is what an AI labor market actually looks like.

---

### 5:00 - 6:00 — Vision close

**On screen:** Landing page or a clean shell prompt.

**Closing statement:**

> Three tiers covers the spectrum: a five-minute pure function, a feature added to your real repo, a bug you can't find. The mechanic is the same — testable claim, hash-committed bid, atomic Lightning settlement, no platform holding funds, no escrow. Built on Lightning because Lightning is the only rail that makes sub-cent stakes and instant settlement possible at the same time. Built with MCP because the customer of the next decade is an agent, not a human. Marketplace as infrastructure. Every model can earn. Every agent can hire. Thanks.

---

## V1 Fallback plan

If something stalls during the live demo, here is what to do.

### A bidder produces a broken diff (codebase or bug bounty tier)

The agents fall back to `seed/codebase_tasks.ts` or `seed/bug_bounty_tasks.ts` `reference_solution` if their LLM output fails to apply or fails internal tests. So the demo always has at least one passing bid. If you see ONLY `reference_solution` bids and no LLM-generated ones, mention it casually:

> The fallback kicked in for that one — happens in production too, that's why ensemble exploration matters.

### Demo Todo app `npm install` is slow

Pre-installed in pre-flight. If you skipped it: `cd demo-codebases/todo-app && npm install`. Should be ~17s.

### Lightning hangs (real mode only)

The hold-invoice is not getting paid or not detecting payment.

1. Don't panic. Say: "Real Lightning, real network, sometimes slow."
2. Open a third terminal and check MDK status:
   ```bash
   curl http://localhost:3000/api/health
   ```
3. If still stuck after 30 seconds, switch narration to the MCP moment early. Come back to UI after.
4. Last resort: stop the demo, restart with `USE_STUBS=true`, and frame as "let me show you the same flow against our local Lightning sim for time."

### Sandbox times out

Agents bid but tests stay `PENDING` forever.

1. The sandbox is dead. Restart `npm run dev`.
2. Manually re-trigger the test for one bid:
   ```bash
   curl -X POST http://localhost:3000/api/bid/<bid-id>/retest
   ```
3. If still no luck: skip to acceptance. Acknowledge "the sandbox needs a kick after a long idle, but the mechanic is independent of the runner."

### No agents bid within 30 seconds

The agents are not running, or not seeing the bounty.

1. Check terminal 2 — are the four log streams alive?
2. If dead: restart `bash run_all.sh`.
3. If alive but not bidding for the codebase tier: the EnsembleBidder may still be running its candidates. Wait another 20s before forcing a manual bid.
4. Manual bid for snippet tier (last resort):
   ```bash
   curl -X POST http://localhost:3000/api/bounty/<bounty-id>/bid \
     -H "Content-Type: application/json" \
     -d '{
       "bidder_pubkey": "02manual_demo_bidder",
       "code": "export function isPalindrome(s){const c=s.toLowerCase().replace(/[^a-z0-9]/g,\"\");return c===c.split(\"\").reverse().join(\"\");}",
       "asked_price_sats": 4200
     }'
   ```

### Frontend errors

The page shows a red error or a blank screen.

1. Hit refresh once. Most stub-mode polling errors clear.
2. If the error persists, open the browser console (F12) and read the error aloud — "for the engineers in the room, you can see exactly what failed." Then move to the MCP moment, where the API still works.
3. If totally broken: open the backup screen recording. Pre-recorded run is at `docs/demo-recording.mp4` (operator: record this before pitch day).

### MCP server not responding (final segment)

Claude Desktop says "tool call failed."

1. Restart Claude Desktop. Tool reconnects on launch.
2. If still failing, fall back to a cURL call narrated live:
   ```bash
   curl -X POST http://localhost:3000/api/bounty \
     -H "Content-Type: application/json" \
     -d '{ "poster_pubkey": "02claude_via_curl", "title": "...", ... }'
   ```
3. Frame as "the MCP layer is just a thin wrapper around this API — same call, same result."

---

## Reset between rehearsals

Between practice runs, do this to start clean:

```bash
# Stop the agents (Ctrl+C in terminal 2)
# Stop the dev server (Ctrl+C in terminal 1)
rm -f lightning-bounties/dev.db
touch lightning-bounties/dev.db
# Re-revert the demo Todo app if a previous run applied a diff against the working tree:
cd lightning-bounties/demo-codebases/todo-app
git checkout -- app/settings/page.tsx 2>/dev/null || true
rm -f components/DarkModeToggle.tsx
# Restart both
```

You do not need to restart Claude Desktop between runs unless the MCP tool calls start failing.
