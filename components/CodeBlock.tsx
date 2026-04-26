interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  maxHeightClass?: string;
}

function applyMinimalHighlighting(code: string): string {
  // Very light-touch: wrap keywords and strings with spans for color
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
      '<span class="text-success/80">$&</span>'
    )
    .replace(
      /\b(export|import|function|return|const|let|var|if|else|for|while|class|extends|async|await|new|typeof|instanceof|from|default|true|false|null|undefined|def|assert|pass|raise|with|as|not|and|or|in|is|lambda|yield|global|nonlocal|del)\b/g,
      '<span class="text-accent/90">$&</span>'
    )
    .replace(
      /(\/\/.*$|#.*$)/gm,
      '<span class="text-muted">$&</span>'
    );
}

export default function CodeBlock({
  code,
  language,
  className = "",
  maxHeightClass = "max-h-80",
}: CodeBlockProps) {
  const highlighted = applyMinimalHighlighting(code);

  return (
    <div
      className={`relative border border-border bg-fg/[0.02] ${className}`}
    >
      {language && (
        <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-mono text-muted border-l border-b border-border bg-bg">
          {language}
        </div>
      )}
      <pre
        className={`font-mono text-xs leading-relaxed p-4 overflow-auto ${maxHeightClass} text-fg/90`}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}
