// POST /api/bounty/:id/force-deadline — DEMO HELPER: set deadline_at to now so the auditor fires immediately
// This is for live demos where you don't want to wait the full bounty window.
// In production this would be removed or gated to admin auth.
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureJobsRunning } from "@/lib/jobs";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  ensureJobsRunning();

  const { id } = params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Bounty ID is required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const bounty = db
      .prepare("SELECT id, status FROM bounties WHERE id = ?")
      .get(id) as { id: string; status: string } | undefined;

    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (bounty.status !== "OPEN") {
      return NextResponse.json(
        { error: `Bounty is not OPEN (status=${bounty.status})` },
        { status: 409 }
      );
    }

    // Set deadline_at to 1 second ago so the next jobs.ts tick (1s loop) catches it
    const newDeadline = new Date(Date.now() - 1000).toISOString();
    db.prepare("UPDATE bounties SET deadline_at = ? WHERE id = ?").run(newDeadline, id);

    return NextResponse.json({
      bounty_id: id,
      new_deadline_at: newDeadline,
      note: "Auditor will run on the next jobs.ts tick (~1s)",
    });
  } catch (err) {
    console.error(`[POST /api/bounty/${id}/force-deadline] error:`, err);
    return NextResponse.json({ error: "Failed to force deadline" }, { status: 500 });
  }
}
