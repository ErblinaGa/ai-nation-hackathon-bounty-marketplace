# Deployment Notes

> TL;DR: **For the Spiral pitch, run locally on your laptop.** Don't deploy to Vercel today. Here's why and what to do instead.

---

## Why Vercel is broken for this app (today)

The current architecture is incompatible with Vercel's serverless model. Three blockers:

| Component | Current behavior | Why Vercel breaks it |
|---|---|---|
| **`better-sqlite3`** writes to `./dev.db` | Persistent local file | Vercel functions have read-only FS (except `/tmp`, which is wiped per cold-start). DB would reset on every request. |
| **`lib/jobs.ts`** uses `setInterval(tick, 1000)` | Long-running in-process polling | Vercel functions are stateless and only run during a request. No setInterval survives between invocations. |
| **Hold-invoice state** lives in `globalThis.__lightning_store` | In-memory map | Same problem: globalThis dies between cold starts. |

This isn't a small fix — it's an architectural rewrite. The whole point of the in-process polling design was demo simplicity (single `npm run dev`, no extra infrastructure). Trading that for serverless compatibility = adding Postgres/Turso, a job queue (Inngest/QStash/Vercel Cron), and external state for Lightning invoices.

**Estimated work to make Vercel deploy work: 8-12 hours.** Not worth doing before the pitch.

---

## What to do for the pitch

**Run locally during the demo.** Hackathon judges expect this. Plug your laptop into the projector, open `localhost:3000`, demo. This is the standard hackathon approach for stateful demos.

```bash
cd lightning-bounties
npm run dev                           # terminal 1
bash agents/run_all.sh                # terminal 2
```

That's it. Open `http://localhost:3000` on the projector.

If you really need a public URL (e.g., for judges to click before/after the pitch):

### Option A — `ngrok` tunnel (5 min, free)

```bash
brew install ngrok        # if not installed
ngrok http 3000
```

This gives you a public URL like `https://abc123.ngrok.app` that proxies to your local server. Works perfectly with the current architecture because state still lives on your machine.

### Option B — Railway deploy (30 min)

Railway runs your full Node process in a long-lived container — exactly the model this app was built for. Steps:

1. Sign up: https://railway.app
2. Connect GitHub → "Deploy from repo" → point at `lightning-bounties/`
3. Set env vars in Railway dashboard (copy from `.env`)
4. Add a persistent volume for `dev.db` (Railway supports this natively)
5. Deploy. Railway gives you a public URL.

**Railway works because:**
- Long-running containers (your `setInterval` jobs survive)
- Persistent disk for SQLite
- No serverless cold-start issues

This is what Phase 6 in the original BUILD_PLAN intended (Railway for MCP server) — same pattern works for the main app.

### Option C — Vercel (if you really must)

If you absolutely must use Vercel (e.g., to claim the Vercel sponsor credits), the rewrite path is:

1. Replace `better-sqlite3` with **Turso** or **Vercel Postgres** (~3h)
2. Replace `lib/jobs.ts` setInterval with **Vercel Cron** + per-request lazy checks (~2h)
3. Move Lightning invoice state to DB instead of `globalThis` (~1h)
4. Test full flow in deployed env (~2h)
5. Handle cold-start latency in the frontend (~1h)

**~8-12 hours.** Skip unless you have free time and someone else handling the pitch prep.

---

## What about the Vercel v0 credits (1649/2000)?

`v0` is Vercel's **AI UI generator** — it's not deployment credits, it's credits for asking an LLM to generate React components. Hosting on Vercel is free on the hobby tier.

Use the v0 credits for:
- A **separate marketing landing page** at `lightning-bounties.com` (after the pitch)
- A **demo-day slide deck** (v0 can also generate Tailwind slide layouts)
- A **post-pitch "explainer"** site that's pure marketing, not the demo app

**Don't use v0 to regenerate the demo UI** — that would replace the Bauhaus-style components we built and produce generic AI-dashboard slop.

---

## MCP Server Deployment

The MCP server (`mcp-server/`) is a different story. It's a stdio server that runs locally on the user's machine when they invoke it from Claude Desktop. **No deployment needed** — users install it via:

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "lightning-bounties": {
      "command": "node",
      "args": ["/absolute/path/to/lightning-bounties/mcp-server/dist/index.js"],
      "env": { "API_BASE_URL": "https://your-railway-or-ngrok-url/api" }
    }
  }
}
```

The MCP server then talks to your locally-running (or Railway-hosted) backend.

---

## Decision

For the Spiral pitch on demo day:

1. ✅ **Run local + ngrok tunnel for public URL** — fastest, no surprises
2. ⚪ **Railway deploy** — only if you want a stable URL that doesn't depend on your laptop being on
3. ❌ **Vercel deploy** — don't, not without an architecture rewrite

Vercel credits → save for a post-pitch marketing site.
