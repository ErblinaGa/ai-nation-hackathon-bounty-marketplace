// GET /api/github/issue?repo=owner/repo&issue_number=42
// Fetches a single issue + extracts relevant file context from the repo.
// Context extraction: looks at issue body for file references, then fetches those files.
// Full git clone is intentionally avoided here — too slow for a web request.
export const dynamic = "force-dynamic";
// For deep context extraction, use the CLI's context_extractor.

import { NextRequest, NextResponse } from "next/server";
import { getServerClient, isSupabaseConfigured } from "@/lib/supabase";
import type { GitHubIssue } from "@/app/api/github/issues/route";

export interface IssueContext {
  issue: GitHubIssue;
  context_files: Array<{ path: string; content: string }>;
  suggested_title: string;
  suggested_description: string;
}

// Extract file paths mentioned in issue body/title
function extractFilePaths(text: string): string[] {
  const patterns = [
    // Backtick-quoted paths: `src/foo.ts`
    /`([a-zA-Z0-9_.\-/]+\.[a-zA-Z]{1,6})`/g,
    // Bare paths that look like file references: src/foo/bar.ts
    /\b((?:[a-zA-Z0-9_\-]+\/)+[a-zA-Z0-9_.\-]+\.[a-zA-Z]{1,6})\b/g,
  ];

  const found = new Set<string>();
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const path = m[1];
      // Ignore common non-file patterns
      if (!path.includes("://") && path.split("/").length >= 2) {
        found.add(path);
      }
    }
  }
  return Array.from(found).slice(0, 10); // cap at 10 files
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as { content?: string; encoding?: string; size?: number };

    // Skip files over 100KB
    if (data.size && data.size > 100_000) return null;
    if (!data.content || data.encoding !== "base64") return null;

    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  } catch {
    return null;
  }
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
  const issueNumberParam = searchParams.get("issue_number");

  if (!repoParam || !issueNumberParam) {
    return NextResponse.json(
      { error: "Missing required query params: repo, issue_number" },
      { status: 400 }
    );
  }

  const parts = repoParam.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return NextResponse.json(
      { error: "repo param must be in 'owner/repo' format" },
      { status: 400 }
    );
  }

  const [owner, repoName] = parts;
  const issueNumber = parseInt(issueNumberParam, 10);

  if (isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "issue_number must be a positive integer" }, { status: 400 });
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
    console.error("[GET /api/github/issue] auth error:", err);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }

  try {
    // Fetch the issue
    const issueResponse = await fetch(
      `https://api.github.com/repos/${repoParam}/issues/${issueNumber}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!issueResponse.ok) {
      const body = await issueResponse.json().catch(() => ({})) as { message?: string };
      return NextResponse.json(
        { error: `GitHub API error: ${body.message ?? issueResponse.statusText}` },
        { status: issueResponse.status }
      );
    }

    const rawIssue = await issueResponse.json() as {
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      state: "open" | "closed";
      labels: Array<{ name: string; color: string }>;
      created_at: string;
      updated_at: string;
      user: { login: string } | null;
    };

    const issue: GitHubIssue = {
      number: rawIssue.number,
      title: rawIssue.title,
      body: rawIssue.body,
      html_url: rawIssue.html_url,
      state: rawIssue.state,
      labels: rawIssue.labels.map((l) => ({ name: l.name, color: l.color })),
      created_at: rawIssue.created_at,
      updated_at: rawIssue.updated_at,
      user: rawIssue.user,
    };

    // Extract file paths mentioned in issue
    const bodyText = `${issue.title}\n${issue.body ?? ""}`;
    const filePaths = extractFilePaths(bodyText);

    // Fetch file contents in parallel (best-effort — silently skip missing files)
    const fileResults = await Promise.all(
      filePaths.map(async (path) => {
        const content = await fetchFileContent(owner, repoName, path, githubToken!);
        return content ? { path, content } : null;
      })
    );

    const contextFiles = fileResults.filter(
      (f): f is { path: string; content: string } => f !== null
    );

    // Build suggested bounty draft from issue
    const labelNames = issue.labels.map((l) => l.name).join(", ");
    const suggested_description = [
      issue.body?.slice(0, 800) ?? "",
      labelNames ? `\nLabels: ${labelNames}` : "",
      `\nSource: ${issue.html_url}`,
    ]
      .join("")
      .trim();

    const result: IssueContext = {
      issue,
      context_files: contextFiles,
      suggested_title: issue.title,
      suggested_description,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/github/issue] error:", err);
    return NextResponse.json({ error: "Failed to fetch issue context" }, { status: 500 });
  }
}
