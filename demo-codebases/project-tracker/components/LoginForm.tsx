"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { findUser, setSession } from "@/lib/auth/session";
import { validateLoginForm } from "@/lib/validation";
import { Button } from "./ui/Button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("demo");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = validateLoginForm({ email, password });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setLoading(true);

    // Simulate network delay for realism
    await new Promise((r) => setTimeout(r, 400));

    const user = findUser(email, password);
    if (!user) {
      setErrors({ email: "No account found with that email" });
      setLoading(false);
      return;
    }

    setSession(user);
    const from = searchParams.get("from") ?? "/";
    router.push(from);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className="block text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-[--border] bg-transparent text-sm text-[--text] focus:outline-none focus:border-[--accent]"
          autoComplete="email"
          aria-describedby={errors.email ? "email-error" : undefined}
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-xs text-red-500">{errors.email}</p>
        )}
      </div>
      <div>
        <label className="block text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-[--border] bg-transparent text-sm text-[--text] focus:outline-none focus:border-[--accent]"
          autoComplete="current-password"
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password && (
          <p id="password-error" className="mt-1 text-xs text-red-500">{errors.password}</p>
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="md"
        className="w-full"
        disabled={loading}
        aria-label="Sign in"
      >
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
