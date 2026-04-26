import CodeBlock from "./CodeBlock";
import type { BugBountyPayload } from "@/lib/types";

interface BugBountyTargetViewProps {
  payload: BugBountyPayload;
}

export default function BugBountyTargetView({ payload }: BugBountyTargetViewProps) {
  return (
    <div className="space-y-5">
      {/* Symptom — danger-colored alert */}
      <div
        className="border border-danger/30 bg-danger/[0.04] px-5 py-4"
        role="alert"
        aria-label="Bug symptom"
      >
        <div className="flex items-start gap-3">
          {/* Structural accent bar */}
          <div className="w-0.5 bg-danger/50 flex-shrink-0 self-stretch" aria-hidden="true" />
          <div>
            <div className="text-[10px] font-mono text-danger/70 tracking-widest uppercase mb-1.5">
              Symptom
            </div>
            <p className="text-sm text-danger leading-relaxed">
              {payload.symptom}
            </p>
          </div>
        </div>
      </div>

      {/* Failing input example */}
      {payload.failing_input_example && (
        <div className="border border-border">
          <div className="px-4 py-2 bg-fg/[0.02] border-b border-border">
            <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
              Failing Input Example
            </span>
          </div>
          <pre
            className="font-mono text-xs text-fg/90 px-4 py-3 overflow-x-auto leading-relaxed"
            aria-label="Failing input example"
          >
            {payload.failing_input_example}
          </pre>
        </div>
      )}

      {/* Target code */}
      <div>
        <div className="flex items-center gap-3 mb-2.5">
          <span className="text-[10px] font-mono text-muted tracking-widest uppercase">
            Target Code
          </span>
          <span className="text-[10px] font-mono text-muted/60">
            — {payload.language}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <CodeBlock
          code={payload.target_code}
          language={payload.language}
          maxHeightClass="max-h-96"
        />
      </div>

      {/* Hidden tests notice */}
      <div className="border border-border px-4 py-3 flex items-center gap-3 bg-fg/[0.015]">
        <div className="w-4 h-4 border border-muted/40 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <span className="text-[9px] font-mono text-muted">?</span>
        </div>
        <span className="text-xs font-mono text-muted">
          Hidden test suite — revealed only after settlement
        </span>
      </div>
    </div>
  );
}
