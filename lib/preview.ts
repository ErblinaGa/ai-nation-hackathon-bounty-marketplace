// Computes PreviewMetadata from code and optional sandbox result.
import type { PreviewMetadata, Language, TestRunResult } from "./types";

export function computePreview(
  code: string,
  language: Language,
  sandboxResult?: TestRunResult
): PreviewMetadata {
  const lines = code.split("\n").length;

  let imports: string[] = [];
  if (language === "typescript") {
    const matches = code.matchAll(/^import\s+.+\s+from\s+['"](.+)['"]/gm);
    imports = [...matches].map((m) => m[1]);
  } else {
    const matches = code.matchAll(/^(?:from|import)\s+(\S+)/gm);
    imports = [...matches].map((m) => m[1]);
  }

  // Deduplicate
  imports = [...new Set(imports)];

  return {
    lines,
    imports,
    runtime_ms: sandboxResult?.metrics.runtime_ms ?? null,
    mem_mb: sandboxResult?.metrics.mem_mb ?? null,
  };
}
