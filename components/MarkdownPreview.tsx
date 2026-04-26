"use client";

// Minimal inline markdown renderer — no external deps.
// Handles: headings, bold, italic, inline code, code blocks, unordered lists, links, line breaks.

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

// Escape HTML special chars for safe rendering
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Process inline markdown within a line (bold, italic, code, links)
function processInline(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    // Inline code: `code`
    .replace(/`([^`]+)`/g, '<code class="font-mono text-xs bg-fg/[0.06] px-1.5 py-0.5 text-fg">$1</code>')
    // Bold: **text** or __text__
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    // Italic: *text* or _text_
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    // Links: [text](url)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:no-underline">$1</a>'
    );
}

function renderMarkdown(content: string): string {
  const lines = content.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inList = false;

  function flushList() {
    if (inList) {
      output.push("</ul>");
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fences
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        flushList();
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        const codeContent = codeLines.map(escapeHtml).join("\n");
        output.push(
          `<pre class="border border-border bg-fg/[0.03] px-4 py-3 overflow-x-auto my-3"><code class="font-mono text-xs text-fg whitespace-pre">${codeContent}</code></pre>`
        );
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headings
    const h3Match = /^### (.+)$/.exec(line);
    const h2Match = /^## (.+)$/.exec(line);
    const h1Match = /^# (.+)$/.exec(line);

    if (h1Match) {
      flushList();
      output.push(`<h1 class="font-display font-bold text-xl text-fg mt-4 mb-2">${processInline(h1Match[1])}</h1>`);
      continue;
    }
    if (h2Match) {
      flushList();
      output.push(`<h2 class="font-display font-bold text-base text-fg mt-4 mb-2">${processInline(h2Match[1])}</h2>`);
      continue;
    }
    if (h3Match) {
      flushList();
      output.push(`<h3 class="font-display font-bold text-sm text-fg mt-3 mb-1">${processInline(h3Match[1])}</h3>`);
      continue;
    }

    // Unordered list items: - or *
    const listMatch = /^[-*] (.+)$/.exec(line);
    if (listMatch) {
      if (!inList) {
        output.push('<ul class="list-disc list-inside space-y-1 my-2 text-sm text-muted">');
        inList = true;
      }
      output.push(`<li>${processInline(listMatch[1])}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      output.push('<div class="h-2" aria-hidden="true" />');
      continue;
    }

    // Regular paragraph line
    flushList();
    output.push(`<p class="text-sm text-muted leading-relaxed">${processInline(line)}</p>`);
  }

  flushList();
  if (inCodeBlock && codeLines.length > 0) {
    const codeContent = codeLines.map(escapeHtml).join("\n");
    output.push(
      `<pre class="border border-border bg-fg/[0.03] px-4 py-3 overflow-x-auto my-3"><code class="font-mono text-xs text-fg whitespace-pre">${codeContent}</code></pre>`
    );
  }

  return output.join("\n");
}

export default function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  if (!content.trim()) return null;

  const html = renderMarkdown(content);

  return (
    <div
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-label="Markdown preview"
    />
  );
}
