/**
 * [context_extractor] Walks a codebase directory and uses claude-haiku to identify
 * the 5-10 most relevant files for a given task description.
 *
 * Returns a CodebasePayload-compatible array of { path, content } objects.
 */
import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { glob } from "glob";

// Directories and file patterns to always skip.
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".cache",
  "coverage",
  ".turbo",
  ".vercel",
]);

const SKIP_EXTENSIONS = new Set([
  ".lock",
  ".log",
  ".map",
  ".min.js",
  ".min.css",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".db",
  ".sqlite",
  ".sqlite3",
]);

// Max file size in bytes to include in listing (skip huge files).
const MAX_FILE_BYTES = 200_000;

// Max chars of a single file's content to pass to Claude for ranking.
const MAX_FILE_PREVIEW_CHARS = 500;

// Max total chars of all file previews to send to Claude (token budget).
const MAX_TOTAL_PREVIEW_CHARS = 40_000;

export interface ContextFile {
  path: string;  // relative to codebase root
  content: string;
}

/**
 * [context_extractor][walkCodebase] Returns list of all eligible file paths
 * (relative to rootDir), skipping ignored dirs/extensions/large files.
 */
export async function walkCodebase(rootDir: string): Promise<string[]> {
  const allFiles = await glob("**/*", {
    cwd: rootDir,
    nodir: true,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/__pycache__/**",
      "**/.cache/**",
      "**/coverage/**",
    ],
  });

  const eligible: string[] = [];
  for (const relPath of allFiles) {
    // Skip if any path segment is a skip-dir
    const segments = relPath.split("/");
    if (segments.some((seg) => SKIP_DIRS.has(seg))) {
      continue;
    }

    // Skip by extension
    const ext = relPath.includes(".")
      ? "." + relPath.split(".").slice(-1)[0]
      : "";
    if (SKIP_EXTENSIONS.has(ext)) {
      continue;
    }

    // Skip large files
    try {
      const absPath = join(rootDir, relPath);
      const stat = statSync(absPath);
      if (stat.size > MAX_FILE_BYTES) {
        continue;
      }
    } catch {
      continue;
    }

    eligible.push(relPath);
  }

  return eligible;
}

/**
 * [context_extractor][rankFilesByRelevance] Asks claude-haiku to return the 5-10
 * most relevant file paths for a given task description.
 *
 * Falls back to returning the first 10 files if Claude is unavailable.
 */
export async function rankFilesByRelevance(
  taskDescription: string,
  filePaths: string[],
  rootDir: string,
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[context_extractor][rankFilesByRelevance] ANTHROPIC_API_KEY not set — using first 10 files as fallback",
    );
    return filePaths.slice(0, 10);
  }

  if (filePaths.length === 0) {
    return [];
  }

  // Build file listing with short previews (for token efficiency).
  const fileListParts: string[] = [];
  let totalChars = 0;
  const includedPaths: string[] = [];

  for (const relPath of filePaths) {
    const absPath = join(rootDir, relPath);
    let preview = "";
    try {
      const content = readFileSync(absPath, "utf-8");
      preview = content.slice(0, MAX_FILE_PREVIEW_CHARS).replace(/\n/g, "\\n");
    } catch {
      preview = "(unreadable)";
    }

    const entry = `${relPath}: ${preview}`;
    if (totalChars + entry.length > MAX_TOTAL_PREVIEW_CHARS) {
      break;
    }

    fileListParts.push(entry);
    includedPaths.push(relPath);
    totalChars += entry.length;
  }

  const fileList = fileListParts.join("\n");

  const prompt = `You are a code relevance expert. Given a task description and a list of files (with content previews), return a JSON array of the 5-10 most relevant file paths that a developer would need to read or modify to complete the task.

Return ONLY a valid JSON array of file path strings. No explanations, no markdown.

Task: ${taskDescription}

Files (path: content_preview):
${fileList}

Return JSON array of the 5-10 most relevant file paths:`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Strip markdown fences if present
    const clean = text.startsWith("```")
      ? text.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "").trim()
      : text;

    const parsed: unknown = JSON.parse(clean);
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not a JSON array");
    }

    // Validate that all returned paths are in our known list
    const knownSet = new Set(includedPaths);
    const filtered = (parsed as string[]).filter(
      (p) => typeof p === "string" && knownSet.has(p),
    );

    if (filtered.length === 0) {
      console.warn(
        "[context_extractor][rankFilesByRelevance] Claude returned no matching paths — falling back to first 10",
      );
      return filePaths.slice(0, 10);
    }

    return filtered.slice(0, 10);
  } catch (err) {
    console.error(
      "[context_extractor][rankFilesByRelevance] Error calling Claude or parsing response:",
      err,
    );
    return filePaths.slice(0, 10);
  }
}

// Build/test essentials that must always be in context_files so the sandbox can
// actually run `npm test` after applying the bidder's diff. The LLM ranker may
// drop these as "not relevant" to the task, but without them the sandbox fails.
//
// NOTE: package-lock.json is intentionally excluded — it's huge (often 100k+ chars)
// which would consume the LLM context budget. The sandbox uses the warm node_modules
// symlink from demo-codebases/<id>/node_modules anyway, so npm install isn't needed.
const ALWAYS_INCLUDE_PATTERNS = [
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "vitest.config.js",
  "vitest.setup.ts",
  "vitest.setup.js",
  "next.config.mjs",
  "next.config.js",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.mjs",
  "postcss.config.js",
  "jest.config.ts",
  "jest.config.js",
  "pyproject.toml",
  "requirements.txt",
];

/**
 * [context_extractor][extractContext] Main entry: walks directory, ranks files
 * by relevance, reads their content, returns ContextFile array.
 */
export async function extractContext(
  rootDir: string,
  taskDescription: string,
): Promise<ContextFile[]> {
  console.log(
    `[context_extractor] Walking codebase at: ${rootDir}`,
  );

  const allFiles = await walkCodebase(rootDir);
  console.log(`[context_extractor] Found ${allFiles.length} eligible files`);

  if (allFiles.length === 0) {
    console.warn("[context_extractor] No eligible files found in codebase");
    return [];
  }

  console.log("[context_extractor] Asking Claude Haiku to rank files by relevance...");
  const relevantPaths = await rankFilesByRelevance(
    taskDescription,
    allFiles,
    rootDir,
  );

  // Always-include essentials (build/test config) — sandbox needs these to run npm test
  const allFileSet = new Set(allFiles);
  const essentials = ALWAYS_INCLUDE_PATTERNS.filter((p) => allFileSet.has(p));
  const finalPaths = Array.from(new Set([...essentials, ...relevantPaths]));

  console.log(
    `[context_extractor] Final files (${finalPaths.length} = ${essentials.length} essentials + ${relevantPaths.length} ranked): ${finalPaths.join(", ")}`,
  );

  const contextFiles: ContextFile[] = [];
  for (const relPath of finalPaths) {
    const absPath = join(rootDir, relPath);
    try {
      const content = readFileSync(absPath, "utf-8");
      contextFiles.push({ path: relPath, content });
    } catch (err) {
      console.error(
        `[context_extractor] Could not read file ${absPath}: ${err}`,
      );
    }
  }

  return contextFiles;
}
