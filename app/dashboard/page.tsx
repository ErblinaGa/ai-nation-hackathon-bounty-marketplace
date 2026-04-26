// Dashboard — shows the current user's bounties, repos, and wallet balance.
// Protected: AuthGuard redirects to /login if no session.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  // Server-side auth check
  if (process.env.USE_SUPABASE === "true") {
    const user = await getCurrentUser();
    if (!user) {
      redirect("/login");
    }
    return <DashboardClient user={user} />;
  }

  // SQLite mode — redirect to home (no user concept)
  redirect("/");
}
