// GET /api/github/issues?repo=owner/repo
// Lists open issues for the given repo using the authenticated user's GitHub token.

import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getServerClient, isSupabaseConfigured } from "@/lib/supabase";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured — GitHub OAuth unavailable" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const repoParam = searchParams.get("repo");

  if (!repoParam) {
    return NextResponse.json({ error: "Missing required query param: repo" }, { status: 400 });
  }

  // Expect "owner/repo" format
  const parts = repoParam.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return NextResponse.json(
      { error: "repo param must be in 'owner/repo' format" },
      { status: 400 }
    );
  }

  let githubToken: string | null = null;

  try {
    const supabase = await getServerClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    githubToken = session.provider_token ?? null;

    if (!githubToken) {
      const { data: { user } } = await supabase.auth.getUser();
      githubToken = (user?.user_metadata?.provider_token as string) ?? null;
    }

    if (!githubToken) {
      return NextResponse.json(
        { error: "No GitHub token. Re-connect via /repos/connect.", reconnect: true },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("[GET /api/github/issues] auth error:", err);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoParam}/issues?state=open&per_page=50&sort=updated`,
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

    const rawIssues = await response.json() as Array<{
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      state: "open" | "closed";
      labels: Array<{ name: string; color: string }>;
      created_at: string;
      updated_at: string;
      user: { login: string } | null;
      pull_request?: unknown; // PRs are returned by the issues endpoint — filter them out
    }>;

    // Filter out pull requests (GitHub issues endpoint returns both)
    const issues: GitHubIssue[] = rawIssues
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body,
        html_url: i.html_url,
        state: i.state,
        labels: i.labels.map((l) => ({ name: l.name, color: l.color })),
        created_at: i.created_at,
        updated_at: i.updated_at,
        user: i.user,
      }));

    return NextResponse.json(issues);
  } catch (err) {
    console.error("[GET /api/github/issues] GitHub API error:", err);
    return NextResponse.json({ error: "Failed to fetch issues" }, { status: 500 });
  }
}
