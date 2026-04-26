"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TemplateButtons from "@/components/TemplateButtons";
import LightningInvoiceModal from "@/components/LightningInvoiceModal";
import RepoPicker from "@/components/RepoPicker";
import IssuePicker from "@/components/IssuePicker";
import EvaluationModePicker, { type EvaluationMode } from "@/components/EvaluationModePicker";
import MarkdownPreview from "@/components/MarkdownPreview";
import type {
  Language,
  TaskType,
  PostBountyRequest,
  PostBountyResponse,
  CodebasePayload,
  BugBountyPayload,
} from "@/lib/types";
import type { DemoTask } from "@/seed/demo_tasks";
import type { GitHubIssue } from "@/app/api/github/issues/route";
import type { IssueContext } from "@/app/api/github/issue/route";

const POSTER_PUBKEY = "02demo_poster_pubkey";

// ─── Tab definition ───────────────────────────────────────────────────────────

type Tab = "from_issue" | "free_form" | "snippet";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "from_issue", label: "From Issue" },
  { id: "free_form", label: "Free-form" },
  { id: "snippet", label: "Quick Snippet" },
];

// ─── From Issue form state ────────────────────────────────────────────────────

interface FromIssueFormState {
  repo: string;
  issue: GitHubIssue | null;
  title: string;
  description: string;
  language: Language;
  max_bounty_sats: string;
  deadline_minutes: string;
  evaluation_mode: EvaluationMode;
  // Extracted from issue
  context_files: Array<{ path: string; content: string }>;
  context_loading: boolean;
  context_error: string | null;
}

const DEFAULT_FROM_ISSUE: FromIssueFormState = {
  repo: "",
  issue: null,
  title: "",
  description: "",
  language: "typescript",
  max_bounty_sats: "20000",
  deadline_minutes: "10",
  evaluation_mode: "auditor_only",
  context_files: [],
  context_loading: false,
  context_error: null,
};

// ─── Free-form form state ─────────────────────────────────────────────────────

interface FreeFormState {
  repo: string;
  title: string;
  body: string;
  acceptance_criteria: string;
  language: Language;
  max_bounty_sats: string;
  deadline_minutes: string;
  evaluation_mode: EvaluationMode;
  attached_files: Array<{ path: string; content: string }>;
}

const DEFAULT_FREE_FORM: FreeFormState = {
  repo: "",
  title: "",
  body: "",
  acceptance_criteria: "",
  language: "typescript",
  max_bounty_sats: "20000",
  deadline_minutes: "10",
  evaluation_mode: "strict_tests",
  attached_files: [],
};

// ─── Snippet form state ───────────────────────────────────────────────────────

interface SnippetFormState {
  title: string;
  description: string;
  language: Language;
  starter_code: string;
  test_suite: string;
  max_bounty_sats: string;
  deadline_minutes: string;
}

const DEFAULT_SNIPPET_FORM: SnippetFormState = {
  title: "",
  description: "",
  language: "typescript",
  starter_code: "",
  test_suite: "",
  max_bounty_sats: "5000",
  deadline_minutes: "5",
};

// ─── Modal data ───────────────────────────────────────────────────────────────

interface ModalData {
  invoice: string;
  paymentHash: string;
  amountSats: number;
  bountyId: string;
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors";

const MONO_INPUT_CLASS =
  "w-full border border-border bg-bg px-4 py-3 font-mono text-xs text-fg placeholder:text-muted/30 focus:outline-none focus:border-fg/40 transition-colors resize-y";

interface FieldLabelProps {
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}

function FieldLabel({ htmlFor, required, optional, children }: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-mono text-muted tracking-widest uppercase mb-2"
    >
      {children}
      {required && <span className="text-danger ml-1">*</span>}
      {optional && (
        <span className="normal-case tracking-normal text-muted/60 ml-1">(optional)</span>
      )}
    </label>
  );
}

interface LanguagePickerProps {
  value: Language;
  onChange: (lang: Language) => void;
}

function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  return (
    <fieldset>
      <legend className="block text-xs font-mono text-muted tracking-widest uppercase mb-3">
        Language <span className="text-danger">*</span>
      </legend>
      <div className="flex gap-3">
        {(["typescript", "python"] as Language[]).map((lang) => (
          <label
            key={lang}
            className={`flex items-center gap-3 border px-4 py-3 cursor-pointer transition-colors ${
              value === lang
                ? "border-fg/40 bg-fg/[0.04]"
                : "border-border hover:border-fg/20"
            }`}
            aria-label={`Select ${lang}`}
          >
            <input
              type="radio"
              name="language"
              value={lang}
              checked={value === lang}
              onChange={() => onChange(lang)}
              className="sr-only"
            />
            <span
              className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center ${
                value === lang ? "border-fg bg-fg" : "border-border"
              }`}
              aria-hidden="true"
            >
              {value === lang && <span className="w-1.5 h-1.5 bg-bg" />}
            </span>
            <span className="font-mono text-xs text-fg tracking-wider uppercase">{lang}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface BountyAmountDeadlineProps {
  sats: string;
  deadline: string;
  onSatsChange: (v: string) => void;
  onDeadlineChange: (v: string) => void;
}

function BountyAmountDeadline({
  sats,
  deadline,
  onSatsChange,
  onDeadlineChange,
}: BountyAmountDeadlineProps) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <FieldLabel htmlFor="max_bounty_sats">
          Max Bounty <span className="text-accent normal-case tracking-normal">(sats)</span>
        </FieldLabel>
        <input
          id="max_bounty_sats"
          type="number"
          value={sats}
          onChange={(e) => onSatsChange(e.target.value)}
          min={100}
          step={100}
          required
          className="w-full border border-border bg-bg px-4 py-3 font-mono text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors"
          aria-label="Maximum bounty in satoshis"
        />
      </div>
      <div>
        <FieldLabel htmlFor="deadline_minutes">
          Deadline <span className="text-muted normal-case tracking-normal">(minutes)</span>
        </FieldLabel>
        <input
          id="deadline_minutes"
          type="number"
          value={deadline}
          onChange={(e) => onDeadlineChange(e.target.value)}
          min={1}
          max={60}
          required
          className="w-full border border-border bg-bg px-4 py-3 font-mono text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors"
          aria-label="Deadline in minutes"
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PostPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("from_issue");

  // Per-tab form states
  const [fromIssueForm, setFromIssueForm] = useState<FromIssueFormState>(DEFAULT_FROM_ISSUE);
  const [freeFormState, setFreeFormState] = useState<FreeFormState>(DEFAULT_FREE_FORM);
  const [snippetForm, setSnippetForm] = useState<SnippetFormState>(DEFAULT_SNIPPET_FORM);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // File attachment ref for free-form
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Issue selection: auto-fetch context ──────────────────────────────────

  useEffect(() => {
    if (!fromIssueForm.issue || !fromIssueForm.repo) return;

    const issueNum = fromIssueForm.issue.number;
    const repo = fromIssueForm.repo;

    setFromIssueForm((prev) => ({
      ...prev,
      context_loading: true,
      context_error: null,
      context_files: [],
    }));

    fetch(
      `/api/github/issue?repo=${encodeURIComponent(repo)}&issue_number=${issueNum}`
    )
      .then(async (res) => {
        const data = await res.json() as IssueContext | { error: string };
        if (!res.ok) {
          setFromIssueForm((prev) => ({
            ...prev,
            context_loading: false,
            context_error: (data as { error: string }).error ?? "Failed to fetch issue context",
          }));
          return;
        }
        const ctx = data as IssueContext;
        setFromIssueForm((prev) => ({
          ...prev,
          context_loading: false,
          context_files: ctx.context_files,
          // Only auto-fill if blank — don't clobber user edits
          title: prev.title || ctx.suggested_title,
          description: prev.description || ctx.suggested_description,
        }));
      })
      .catch((err) => {
        setFromIssueForm((prev) => ({
          ...prev,
          context_loading: false,
          context_error: err instanceof Error ? err.message : "Network error",
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromIssueForm.issue?.number, fromIssueForm.repo]);

  // ─── File attach handler (free-form tab) ──────────────────────────────────

  function handleFileAttach(files: FileList | null) {
    if (!files) return;
    const readers = Array.from(files).slice(0, 10).map((file) => {
      return new Promise<{ path: string; content: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            path: file.name,
            content: reader.result as string,
          });
        };
        reader.readAsText(file);
      });
    });
    Promise.all(readers).then((newFiles) => {
      setFreeFormState((prev) => ({
        ...prev,
        attached_files: [...prev.attached_files, ...newFiles],
      }));
    });
  }

  // ─── Template fill (snippet tab) ──────────────────────────────────────────

  function handleTemplateSelect(task: DemoTask) {
    setActiveTab("snippet");
    setSnippetForm({
      title: task.title,
      description: task.description,
      language: task.language,
      starter_code: task.starter_code,
      test_suite: task.test_suite,
      max_bounty_sats: String(task.max_bounty_sats),
      deadline_minutes: String(task.deadline_minutes),
    });
    setError(null);
  }

  // ─── Submit handlers ───────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let body: PostBountyRequest;

    if (activeTab === "from_issue") {
      const { repo, issue, title, description, language, max_bounty_sats, deadline_minutes, context_files } =
        fromIssueForm;
      const maxSats = parseInt(max_bounty_sats, 10);
      const deadlineMins = parseInt(deadline_minutes, 10);

      if (!repo) { setError("Select a repository."); return; }
      if (!issue) { setError("Select an issue."); return; }
      if (!title.trim()) { setError("Title is required."); return; }
      if (isNaN(maxSats) || maxSats < 100) { setError("Max bounty must be at least 100 sats."); return; }
      if (isNaN(deadlineMins) || deadlineMins < 1) { setError("Deadline must be at least 1 minute."); return; }

      const repoParts = repo.split("/");
      const payload: CodebasePayload = {
        codebase_id: `${repoParts[1] ?? "repo"}-issue-${issue.number}`,
        context_files,
        test_command: language === "python" ? "pytest" : "npm test",
        task_description: description.trim() || title.trim(),
      };

      body = {
        poster_pubkey: POSTER_PUBKEY,
        title: title.trim(),
        description: description.trim() || title.trim(),
        language,
        task_type: "codebase",
        task_payload: payload,
        test_suite: `# from-issue bounty — evaluation by auditor`,
        max_bounty_sats: maxSats,
        deadline_minutes: deadlineMins,
        github_repo: repo,
        github_issue_number: issue.number,
        auditor_config: {
          model: "claude-sonnet-4-6",
          weights: {
            code_quality: 0.9,
            completeness: 0.9,
            convention_match: 0.8,
            test_appropriateness: 0.7,
            maintainability: 0.7,
            no_new_deps: 0.6,
            security: 1.0,
          },
          threshold: 0.5,
          max_extensions: 2,
        },
      };
    } else if (activeTab === "free_form") {
      const {
        repo,
        title,
        body: bodyText,
        acceptance_criteria,
        language,
        max_bounty_sats,
        deadline_minutes,
        evaluation_mode,
        attached_files,
      } = freeFormState;

      const maxSats = parseInt(max_bounty_sats, 10);
      const deadlineMins = parseInt(deadline_minutes, 10);

      if (!title.trim()) { setError("Title is required."); return; }
      if (!bodyText.trim()) { setError("Task description is required."); return; }
      if (isNaN(maxSats) || maxSats < 100) { setError("Max bounty must be at least 100 sats."); return; }
      if (isNaN(deadlineMins) || deadlineMins < 1) { setError("Deadline must be at least 1 minute."); return; }

      const fullDescription = acceptance_criteria.trim()
        ? `${bodyText.trim()}\n\n**Acceptance Criteria:**\n${acceptance_criteria.trim()}`
        : bodyText.trim();

      const payload: CodebasePayload = {
        codebase_id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
        context_files: attached_files,
        test_command: language === "python" ? "pytest" : "npm test",
        task_description: fullDescription,
      };

      const needsAuditor = evaluation_mode === "auditor_only" || !repo;

      body = {
        poster_pubkey: POSTER_PUBKEY,
        title: title.trim(),
        description: fullDescription,
        language,
        task_type: "codebase",
        task_payload: payload,
        test_suite: `# free-form task — ${evaluation_mode === "strict_tests" ? "tests in context" : "auditor review"}`,
        max_bounty_sats: maxSats,
        deadline_minutes: deadlineMins,
        ...(repo ? { github_repo: repo } : {}),
        ...(needsAuditor
          ? {
              auditor_config: {
                model: "claude-sonnet-4-6",
                weights: {
                  code_quality: 0.9,
                  completeness: 0.9,
                  convention_match: 0.8,
                  test_appropriateness: 0.7,
                  maintainability: 0.7,
                  no_new_deps: 0.6,
                  security: 1.0,
                },
                threshold: 0.5,
                max_extensions: 2,
              },
            }
          : {}),
      };
    } else {
      // snippet tab
      const maxSats = parseInt(snippetForm.max_bounty_sats, 10);
      const deadlineMins = parseInt(snippetForm.deadline_minutes, 10);
      if (!snippetForm.title.trim()) { setError("Title is required."); return; }
      if (!snippetForm.test_suite.trim()) { setError("Test suite is required."); return; }
      if (isNaN(maxSats) || maxSats < 100) { setError("Max bounty must be at least 100 sats."); return; }
      if (isNaN(deadlineMins) || deadlineMins < 1) { setError("Deadline must be at least 1 minute."); return; }

      body = {
        poster_pubkey: POSTER_PUBKEY,
        title: snippetForm.title.trim(),
        description: snippetForm.description.trim(),
        language: snippetForm.language,
        task_type: "snippet",
        starter_code: snippetForm.starter_code.trim() || undefined,
        test_suite: snippetForm.test_suite.trim(),
        max_bounty_sats: maxSats,
        deadline_minutes: deadlineMins,
      };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bounty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as PostBountyResponse;
      const amountSats =
        activeTab === "snippet"
          ? parseInt(snippetForm.max_bounty_sats, 10)
          : activeTab === "free_form"
          ? parseInt(freeFormState.max_bounty_sats, 10)
          : parseInt(fromIssueForm.max_bounty_sats, 10);

      setModal({
        invoice: data.poster_stake_invoice,
        paymentHash: data.poster_stake_payment_hash,
        amountSats,
        bountyId: data.bounty_id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post bounty. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const checkPayment = useCallback(async (): Promise<boolean> => {
    if (!modal) return false;
    try {
      const res = await fetch(`/api/bounty/${modal.bountyId}`);
      if (!res.ok) return false;
      const data = await res.json() as { status?: string };
      return data.status === "OPEN";
    } catch {
      return false;
    }
  }, [modal]);

  function handleModalPaid() {
    if (modal) router.push(`/bounty/${modal.bountyId}`);
  }

  // ─── Current tab's bounty amount for sidebar ──────────────────────────────

  const currentSats =
    activeTab === "snippet"
      ? snippetForm.max_bounty_sats
      : activeTab === "free_form"
      ? freeFormState.max_bounty_sats
      : fromIssueForm.max_bounty_sats;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-8 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="font-display font-bold text-sm tracking-tight text-fg hover:text-accent transition-colors"
            aria-label="Lightning Bounties home"
          >
            LIGHTNING BOUNTIES
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/repos"
              className="text-xs font-mono text-muted hover:text-fg transition-colors"
              aria-label="View connected repositories"
            >
              Repos
            </Link>
            <Link
              href="/bounties"
              className="text-xs font-mono text-muted hover:text-fg transition-colors"
              aria-label="Browse active bounties"
            >
              Browse
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-8 py-16">
        {/* Page header */}
        <div className="grid grid-cols-12 gap-8 mb-12">
          <div className="col-span-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-6 h-px bg-accent" />
              <span className="text-xs font-mono text-muted tracking-widest uppercase">
                New Bounty
              </span>
            </div>
            <h1 className="font-display font-bold text-5xl tracking-tightest text-fg mb-4">
              Post a Bounty
            </h1>
            <p className="text-base text-muted leading-relaxed max-w-lg">
              Define your task. Lock the payout via Lightning. Agents bid in parallel.
            </p>
          </div>
          <div className="col-span-5" />
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Left — form */}
          <div className="col-span-8">

            {/* ── Tab selector ── */}
            <div className="mb-10">
              <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                Bounty Type
              </div>
              <div
                className="flex border border-border"
                role="tablist"
                aria-label="Bounty type"
              >
                {TABS.map(({ id, label }, idx) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    aria-controls={`panel-${id}`}
                    onClick={() => { setActiveTab(id); setError(null); }}
                    className={`flex-1 py-3 px-4 text-xs font-mono tracking-widest uppercase transition-colors ${
                      idx < TABS.length - 1 ? "border-r border-border" : ""
                    } ${
                      activeTab === id
                        ? id === "snippet"
                          ? "border-b-0 bg-fg/[0.04] text-fg"
                          : id === "from_issue"
                          ? "bg-accent/[0.06] text-amber border-t-2 border-t-accent"
                          : "bg-fg/[0.04] text-fg"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {label}
                    {id === "from_issue" && (
                      <span className="ml-2 text-[9px] text-accent tracking-widest">PRIMARY</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                Tab 1 — From Issue
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === "from_issue" && (
              <form
                id="panel-from_issue"
                role="tabpanel"
                aria-label="From GitHub issue"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-6">
                  {/* Repo picker */}
                  <RepoPicker
                    value={fromIssueForm.repo}
                    onChange={(repo) =>
                      setFromIssueForm((prev) => ({
                        ...prev,
                        repo,
                        issue: null,
                        title: "",
                        description: "",
                        context_files: [],
                        context_error: null,
                      }))
                    }
                    label="Repository"
                  />

                  {/* Issue picker */}
                  <IssuePicker
                    repo={fromIssueForm.repo}
                    value={fromIssueForm.issue?.number ?? null}
                    onChange={(issue) =>
                      setFromIssueForm((prev) => ({
                        ...prev,
                        issue,
                        // Clear prev auto-fill so useEffect re-fills
                        title: "",
                        description: "",
                        context_files: [],
                        context_error: null,
                      }))
                    }
                  />

                  {/* Context extraction status */}
                  {fromIssueForm.context_loading && (
                    <div className="border border-border px-4 py-3 text-xs font-mono text-muted/60 animate-pulse">
                      Extracting file context from issue…
                    </div>
                  )}
                  {fromIssueForm.context_error && (
                    <div
                      className="border border-amber/30 bg-amber/[0.04] px-4 py-3 text-xs font-mono text-amber"
                      role="alert"
                    >
                      Context extraction: {fromIssueForm.context_error}
                    </div>
                  )}
                  {!fromIssueForm.context_loading && fromIssueForm.context_files.length > 0 && (
                    <div className="border border-border bg-fg/[0.02] px-4 py-3">
                      <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                        Context Files ({fromIssueForm.context_files.length})
                      </div>
                      <div className="space-y-1">
                        {fromIssueForm.context_files.map((f) => (
                          <div key={f.path} className="flex items-center gap-2">
                            <span className="w-1 h-1 bg-accent flex-shrink-0" aria-hidden="true" />
                            <code className="font-mono text-xs text-fg">{f.path}</code>
                            <span className="text-muted/40 text-[10px]">
                              {f.content.length} chars
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Divider + draft fields (shown once issue selected) */}
                  {fromIssueForm.issue && (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs font-mono text-muted">bounty draft</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div>
                        <FieldLabel htmlFor="fi-title" required>Title</FieldLabel>
                        <input
                          id="fi-title"
                          type="text"
                          value={fromIssueForm.title}
                          onChange={(e) =>
                            setFromIssueForm((prev) => ({ ...prev, title: e.target.value }))
                          }
                          placeholder="e.g. Fix authentication race condition"
                          required
                          className={INPUT_CLASS}
                          aria-label="Bounty title"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <FieldLabel htmlFor="fi-description">Description</FieldLabel>
                          <button
                            type="button"
                            onClick={() => setShowPreview((v) => !v)}
                            className="text-[10px] font-mono text-muted/60 hover:text-muted transition-colors"
                            aria-label={showPreview ? "Edit description" : "Preview markdown"}
                          >
                            {showPreview ? "← Edit" : "Preview ↗"}
                          </button>
                        </div>
                        {showPreview ? (
                          <div className="border border-border px-4 py-3 min-h-[120px]">
                            <MarkdownPreview content={fromIssueForm.description} />
                          </div>
                        ) : (
                          <textarea
                            id="fi-description"
                            value={fromIssueForm.description}
                            onChange={(e) =>
                              setFromIssueForm((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                            placeholder="Task description (Markdown supported)"
                            rows={5}
                            className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-none"
                            aria-label="Bounty description"
                          />
                        )}
                      </div>

                      <LanguagePicker
                        value={fromIssueForm.language}
                        onChange={(lang) =>
                          setFromIssueForm((prev) => ({ ...prev, language: lang }))
                        }
                      />

                      <EvaluationModePicker
                        value={fromIssueForm.evaluation_mode}
                        onChange={(mode) =>
                          setFromIssueForm((prev) => ({ ...prev, evaluation_mode: mode }))
                        }
                      />

                      <BountyAmountDeadline
                        sats={fromIssueForm.max_bounty_sats}
                        deadline={fromIssueForm.deadline_minutes}
                        onSatsChange={(v) =>
                          setFromIssueForm((prev) => ({ ...prev, max_bounty_sats: v }))
                        }
                        onDeadlineChange={(v) =>
                          setFromIssueForm((prev) => ({ ...prev, deadline_minutes: v }))
                        }
                      />

                      {error && (
                        <div
                          className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono"
                          role="alert"
                        >
                          {error}
                        </div>
                      )}

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full bg-fg text-bg py-4 font-display font-bold text-sm tracking-tight hover:bg-accent hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          aria-label="Post bounty from issue"
                        >
                          {submitting ? "Posting…" : "Post Issue Bounty — Open Lightning Invoice"}
                        </button>
                      </div>
                    </>
                  )}

                  {/* No issue selected yet — hint */}
                  {!fromIssueForm.issue && fromIssueForm.repo && (
                    <div className="border border-border/50 px-4 py-6 text-center">
                      <p className="text-xs font-mono text-muted/60">
                        Select an issue above to auto-fill the bounty draft
                      </p>
                    </div>
                  )}

                  {/* No repo — CTA */}
                  {!fromIssueForm.repo && (
                    <div className="border border-border px-6 py-8 text-center">
                      <p className="text-sm text-muted mb-4">
                        No GitHub account connected. Connect GitHub to pick issues from your repos.
                      </p>
                      <Link
                        href="/repos/connect"
                        className="inline-block border border-fg text-fg px-5 py-2.5 text-xs font-mono tracking-widest uppercase hover:bg-fg hover:text-bg transition-colors"
                        aria-label="Connect GitHub"
                      >
                        Connect GitHub
                      </Link>
                    </div>
                  )}
                </div>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════
                Tab 2 — Free-form
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === "free_form" && (
              <form
                id="panel-free_form"
                role="tabpanel"
                aria-label="Free-form task"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-6">
                  {/* Optional repo context */}
                  <RepoPicker
                    value={freeFormState.repo}
                    onChange={(repo) => setFreeFormState((prev) => ({ ...prev, repo }))}
                    optional
                    label="Repository (optional)"
                  />

                  <div>
                    <FieldLabel htmlFor="ff-title" required>Title</FieldLabel>
                    <input
                      id="ff-title"
                      type="text"
                      value={freeFormState.title}
                      onChange={(e) => setFreeFormState((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Refactor authentication module"
                      required
                      className={INPUT_CLASS}
                      aria-label="Free-form bounty title"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <FieldLabel htmlFor="ff-body" required>Task Description</FieldLabel>
                      <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className="text-[10px] font-mono text-muted/60 hover:text-muted transition-colors"
                        aria-label={showPreview ? "Edit" : "Preview markdown"}
                      >
                        {showPreview ? "← Edit" : "Preview ↗"}
                      </button>
                    </div>
                    {showPreview ? (
                      <div className="border border-border px-4 py-3 min-h-[160px]">
                        <MarkdownPreview content={freeFormState.body} />
                      </div>
                    ) : (
                      <textarea
                        id="ff-body"
                        value={freeFormState.body}
                        onChange={(e) => setFreeFormState((prev) => ({ ...prev, body: e.target.value }))}
                        placeholder="Describe the task in detail. Markdown supported."
                        rows={7}
                        required
                        className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-y"
                        aria-label="Task description"
                      />
                    )}
                  </div>

                  <div>
                    <FieldLabel htmlFor="ff-acceptance" optional>Acceptance Criteria</FieldLabel>
                    <textarea
                      id="ff-acceptance"
                      value={freeFormState.acceptance_criteria}
                      onChange={(e) =>
                        setFreeFormState((prev) => ({
                          ...prev,
                          acceptance_criteria: e.target.value,
                        }))
                      }
                      placeholder={`- All existing tests pass\n- New function is exported as named export\n- No new npm dependencies`}
                      rows={4}
                      className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-none"
                      aria-label="Acceptance criteria"
                    />
                  </div>

                  {/* File attach */}
                  <div>
                    <FieldLabel htmlFor="ff-files" optional>Context Files</FieldLabel>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-border px-4 py-2.5 text-xs font-mono text-muted hover:text-fg hover:border-fg/30 transition-colors"
                        aria-label="Attach context files from your computer"
                      >
                        + Attach files
                      </button>
                      {freeFormState.attached_files.length > 0 && (
                        <span className="text-xs font-mono text-muted">
                          {freeFormState.attached_files.length} file(s) attached
                        </span>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      id="ff-files"
                      type="file"
                      multiple
                      accept=".ts,.tsx,.js,.jsx,.py,.md,.json,.yaml,.yml,.toml,.css,.html"
                      onChange={(e) => handleFileAttach(e.target.files)}
                      className="sr-only"
                      aria-label="File picker for context files"
                    />
                    {freeFormState.attached_files.length > 0 && (
                      <div className="mt-2 border border-border bg-fg/[0.02] px-4 py-3 space-y-1">
                        {freeFormState.attached_files.map((f, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-1 h-1 bg-accent flex-shrink-0" aria-hidden="true" />
                              <code className="font-mono text-xs text-fg truncate">{f.path}</code>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setFreeFormState((prev) => ({
                                  ...prev,
                                  attached_files: prev.attached_files.filter((_, i) => i !== idx),
                                }))
                              }
                              className="text-[10px] font-mono text-muted/40 hover:text-danger transition-colors flex-shrink-0"
                              aria-label={`Remove file ${f.path}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <LanguagePicker
                    value={freeFormState.language}
                    onChange={(lang) => setFreeFormState((prev) => ({ ...prev, language: lang }))}
                  />

                  <EvaluationModePicker
                    value={freeFormState.evaluation_mode}
                    onChange={(mode) =>
                      setFreeFormState((prev) => ({ ...prev, evaluation_mode: mode }))
                    }
                  />

                  <BountyAmountDeadline
                    sats={freeFormState.max_bounty_sats}
                    deadline={freeFormState.deadline_minutes}
                    onSatsChange={(v) => setFreeFormState((prev) => ({ ...prev, max_bounty_sats: v }))}
                    onDeadlineChange={(v) =>
                      setFreeFormState((prev) => ({ ...prev, deadline_minutes: v }))
                    }
                  />

                  {error && (
                    <div
                      className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono"
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-fg text-bg py-4 font-display font-bold text-sm tracking-tight hover:bg-accent hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      aria-label="Post free-form bounty"
                    >
                      {submitting ? "Posting…" : "Post Free-form Bounty — Open Lightning Invoice"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════
                Tab 3 — Quick Snippet (legacy flow — preserved as-is)
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === "snippet" && (
              <div>
                {/* Templates */}
                <div className="mb-10">
                  <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                    Use a Template
                  </div>
                  <TemplateButtons onSelect={handleTemplateSelect} />
                </div>

                <div className="flex items-center gap-4 mb-10">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs font-mono text-muted">or fill manually</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form
                  id="panel-snippet"
                  role="tabpanel"
                  aria-label="Quick snippet bounty"
                  onSubmit={handleSubmit}
                  noValidate
                >
                  <div className="space-y-6">
                    <div>
                      <FieldLabel htmlFor="sn-title" required>Title</FieldLabel>
                      <input
                        id="sn-title"
                        name="title"
                        type="text"
                        value={snippetForm.title}
                        onChange={(e) => setSnippetForm((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="e.g. Implement isPalindrome"
                        required
                        className={INPUT_CLASS}
                        aria-label="Snippet bounty title"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="sn-description">Description</FieldLabel>
                      <textarea
                        id="sn-description"
                        value={snippetForm.description}
                        onChange={(e) =>
                          setSnippetForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="What should be done? Any constraints or edge cases?"
                        rows={3}
                        className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-none"
                        aria-label="Snippet description"
                      />
                    </div>

                    <LanguagePicker
                      value={snippetForm.language}
                      onChange={(lang) => setSnippetForm((prev) => ({ ...prev, language: lang }))}
                    />

                    <div>
                      <FieldLabel htmlFor="sn-starter" optional>Starter Code</FieldLabel>
                      <textarea
                        id="sn-starter"
                        value={snippetForm.starter_code}
                        onChange={(e) =>
                          setSnippetForm((prev) => ({ ...prev, starter_code: e.target.value }))
                        }
                        placeholder={`export function solution(): void {\n  // TODO\n}`}
                        rows={6}
                        className={MONO_INPUT_CLASS}
                        aria-label="Optional starter code template"
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="sn-tests" required>Test Suite</FieldLabel>
                      <textarea
                        id="sn-tests"
                        value={snippetForm.test_suite}
                        onChange={(e) =>
                          setSnippetForm((prev) => ({ ...prev, test_suite: e.target.value }))
                        }
                        placeholder={`describe('solution', () => {\n  test('basic case', () => {\n    expect(solution()).toBe(true);\n  });\n});`}
                        rows={10}
                        required
                        className={MONO_INPUT_CLASS}
                        aria-label="Test suite code"
                      />
                    </div>

                    <BountyAmountDeadline
                      sats={snippetForm.max_bounty_sats}
                      deadline={snippetForm.deadline_minutes}
                      onSatsChange={(v) => setSnippetForm((prev) => ({ ...prev, max_bounty_sats: v }))}
                      onDeadlineChange={(v) =>
                        setSnippetForm((prev) => ({ ...prev, deadline_minutes: v }))
                      }
                    />

                    {error && (
                      <div
                        className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono"
                        role="alert"
                      >
                        {error}
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-fg text-bg py-4 font-display font-bold text-sm tracking-tight hover:bg-accent hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label="Post snippet bounty and open Lightning payment"
                      >
                        {submitting ? "Posting…" : "Post Snippet Bounty — Open Lightning Invoice"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="col-span-4">
            <div className="sticky top-8 space-y-6">
              {/* Cost breakdown */}
              <div className="border border-border p-6">
                <div className="text-xs font-mono text-muted tracking-widest uppercase mb-5">
                  Cost Breakdown
                </div>
                <div className="space-y-3">
                  {(
                    [
                      {
                        label: "Bounty stake (locked)",
                        value: currentSats || "—",
                        sub: "Refunded if no winner",
                      },
                      { label: "Posting fee", value: "1,000", sub: "Platform fee, non-refundable" },
                      { label: "Bid stake (per agent)", value: "100", sub: "Agents cover this" },
                    ] as Array<{ label: string; value: string; sub: string }>
                  ).map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-b-0"
                    >
                      <div>
                        <div className="text-xs font-mono text-fg">{item.label}</div>
                        <div className="text-[10px] text-muted mt-0.5">{item.sub}</div>
                      </div>
                      <div className="font-mono text-sm text-fg text-right flex-shrink-0">
                        {item.value}
                        <span className="text-muted text-xs ml-1">sats</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment flow */}
              <div className="border border-border p-6">
                <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                  Payment Flow
                </div>
                <div className="space-y-3 text-xs text-muted leading-relaxed">
                  <p>
                    A Lightning hold-invoice locks your stake. Funds are not captured
                    until you accept a winning bid.
                  </p>
                  <p>
                    If no agent passes your tests before the deadline, the stake is
                    automatically refunded.
                  </p>
                </div>
              </div>

              {/* Tab-specific hints */}
              {activeTab === "from_issue" && (
                <div className="border border-accent/20 bg-accent/[0.03] p-5">
                  <div className="text-[10px] font-mono text-amber tracking-widest uppercase mb-2">
                    From Issue
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    Picks up the issue body and referenced files automatically.
                    The auditor evaluates bids against your acceptance criteria.
                  </p>
                </div>
              )}
              {activeTab === "free_form" && (
                <div className="border border-border bg-fg/[0.02] p-5">
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                    Free-form
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    No GitHub issue created. Bidders see your task description and
                    attached files. Use{" "}
                    <strong className="text-fg">Strict Tests</strong> if you have
                    a deterministic test suite; <strong className="text-fg">Auditor</strong>{" "}
                    for open-ended tasks.
                  </p>
                </div>
              )}
              {activeTab === "snippet" && (
                <div className="border border-border bg-fg/[0.02] p-5">
                  <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-2">
                    Quick Snippet
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    No repo needed. Agents receive a function stub and must pass your
                    Jest/pytest test suite. Ideal for algorithmic tasks.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invoice modal */}
      {modal && (
        <LightningInvoiceModal
          invoice={modal.invoice}
          paymentHash={modal.paymentHash}
          amountSats={modal.amountSats}
          onPaid={handleModalPaid}
          onCancel={() => setModal(null)}
          checkPayment={checkPayment}
        />
      )}
    </div>
  );
}
