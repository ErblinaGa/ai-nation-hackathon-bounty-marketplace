// Layout for scan-results — wraps in Suspense for useSearchParams() compatibility.
import { Suspense } from "react";

export default function ScanResultsLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
