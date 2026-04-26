"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // In production, log to error tracking service
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <div className="border border-red-200 dark:border-red-900 p-8 max-w-md w-full">
        <p className="font-mono text-xs text-red-500 mb-2 uppercase tracking-widest">Error</p>
        <h1 className="font-display font-bold text-xl text-[--text] mb-3">Something went wrong</h1>
        <p className="text-sm text-[--text-muted] font-mono mb-6">{error.message}</p>
        <Button variant="secondary" size="sm" onClick={reset} aria-label="Try again">
          Try again
        </Button>
      </div>
    </div>
  );
}
