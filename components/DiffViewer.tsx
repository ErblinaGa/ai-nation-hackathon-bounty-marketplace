"use client";

import { useState } from "react";

interface DiffViewerProps {
  diff: string;
  className?: string;
}

type LineType = "header" | "hunk" | "add" | "del" | "context";

interface DiffLine {
  type: LineType;
  content: string;
}

interface DiffFile {
  header: string;
  lines: DiffLine[];
}

function parseDiff(raw: string): DiffFile[] {
  const lines = raw.split("\n");
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("--- ")) {
      // Start of a new file diff — peek at next line for +++ header
      const nextLine = lines[i + 1] ?? "";
      if (nextLine.startsWith("+++ ")) {
        const fromPath = line.slice(4).trim();
        const toPath = nextLine.slice(4).trim();
        const header =
          fromPath === "/dev/null" ? toPath : toPath === "/dev/null" ? fromPath : toPath;
        current = { header, lines: [] };
        files.push(current);
        i++; // skip the +++ line
      }
      continue;
    }

    if (!current) continue;

    if (line.startsWith("+++ ")) continue; // already consumed

    if (line.startsWith("@@ ")) {
      current.lines.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      current.lines.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      current.lines.push({ type: "del", content: line.slice(1) });
    } else if (line === "\\ No newline at end of file") {
      // ignore
    } else {
      // context line — may start with a space
      current.lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line });
    }
  }

  return files;
}

function lineStyle(type: LineType): string {
  switch (type) {
    case "add":
      return "bg-[#E6F4EA] text-[#1F5A2E]";
    case "del":
      return "bg-[#FCE8E8] text-[#9F2424]";
    case "hunk":
      return "bg-fg/[0.04] text-muted italic";
    case "header":
      return "bg-fg/[0.06] text-fg font-semibold";
    default:
      return "text-fg/80";
  }
}

function linePrefix(type: LineType): string {
  switch (type) {
    case "add":
      return "+";
    case "del":
      return "-";
    case "hunk":
      return "";
    default:
      return " ";
  }
}

interface FileBlockProps {
  file: DiffFile;
}

function FileBlock({ file }: FileBlockProps) {
  const [open, setOpen] = useState(true);
  const addCount = file.lines.filter((l) => l.type === "add").length;
  const delCount = file.lines.filter((l) => l.type === "del").length;

  return (
    <div className="border border-border">
      {/* File header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-fg/[0.03] hover:bg-fg/[0.05] transition-colors text-left"
        aria-expanded={open}
        aria-label={`Toggle diff for ${file.header}`}
      >
        <span className="font-mono text-xs text-fg tracking-tight">{file.header}</span>
        <div className="flex items-center gap-3">
          {addCount > 0 && (
            <span className="font-mono text-[10px] text-[#1F5A2E]">+{addCount}</span>
          )}
          {delCount > 0 && (
            <span className="font-mono text-[10px] text-[#9F2424]">-{delCount}</span>
          )}
          <span
            className={`w-3 h-3 border border-current flex items-center justify-center text-muted transition-transform ${open ? "rotate-45" : ""}`}
            aria-hidden="true"
          >
            <span className="text-[9px] leading-none">+</span>
          </span>
        </div>
      </button>

      {/* Diff lines */}
      {open && (
        <div className="overflow-x-auto">
          <pre className="font-mono text-xs leading-5 text-fg/90">
            {file.lines.map((line, idx) => (
              <div
                key={idx}
                className={`flex min-w-0 ${lineStyle(line.type)}`}
              >
                <span
                  className="w-5 flex-shrink-0 select-none text-center opacity-50"
                  aria-hidden="true"
                >
                  {linePrefix(line.type)}
                </span>
                <span className="flex-1 px-3 py-0 whitespace-pre">
                  {line.type === "hunk" ? line.content : line.content}
                </span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function DiffViewer({ diff, className = "" }: DiffViewerProps) {
  const files = parseDiff(diff);

  if (files.length === 0) {
    return (
      <div
        className={`border border-border px-4 py-3 text-xs font-mono text-muted ${className}`}
      >
        No diff content
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {files.map((file, i) => (
        <FileBlock key={i} file={file} />
      ))}
    </div>
  );
}
