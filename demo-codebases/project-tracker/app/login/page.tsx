import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[--bg]">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-[--accent] mb-2">
            Project Tracker
          </p>
          <h1 className="font-display font-bold text-3xl text-[--text]">Sign in</h1>
        </div>
        <div className="border border-[--border] bg-[--surface] p-6">
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </Suspense>
          <p className="mt-4 text-xs text-[--text-muted] font-mono">
            Use demo@example.com with any password
          </p>
        </div>
      </div>
    </div>
  );
}
