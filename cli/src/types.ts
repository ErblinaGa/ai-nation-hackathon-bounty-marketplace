/**
 * [cli/types] Subset of lib/types.ts needed by CLI commands.
 * Kept in sync with the root lib/types.ts contract — do not diverge.
 */

export interface AuditorWeights {
  code_quality: number;          // V3
  completeness: number;          // V3
  convention_match: number;
  test_appropriateness: number;  // V3 (renamed from test_coverage)
  maintainability: number;       // V3
  no_new_deps: number;
  security: number;
}

export interface AuditorConfig {
  model: "claude-sonnet-4-6" | "claude-haiku-4-5";
  weights: AuditorWeights;
  threshold: number;
  max_extensions: number;
  prompt_addendum?: string;
}
