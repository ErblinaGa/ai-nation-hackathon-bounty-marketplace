"use client";

import { useState } from "react";
import CodeBlock from "./CodeBlock";
import type { CodebasePayload } from "@/lib/types";

interface CodebaseContextViewProps {
  payload: CodebasePayload;
}

interface FileEntryProps {
  path: string;
  content: string;
}

function FileEntry({ path, content }: FileEntryProps) {
  const [open, setOpen] = useState(false);
  const lineCount = content.split("\n").length;
  const ext = path.split(".").pop() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
  };
  const lang = langMap[ext] ?? ext;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-fg/[0.025] transition-colors text-left"
        aria-expanded={open}
        aria-label={`Toggle file: ${path}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Expand indicator */}
          <span
            className={`w-3 h-3 border border-current flex items-center justify-center text-muted flex-shrink-0 transition-transform ${open ? "rotate-45" : ""}`}
            aria-hidden="true"
          >
            <span className="text-[8px] leading-none">+</span>
          </span>
          {/* File path */}
          <span className="font-mono text-xs text-fg tracking-tight truncate">
            {path}
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted/60 flex-shrink-0 ml-4">
          {lineCount} lines
        </span>
      </button>

      {open && (
        <div className="border-t border-border">
          <CodeBlock
            code={content}
            language={lang}
            maxHeightClass="max-h-64"
          />
        </div>
      )}
    </div>
  );
}

export default function CodebaseContextView({ payload }: CodebaseContextViewProps) {
  const totalLines = payload.context_files.reduce(
    (sum, f) => sum + f.content.split("\n").length,
    0
  );

  return (
    <div className="border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-fg/[0.02] border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
            Codebase Context
          </span>
          <span className="font-mono text-xs text-fg">
            {payload.context_files.length} files
          </span>
          <span className="text-muted/40">·</span>
          <span className="font-mono text-xs text-muted">
            {totalLines.toLocaleString()} lines
          </span>
        </div>

        {/* Test command pill */}
        <div
          className="flex items-center gap-2 border border-border px-3 py-1 bg-bg"
          title="Test command"
        >
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
            cmd:
          </span>
          <span className="font-mono text-xs text-fg">
            {payload.test_command}
          </span>
        </div>
      </div>

      {/* Task description if present */}
      {payload.task_description && (
        <div className="px-4 py-3 border-b border-border">
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase block mb-1">
            Task
          </span>
          <p className="text-sm text-fg leading-relaxed">{payload.task_description}</p>
        </div>
      )}

      {/* File tree */}
      <div>
        {payload.context_files.map((file) => (
          <FileEntry key={file.path} path={file.path} content={file.content} />
        ))}
      </div>
    </div>
  );
}
