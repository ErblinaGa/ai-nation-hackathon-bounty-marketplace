"use client";

import { useEffect, useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LineType = "add" | "del" | "hunk" | "context";

interface DiffLine {
  type: LineType;
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffFile {
  /** Display path — derived from +++ header */
  path: string;
  lines: DiffLine[];
  addCount: number;
  delCount: number;
}

// ---------------------------------------------------------------------------
// Diff parser
// ---------------------------------------------------------------------------

function parseDiff(raw: string): DiffFile[] {
  const lines = raw.split("\n");
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("--- ")) {
      const next = lines[i + 1] ?? "";
      if (next.startsWith("+++ ")) {
        const toPath = next.slice(4).trim().replace(/^b\//, "");
        const fromPath = line.slice(4).trim().replace(/^a\//, "");
        const path = toPath === "/dev/null" ? fromPath : toPath;
        current = { path, lines: [], addCount: 0, delCount: 0 };
        files.push(current);
        i++; // skip +++ line
      }
      continue;
    }

    if (!current) continue;
    if (line.startsWith("+++ ")) continue;

    if (line.startsWith("@@ ")) {
      // Parse hunk header to get line numbers: @@ -a,b +c,d @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10) - 1;
        newLine = parseInt(match[2], 10) - 1;
      }
      current.lines.push({ type: "hunk", content: line, oldLineNo: null, newLineNo: null });
      continue;
    }

    if (line === "\\ No newline at end of file") continue;

    if (line.startsWith("+")) {
      newLine++;
      current.addCount++;
      current.lines.push({ type: "add", content: line.slice(1), oldLineNo: null, newLineNo: newLine });
    } else if (line.startsWith("-")) {
      oldLine++;
      current.delCount++;
      current.lines.push({ type: "del", content: line.slice(1), oldLineNo: oldLine, newLineNo: null });
    } else {
      oldLine++;
      newLine++;
      current.lines.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldLineNo: oldLine,
        newLineNo: newLine,
      });
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Lightweight syntax highlighter (regex-only, no deps)
// ---------------------------------------------------------------------------

const KEYWORDS =
  /\b(const|let|var|function|return|import|export|from|default|class|extends|interface|type|if|else|for|while|switch|case|break|continue|new|null|undefined|true|false|async|await|typeof|instanceof|throw|try|catch|finally|void|in|of)\b/g;
const STRINGS = /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g;
const COMMENTS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
const NUMBERS = /\b(\d+(?:\.\d+)?)\b/g;

interface Token {
  kind: "kw" | "str" | "num" | "cmt" | "plain";
  text: string;
}

function tokenize(code: string): Token[] {
  // Build a list of [start, end, kind] spans, process in order
  type Span = { start: number; end: number; kind: "kw" | "str" | "num" | "cmt" };
  const spans: Span[] = [];

  const push = (re: RegExp, kind: Span["kind"]) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, kind });
    }
  };

  push(COMMENTS, "cmt");
  push(STRINGS, "str");
  push(NUMBERS, "num");
  push(KEYWORDS, "kw");

  // Sort by start, remove overlapping (first wins)
  spans.sort((a, b) => a.start - b.start);
  const clean: Span[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start >= cursor) {
      clean.push(s);
      cursor = s.end;
    }
  }

  // Build token list
  const tokens: Token[] = [];
  let pos = 0;
  for (const s of clean) {
    if (pos < s.start) tokens.push({ kind: "plain", text: code.slice(pos, s.start) });
    tokens.push({ kind: s.kind, text: code.slice(s.start, s.end) });
    pos = s.end;
  }
  if (pos < code.length) tokens.push({ kind: "plain", text: code.slice(pos) });

  return tokens;
}

const TOKEN_COLORS: Record<Token["kind"], string> = {
  kw: "text-[#F0A868]",   // accent orange
  str: "text-[#7EC894]",  // muted green
  num: "text-[#79B8FF]",  // blue
  cmt: "text-[#666E7A] italic",  // muted italic
  plain: "",
};

function HighlightedLine({ content }: { content: string }) {
  const tokens = tokenize(content);
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} className={TOKEN_COLORS[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// File tree node
// ---------------------------------------------------------------------------

interface FileTreeItemProps {
  file: DiffFile;
  isSelected: boolean;
  onSelect: () => void;
}

function FileTreeItem({ file, isSelected, onSelect }: FileTreeItemProps) {
  const parts = file.path.split("/");
  const name = parts[parts.length - 1];
  const dir = parts.slice(0, -1).join("/");

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-fg/[0.05] transition-colors focus-visible:outline-1 focus-visible:outline-accent ${
        isSelected ? "bg-fg/[0.08] border-l-2 border-accent" : "border-l-2 border-transparent"
      }`}
      aria-label={`View diff for ${file.path}`}
      aria-current={isSelected ? "true" : undefined}
    >
      <span className="flex-1 min-w-0">
        {dir && (
          <span className="block text-[10px] font-mono text-muted leading-tight truncate">
            {dir}/
          </span>
        )}
        <span
          className={`block text-[11px] font-mono leading-tight truncate ${
            isSelected ? "text-fg" : "text-fg/70"
          }`}
        >
          {name}
        </span>
      </span>
      <span className="flex-shrink-0 flex gap-1 items-center mt-0.5">
        {file.addCount > 0 && (
          <span className="text-[9px] font-mono text-[#7EC894]">+{file.addCount}</span>
        )}
        {file.delCount > 0 && (
          <span className="text-[9px] font-mono text-[#F87171]">-{file.delCount}</span>
        )}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Diff pane — renders one file's diff lines
// ---------------------------------------------------------------------------

interface DiffPaneProps {
  file: DiffFile;
}

function DiffPane({ file }: DiffPaneProps) {
  if (file.lines.length === 0) {
    return (
      <div className="px-6 py-4 text-xs font-mono text-muted">No changes in this file.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" aria-label={`Diff for ${file.path}`}>
        <tbody className="font-mono text-xs leading-5">
          {file.lines.map((line, idx) => {
            if (line.type === "hunk") {
              return (
                <tr key={idx} className="bg-fg/[0.04]">
                  <td className="w-10 px-2 py-0.5 text-[9px] text-muted/60 select-none text-right border-r border-border" />
                  <td className="w-10 px-2 py-0.5 text-[9px] text-muted/60 select-none text-right border-r border-border" />
                  <td className="w-4 px-1 text-muted/40 select-none" />
                  <td className="px-4 py-0.5 text-muted/60 italic text-[10px]">
                    {line.content}
                  </td>
                </tr>
              );
            }

            const isAdd = line.type === "add";
            const isDel = line.type === "del";

            return (
              <tr
                key={idx}
                className={
                  isAdd
                    ? "bg-[#0D2B18] hover:bg-[#0D2B18]/80"
                    : isDel
                    ? "bg-[#2B0D0D] hover:bg-[#2B0D0D]/80"
                    : "hover:bg-fg/[0.02]"
                }
              >
                <td
                  className="w-10 px-2 py-0 text-[10px] text-muted/40 select-none text-right border-r border-border/50"
                  aria-hidden="true"
                >
                  {isDel ? line.oldLineNo : ""}
                </td>
                <td
                  className="w-10 px-2 py-0 text-[10px] text-muted/40 select-none text-right border-r border-border/50"
                  aria-hidden="true"
                >
                  {isAdd ? line.newLineNo : !isDel ? line.newLineNo : ""}
                </td>
                <td
                  className={`w-4 px-1 select-none text-center ${
                    isAdd
                      ? "text-[#7EC894]"
                      : isDel
                      ? "text-[#F87171]"
                      : "text-muted/30"
                  }`}
                  aria-hidden="true"
                >
                  {isAdd ? "+" : isDel ? "-" : " "}
                </td>
                <td className="px-4 py-0 whitespace-pre text-fg/85">
                  <HighlightedLine content={line.content} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal component
// ---------------------------------------------------------------------------

interface WinningDiffData {
  bid_id: string;
  bidder_pubkey: string;
  asked_price_sats: number;
  diff: string;
  test_output: string | null;
  auditor_reasoning: string | null;
}

interface WinnerCodeViewerProps {
  bountyId: string;
  onClose: () => void;
}

export default function WinnerCodeViewer({ bountyId, onClose }: WinnerCodeViewerProps) {
  const [data, setData] = useState<WinningDiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);

  // ESC key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Prevent scroll on body while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Fetch winning diff
  useEffect(() => {
    async function fetchDiff() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bounty/${bountyId}/winning-diff`, {
          headers: { "x-pubkey": "02demo_poster_pubkey" },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as WinningDiffData;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load diff");
      } finally {
        setLoading(false);
      }
    }
    void fetchDiff();
  }, [bountyId]);

  const files = data ? parseDiff(data.diff) : [];
  const selectedFile = files[selectedFileIdx] ?? null;

  // Click on backdrop → close
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A]/90"
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-label="Winner code viewer"
    >
      <div
        className="w-[92vw] max-w-[1200px] h-[85vh] flex flex-col border border-border bg-bg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Title bar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-fg/[0.02] flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
              Winner Code
            </span>
            {data && (
              <>
                <span className="text-[10px] font-mono text-fg/40">·</span>
                <span className="font-mono text-[11px] text-fg/70 truncate">
                  {data.bid_id.slice(0, 16)}…
                </span>
                <span className="text-[10px] font-mono text-fg/40">·</span>
                <span className="font-mono text-[11px] text-muted">
                  {data.bidder_pubkey.slice(0, 8)}…
                </span>
                <span className="text-[10px] font-mono text-fg/40">·</span>
                <span className="font-mono text-[11px] text-accent">
                  {data.asked_price_sats.toLocaleString()} sats
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 border border-border flex items-center justify-center text-muted hover:text-fg hover:border-fg/40 transition-colors flex-shrink-0 ml-4"
            aria-label="Close winner code viewer"
          >
            <span className="text-xs leading-none font-mono">×</span>
          </button>
        </div>

        {/* ── Content area ── */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <span className="font-mono text-xs text-muted animate-pulse">Loading diff…</span>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div
              className="border border-danger/30 bg-danger/5 px-5 py-4 text-xs font-mono text-danger"
              role="alert"
            >
              {error}
            </div>
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <span className="font-mono text-xs text-muted">No files in diff.</span>
          </div>
        )}

        {!loading && !error && files.length > 0 && (
          <div className="flex flex-1 min-h-0">
            {/* ── Left: file tree ── */}
            <div className="w-52 flex-shrink-0 border-r border-border flex flex-col bg-fg/[0.015]">
              <div className="px-3 py-2 border-b border-border flex-shrink-0">
                <span className="text-[9px] font-mono text-muted tracking-widest uppercase">
                  Files ({files.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto py-1" role="listbox" aria-label="Changed files">
                {files.map((file, idx) => (
                  <FileTreeItem
                    key={idx}
                    file={file}
                    isSelected={idx === selectedFileIdx}
                    onSelect={() => setSelectedFileIdx(idx)}
                  />
                ))}
              </div>
              {/* Totals */}
              <div className="px-3 py-2 border-t border-border flex gap-3 flex-shrink-0">
                <span className="text-[9px] font-mono text-[#7EC894]">
                  +{files.reduce((s, f) => s + f.addCount, 0)}
                </span>
                <span className="text-[9px] font-mono text-[#F87171]">
                  -{files.reduce((s, f) => s + f.delCount, 0)}
                </span>
              </div>
            </div>

            {/* ── Right: diff view ── */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* File path header */}
              {selectedFile && (
                <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-fg/[0.02] flex-shrink-0">
                  <span className="font-mono text-[11px] text-fg/80 truncate">
                    {selectedFile.path}
                  </span>
                  <span className="ml-auto flex gap-3 flex-shrink-0">
                    <span className="text-[10px] font-mono text-[#7EC894]">
                      +{selectedFile.addCount}
                    </span>
                    <span className="text-[10px] font-mono text-[#F87171]">
                      -{selectedFile.delCount}
                    </span>
                  </span>
                </div>
              )}

              <div className="flex-1 overflow-auto">
                {selectedFile ? (
                  <DiffPane file={selectedFile} />
                ) : (
                  <div className="p-6 text-xs font-mono text-muted">
                    Select a file from the tree.
                  </div>
                )}
              </div>

              {/* Auditor reasoning strip */}
              {data?.auditor_reasoning && (
                <div className="border-t border-border px-4 py-2 bg-fg/[0.015] flex-shrink-0">
                  <span className="text-[9px] font-mono text-muted tracking-widest uppercase mr-3">
                    Auditor:
                  </span>
                  <span className="text-[10px] font-mono text-muted/80 line-clamp-2">
                    {data.auditor_reasoning}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
