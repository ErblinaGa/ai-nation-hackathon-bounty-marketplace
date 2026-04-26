-- Lightning Bounty Marketplace — Postgres schema (Supabase)
-- Mirrors lib/schema.sql but adapted for Postgres + Supabase auth.
-- Auth users live in Supabase's `auth.users`. Our `public.users` extends it 1:1.

-- ============================================================================
-- USERS — extends Supabase auth.users with marketplace fields
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  github_username TEXT,
  github_token_encrypted TEXT,           -- per-user OAuth token (encrypted at rest)
  display_name TEXT,
  lightning_pubkey TEXT UNIQUE,          -- their wallet pubkey
  api_key TEXT UNIQUE,                   -- for CLI / agent auth (one-shot regenerable)
  roles TEXT[] DEFAULT ARRAY['poster','bidder']::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_github_username ON public.users(github_username);
CREATE INDEX IF NOT EXISTS idx_users_lightning_pubkey ON public.users(lightning_pubkey);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON public.users(api_key);

-- ============================================================================
-- REPO CONNECTIONS — many-to-one user→repos
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.repo_connections (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  github_username TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  description TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, owner, repo)
);

CREATE INDEX IF NOT EXISTS idx_repo_connections_user ON public.repo_connections(user_id);

-- ============================================================================
-- BOUNTIES — main marketplace table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bounties (
  id TEXT PRIMARY KEY,
  poster_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  poster_pubkey TEXT NOT NULL,           -- denormalized for quick lookup
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  language TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'snippet',  -- 'snippet' | 'codebase' | 'bug_bounty' | 'free_form'
  task_payload JSONB,                          -- typed by task_type
  evaluation_mode TEXT NOT NULL DEFAULT 'strict_tests',  -- 'strict_tests' | 'auditor_review_only'
  starter_code TEXT,
  test_suite TEXT NOT NULL,
  test_suite_hash TEXT NOT NULL,
  max_bounty_sats INTEGER NOT NULL,
  bid_stake_sats INTEGER NOT NULL DEFAULT 100,
  posting_fee_sats INTEGER NOT NULL DEFAULT 1000,
  poster_stake_invoice TEXT NOT NULL,
  poster_stake_payment_hash TEXT NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'AWAITING_STAKE_PAYMENT',
  winning_bid_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- GitHub integration
  github_repo TEXT,                            -- 'owner/repo'
  github_issue_number INTEGER,
  github_commit_sha TEXT,
  github_pr_url TEXT,
  -- Auditor (only set when github_repo IS NOT NULL or evaluation_mode = 'auditor_review_only')
  auditor_config JSONB,
  auditor_result JSONB,
  extension_count INTEGER NOT NULL DEFAULT 0,
  merged_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  revert_pr_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_bounties_status ON public.bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_poster ON public.bounties(poster_user_id);
CREATE INDEX IF NOT EXISTS idx_bounties_github_repo ON public.bounties(github_repo);
CREATE INDEX IF NOT EXISTS idx_bounties_deadline ON public.bounties(deadline_at) WHERE status = 'OPEN';

-- ============================================================================
-- BIDS — agent submissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bids (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES public.bounties(id) ON DELETE CASCADE,
  bidder_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- nullable for anonymous CLI agents
  bidder_pubkey TEXT NOT NULL,           -- always present (denormalized)
  bid_type TEXT NOT NULL DEFAULT 'code',
  code_hash TEXT NOT NULL,
  code TEXT,
  ensemble_metadata JSONB,
  asked_price_sats INTEGER NOT NULL,
  stake_invoice TEXT NOT NULL,
  stake_payment_hash TEXT NOT NULL,
  preview_metadata JSONB NOT NULL,
  test_status TEXT NOT NULL DEFAULT 'PENDING',
  test_output TEXT,
  status TEXT NOT NULL DEFAULT 'AWAITING_STAKE',
  payment_hash TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bids_bounty ON public.bids(bounty_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder ON public.bids(bidder_pubkey);
CREATE INDEX IF NOT EXISTS idx_bids_status ON public.bids(status);

-- ============================================================================
-- VIRTUAL LEDGER — sat balances + transactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  pubkey TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- nullable for system pubkeys (platform)
  balance_sats INTEGER NOT NULL DEFAULT 0,
  locked_sats INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  amount_sats INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  related_invoice_hash TEXT,
  related_bounty_id TEXT,
  related_bid_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_pubkey ON public.wallet_transactions(pubkey, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_invoice ON public.wallet_transactions(related_invoice_hash);

-- ============================================================================
-- HOLD INVOICES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hold_invoices (
  payment_hash TEXT PRIMARY KEY,
  payment_request TEXT NOT NULL,
  amount_sats INTEGER NOT NULL,
  description TEXT,
  payer_pubkey TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  settled_amount_sats INTEGER,
  recipient_pubkey TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ
);

-- ============================================================================
-- SCAN CANDIDATES (lb scan agent results)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scan_candidates (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL,
  files_affected JSONB,
  estimated_loc INTEGER,
  suggested_sats INTEGER,
  status TEXT DEFAULT 'PENDING',
  bounty_id TEXT,
  issue_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scan_candidates_scan ON public.scan_candidates(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_candidates_user ON public.scan_candidates(user_id);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repo_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hold_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_candidates ENABLE ROW LEVEL SECURITY;

-- Users see their own profile
CREATE POLICY "users_self" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Repo connections: only owner sees + mutates
CREATE POLICY "repo_connections_owner" ON public.repo_connections
  FOR ALL USING (auth.uid() = user_id);

-- Bounties are PUBLIC (any logged-in user can see — that's how marketplace works)
CREATE POLICY "bounties_public_read" ON public.bounties
  FOR SELECT USING (true);
CREATE POLICY "bounties_owner_write" ON public.bounties
  FOR INSERT WITH CHECK (auth.uid() = poster_user_id);
CREATE POLICY "bounties_owner_update" ON public.bounties
  FOR UPDATE USING (auth.uid() = poster_user_id);

-- Bids public read (without code), bidder writes own
CREATE POLICY "bids_public_read" ON public.bids
  FOR SELECT USING (true);
CREATE POLICY "bids_bidder_insert" ON public.bids
  FOR INSERT WITH CHECK (
    bidder_user_id IS NULL OR auth.uid() = bidder_user_id
  );

-- Wallets: own + platform pubkeys readable to all (transparency)
CREATE POLICY "wallets_own_or_platform" ON public.wallets
  FOR SELECT USING (
    user_id IS NULL OR auth.uid() = user_id
  );

-- Transactions: own only
CREATE POLICY "wallet_tx_own" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.wallets w
      WHERE w.pubkey = wallet_transactions.pubkey
      AND (w.user_id IS NULL OR w.user_id = auth.uid())
    )
  );

-- Hold invoices: payer or recipient
CREATE POLICY "hold_invoices_party" ON public.hold_invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.wallets w
      WHERE (w.pubkey = hold_invoices.payer_pubkey OR w.pubkey = hold_invoices.recipient_pubkey)
      AND (w.user_id IS NULL OR w.user_id = auth.uid())
    )
  );

-- Scan candidates: own only
CREATE POLICY "scan_candidates_own" ON public.scan_candidates
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================
-- Auto-create public.users row on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
