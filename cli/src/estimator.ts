/**
 * [cli/estimator] Estimates bounty complexity + suggested sat range using claude-haiku-4-5.
 *
 * Runs on every `lb gh-bounty` call without --max-sats. Haiku is used to keep cost low.
 * Falls back gracefully to a medium bracket if the API key is missing or Claude fails.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface EstimatorResult {
  estimated_loc: number;       // total lines likely changed
  estimated_files: number;     // number of files affected
  complexity: "trivial" | "easy" | "medium" | "hard" | "very_hard";
  suggested_sats_min: number;  // lower bracket
  suggested_sats_max: number;  // upper bracket
  reasoning: string;           // 1-2 sentences explaining the estimate
}

// Sat brackets per complexity tier.
const SAT_RANGES: Record<EstimatorResult["complexity"], [number, number]> = {
  trivial:   [2_000,   5_000],
  easy:      [5_000,  15_000],
  medium:   [20_000,  50_000],
  hard:     [60_000, 120_000],
  very_hard:[150_000, 300_000],
};

const FALLBACK_RESULT: EstimatorResult = {
  estimated_loc: 0,
  estimated_files: 0,
  complexity: "medium",
  suggested_sats_min: 20_000,
  suggested_sats_max: 50_000,
  reasoning: "estimator unavailable, defaulting to medium",
};

interface ClaudeEstimate {
  estimated_loc: number;
  estimated_files: number;
  complexity: string;
  reasoning: string;
}

/**
 * [estimator][estimate] Calls claude-haiku-4-5 to estimate complexity + sat range.
 *
 * @param issueTitle - GitHub issue title
 * @param issueBody  - GitHub issue body
 * @param contextFiles - Up to 3-5 most relevant files (truncated to 2k chars each)
 */
export async function estimate(
  issueTitle: string,
  issueBody: string,
  contextFiles: { path: string; content: string }[],
): Promise<EstimatorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[estimator] ANTHROPIC_API_KEY not set — using fallback medium bracket",
    );
    return FALLBACK_RESULT;
  }

  // Truncate each context file to 2k chars.
  const truncatedFiles = contextFiles.slice(0, 5).map((f) => ({
    path: f.path,
    content: f.content.slice(0, 2000),
  }));

  const contextBlock =
    truncatedFiles.length > 0
      ? truncatedFiles
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join("\n\n")
      : "(no context files available)";

  const prompt = `You are a senior engineer estimating the effort to resolve a GitHub issue.

Issue title: ${issueTitle}

Issue body:
${issueBody}

Relevant codebase files:
${contextBlock}

Estimate the complexity and effort to resolve this issue. Output JSON only — no prose, no markdown fences.

JSON shape:
{
  "estimated_loc": <integer: total lines of code likely changed>,
  "estimated_files": <integer: number of files likely affected>,
  "complexity": <one of: "trivial" | "easy" | "medium" | "hard" | "very_hard">,
  "reasoning": <string: 1-2 sentences explaining the estimate>
}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Strip markdown fences if present.
    const clean = raw.startsWith("```")
      ? raw.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "").trim()
      : raw;

    const parsed = JSON.parse(clean) as ClaudeEstimate;

    const complexity = _validateComplexity(parsed.complexity);
    const [min, max] = SAT_RANGES[complexity];

    return {
      estimated_loc: Math.max(0, parseInt(String(parsed.estimated_loc), 10) || 0),
      estimated_files: Math.max(0, parseInt(String(parsed.estimated_files), 10) || 0),
      complexity,
      suggested_sats_min: min,
      suggested_sats_max: max,
      reasoning: String(parsed.reasoning ?? "").slice(0, 500),
    };
  } catch (err) {
    console.error(
      `[estimator] Failed to estimate complexity: ${err instanceof Error ? err.message : String(err)} — using fallback`,
    );
    return FALLBACK_RESULT;
  }
}

/**
 * [estimator][_validateComplexity] Validates complexity value from Claude, falls back to "medium".
 */
function _validateComplexity(value: unknown): EstimatorResult["complexity"] {
  const valid = new Set<string>(["trivial", "easy", "medium", "hard", "very_hard"]);
  if (typeof value === "string" && valid.has(value)) {
    return value as EstimatorResult["complexity"];
  }
  return "medium";
}

/**
 * [estimator][midpoint] Computes the midpoint of a [min, max] sat range.
 */
export function midpoint(result: EstimatorResult): number {
  return Math.round((result.suggested_sats_min + result.suggested_sats_max) / 2);
}
