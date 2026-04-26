// Shared types — the contract between db, API, UI, agents, and MCP server.

export type Language = "typescript" | "python";

// 3-tier task taxonomy
export type TaskType = "snippet" | "codebase" | "bug_bounty";

// Bid submission shape varies by task type
export type BidType = "code" | "diff" | "proof";

// Task payload for codebase tasks (Path A): bidder receives extracted context, submits unified diff
export interface CodebasePayload {
  codebase_id: string;          // reference to demo-codebases/<id> (e.g. "todo-app")
  context_files: Array<{        // pre-extracted relevant files (snapshot)
    path: string;
    content: string;
  }>;
  test_command: string;         // e.g. "npm test" — runs in sandbox after diff applied
  task_description: string;     // human-readable goal
}

// Task payload for bug bounty tasks (Path C): bidder receives buggy code, submits a fix (also a diff)
export interface BugBountyPayload {
  target_code: string;          // the buggy module (TS or Py source)
  language: Language;
  symptom: string;              // human-readable bug description ("returns wrong order on DST inputs")
  failing_input_example?: string; // optional hint
  hidden_test_suite: string;    // tests that the FIX must pass (incl. regression test for the bug)
}

// Ensemble bid metadata: bidder ran multiple models, picked best
export interface EnsembleMetadata {
  candidates: Array<{
    model: string;              // e.g. "claude-haiku-4-5"
    passed_internal_tests: boolean;
    runtime_ms: number;
    chosen: boolean;
  }>;
  selection_reason: string;     // "passed all internal tests" | "best diff size" | etc.
}

// V2: GitHub repo connection (one row per connected repo)
export interface RepoConnection {
  id: string;
  owner: string;            // e.g. "boaharis"
  repo: string;             // e.g. "lightning-bounty-demo"
  github_username: string;  // who connected it (= owner of the auth token)
  default_branch: string;   // e.g. "main"
  description: string | null;
  connected_at: string;
}

// V3: Auditor scoring weights — quality-only. Price is NOT a scoring criterion;
// tiebreaker is now submission time (earliest wins) among bids within 0.02 of top score.
export interface AuditorWeights {
  code_quality: number;         // readability, naming, idioms (default 0.9)
  completeness: number;         // solves whole issue, handles edge cases (default 0.9)
  convention_match: number;     // matches existing codebase style (default 0.8)
  test_appropriateness: number; // 1.0 if existing tests cover OR new tests added for new behavior;
                                 // 0.5 if unclear; 0.0 only if existing tests broke or obvious gaps ignored.
                                 // DO NOT penalize bids that don't add new tests when existing tests already cover. (default 0.7)
  maintainability: number;      // no over-engineering, no clever tricks (default 0.7)
  no_new_deps: number;          // penalty for new package.json deps (default 0.6)
  security: number;             // no eval/exec/network/file-write smells (default 1.0)
  // REMOVED: diff_size, price, bidder_track_record, test_coverage (quality-only per user feedback)
}

export interface AuditorConfig {
  model: "claude-opus-4-7" | "claude-sonnet-4-6";
  weights: AuditorWeights;
  threshold: number;            // top-bid score below this => re-open bidding (default 0.5)
  max_extensions: number;       // cap on re-opens before fallback-pick (default 2)
  prompt_addendum?: string;     // optional custom criteria from poster
}

// V2: Auditor decision output (stored on bounty after audit runs)
export interface AuditorBidScore {
  bid_id: string;
  bidder_pubkey: string;
  total_score: number;          // 0-1 weighted average
  per_criterion: Record<keyof AuditorWeights, number>;  // raw 0-1 scores per dimension
  reasoning: string;            // 1-paragraph LLM justification
  chosen: boolean;
}

export interface AuditorResult {
  audited_at: string;           // ISO timestamp
  model_used: string;
  ranked: AuditorBidScore[];    // sorted by total_score desc
  winner_bid_id: string | null; // null if no winner picked (re-open or fail)
  decision: "PICK_WINNER" | "REOPEN_BIDDING" | "FALLBACK_PICK";
  confidence: number;           // top score, for quick UI display
  notes: string;                // overall summary (e.g. "Top 2 candidates were close...")
}

export type BountyStatus =
  | "AWAITING_STAKE_PAYMENT"
  | "OPEN"
  | "SETTLED"
  | "EXPIRED"
  | "CANCELED"
  | "REVERTED";

export type BidStatus =
  | "AWAITING_STAKE"
  | "PENDING"
  | "PASS"
  | "FAIL"
  | "WON"
  | "LOST"
  | "REFUNDED";

export type TestStatus = "PENDING" | "PASS" | "FAIL";

export interface PreviewMetadata {
  lines: number;
  imports: string[];
  runtime_ms: number | null;
  mem_mb: number | null;
}

export interface Bounty {
  id: string;
  poster_pubkey: string;
  title: string;
  description: string;
  language: Language;
  task_type: TaskType;
  task_payload: string | null;  // JSON string of CodebasePayload | BugBountyPayload | null (snippet)
  starter_code: string | null;
  test_suite: string;
  test_suite_hash: string;
  max_bounty_sats: number;
  bid_stake_sats: number;
  posting_fee_sats: number;
  poster_stake_invoice: string;
  poster_stake_payment_hash: string;
  deadline_at: string;
  status: BountyStatus;
  winning_bid_id: string | null;
  created_at: string;
  // V2: GitHub-driven bounty fields (null for free-form bounties posted via /post UI)
  github_repo: string | null;            // "owner/repo"
  github_issue_number: number | null;
  github_commit_sha: string | null;      // repo state at posting time
  github_pr_url: string | null;          // populated after auditor decision + auto-PR
  // V2: Auditor (only set when github_repo is non-null)
  auditor_config: string | null;         // JSON of AuditorConfig, locked at posting
  auditor_result: string | null;         // JSON of AuditorResult, written after audit
  extension_count: number;               // 0..max_extensions; tracks re-open rounds
  merged_at: string | null;             // V2.5: ISO timestamp when auto-PR was merged
  // V3: Revert fields (populated after gh-revert)
  reverted_at: string | null;
  revert_pr_url: string | null;
}

export interface BountyListItem {
  id: string;
  title: string;
  description: string;
  language: Language;
  task_type: TaskType;
  max_bounty_sats: number;
  deadline_at: string;
  status: BountyStatus;
  bid_count: number;
  passing_bid_count: number;
  created_at: string;
  github_repo: string | null;            // V2
  github_issue_number: number | null;    // V2
}

export interface Bid {
  id: string;
  bounty_id: string;
  bidder_pubkey: string;
  bid_type: BidType;
  code_hash: string;
  code: string | null;
  ensemble_metadata: EnsembleMetadata | null;
  asked_price_sats: number;
  stake_invoice: string;
  stake_payment_hash: string;
  preview_metadata: PreviewMetadata;
  test_status: TestStatus;
  test_output: string | null;
  status: BidStatus;
  payment_hash: string | null;
  submitted_at: string;
}

// Public bid (no `code` field — that's hash-locked until accept).
export interface PublicBid {
  id: string;
  bounty_id: string;
  bidder_pubkey: string;
  bid_type: BidType;
  code_hash: string;
  ensemble_metadata: EnsembleMetadata | null;  // public — shows multi-model exploration
  asked_price_sats: number;
  preview_metadata: PreviewMetadata;
  test_status: TestStatus;
  test_output: string | null;
  status: BidStatus;
  submitted_at: string;
}

export interface BountyDetail extends BountyListItem {
  starter_code: string | null;
  test_suite: string;
  test_suite_hash: string;
  task_payload: string | null;  // raw JSON; UI parses based on task_type
  bid_stake_sats: number;
  posting_fee_sats: number;
  poster_pubkey: string;
  bids: PublicBid[];
  winning_bid_id: string | null;
  // V2 GitHub + auditor fields
  github_repo: string | null;
  github_issue_number: number | null;
  github_commit_sha: string | null;
  github_pr_url: string | null;
  auditor_config: AuditorConfig | null;     // parsed JSON
  auditor_result: AuditorResult | null;     // parsed JSON
  extension_count: number;
  merged_at: string | null;               // V2.5: ISO timestamp when auto-PR was merged
  // V3: Revert fields
  reverted_at: string | null;
  revert_pr_url: string | null;
}

// --- Lightning ---

export interface HoldInvoice {
  paymentRequest: string;   // BOLT11
  paymentHash: string;
  amountSats: number;
  description: string;
  status: "CREATED" | "ACCEPTED" | "SETTLED" | "CANCELED";
  createdAt: string;
}

export interface LightningClient {
  // Create a hold-invoice. payerPubkey identifies whose balance gets locked
  // when the invoice transitions to ACCEPTED (auto in stub/ledger mode after 2s).
  createHoldInvoice(
    amountSats: number,
    description: string,
    payerPubkey?: string
  ): Promise<HoldInvoice>;
  getInvoice(paymentHash: string): Promise<HoldInvoice | null>;
  // Settle the invoice. recipientPubkey + settleAmountSats let us send a partial
  // amount to the recipient and refund the rest to payer (used in acceptBid where
  // poster_stake = max_bounty but actual payout = winning_bid_price).
  // If recipientPubkey is omitted, treats it as a "burn" (sat goes to platform).
  // If settleAmountSats is omitted, settles the full amount.
  settleHoldInvoice(
    paymentHash: string,
    recipientPubkey?: string,
    settleAmountSats?: number
  ): Promise<void>;
  // Cancel: full refund to payer.
  cancelHoldInvoice(paymentHash: string): Promise<void>;
  // V2.5: ledger inspection helpers (used by /wallets UI + tests)
  getBalance?(pubkey: string): Promise<{ available_sats: number; locked_sats: number }>;
  ensureWallet?(pubkey: string, label?: string, seedSats?: number): Promise<void>;
}

// V2.5: Wallet & transaction types (for /wallets UI)
export interface Wallet {
  pubkey: string;
  balance_sats: number;        // available
  locked_sats: number;          // in-flight in open invoices
  label: string | null;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  pubkey: string;
  amount_sats: number;          // positive = credit, negative = debit
  type: "SEED" | "HOLD" | "SETTLE" | "CANCEL" | "BURN";
  reason: string | null;
  related_invoice_hash: string | null;
  related_bounty_id: string | null;
  related_bid_id: string | null;
  created_at: string;
}

// --- Sandbox ---

export interface TestRunResult {
  status: "PASS" | "FAIL";
  output: string;
  metrics: {
    runtime_ms: number;
    mem_mb: number | null;
  };
}

// Task-type-aware sandbox runs
export type SandboxRunRequest =
  | {
      kind: "snippet";
      language: Language;
      code: string;
      test_suite: string;
    }
  | {
      kind: "codebase";
      language: Language;
      diff: string;                     // unified diff to apply
      payload: CodebasePayload;         // codebase context + test command
    }
  | {
      kind: "bug_bounty";
      language: Language;
      diff: string;                     // bidder's fix as a unified diff
      payload: BugBountyPayload;        // target_code + hidden_test_suite
    };

export interface SandboxClient {
  // Legacy snippet path (for backward compat with existing snippet bounties)
  runTests(
    language: Language,
    code: string,
    testSuite: string
  ): Promise<TestRunResult>;

  // New unified entry point — switches on request.kind
  run(request: SandboxRunRequest): Promise<TestRunResult>;
}

// --- API request/response shapes ---

export interface PostBountyRequest {
  poster_pubkey: string;
  title: string;
  description: string;
  language: Language;
  task_type?: TaskType;             // defaults to 'snippet' if omitted (backward compat)
  task_payload?: CodebasePayload | BugBountyPayload | null;
  starter_code?: string;
  test_suite: string;               // for snippet: jest/pytest tests; for codebase/bug_bounty: marker (real tests live in payload)
  max_bounty_sats: number;
  deadline_minutes?: number;
  // V2: GitHub-driven bounty (when set, auditor becomes sole decider — no manual buyer accept)
  github_repo?: string;             // "owner/repo"
  github_issue_number?: number;
  github_commit_sha?: string;
  auditor_config?: AuditorConfig;   // required when github_repo is set
}

export interface PostBountyResponse {
  bounty_id: string;
  test_suite_hash: string;
  poster_stake_invoice: string;
  poster_stake_payment_hash: string;
  deadline_at: string;
  status: BountyStatus;
}

export interface SubmitBidRequest {
  bidder_pubkey: string;
  bid_type?: BidType;               // defaults to 'code' (backward compat for snippets)
  code: string;                     // raw code | unified diff | proof JSON depending on bid_type
  ensemble_metadata?: EnsembleMetadata;
  /** @deprecated V3: bidder always takes the FULL bounty_sats if they win (winner-takes-all).
   *  This field is accepted for backward compat but ignored — the server always stores
   *  asked_price_sats = bounty.max_bounty_sats internally so downstream settlement code works. */
  asked_price_sats?: number;
}

export interface SubmitBidResponse {
  bid_id: string;
  stake_invoice: string;
  stake_payment_hash: string;
  code_hash: string;
  status: BidStatus;
}

export interface AcceptBidRequest {
  bid_id: string;
  poster_pubkey: string;
}

export interface AcceptBidResponse {
  bid_id: string;
  code: string;
  payment_hash: string;
  settled_amount_sats: number;
  refunded_to_poster_sats: number;
}

export interface PublicStats {
  pubkey: string;
  total_bids: number;
  wins: number;
  passes: number;
  win_rate: number;
  pass_rate: number;
  avg_won_price_sats: number | null;
  unique_bounties: number;
}
