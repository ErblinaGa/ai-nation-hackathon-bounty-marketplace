"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "@/lib/auth";
import type { BountyListItem, RepoConnection } from "@/lib/types";

interface Props {
  user: AuthUser;
}

export default function DashboardClient({ user }: Props) {
  const [bounties, setBounties] = useState<BountyListItem[]>([]);
  const [repos, setRepos] = useState<RepoConnection[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [bRes, rRes, wRes] = await Promise.allSettled([
          fetch("/api/bounties").then((r) => r.json()),
          fetch("/api/repos").then((r) => r.json()),
          fetch("/api/wallets").then((r) => r.json()),
        ]);

        if (bRes.status === "fulfilled" && Array.isArray(bRes.value)) {
          setBounties(bRes.value as BountyListItem[]);
        }
        if (rRes.status === "fulfilled" && Array.isArray(rRes.value)) {
          setRepos(rRes.value as RepoConnection[]);
        }
        if (wRes.status === "fulfilled" && wRes.value.wallets) {
          // Sum up balance for current user's wallet if pubkey is set
          const wallets = wRes.value.wallets as Array<{
            pubkey: string;
            balance_sats: number;
          }>;
          if (user.lightning_pubkey) {
            const mine = wallets.find(
              (w) => w.pubkey === user.lightning_pubkey
            );
            setWalletBalance(mine?.balance_sats ?? 0);
          }
        }
      } catch {
        // Silent — non-critical
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [user.lightning_pubkey]);

  const displayName =
    user.display_name ?? user.github_username ?? user.email ?? "Unknown";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      {/* Page header */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "24px 32px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              marginBottom: 4,
              fontFamily: "var(--font-jetbrains), monospace",
            }}
          >
            Dashboard
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
              fontFamily: "var(--font-inter-tight), var(--font-inter), sans-serif",
            }}
          >
            {displayName}
          </h1>
          {user.email && user.display_name !== user.email && (
            <p
              style={{
                fontSize: 12,
                color: "var(--muted)",
                marginTop: 2,
                fontFamily: "var(--font-jetbrains), monospace",
              }}
            >
              {user.email}
            </p>
          )}
        </div>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <ActionButton href="/post" label="Post bounty" primary />
          <ActionButton href="/repos" label="Connect repo" />
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <StatCell
          label="Bounties"
          value={loading ? "..." : String(bounties.length)}
        />
        <StatCell
          label="Repos"
          value={loading ? "..." : String(repos.length)}
          borderLeft
        />
        <StatCell
          label="Wallet"
          value={
            loading
              ? "..."
              : walletBalance !== null
              ? `${walletBalance.toLocaleString()} sats`
              : "—"
          }
          borderLeft
          href="/wallets"
        />
      </div>

      {/* Content grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
        }}
      >
        {/* Bounties panel */}
        <Panel
          label="Recent bounties"
          cta={{ label: "View all", href: "/bounties" }}
          borderRight
        >
          {loading ? (
            <LoadingRows />
          ) : bounties.length === 0 ? (
            <EmptyState
              message="No bounties yet"
              action={{ label: "Post your first bounty", href: "/post" }}
            />
          ) : (
            bounties.slice(0, 5).map((b) => (
              <BountyRow key={b.id} bounty={b} />
            ))
          )}
        </Panel>

        {/* Repos panel */}
        <Panel
          label="Connected repos"
          cta={{ label: "Manage", href: "/repos" }}
        >
          {loading ? (
            <LoadingRows count={3} />
          ) : repos.length === 0 ? (
            <EmptyState
              message="No repos connected"
              action={{ label: "Connect a repo", href: "/repos" }}
            />
          ) : (
            repos.slice(0, 5).map((r) => <RepoRow key={r.id} repo={r} />)
          )}
        </Panel>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        padding: "8px 16px",
        border: "1px solid var(--border)",
        background: primary ? "var(--fg)" : "transparent",
        color: primary ? "var(--bg)" : "var(--fg)",
        fontFamily: "var(--font-jetbrains), monospace",
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        textDecoration: "none",
        fontWeight: 700,
      }}
    >
      {label}
    </Link>
  );
}

function StatCell({
  label,
  value,
  borderLeft,
  href,
}: {
  label: string;
  value: string;
  borderLeft?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        padding: "20px 32px",
        borderLeft: borderLeft ? "1px solid var(--border)" : undefined,
      }}
    >
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 6,
          fontFamily: "var(--font-jetbrains), monospace",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--fg)",
          fontFamily: "var(--font-inter-tight), var(--font-inter), sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function Panel({
  label,
  cta,
  children,
  borderRight,
}: {
  label: string;
  cta: { label: string; href: string };
  children: React.ReactNode;
  borderRight?: boolean;
}) {
  return (
    <div
      style={{
        borderRight: borderRight ? "1px solid var(--border)" : undefined,
        borderTop: "1px solid var(--border)",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            fontFamily: "var(--font-jetbrains), monospace",
          }}
        >
          {label}
        </span>
        <Link
          href={cta.href}
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--accent)",
            textDecoration: "none",
            fontFamily: "var(--font-jetbrains), monospace",
          }}
        >
          {cta.label}
        </Link>
      </div>
      <div>{children}</div>
    </div>
  );
}

function BountyRow({ bounty }: { bounty: BountyListItem }) {
  const statusColor =
    bounty.status === "OPEN"
      ? "#16a34a"
      : bounty.status === "SETTLED"
      ? "var(--accent)"
      : "var(--muted)";

  return (
    <Link
      href={`/bounty/${bounty.id}`}
      style={{
        display: "block",
        padding: "12px 24px",
        borderBottom: "1px solid var(--border)",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--fg)",
              fontWeight: 500,
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {bounty.title}
          </p>
          <p
            style={{
              fontSize: 11,
              color: "var(--muted)",
              fontFamily: "var(--font-jetbrains), monospace",
            }}
          >
            {bounty.max_bounty_sats.toLocaleString()} sats
          </p>
        </div>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: statusColor,
            fontFamily: "var(--font-jetbrains), monospace",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {bounty.status}
        </span>
      </div>
    </Link>
  );
}

function RepoRow({ repo }: { repo: RepoConnection }) {
  return (
    <Link
      href={`/repos/${repo.owner}/${repo.repo}`}
      style={{
        display: "block",
        padding: "12px 24px",
        borderBottom: "1px solid var(--border)",
        textDecoration: "none",
      }}
    >
      <p
        style={{
          fontSize: 13,
          color: "var(--fg)",
          fontFamily: "var(--font-jetbrains), monospace",
          marginBottom: 2,
        }}
      >
        {repo.owner}/{repo.repo}
      </p>
      <p
        style={{
          fontSize: 11,
          color: "var(--muted)",
          fontFamily: "var(--font-jetbrains), monospace",
        }}
      >
        {repo.default_branch} · connected {new Date(repo.connected_at).toLocaleDateString()}
      </p>
    </Link>
  );
}

function EmptyState({
  message,
  action,
}: {
  message: string;
  action: { label: string; href: string };
}) {
  return (
    <div style={{ padding: "28px 24px", textAlign: "center" }}>
      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 12,
          fontFamily: "var(--font-jetbrains), monospace",
        }}
      >
        {message}
      </p>
      <Link
        href={action.href}
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--accent)",
          textDecoration: "none",
          fontFamily: "var(--font-jetbrains), monospace",
        }}
      >
        {action.label} →
      </Link>
    </div>
  );
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            opacity: 0.4,
          }}
        >
          <div
            style={{
              height: 12,
              width: "60%",
              background: "var(--border)",
              marginBottom: 6,
            }}
          />
          <div
            style={{
              height: 10,
              width: "30%",
              background: "var(--border)",
            }}
          />
        </div>
      ))}
    </>
  );
}
