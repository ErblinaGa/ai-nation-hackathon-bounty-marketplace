/**
 * [cli/types] Subset of lib/types.ts needed by CLI commands.
 * Kept in sync with the root lib/types.ts contract — do not diverge.
 */

export interface AuditorWeights {
  diff_size: number;
  convention_match: number;
  no_new_deps: number;
  security: number;
  price: number;
  bidder_track_record: number;
}

export interface AuditorConfig {
  model: "claude-sonnet-4-6" | "claude-haiku-4-5";
  weights: AuditorWeights;
  threshold: number;
  max_extensions: number;
  prompt_addendum?: string;
}
