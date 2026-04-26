// POST /api/bounty/:id/audit — manually trigger the auditor (for testing)
// GET  /api/bounty/:id/audit — return current auditor_result if it exists
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runAuditor } from "@/lib/auditor";
import { acceptBid, ensureJobsRunning } from "@/lib/jobs";
import type { AuditorResult } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bounty ID required" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    const row = db
      .prepare("SELECT auditor_result FROM bounties WHERE id = ?")
      .get(id) as { auditor_result: string | null } | undefined;

    if (!row) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }

    if (!row.auditor_result) {
      return NextResponse.json(
        { success: true, data: null, message: "Audit not yet run" },
        { status: 200 }
      );
    }

    const result: AuditorResult = JSON.parse(row.auditor_result);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(`[GET /api/bounty/${id}/audit] error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch audit result" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  ensureJobsRunning();

  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, error: "Bounty ID required" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    // Validate the bounty exists and is GitHub-driven
    const bounty = db
      .prepare(
        `SELECT id, status, github_repo, auditor_result, auditor_config,
                extension_count, created_at, deadline_at
         FROM bounties WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          status: string;
          github_repo: string | null;
          auditor_result: string | null;
          auditor_config: string | null;
          extension_count: number;
          created_at: string;
          deadline_at: string;
        }
      | undefined;

    if (!bounty) {
      return NextResponse.json(
        { success: false, error: "Bounty not found" },
        { status: 404 }
      );
    }

    if (!bounty.github_repo) {
      return NextResponse.json(
        {
          success: false,
          error: "This bounty is not GitHub-driven. Auditor only applies to codebase bounties with a github_repo.",
        },
        { status: 400 }
      );
    }

    if (bounty.status !== "OPEN") {
      return NextResponse.json(
        { success: false, error: `Bounty is not OPEN (status=${bounty.status})` },
        { status: 400 }
      );
    }

    // Run the auditor
    const result = await runAuditor(id);

    // Persist auditor_result
    db.prepare("UPDATE bounties SET auditor_result = ? WHERE id = ?").run(
      JSON.stringify(result),
      id
    );
    console.log(`[POST /api/bounty/${id}/audit] result persisted, decision=${result.decision}`);

    // Act on the decision
    if (result.decision === "PICK_WINNER" || result.decision === "FALLBACK_PICK") {
      if (result.winner_bid_id) {
        try {
          await acceptBid(id, result.winner_bid_id);
          console.log(
            `[POST /api/bounty/${id}/audit] acceptBid called for bid ${result.winner_bid_id}`
          );
        } catch (err) {
          console.error(
            `[POST /api/bounty/${id}/audit] acceptBid failed:`,
            err
          );
          // Return the result anyway — partial success (audit ran, settle failed)
          return NextResponse.json(
            {
              success: false,
              error: `Audit ran but acceptBid failed: ${err instanceof Error ? err.message : String(err)}`,
              data: result,
            },
            { status: 500 }
          );
        }
      }
    } else if (result.decision === "REOPEN_BIDDING") {
      // Extend deadline by original deadline_minutes
      const createdMs = new Date(bounty.created_at).getTime();
      const deadlineMs = new Date(bounty.deadline_at).getTime();
      const originalMinutes = Math.round((deadlineMs - createdMs) / 60000);
      const extensionMs = originalMinutes * 60 * 1000;
      const newDeadline = new Date(deadlineMs + extensionMs).toISOString();

      db.prepare(
        "UPDATE bounties SET deadline_at = ?, extension_count = extension_count + 1 WHERE id = ?"
      ).run(newDeadline, id);

      console.log(
        `[POST /api/bounty/${id}/audit] REOPEN_BIDDING: deadline extended to ${newDeadline} (extension ${bounty.extension_count + 1})`
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(`[POST /api/bounty/${id}/audit] error:`, err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Auditor failed",
      },
      { status: 500 }
    );
  }
}
