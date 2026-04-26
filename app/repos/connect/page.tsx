"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";

function GitHubMark({ size = 16 }: { size?: number }) {
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

export default function ConnectGitHubPage() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseReady = isSupabaseConfigured();

  async function handleConnect() {
    if (!supabaseReady) {
      setError("Supabase is not configured. See operator setup notes below.");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const supabase = getBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          // repo: access repo content, issues, PRs
          // read:org: list org repos
          scopes: "repo read:org",
          redirectTo: `${window.location.origin}/repos`,
        },
      });

      if (authError) {
        throw authError;
      }
      // If no error, the browser is being redirected to GitHub — nothing more to do here.
    } catch (err) {
      setConnecting(false);
      setError(
        err instanceof Error ? err.message : "Failed to initiate GitHub OAuth. Check Supabase config."
      );
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors"
            aria-label="Lightning Bounties home"
          >
            LIGHTNING BOUNTIES
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/repos"
              className="text-xs font-mono text-muted hover:text-fg transition-colors"
              aria-label="View connected repositories"
            >
              Repos
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-8 py-16">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-7">
            {/* Page header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-6 h-px bg-accent" />
              <span className="text-xs font-mono text-muted tracking-widest uppercase">
                GitHub Integration
              </span>
            </div>

            <h1 className="font-display font-bold text-5xl tracking-tightest text-fg mb-4">
              Connect GitHub
            </h1>
            <p className="text-base text-muted leading-relaxed mb-10 max-w-lg">
              Authorize Lightning Bounties to read your repositories and issues.
              You pick which repos to use — we never write without your explicit action.
            </p>

            {/* Supabase not configured warning */}
            {!supabaseReady && (
              <div
                className="border border-amber/30 bg-amber/[0.04] px-5 py-4 mb-8 text-sm font-mono text-amber"
                role="alert"
              >
                <div className="font-bold text-xs tracking-widest uppercase mb-2">
                  Operator Setup Required
                </div>
                Supabase environment variables are not set. GitHub OAuth requires{" "}
                <code className="text-fg">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code className="text-fg">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
                See the setup notes below.
              </div>
            )}

            {/* Error state */}
            {error && (
              <div
                className="border border-danger/30 bg-danger/[0.04] px-5 py-4 mb-8 text-sm font-mono text-danger"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Connect button */}
            <div className="mb-12">
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-3 border border-fg bg-fg text-bg px-6 py-4 font-display font-bold text-sm tracking-tight hover:bg-accent hover:border-accent hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label="Connect GitHub account via OAuth"
              >
                <GitHubMark size={16} />
                {connecting ? "Redirecting to GitHub…" : "Connect GitHub"}
              </button>
              <p className="text-xs text-muted mt-3 font-mono">
                Redirects to GitHub OAuth. Returns to /repos on success.
              </p>
            </div>

            {/* Scopes explanation */}
            <div className="border border-border p-6 mb-8">
              <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                Permissions Requested
              </div>
              <div className="space-y-3">
                {[
                  {
                    scope: "repo",
                    desc: "Read repository contents, issues, pull requests. Required to list issues and fetch file context.",
                  },
                  {
                    scope: "read:org",
                    desc: "Read organization membership. Required to list repos in organizations you belong to.",
                  },
                ].map((item) => (
                  <div key={item.scope} className="flex gap-4 items-start">
                    <code className="font-mono text-xs text-accent bg-accent/[0.08] px-2 py-1 flex-shrink-0">
                      {item.scope}
                    </code>
                    <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Operator setup notes */}
            <div className="border border-border/50 p-6">
              <div className="text-xs font-mono text-muted/60 tracking-widest uppercase mb-4">
                Operator Setup
              </div>
              <div className="space-y-3 text-xs text-muted/80 font-mono leading-relaxed">
                <p>To enable GitHub OAuth, the operator must:</p>
                <ol className="list-decimal list-inside space-y-2 text-xs text-muted">
                  <li>
                    Create a GitHub OAuth App at{" "}
                    <code className="text-fg">github.com/settings/developers</code>
                  </li>
                  <li>
                    Set callback URL:{" "}
                    <code className="text-fg">https://&lt;project&gt;.supabase.co/auth/v1/callback</code>
                  </li>
                  <li>
                    In Supabase Dashboard → Auth → Providers → GitHub: enable and enter Client ID + Secret
                  </li>
                  <li>
                    Set env vars:{" "}
                    <code className="text-fg">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
                    <code className="text-fg">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
                  </li>
                </ol>
                <p className="text-muted/50 mt-2">
                  Without this setup, the OAuth button redirects but GitHub rejects the handshake.
                </p>
              </div>
            </div>
          </div>

          {/* Right sidebar — decorative */}
          <div className="col-span-5" />
        </div>
      </div>
    </div>
  );
}
