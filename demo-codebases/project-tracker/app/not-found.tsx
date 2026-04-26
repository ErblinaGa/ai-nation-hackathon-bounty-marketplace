import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <p className="font-mono text-8xl font-bold text-[--border] mb-4 select-none">404</p>
        <h1 className="font-display font-bold text-xl text-[--text] mb-2">Page not found</h1>
        <p className="text-sm text-[--text-muted] mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="font-mono text-sm text-[--accent] hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
