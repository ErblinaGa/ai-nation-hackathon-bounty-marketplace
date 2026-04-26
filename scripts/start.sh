#!/usr/bin/env bash
# Production startup script for Railway (and any container host).
# - Logs the deployed git SHA so deploys are traceable in Railway logs.
# - Confirms USE_SUPABASE mode so operators know which DB backend is active.
# - Does NOT create dev.db when USE_SUPABASE=true (Supabase is the DB).
set -e

echo "[start] Lightning Bounty Marketplace — production boot"
echo "[start] git SHA: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "[start] node: $(node --version)"
echo "[start] USE_SUPABASE=${USE_SUPABASE:-false}"

if [ "${USE_SUPABASE}" = "true" ]; then
  echo "[start] DB mode: Supabase Postgres (no local dev.db)"
  if [ -z "${NEXT_PUBLIC_SUPABASE_URL}" ]; then
    echo "[start] ERROR: NEXT_PUBLIC_SUPABASE_URL is not set — aborting" >&2
    exit 1
  fi
  if [ -z "${SUPABASE_DB_PASSWORD}" ]; then
    echo "[start] ERROR: SUPABASE_DB_PASSWORD is not set — aborting" >&2
    exit 1
  fi
else
  echo "[start] DB mode: SQLite (dev.db in working directory)"
fi

exec npm start
