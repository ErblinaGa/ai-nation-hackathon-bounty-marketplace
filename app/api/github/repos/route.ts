// GET /api/github/repos
// Lists the current user's GitHub repos using their OAuth token from Supabase session.
// Requires: Supabase configured + GitHub OAuth provider enabled.

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerClient, isSupabaseConfigured } from "@/lib/supabase";

export interface GitHubRepo {
  id: number;
  owner: string;
  repo: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  pushed_at: string | null;
}

export async function GET(_req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured — GitHub OAuth unavailable" },
      { status: 503 }
    );
  }

  let githubToken: string | null = null;

  try {
    const supabase = await getServerClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // provider_token is available on the session object after OAuth sign-in.
    // It is NOT persisted across logouts — once the user logs out and back in,
    // a new token is issued by GitHub.
    githubToken = session.provider_token ?? null;

    // Fallback: check user_metadata for a stored token (requires server-side persistence logic)
    if (!githubToken) {
      const { data: { user } } = await supabase.auth.getUser();
      githubToken = (user?.user_metadata?.provider_token as string) ?? null;
    }

    if (!githubToken) {
      return NextResponse.json(
        {
          error: "No GitHub token available. Please re-connect GitHub via /repos/connect.",
          reconnect: true,
        },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("[GET /api/github/repos] auth error:", err);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }

  try {
    // Fetch all repos the user has access to (includes orgs with read:org scope)
    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=pushed&type=all",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      return NextResponse.json(
        { error: `GitHub API error: ${body.message ?? response.statusText}` },
        { status: response.status }
      );
    }

    const rawRepos = await response.json() as Array<{
      id: number;
      full_name: string;
      name: string;
      owner: { login: string };
      description: string | null;
      private: boolean;
      default_branch: string;
      html_url: string;
      pushed_at: string | null;
    }>;

    const repos: GitHubRepo[] = rawRepos.map((r) => ({
      id: r.id,
      owner: r.owner.login,
      repo: r.name,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      default_branch: r.default_branch,
      html_url: r.html_url,
      pushed_at: r.pushed_at,
    }));

    return NextResponse.json(repos);
  } catch (err) {
    console.error("[GET /api/github/repos] GitHub API error:", err);
    return NextResponse.json({ error: "Failed to fetch GitHub repos" }, { status: 500 });
  }
}
