// POST /api/bounty — create a new bounty, issue poster stake hold-invoice
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { getLightningClient } from "@/lib/lightning";
import { sha256 } from "@/lib/hash";
import { ensureJobsRunning } from "@/lib/jobs";
import type {
  PostBountyRequest,
  PostBountyResponse,
  TaskType,
  CodebasePayload,
  BugBountyPayload,
} from "@/lib/types";

const VALID_TASK_TYPES: TaskType[] = ["snippet", "codebase", "bug_bounty"];

// Basic shape check — not deep validation, just enough to catch obvious errors.
function validatePayload(
  taskType: TaskType,
  payload: unknown
): string | null {
  if (taskType === "snippet") return null; // no payload needed

  if (!payload || typeof payload !== "object") {
    return `task_payload is required for task_type '${taskType}'`;
  }

  if (taskType === "codebase") {
    const p = payload as Partial<CodebasePayload>;
    if (!p.codebase_id) return "task_payload.codebase_id is required";
    if (!Array.isArray(p.context_files)) return "task_payload.context_files must be an array";
    if (!p.test_command) return "task_payload.test_command is required";
    if (!p.task_description) return "task_payload.task_description is required";
    return null;
  }

  if (taskType === "bug_bounty") {
    const p = payload as Partial<BugBountyPayload>;
    if (!p.target_code) return "task_payload.target_code is required";
    if (!p.language) return "task_payload.language is required";
    if (!p.symptom) return "task_payload.symptom is required";
    if (!p.hidden_test_suite) return "task_payload.hidden_test_suite is required";
    return null;
  }

  return null;
}

export async function POST(req: NextRequest) {
  ensureJobsRunning();

  let body: PostBountyRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Input validation
  if (!body.poster_pubkey?.trim()) {
    return NextResponse.json(
      { success: false, error: "poster_pubkey is required" },
      { status: 400 }
    );
  }
  if (!body.title?.trim()) {
    return NextResponse.json(
      { success: false, error: "title is required" },
      { status: 400 }
    );
  }
  if (!body.description?.trim()) {
    return NextResponse.json(
      { success: false, error: "description is required" },
      { status: 400 }
    );
  }
  if (!["typescript", "python"].includes(body.language)) {
    return NextResponse.json(
      { success: false, error: "language must be 'typescript' or 'python'" },
      { status: 400 }
    );
  }

  const taskType: TaskType = body.task_type ?? "snippet";
  if (!VALID_TASK_TYPES.includes(taskType)) {
    return NextResponse.json(
      { success: false, error: `task_type must be one of: ${VALID_TASK_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const payloadValidationError = validatePayload(taskType, body.task_payload ?? null);
  if (payloadValidationError) {
    return NextResponse.json(
      { success: false, error: payloadValidationError },
      { status: 400 }
    );
  }

  if (!body.test_suite?.trim()) {
    return NextResponse.json(
      { success: false, error: "test_suite is required" },
      { status: 400 }
    );
  }
  if (!body.max_bounty_sats || body.max_bounty_sats <= 0) {
    return NextResponse.json(
      { success: false, error: "max_bounty_sats must be a positive integer" },
      { status: 400 }
    );
  }

  const deadlineMinutes = body.deadline_minutes ?? 5;
  if (deadlineMinutes <= 0 || deadlineMinutes > 1440) {
    return NextResponse.json(
      { success: false, error: "deadline_minutes must be 1–1440" },
      { status: 400 }
    );
  }

  const bountyId = `bnty_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const testSuiteHash = sha256(body.test_suite);
  const deadlineAt = new Date(
    Date.now() + deadlineMinutes * 60 * 1000
  ).toISOString();

  let posterStakeInvoice;
  try {
    const lightning = getLightningClient();
    posterStakeInvoice = await lightning.createHoldInvoice(
      body.max_bounty_sats,
      `Bounty stake: ${body.title}`,
      body.poster_pubkey
    );
  } catch (err) {
    console.error("[POST /api/bounty] lightning error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create stake invoice" },
      { status: 500 }
    );
  }

  const taskPayloadJson =
    body.task_payload != null ? JSON.stringify(body.task_payload) : null;

  // V2: GitHub fields (optional — null for free-form bounties)
  const githubRepo = body.github_repo ?? null;
  const githubIssueNumber = body.github_issue_number ?? null;
  const githubCommitSha = body.github_commit_sha ?? null;
  const auditorConfigJson = body.auditor_config
    ? JSON.stringify(body.auditor_config)
    : null;

  // If github_repo is set, auditor_config is required
  if (githubRepo && !auditorConfigJson) {
    return NextResponse.json(
      { success: false, error: "auditor_config is required when github_repo is set" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO bounties
        (id, poster_pubkey, title, description, language, task_type, task_payload,
         starter_code, test_suite, test_suite_hash, max_bounty_sats, bid_stake_sats,
         posting_fee_sats, poster_stake_invoice, poster_stake_payment_hash,
         deadline_at, status,
         github_repo, github_issue_number, github_commit_sha, auditor_config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bountyId,
      body.poster_pubkey,
      body.title,
      body.description,
      body.language,
      taskType,
      taskPayloadJson,
      body.starter_code ?? null,
      body.test_suite,
      testSuiteHash,
      body.max_bounty_sats,
      100, // bid_stake_sats
      1000, // posting_fee_sats
      posterStakeInvoice.paymentRequest,
      posterStakeInvoice.paymentHash,
      deadlineAt,
      "AWAITING_STAKE_PAYMENT",
      githubRepo,
      githubIssueNumber,
      githubCommitSha,
      auditorConfigJson
    );
  } catch (err) {
    console.error("[POST /api/bounty] db error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save bounty" },
      { status: 500 }
    );
  }

  const response: PostBountyResponse = {
    bounty_id: bountyId,
    test_suite_hash: testSuiteHash,
    poster_stake_invoice: posterStakeInvoice.paymentRequest,
    poster_stake_payment_hash: posterStakeInvoice.paymentHash,
    deadline_at: deadlineAt,
    status: "AWAITING_STAKE_PAYMENT",
  };

  return NextResponse.json(response, { status: 201 });
}
