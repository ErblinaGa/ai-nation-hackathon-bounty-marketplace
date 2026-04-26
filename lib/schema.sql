-- Bounties = Poster postings (3 task types: snippet, codebase, bug_bounty)
CREATE TABLE IF NOT EXISTS bounties (
  id TEXT PRIMARY KEY,
  poster_pubkey TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  language TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'snippet',  -- 'snippet' | 'codebase' | 'bug_bounty'
  task_payload TEXT,                           -- JSON: CodebasePayload | BugBountyPayload | null
  starter_code TEXT,
  test_suite TEXT NOT NULL,
  test_suite_hash TEXT NOT NULL,
  max_bounty_sats INTEGER NOT NULL,
  bid_stake_sats INTEGER NOT NULL DEFAULT 100,
  posting_fee_sats INTEGER NOT NULL DEFAULT 1000,
  poster_stake_invoice TEXT NOT NULL,
  poster_stake_payment_hash TEXT NOT NULL,
  deadline_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'AWAITING_STAKE_PAYMENT',
  winning_bid_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- V2: GitHub-driven bounty fields (NULL for free-form bounties)
  github_repo TEXT,                            -- 'owner/repo'
  github_issue_number INTEGER,
  github_commit_sha TEXT,                      -- repo state at posting
  github_pr_url TEXT,                          -- populated after auditor + auto-PR
  -- V2: Auditor (only set when github_repo IS NOT NULL)
  auditor_config TEXT,                         -- JSON, locked at posting time
  auditor_result TEXT,                         -- JSON, written after auditor decision
  extension_count INTEGER NOT NULL DEFAULT 0,  -- 0..max_extensions for re-open rounds
  merged_at TIMESTAMP,                         -- V2.5: when the auto-PR was merged
  reverted_at TIMESTAMP,                       -- V3: when revert PR was opened
  revert_pr_url TEXT                           -- V3: URL of the revert PR
);

-- V2: GitHub repos connected to this marketplace
CREATE TABLE IF NOT EXISTS repo_connections (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  github_username TEXT NOT NULL,               -- who connected (= owner of the gh auth token)
  default_branch TEXT NOT NULL DEFAULT 'main',
  description TEXT,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner, repo)
);

-- V2.5: Virtual ledger — DB-backed sat balances (replaces in-memory stub Lightning).
-- One row per pubkey. Balances are denormalized for fast read; wallet_transactions is the immutable audit log.
CREATE TABLE IF NOT EXISTS wallets (
  pubkey TEXT PRIMARY KEY,
  balance_sats INTEGER NOT NULL DEFAULT 0,        -- available (non-locked) balance
  locked_sats INTEGER NOT NULL DEFAULT 0,         -- currently held in open invoices
  label TEXT,                                      -- e.g. "operator", "FastBidder", "platform"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- V2.5: Wallet transaction log — every credit/debit, immutable, queryable for /wallets UI
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL,
  amount_sats INTEGER NOT NULL,                    -- positive = credit, negative = debit
  type TEXT NOT NULL,                              -- 'SEED' | 'HOLD' | 'SETTLE' | 'CANCEL' | 'BURN'
  reason TEXT,                                     -- human-readable ("bid stake bid_xyz", "winner payout for bnty_abc")
  related_invoice_hash TEXT,                       -- links to the invoice that caused this tx (if any)
  related_bounty_id TEXT,                          -- optional bounty link
  related_bid_id TEXT,                             -- optional bid link
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_pubkey ON wallet_transactions(pubkey, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_invoice ON wallet_transactions(related_invoice_hash);

-- V2.5: Hold invoices (replaces in-memory globalThis store)
-- Every hold invoice has a payer (whose balance was locked) and a recipient (who gets it on settle).
CREATE TABLE IF NOT EXISTS hold_invoices (
  payment_hash TEXT PRIMARY KEY,
  payment_request TEXT NOT NULL,                   -- BOLT11-like string (lnbcledger_<hash> for stub mode)
  amount_sats INTEGER NOT NULL,
  description TEXT,
  payer_pubkey TEXT NOT NULL,                      -- who's paying (balance locked from here on ACCEPTED)
  status TEXT NOT NULL DEFAULT 'CREATED',          -- 'CREATED' | 'ACCEPTED' | 'SETTLED' | 'CANCELED'
  settled_amount_sats INTEGER,                     -- on SETTLED: how much went to recipient (rest refunded to payer)
  recipient_pubkey TEXT,                           -- on SETTLED: who got the money
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  settled_at TIMESTAMP
);

-- Bids = Agent submissions (3 bid types: code, diff, proof)
CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  bounty_id TEXT NOT NULL REFERENCES bounties(id),
  bidder_pubkey TEXT NOT NULL,
  bid_type TEXT NOT NULL DEFAULT 'code',       -- 'code' | 'diff' | 'proof'
  code_hash TEXT NOT NULL,
  code TEXT,                                   -- raw code (snippet) | unified diff (codebase) | proof JSON (bug_bounty)
  ensemble_metadata TEXT,                      -- JSON: optional record of multi-model exploration {candidates: [{model, passed_internal_tests, ...}], chosen}
  asked_price_sats INTEGER NOT NULL,
  stake_invoice TEXT NOT NULL,
  stake_payment_hash TEXT NOT NULL,
  preview_metadata TEXT NOT NULL,
  test_status TEXT NOT NULL DEFAULT 'PENDING',
  test_output TEXT,
  status TEXT NOT NULL DEFAULT 'AWAITING_STAKE',
  payment_hash TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- V3: Scan candidates — AI-drafted improvement issues from codebase scans
CREATE TABLE IF NOT EXISTS scan_candidates (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL,
  files_affected TEXT,
  estimated_loc INTEGER,
  suggested_sats INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING',
  bounty_id TEXT,
  issue_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  applied_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scan_candidates_scan_id ON scan_candidates(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_candidates_repo ON scan_candidates(repo, created_at DESC);

-- Public Settlement Statistics view
CREATE VIEW IF NOT EXISTS public_stats AS
SELECT
  pubkey,
  COUNT(*) as total_bids,
  SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN test_status = 'PASS' THEN 1 ELSE 0 END) as passes,
  AVG(CASE WHEN status = 'WON' THEN asked_price_sats END) as avg_won_price_sats,
  COUNT(DISTINCT bounty_id) as unique_bounties_bid
FROM (
  SELECT bidder_pubkey as pubkey, status, test_status, asked_price_sats, bounty_id
  FROM bids
)
GROUP BY pubkey;
