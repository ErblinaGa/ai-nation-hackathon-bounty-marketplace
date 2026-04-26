"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type State = "idle" | "loading" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setErrorMsg("Email is required");
      setState("error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Enter a valid email address");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const supabase = getBrowserClient();
      const redirectTo = window.location.origin + "/auth/callback";

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        setErrorMsg(error.message);
        setState("error");
        return;
      }

      setState("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unexpected error");
      setState("error");
    }
  }

  async function resend() {
    setState("idle");
    setEmail(email);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "var(--font-jetbrains), monospace",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          border: "1px solid var(--border)",
          padding: 0,
        }}
      >
        {/* Header bar */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              background: "var(--accent)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Lightning Bounties
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "32px 24px" }}>
          {state === "sent" ? (
            <SentState email={email} onResend={resend} />
          ) : (
            <Form
              email={email}
              onEmailChange={setEmail}
              onSubmit={sendMagicLink}
              loading={state === "loading"}
              errorMsg={state === "error" ? errorMsg : ""}
            />
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Form({
  email,
  onEmailChange,
  onSubmit,
  loading,
  errorMsg,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  errorMsg: string;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 6,
          color: "var(--fg)",
          fontFamily: "var(--font-inter-tight), var(--font-inter), sans-serif",
        }}
      >
        Sign in
      </h1>
      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 28,
          lineHeight: 1.5,
        }}
      >
        Enter your email — we&apos;ll send a magic link.
        <br />
        No password required.
      </p>

      <label
        htmlFor="email"
        style={{
          display: "block",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        Email address
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder="you@example.com"
        disabled={loading}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--fg)",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 13,
          padding: "10px 12px",
          outline: "none",
          marginBottom: errorMsg ? 8 : 20,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "var(--accent)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "var(--border)";
        }}
      />

      {errorMsg && (
        <p
          style={{
            fontSize: 11,
            color: "#c0392b",
            marginBottom: 16,
            fontFamily: "var(--font-jetbrains), monospace",
          }}
        >
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          display: "block",
          width: "100%",
          padding: "11px 16px",
          background: loading ? "var(--muted)" : "var(--fg)",
          color: "var(--bg)",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
          fontWeight: 700,
        }}
      >
        {loading ? "Sending..." : "Send magic link"}
      </button>
    </form>
  );
}

function SentState({
  email,
  onResend,
}: {
  email: string;
  onResend: () => void;
}) {
  return (
    <div>
      <div
        style={{
          width: 32,
          height: 4,
          background: "var(--accent)",
          marginBottom: 24,
        }}
      />
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 10,
          color: "var(--fg)",
          fontFamily: "var(--font-inter-tight), var(--font-inter), sans-serif",
        }}
      >
        Check your email
      </h2>
      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.6,
          marginBottom: 24,
          fontFamily: "var(--font-jetbrains), monospace",
          wordBreak: "break-all",
        }}
      >
        Magic link sent to{" "}
        <span style={{ color: "var(--fg)" }}>{email}</span>
        <br />
        Click the link to sign in. No code needed.
      </p>

      <p
        style={{
          fontSize: 11,
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        Didn&apos;t receive it?
      </p>
      <button
        type="button"
        onClick={onResend}
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--fg)",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: "8px 14px",
          cursor: "pointer",
        }}
      >
        Resend link
      </button>
    </div>
  );
}
