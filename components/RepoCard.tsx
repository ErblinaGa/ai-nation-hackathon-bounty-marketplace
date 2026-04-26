import Link from "next/link";
import type { RepoConnection } from "@/lib/types";

interface RepoCardProps {
  repo: RepoConnection;
  bountyCount?: number;
}

function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RepoCard({ repo, bountyCount = 0 }: RepoCardProps) {
  return (
    <Link
      href={`/repos/${repo.owner}/${repo.repo}`}
      className="group block border border-border bg-bg hover:border-fg/30 transition-colors duration-150"
      aria-label={`View repo: ${repo.owner}/${repo.repo}`}
    >
      <div className="p-6">
        {/* Top row — github icon + owner/repo */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-muted flex-shrink-0 group-hover:text-fg transition-colors">
              <GitHubMark size={16} />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-fg truncate tracking-tight">
                {repo.owner}/{repo.repo}
              </div>
              {repo.github_username && (
                <div className="font-mono text-[10px] text-muted tracking-widest mt-0.5">
                  @{repo.github_username}
                </div>
              )}
            </div>
          </div>

          {/* Connected dot */}
          <span
            className="w-1.5 h-1.5 bg-success flex-shrink-0 mt-1"
            aria-label="Connected"
          />
        </div>

        {/* Description */}
        {repo.description ? (
          <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-4">
            {repo.description}
          </p>
        ) : (
          <p className="text-sm text-muted/40 italic mb-4">No description</p>
        )}

        {/* Bottom row — connected_at + bounty count */}
        <div className="border-t border-border pt-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-0.5">
              Connected
            </div>
            <div className="font-mono text-xs text-fg/70">
              {formatDate(repo.connected_at)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-0.5">
              Bounties
            </div>
            <div className="font-mono text-sm font-semibold text-accent tabular-nums">
              {bountyCount}
            </div>
          </div>
        </div>
      </div>

      {/* Hover accent line */}
      <div className="h-px w-0 group-hover:w-full bg-accent transition-all duration-300" />
    </Link>
  );
}
