# Hosting Options

You have three ways to put this app on a public URL. Pick based on how permanent you need it.

---

## Option 1: cloudflared tunnel (LIVE NOW — no setup needed)

Status: **Active** at the URL printed by `cloudflared tunnel --url http://localhost:3000`.

```bash
# Already running. To restart:
brew install cloudflared      # if not installed
cloudflared tunnel --url http://localhost:3000 > /tmp/cf-tunnel.log 2>&1 &
sleep 5
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-tunnel.log | head -1
```

**Pros:** Instant. Zero auth. All sandbox features work (because it's just your laptop).
**Cons:** URL is ephemeral (`*.trycloudflare.com`). Laptop must stay on.

Use for: showing someone the demo right now over Zoom screen-share.

---

## Option 2: Railway deploy (RECOMMENDED for permanent URL)

Railway runs your full Node process in a long-lived Linux container. Everything in the app works because the runtime has access to `git`, `patch`, `python3`, `npx`, child processes, and the filesystem.

Project is pre-configured. To deploy:

```bash
# 1. Install Railway CLI (one time)
brew install railwayapp/railway/railway

# 2. Login (opens browser, you confirm)
railway login

# 3. From the lightning-bounties dir, link to a new project
cd /Users/harismuranovic/Desktop/saas/bounty-map/lightning-bounties
railway init   # name it "lightning-bounties"

# 4. Set env vars (copy your local .env to Railway)
railway variables --set ANTHROPIC_API_KEY=sk-ant-... \
                  --set TAVILY_API_KEY=tvly-dev-... \
                  --set USE_STUBS=true

# 5. Add a persistent volume for the SQLite DB
railway volume add --mount /app/data
# Then update DATABASE_URL: railway variables --set DATABASE_URL=file:/app/data/dev.db

# 6. Deploy
railway up

# 7. Get the URL
railway domain   # generates *.up.railway.app, or use --custom for your own domain
```

**Pros:** Persistent. ~$5 free credit. Custom domain in 5 min. All sandbox features work.
**Cons:** Needs `railway login` (browser, one time).

Use for: a stable URL judges can click before/after the pitch.

---

## Option 3: Vercel (NOT RECOMMENDED for this app)

Vercel is serverless. The app needs:

- **Persistent filesystem** for SQLite (Vercel: read-only, except /tmp which is wiped)
- **Long-running background polling** (Vercel: stateless functions, 10s max execution by default)
- **Child process spawning** of `git`, `patch`, `npx tsx` for the sandbox (Vercel runtime: limited binaries)

**To make Vercel work** would require:

1. Replace `better-sqlite3` with `@libsql/client` (Turso) — ~2h
2. Replace `lib/jobs.ts` setInterval with Vercel Cron + lazy per-request ticks — ~2h
3. Move Lightning store from `globalThis` to DB — ~1h
4. Either skip the sandbox in serverless mode (mock all bids → PASS) OR use a Vercel Functions runtime that supports the binaries (premium tier) — ~3h
5. Test/fix every flow — ~2h

Total: **~10h refactor**. Save your Vercel sponsor credits for a marketing landing page (separate static site) instead.

---

## Use the Vercel v0 credits anyway?

The 1649 v0 credits are for AI UI generation, not deployment. Use them for:
- A separate marketing landing page on Vercel pointing at your Railway-hosted app
- Demo-day slide deck templates
- Post-pitch explainer site

Don't use v0 to regenerate the demo UI — would replace the Bauhaus components.

---

## Custom domain (Railway)

Once Railway is up:

```bash
railway domain --custom yourdomain.com
# Then add CNAME in your DNS provider per Railway's instructions
```

DNS propagation: 5-30 min. SSL is automatic.
