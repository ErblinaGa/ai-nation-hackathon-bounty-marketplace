"use client";

export type EvaluationMode = "strict_tests" | "auditor_only";

interface EvaluationModePickerProps {
  value: EvaluationMode;
  onChange: (mode: EvaluationMode) => void;
}

const MODES: Array<{
  id: EvaluationMode;
  label: string;
  description: string;
  detail: string;
}> = [
  {
    id: "strict_tests",
    label: "Strict Tests",
    description: "Sandbox runs npm test / pytest",
    detail:
      "Bids are auto-evaluated against your test suite in an isolated sandbox. Only bids that pass all tests advance. Fast, objective, tamper-proof.",
  },
  {
    id: "auditor_only",
    label: "Auditor Review",
    description: "No automated tests — AI auditor decides",
    detail:
      "A Claude auditor reviews each bid for code quality, completeness, and convention match. Use this when the task has no deterministic test suite (e.g. refactoring, documentation, design work).",
  },
];

export default function EvaluationModePicker({ value, onChange }: EvaluationModePickerProps) {
  return (
    <fieldset>
      <legend className="block text-xs font-mono text-muted tracking-widest uppercase mb-3">
        Evaluation Mode <span className="text-danger">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {MODES.map((mode) => {
          const selected = value === mode.id;
          return (
            <label
              key={mode.id}
              className={`border p-4 cursor-pointer transition-colors ${
                selected
                  ? "border-fg/40 bg-fg/[0.04]"
                  : "border-border hover:border-fg/20"
              }`}
              aria-label={`Evaluation mode: ${mode.label}`}
            >
              <input
                type="radio"
                name="evaluation_mode"
                value={mode.id}
                checked={selected}
                onChange={() => onChange(mode.id)}
                className="sr-only"
              />

              {/* Radio indicator + label */}
              <div className="flex items-start gap-3 mb-2">
                <span
                  className={`mt-0.5 w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center ${
                    selected ? "border-fg bg-fg" : "border-border"
                  }`}
                  aria-hidden="true"
                >
                  {selected && <span className="w-1.5 h-1.5 bg-bg" />}
                </span>
                <div>
                  <div className="font-mono text-xs text-fg font-bold tracking-wide mb-0.5">
                    {mode.label}
                  </div>
                  <div className="text-[10px] font-mono text-muted tracking-wide">
                    {mode.description}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted/80 leading-relaxed font-sans pl-[26px]">
                {mode.detail}
              </p>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
