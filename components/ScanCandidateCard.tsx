"use client";

import { useState } from "react";

export type ScanSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface ScanCandidateCardProps {
  candidate: {
    id: string;
    title: string;
    body: string;
    severity: ScanSeverity;
    files_affected: string[];
    estimated_loc: number;
    suggested_sats: number;
    status: string;
  };
  index: number;
  selected: boolean;
  onToggle: (id: string) => void;
  onTitleChange: (id: string, title: string) => void;
  onSatsChange: (id: string, sats: number) => void;
}

const SEVERITY_STYLES: Record<ScanSeverity, string> = {
  HIGH: "bg-[#ff4500] text-white",
  MEDIUM: "bg-[#f59e0b] text-black",
  LOW: "bg-[#6b7280] text-white",
};

export default function ScanCandidateCard({
  candidate,
  index,
  selected,
  onToggle,
  onTitleChange,
  onSatsChange,
}: ScanCandidateCardProps) {
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(candidate.title);
  const [satsDraft, setSatsDraft] = useState(String(candidate.suggested_sats));

  const isApplied = candidate.status === "APPLIED";

  function handleTitleBlur() {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== candidate.title) {
      onTitleChange(candidate.id, titleDraft.trim());
    }
  }

  function handleSatsBlur() {
    const parsed = parseInt(satsDraft, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed !== candidate.suggested_sats) {
      onSatsChange(candidate.id, parsed);
    }
  }

  // Truncate body preview
  const bodyLines = candidate.body.split("\n").filter((l) => l.trim());
  const bodyPreview = bodyLines.slice(0, 3).join(" ").slice(0, 180);
  const hasMoreBody = candidate.body.length > bodyPreview.length + 10;

  return (
    <article
      className={`border transition-colors ${
        isApplied
          ? "border-border bg-fg/[0.01] opacity-60"
          : selected
          ? "border-fg bg-fg/[0.03]"
          : "border-border bg-bg hover:border-fg/40"
      }`}
      aria-label={`Candidate ${index + 1}: ${candidate.title}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-4 px-5 py-4 border-b border-border">
        {/* Checkbox */}
        <div className="flex items-center pt-0.5">
          <input
            type="checkbox"
            id={`check-${candidate.id}`}
            checked={selected}
            disabled={isApplied}
            onChange={() => onToggle(candidate.id)}
            className="w-4 h-4 accent-fg cursor-pointer disabled:cursor-not-allowed"
            aria-label={`Select candidate ${index + 1}`}
          />
        </div>

        {/* Index */}
        <span className="font-mono text-xs text-muted pt-0.5 select-none w-4">
          {index + 1}
        </span>

        {/* Severity badge */}
        <span
          className={`font-mono text-[10px] font-bold tracking-widest px-2 py-0.5 shrink-0 ${SEVERITY_STYLES[candidate.severity]}`}
          aria-label={`Severity: ${candidate.severity}`}
        >
          {candidate.severity}
        </span>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleBlur();
                if (e.key === "Escape") {
                  setTitleDraft(candidate.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
              className="w-full font-mono text-sm text-fg bg-transparent border-b border-fg/40 focus:outline-none focus:border-fg"
              aria-label="Edit title"
            />
          ) : (
            <button
              type="button"
              onClick={() => !isApplied && setEditingTitle(true)}
              className={`text-left font-mono text-sm text-fg leading-snug w-full ${
                isApplied ? "cursor-default" : "cursor-text hover:text-accent"
              }`}
              title={isApplied ? "Already filed" : "Click to edit title"}
              aria-label={`Title: ${candidate.title}. ${isApplied ? "Applied." : "Click to edit."}`}
            >
              {candidate.title}
            </button>
          )}
        </div>

        {/* Sats */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            value={satsDraft}
            min={100}
            step={1000}
            onChange={(e) => setSatsDraft(e.target.value)}
            onBlur={handleSatsBlur}
            disabled={isApplied}
            className="w-20 font-mono text-xs text-accent text-right bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none disabled:opacity-50"
            aria-label="Suggested sats"
          />
          <span className="font-mono text-[10px] text-muted">sat</span>
        </div>

        {/* Applied badge */}
        {isApplied && (
          <span className="font-mono text-[10px] text-muted border border-muted/30 px-2 py-0.5 shrink-0">
            APPLIED
          </span>
        )}
      </div>

      {/* Body + meta */}
      <div className="px-5 py-3">
        {/* Body preview */}
        <div className="mb-3">
          <p className="text-xs text-muted/80 leading-relaxed font-mono">
            {bodyExpanded ? candidate.body.slice(0, 800) : bodyPreview}
            {!bodyExpanded && hasMoreBody && "…"}
          </p>
          {hasMoreBody && (
            <button
              type="button"
              onClick={() => setBodyExpanded((v) => !v)}
              className="mt-1 text-[10px] font-mono text-muted/50 hover:text-muted underline"
              aria-expanded={bodyExpanded}
              aria-label={bodyExpanded ? "Collapse body" : "Expand body"}
            >
              {bodyExpanded ? "collapse" : "expand"}
            </button>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted/60">
          {candidate.estimated_loc > 0 && (
            <span>~{candidate.estimated_loc} loc</span>
          )}
          {candidate.files_affected.length > 0 && (
            <span className="truncate max-w-xs" title={candidate.files_affected.join(", ")}>
              {candidate.files_affected.slice(0, 2).join(", ")}
              {candidate.files_affected.length > 2 &&
                ` +${candidate.files_affected.length - 2} more`}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
