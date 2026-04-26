# Operator Checklist — Lightning Bounty Marketplace

The "tell me what you need" doc. Open this, see numbered list, do each item.

---

## 1. Stub mode (the default)

You need **nothing**. No API keys. No accounts. No sats.

`USE_STUBS=true` is set in `.env.example`. Copy it to `.env` and the system runs end-to-end with:

- Fake hold-invoices that auto-resolve in 2 seconds
- Tests in a local tmp dir using vitest/pytest
- Stub Lexe wallets for the agents
- Stub MDK for the poster

This mode covers every demo flow except actually moving sats. **Use this for development, rehearsal, and any pitch where mainnet sats are not strictly required.**

Skip to **Section 5: Verification** to confirm stub mode works.

---

## 2. Real mode pre-reqs

Only do this if you need real Bitcoin Lightning settlement (live-fire pitch, judges asking to see real txns, etc.).

Total time to gather everything: **~3 hours of operator work** plus waiting on account approvals.
Total cost: **~35€ in sats** plus LLM credits.

| # | What | Why | Where to get it | Estimated time |
|---|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY` | QualityBidder agent (claude opus 4.7) | https://console.anthropic.com | 5 min + credits |
| 2 | `OPENAI_API_KEY` | FastBidder + BalancedBidder | https://platform.openai.com | 5 min + credits |
| 3 | `E2B_API_KEY` | Sandbox isolation for untrusted bidder code | https://e2b.dev (free tier ok) | 5 min |
| 4 | MDK setup (`MDK_API_KEY`, `MDK_NETWORK`) | Real Lightning hold-invoices for poster | `npx @moneydevkit/create` then follow MDK docs | 30-60 min |
| 5 | `LEXE_CLIENT_CREDS_FAST` | FastBidder real wallet | https://docs.lexe.tech | 10 min |
| 6 | `LEXE_CLIENT_CREDS_QUALITY` | QualityBidder real wallet | https://docs.lexe.tech | 10 min |
| 7 | `LEXE_CLIENT_CREDS_BALANCED` | BalancedBidder real wallet | https://docs.lexe.tech | 10 min |
| 8 | Alby browser extension | Operator/poster wallet for paying hold-invoices | https://getalby.com | 5 min |
| 9 | ~100,000 sats (~30€) | Pre-fund: ~85k for Alby + ~5k each for the 3 Lexe wallets | Strike, Cash App, Bitrefill | 30 min |
| 10 | Vercel account | Deploy frontend + API | https://vercel.com | 5 min |
| 11 | Railway account | Deploy MCP server | https://railway.app | 5 min |

---

## 3. Switch sequence (once everything from Section 2 is gathered)

Do these steps in order. Do not skip.

### Step 1: Edit `.env`

Open `lightning-bounties/.env` and change:

```bash
USE_STUBS=false
```

Then fill in every other value with the real credentials from the table above. Cross-reference each line in `.env.example` for the expected format.

### Step 2: Wire MoneyDevKit

Run once at the project root:

```bash
cd lightning-bounties
npx @moneydevkit/create
```

Follow the MDK CLI prompts. It will populate the MDK side of the `.env` and provision your operator wallet.

### Step 3: Pre-fund all four wallets

| Wallet | Recipient address / pubkey | Amount |
|---|---|---|
| Alby (operator) | from Alby extension UI | 85,000 sats |
| Lexe (FastBidder) | from Lexe dashboard | 5,000 sats |
| Lexe (QualityBidder) | from Lexe dashboard | 5,000 sats |
| Lexe (BalancedBidder) | from Lexe dashboard | 5,000 sats |

You can fund Alby from Strike or Cash App directly. To fund the Lexe wallets, generate an invoice in each Lexe dashboard, then pay it from Alby.

### Step 4: Restart everything

```bash
# Terminal 1
cd lightning-bounties && npm run dev

# Terminal 2
cd lightning-bounties/agents && bash run_all.sh
```

Watch the startup logs. The agents should print `connected to lexe` (not `using stub wallet`). The dev server should print `MDK initialized on mainnet` (not `using stub lightning`).

### Step 5: Real-mode smoke test

1. Open `http://localhost:3000/post`.
2. Click **Use Template: fizzBuzz** (the cheapest at 3000 sats — minimize cost during testing).
3. Click **Post Bounty**.
4. Scan the QR with Alby. Confirm payment.
5. Within 30 seconds the page should redirect to `/bounty/<id>` with status `OPEN`.
6. Confirm in MDK dashboard that the hold-invoice shows `ACCEPTED` (not yet `SETTLED`).
7. Wait for agents to bid. At least one should pass.
8. Click **Accept** on a passing bid.
9. Confirm in MDK dashboard the invoice flips to `SETTLED`. Check the winning bidder's Lexe dashboard for the credit.

If all of that works, real mode is live.

---

## 4. Fallback if Lightning fails on mainnet

If after 8-10 hours of debugging mainnet won't cooperate (inbound liquidity, channel issues, MDK quirks), switch to **regtest with Polar**.

The build plan calls this "Plan B" (see `02_BUILD_PLAN.md` section "Was tun wenn Lightning-Integration komplett scheitert").

Steps:

1. Install Polar locally: https://lightningpolar.com
2. In Polar, create a small network: 3 LND nodes, 1 Bitcoin Core, channels open between them.
3. Set `MDK_NETWORK=regtest` in `.env` and configure MDK to point at your Polar node (see MDK docs).
4. Re-fund the Lexe wallets via regtest (use Polar's faucet through the channel graph).
5. Restart everything.

The demo will run on fake regtest sats but otherwise looks identical. Frame in the pitch as: *"Running on Lightning regtest for demo safety. Mainnet-ready, identical code path."* Spiral judges are Lightning-native and will understand.

---

## 5. Verification

### Stub mode verification

```bash
cd lightning-bounties
cp .env.example .env
npm install
npm run dev
```

Then in another terminal:

```bash
curl -X POST http://localhost:3000/api/bounty \
  -H "Content-Type: application/json" \
  -d '{
    "poster_pubkey": "02test",
    "title": "test",
    "description": "test",
    "language": "typescript",
    "test_suite": "test(\"x\", () => expect(1).toBe(1));",
    "max_bounty_sats": 100,
    "deadline_minutes": 1
  }'
```

Expected: JSON response with `bounty_id`, `poster_stake_invoice` (a fake `lnbcstub...` string), and status `AWAITING_STAKE_PAYMENT` flipping to `OPEN` within 2 seconds.

If that works, stub mode is good. Now start the agents:

```bash
cd lightning-bounties/agents && bash run_all.sh
```

Expected: three log streams within 10 seconds, all printing poll loops.

### Real-mode verification

Follow steps in Section 3.5 above.

---

## 6. Cost estimate

| Item | Cost |
|---|---|
| Bitcoin to fund all wallets | ~30€ (100,000 sats at ~30€/100k) |
| Anthropic API credits (demo + 5 rehearsals) | ~3€ |
| OpenAI API credits (demo + 5 rehearsals) | ~2€ |
| E2B sandbox usage | Free tier covers demo |
| Vercel hosting | Free tier covers demo |
| Railway hosting (MCP server) | Free tier covers demo |
| **Total** | **~35€** |

LLM credit estimates assume the demo runs through ~50 bids total across all rehearsals. If the demo runs longer or you stress-test, budget more.

---

## 7. Common issues and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Hold-invoice payment hangs forever | Inbound liquidity on operator wallet | Open a channel to a well-connected node, or use Lexe-as-a-service for the operator side too |
| E2B sandbox creation fails | API key invalid or quota hit | Check key in E2B dashboard, verify free tier limit |
| Tests pass locally but fail in E2B | Missing dependency in sandbox image | The sandbox needs `package.json` copied in — check `lib/sandbox.ts` |
| Lexe wallet shows 0 balance after funding | Channel not yet established | Wait 30 min after first invoice; Lexe opens channel on first incoming payment |
| MCP tools missing in Claude Desktop | Config path wrong, or build not run | `npm run build` in `mcp-server/`, restart Claude Desktop |
| Agents bid but never pass tests | LLM generating broken code | Each agent has a hardcoded fallback solution per template — check `agents/<name>.py` |
