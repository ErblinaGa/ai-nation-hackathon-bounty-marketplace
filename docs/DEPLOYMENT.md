# Deployment Guide

## Section 1: Railway (Recommended)

Railway runs a long-lived Node.js process in a container — exactly the model this app requires.
`setInterval` jobs survive, the sandbox can call `git`, `patch`, and `python3`, and there is no cold-start overhead.

### One-command deploy

```bash
npm install -g @railway/cli    # install once

railway login                  # opens browser OAuth

railway init                   # creates a Railway project (run from repo root)
                               # choose "Empty project", name it e.g. "lightning-bounties"

railway up                     # builds + deploys using nixpacks.toml
```

Railway detects `nixpacks.toml` automatically and runs the configured build. On success you get a public URL such as `https://lightning-bounties-production.up.railway.app`.

### Set environment variables

In the Railway dashboard → your service → Variables, paste:

```
# Required
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://<projectRef>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_PASSWORD=<your db password>
USE_SUPABASE=true            # Supabase auth + magic link OTP + middleware
USE_SUPABASE_DB=false        # data store: SQLite (default). See "Data store" below.

# Optional
GITHUB_TOKEN=ghp_...            # for auto-PR + revert CLI commands
GITHUB_APP_ID=                  # if using GitHub App instead of PAT
BOUNTY_URL=https://<your-railway-url>   # used in auto-PR body links
```

Or use the Railway CLI:

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-... USE_SUPABASE=true
```

### Data store

V4 ships with two flags that are decoupled:

- `USE_SUPABASE=true` — Supabase **auth** (cookies, magic link OTP, middleware). Always recommended.
- `USE_SUPABASE_DB=true` — Supabase Postgres as the **data** store. Optional, see below.

**Recommended for V4 deploys:** `USE_SUPABASE=true` + `USE_SUPABASE_DB=false` (Supabase auth, SQLite data on Railway volume).

**Why:** the Postgres adapter (`lib/db_postgres.ts`) returns Promises but ~110 caller sites in `lib/*` and `app/api/*` use the synchronous better-sqlite3 API. Migrating them is tracked as Phase F. Until then, run with `USE_SUPABASE_DB=false`.

**Railway volume for SQLite persistence:** add a 1 GB volume mounted at `/app/data` and set `DATABASE_URL=file:/app/data/dev.db`. Without a volume, the SQLite file is wiped on every deploy.

### Healthcheck

Railway will poll `GET /api/bounties` every 30 s after deploy. A `200 OK` response marks the service healthy.
If the app crashes, Railway restarts it automatically (`ON_FAILURE` policy, up to 3 retries).

---

## Section 2: Docker (Render, Fly.io, self-host)

A `Dockerfile` is included for non-Railway container hosts. Multi-stage build: builder stage installs all deps and compiles, runner stage contains only the artifacts.

```bash
# Build
docker build -t lightning-bounties .

# Run (supply all env vars)
docker run -p 3000:3000 \
  -e USE_SUPABASE=true \
  -e NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  -e SUPABASE_DB_PASSWORD=... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  lightning-bounties
```

App is available at `http://localhost:3000`.

### Fly.io

```bash
fly launch --dockerfile Dockerfile --name lightning-bounties
fly secrets set USE_SUPABASE=true ANTHROPIC_API_KEY=sk-ant-... ...
fly deploy
```

### Render

1. New Web Service → connect GitHub repo
2. Build Command: `docker build -t app . && docker run ...` (or use Render's Dockerfile detection)
3. Set environment variables in the Render dashboard
4. Deploy

---

## Section 3: Environment Variables Checklist

| Variable | Required | Description |
|---|---|---|
| `USE_SUPABASE` | Yes (prod) | `true` enables Supabase auth (magic link, middleware); `false` for unauth dev |
| `USE_SUPABASE_DB` | No | `true` routes data to Supabase Postgres (Phase F); leave unset to use SQLite |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (prod) | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (prod) | Public anon key from Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (prod) | Service role key (bypasses RLS for server-side ops) |
| `SUPABASE_DB_PASSWORD` | Yes (prod) | Database password (used by `lib/db_postgres.ts` for direct pg connection) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for auditor + scan agent |
| `GITHUB_TOKEN` | Recommended | PAT with `repo` scope for auto-PR and revert commands |
| `BOUNTY_URL` | Recommended | Public URL of your deployment (used in auto-PR body) |
| `DATABASE_URL` | Local dev only | `file:./dev.db` path for SQLite mode |

---

## Section 4: Post-deploy configuration

### Supabase: run the migration

If the tables don't exist yet in Supabase (first deploy only):

```bash
node scripts/migrate_supabase.mjs
```

This applies `supabase/migrations/0001_initial.sql` which creates all 8 tables + RLS policies.

### GitHub OAuth

In the Supabase dashboard → Authentication → Providers → GitHub:

1. Enable GitHub provider
2. Enter your GitHub OAuth App credentials (Client ID + Secret)
3. Set the callback URL to: `https://<your-deployment-url>/auth/callback`

Create a GitHub OAuth App at `https://github.com/settings/developers`:
- Homepage URL: `https://<your-deployment-url>`
- Authorization callback URL: `https://<your-deployment-url>/auth/callback`

### Email (magic links)

Supabase provides built-in email via its own SMTP for the free tier (limited to 4 emails/hour).
For production volume, configure a custom SMTP in Supabase → Authentication → Email:

```
SMTP Host: smtp.resend.com   (or SendGrid, Postmark, etc.)
SMTP Port: 587
SMTP User: resend
SMTP Pass: <your resend API key>
Sender: bounties@yourdomain.com
```

---

## Section 5: Persistent storage notes

When `USE_SUPABASE=true`:
- All marketplace data lives in Supabase Postgres (8 tables + RLS)
- Railway's ephemeral disk does NOT matter — no `dev.db` is created
- Supabase's free tier includes 500 MB Postgres + 1 GB storage
- The DB password changes when you rotate it in Supabase — update `SUPABASE_DB_PASSWORD` on Railway

When `USE_SUPABASE=false` (local dev):
- `lib/db_sqlite.ts` creates `./dev.db` on first boot
- Schema auto-migrates via `lib/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`)
- If you add new columns to `lib/schema.sql`, run `ALTER TABLE` manually on existing `dev.db` (see `docs/LESSONS_LEARNED.md` for the pattern)

---

## Section 6: Local dev quick start

```bash
npm install
cp .env.example .env        # fill in ANTHROPIC_API_KEY at minimum

npm run dev                 # starts Next.js on http://localhost:3000
                            # USE_SUPABASE defaults to false → uses SQLite

# In a second terminal (optional — runs AI bidder agents):
cd agents && bash run_all.sh
```

No database setup needed — `dev.db` is created automatically on first request.
