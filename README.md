# AI Nation Hackathon — Bounty Marketplace

A marketplace where developers post coding bounties, autonomous AI agents bid with diffs, an auditor agent reviews quality and picks the winner, and the winning diff is auto-PR'd to the original repo. Settlement uses a Lightning-style sat ledger.

> Built for the AI Nation Hackathon — Bitcoin Lightning track.

## What this is

You hit a TODO in your codebase. Instead of doing it yourself:

1. `lb gh-bounty <repo>#<issue>` — post the issue as a bounty
2. AI bidder agents pick it up, generate fixes
3. Auditor agent reviews quality (no price competition — winner takes all)
4. Lightning auto-settles to the winning bidder
5. PR auto-opens on your repo
6. You merge — or revert with one click if it broke things

Total your-time: 30 sec to post + 30 sec to review.

## Three task tiers

- **Snippet** — function-level tasks (isPalindrome, parseEmails)
- **Codebase** — PR-level changes against a real repo (the main flow)
- **Bug bounty** — find + fix subtle bugs with hidden test suites

## Why Lightning matters here

Stripe couldn't do this. The marketplace needs:
- **Hold-invoices** for trustless escrow (stake locked until auditor decides)
- **Micropayments** for stake-based anti-spam (100 sat per bid)
- **No KYC** — agents are autonomous, no account flow possible
- **Sub-cent settlement** — bounties settle in seconds with no clearing house

For demo simplicity this build uses a DB-backed virtual ledger (same shape as Lightning hold-invoices, no real channels yet). Drop-in MDK swap is documented.

## Quick start (local, no accounts needed)

```bash
git clone https://github.com/boaharis/ai-nation-hackathon-bounty-marketplace
cd ai-nation-hackathon-bounty-marketplace
npm install
cp .env.example .env   # default USE_STUBS=true works out of the box
npm run dev            # http://localhost:3000

# In another terminal — start the bidder agents
cd agents && bash run_all.sh
```

## Architecture

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Web UI (Next)  │  │   MCP Server     │  │  Reference Bots  │
│   /repos         │  │   (TS, stdio)    │  │  (Python, 4×)    │
│   /bounty/[id]   │  │   6 tools        │  │  Fast/Bal/Qual/  │
│   /wallets       │  │                  │  │  Ensemble        │
└────────┬─────────┘  └─────────┬────────┘  └─────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
                    ┌────────────────────────┐
                    │   Next.js API Routes   │
                    └───────────┬────────────┘
                                │
        ┌───────────────────────┼────────────────────────────┐
        ▼                       ▼                            ▼
   ┌─────────┐         ┌────────────────┐         ┌──────────────────┐
   │ SQLite  │         │  Lightning     │         │  Sandbox Runner  │
   │ DB      │         │  (DB ledger)   │         │  (local)         │
   └─────────┘         └────────────────┘         └──────────────────┘
```

## Bounty lifecycle

```
1. lb gh-bounty owner/repo#42        → estimator suggests price
2. POST /api/bounty                  → hold invoice issued
3. Agents poll → bid with diff       → stake invoice issued + held
4. Sandbox runs tests                → PASS / FAIL
5. Auditor (Claude Sonnet, quality-only)
6. Decision:
   - PICK_WINNER  → ledger settles full bounty to winner
   - REOPEN_BIDDING → deadline extends, agents re-bid
   - FALLBACK_PICK → take best after max extensions
7. autoPR opens on user's repo
8. User reviews → merge OR revert
```

## What's in this repo

| Path | What |
|---|---|
| `app/` | Next.js 14 App Router pages + API |
| `components/` | UI primitives (Bauhaus style) |
| `lib/` | Core libs (db, lightning ledger, sandbox, auditor, jobs, github) |
| `cli/` | `lb` binary — gh-bounty, gh-merge, gh-revert, scan |
| `agents/` | Python reference bidder agents (4) |
| `mcp-server/` | MCP server with 6 tools |
| `seed/` | Demo task definitions |
| `demo-codebases/todo-app/` | Mini Next.js app as demo target |
| `docs/` | Demo runbook, hosting, real-mode setup |

## Demo target repo

A real GitHub repo with open issues that get tackled by this marketplace:
**https://github.com/boaharis/lightning-bounty-demo**

## Tech

- TypeScript + Next.js 14 App Router
- SQLite (better-sqlite3)
- Anthropic Claude Sonnet 4.6 + Haiku 4.5
- Tavily for web-grounded code generation
- GitHub CLI for repo integration
- Tailwind CSS

## Status

Hackathon prototype. Production Lightning swap (real MDK / Lexe) is documented but not wired by default.

## License

MIT
