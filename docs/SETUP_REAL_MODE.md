# Real-Mode Setup Guide

> Use this guide when you're ready to swap stub Lightning + stub agent wallets for the real thing. All three (MDK, Lexe, Alby) are independent — you can do them in any order, but the demo only needs all three working together for the final pitch.
>
> **Total time budget:** 90–120 minutes if everything cooperates. Plan for 3 hours.
> **Total cost:** ~20–35 € in sats + AI credits.

---

## What you'll have at the end

| Component | Stub-mode (now) | Real-mode (after this guide) |
|---|---|---|
| Operator wallet (poster of bounties) | none | **Alby Browser Extension**, ~10k sat |
| Agent wallets (3 bidders) | fake pubkeys, no-op pay | **3× Lexe wallets**, ~5k sat each |
| Lightning hold-invoices | `lnbcstub_...` auto-paid in 2s | **Real BOLT11**, scannable QR, real htlcs |
| LLM calls (agents) | reference solutions | **already real** — Anthropic Claude (Haiku/Sonnet/Opus) |
| Web search grounding | **already real** — Tavily | (no change) |
| Sandbox | local tmp dir | **E2B** (optional; local works for demo tasks) |

---

## Step 1 — Alby Browser Extension (5 min)

Alby is your operator wallet — when you click "Post Bounty" in the demo, you scan the QR with Alby to lock the poster-stake.

1. Install: https://getalby.com → Chrome/Firefox extension.
2. Create wallet (Alby Account or self-custodial — either works).
3. Pin the extension to your toolbar.
4. **Top up with ~10,000 sat** (~3 €):
   - Easiest: Strike app or Cash App → Alby's Lightning address (in extension settings).
   - Alternative: any exchange that supports Lightning withdrawal (Kraken, Coinbase, etc).
5. Verify: Alby toolbar should show non-zero balance.

**Test:** open https://getalby.com/demo and pay a 1-sat invoice. If that works, Alby is wired.

---

## Step 2 — MDK (MoneyDevKit) Setup (30–60 min)

MDK is what generates the real hold-invoices on the platform side. It's the replacement for `lib/lightning.ts`'s in-memory stub.

### 2a. Initialize MDK in the project

```bash
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
npx @moneydevkit/create
```

This will:
- Walk you through creating a platform Lightning wallet (MDK-managed)
- Output an `MDK_API_KEY`
- Generate a config file (location varies — note where it puts it)

**Save the API key** — you'll paste it into `.env`.

### 2b. Choose network

In `.env`:
```
MDK_NETWORK=mainnet    # for real demo
# OR
MDK_NETWORK=regtest    # for offline testing if mainnet has channel issues
```

For the Spiral pitch: **mainnet**. Regtest is the fallback only if you can't get inbound liquidity in time.

### 2c. Pre-fund the platform wallet

The platform wallet is what receives poster-stakes. It needs **inbound liquidity** to receive payments from Alby.

Two options:
- **Easy path:** use MDK's hosted LSP (Lightning Service Provider) — should be automatic in their setup flow.
- **Hard path:** open a channel manually. Skip unless you know what you're doing.

**Test:** generate a 100-sat invoice from the platform wallet (via MDK CLI or our `lib/lightning.ts` `createHoldInvoice`), pay it from Alby. Confirm it shows up.

### 2d. Common problems

| Problem | Fix |
|---|---|
| "no route to recipient" | Inbound liquidity issue. Wait for LSP to open a channel, or pay 1 sat to your own platform wallet from Alby first to open one. |
| "invoice expired" | MDK default TTL is 1h. For demo, fine. |
| Hold-invoice never accepts | Check `MDK_NETWORK` matches Alby's network. |

### 2e. Wire it into our code

The current `lib/lightning.ts` is a stub. After MDK setup, you (or I) need to swap the stub's `createHoldInvoice` / `getInvoice` / `settleHoldInvoice` / `cancelHoldInvoice` with MDK SDK calls. **That's a separate code task** — once you have the key + setup working, ping me and I'll swap it (~30 min of code).

---

## Step 3 — Lexe Wallets for Agents (10 min × 3 = 30 min)

Lexe gives each Python reference agent its own non-custodial Lightning wallet that runs 24/7. It's the replacement for `agents/shared/lightning_client.py`'s no-op stub.

### 3a. Create 3 wallets

For each of FastBidder, BalancedBidder, QualityBidder:

1. Go to https://docs.lexe.tech/cli (or web signup).
2. Create a new wallet — name it (e.g.) `LB-FastBidder`.
3. After signup, get the **client credentials string** from the dashboard.
4. Save into `.env`:
```
LEXE_CLIENT_CREDS_FAST=<creds string for FastBidder wallet>
LEXE_CLIENT_CREDS_BALANCED=<creds string for BalancedBidder>
LEXE_CLIENT_CREDS_QUALITY=<creds string for QualityBidder>
```

### 3b. Pre-fund each wallet (~5,000 sat each)

Each agent needs sats to pay bid-stakes (default 100 sat per bid, but a 5000-sat buffer covers ~50 bids per agent — enough for the demo).

For each wallet:
1. Get a Lightning invoice or address from Lexe's UI.
2. Pay 5,000 sat from Alby.
3. Wait for confirmation (Lightning is instant; Lexe should reflect new balance immediately).

**Total sats parked across 3 Lexe wallets: 15,000 (~4–5 €).**

### 3c. Wire it in

Same as MDK: `agents/shared/lightning_client.py` is currently a stub. Once you have the 3 creds, the stub needs swapping (~20 min code task). Ping me when ready.

---

## Step 4 — E2B Sandbox (Optional, 5 min)

The current `lib/sandbox.ts` runs untrusted code locally in a tmp dir. For the 3 demo tasks (which we control), this is fine. For "v2 — accept arbitrary task posts from strangers", you'll want E2B for isolation.

1. Sign up: https://e2b.dev → free tier covers thousands of demo runs.
2. Get API key from dashboard.
3. `.env`: `E2B_API_KEY=e2b_...`
4. Set `USE_STUBS=false` (or specifically `USE_E2B=true` if we add a granular flag).

**For the Spiral pitch demo, you can skip this.** Local sandbox handles isPalindrome/parseEmails/fizzBuzz cleanly.

---

## Step 5 — Switch to Real Mode (after all above)

Once you have:
- Alby installed + funded
- MDK setup + key in `.env`
- 3× Lexe creds in `.env` + wallets funded
- `ANTHROPIC_API_KEY` in `.env` (already done)
- `TAVILY_API_KEY` in `.env` (already done)

Edit `.env`:
```
USE_STUBS=false
```

Restart everything:
```bash
# kill any running processes
pkill -f "next dev"
pkill -f "agents."

# in terminal 1
cd lightning-bounties && npm run dev

# in terminal 2
cd lightning-bounties && bash agents/run_all.sh
```

**Verify in real mode:**
1. Post a bounty via UI → should show real BOLT11 invoice in QR modal.
2. Scan QR with Alby → confirm payment → bounty status flips to OPEN.
3. Within 30s, all 3 agents should bid. Each pays its real stake invoice from its Lexe wallet.
4. Tests run, statuses update.
5. Click Accept on cheapest PASS bid → real Lightning settlement happens, you receive sats minus the winner's bid amount back.

---

## Cost Summary

| Item | Cost |
|---|---|
| Alby pre-fund (operator wallet) | ~10,000 sat (~3 €) |
| Lexe wallets (3× pre-fund) | ~15,000 sat (~5 €) |
| Anthropic Claude credits | ~5 € (already loaded) |
| Tavily | Free dev tier (already loaded) |
| E2B | Free tier |
| MDK / Lexe | Free service tiers |
| **Total** | **~13 € + buffer for retries → budget 25–35 €** |

---

## Pitch-Day Checklist

3 minutes before going live:

- [ ] `npm run dev` is up, no errors in `/tmp/lbm-dev.log`
- [ ] `bash agents/run_all.sh` is up, log shows all 3 agents polling
- [ ] DB is fresh: `rm dev.db && touch dev.db` (skip if you want stats history)
- [ ] Alby balance ≥ 10,000 sat
- [ ] All 3 Lexe wallets ≥ 5,000 sat
- [ ] `localhost:3000` opens without errors
- [ ] Post a test bounty + cycle through full flow once → confirm settlement happens
- [ ] Backup recording exists from a previous successful run

---

## Fallback Plan

If real Lightning fails on demo day (channel issues, MDK outage, Lexe down):

1. **Switch to regtest** — change `MDK_NETWORK=regtest`, run Polar locally. Demo looks the same, judges (Spiral) understand regtest.
2. **Switch to stubs** — change `USE_STUBS=true`, restart. Lightning shows `lnbcstub_...` invoices that auto-resolve. Less authentic but the marketplace mechanic is fully visible.
3. **Show the backup recording** — pre-recorded full demo run that you can fall back to.

---

## When you've gathered everything → ping me

Once you have:
- MDK_API_KEY in `.env`
- 3× LEXE_CLIENT_CREDS_* in `.env`
- All wallets funded

I'll do the code-side swap (~1 hour total): `lib/lightning.ts` from stub to MDK, `agents/shared/lightning_client.py` from stub to Lexe, integration test, and we're real-mode.
