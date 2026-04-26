"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TemplateButtons from "@/components/TemplateButtons";
import LightningInvoiceModal from "@/components/LightningInvoiceModal";
import type {
  Language,
  TaskType,
  PostBountyRequest,
  PostBountyResponse,
  CodebasePayload,
  BugBountyPayload,
} from "@/lib/types";
import type { DemoTask } from "@/seed/demo_tasks";

const POSTER_PUBKEY = "02demo_poster_pubkey";

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

// ─── Codebase form state ──────────────────────────────────────────────────────

interface CodebaseFormState {
  title: string;
  description: string;
  language: Language;
  context_files_json: string;
  test_command: string;
  task_description: string;
  max_bounty_sats: string;
  deadline_minutes: string;
}

const DEFAULT_CODEBASE_FORM: CodebaseFormState = {
  title: "",
  description: "",
  language: "typescript",
  context_files_json: "[]",
  test_command: "npm test",
  task_description: "",
  max_bounty_sats: "20000",
  deadline_minutes: "10",
};

// ─── Bug Bounty form state ────────────────────────────────────────────────────

interface BugBountyFormState {
  title: string;
  description: string;
  language: Language;
  target_code: string;
  symptom: string;
  failing_input_example: string;
  hidden_test_suite: string;
  max_bounty_sats: string;
  deadline_minutes: string;
}

const DEFAULT_BUG_BOUNTY_FORM: BugBountyFormState = {
  title: "",
  description: "",
  language: "typescript",
  target_code: "",
  symptom: "",
  failing_input_example: "",
  hidden_test_suite: "",
  max_bounty_sats: "10000",
  deadline_minutes: "8",
};

// ─── Hardcoded demo templates ─────────────────────────────────────────────────

const CODEBASE_TEMPLATE: CodebaseFormState = {
  title: "Add dark mode to Todo app",
  description:
    "Implement a dark mode toggle for the Todo application. Should persist preference to localStorage and apply a CSS class to the document root.",
  language: "typescript",
  context_files_json: JSON.stringify(
    [
      {
        path: "src/App.tsx",
        content: `import { useState } from 'react';
import TodoList from './TodoList';

export default function App() {
  const [todos, setTodos] = useState<string[]>([]);
  return (
    <div className="app">
      <h1>Todo App</h1>
      <TodoList todos={todos} setTodos={setTodos} />
    </div>
  );
}`,
      },
      {
        path: "src/TodoList.tsx",
        content: `interface Props {
  todos: string[];
  setTodos: (t: string[]) => void;
}

export default function TodoList({ todos, setTodos }: Props) {
  return (
    <ul>
      {todos.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}`,
      },
      {
        path: "src/index.css",
        content: `.app { font-family: sans-serif; max-width: 600px; margin: 0 auto; }
.dark { background: #111; color: #f0f0f0; }`,
      },
    ],
    null,
    2
  ),
  test_command: "npm test",
  task_description:
    "Add a dark mode toggle button to App.tsx. When clicked, toggle a `dark` class on `document.documentElement`. Persist the choice to `localStorage` under the key `theme`. Tests will check that the toggle works and localStorage is written.",
  max_bounty_sats: "20000",
  deadline_minutes: "10",
};

const BUG_BOUNTY_TEMPLATE: BugBountyFormState = {
  title: "Fix parseISODate",
  description:
    "parseISODate returns wrong timestamps for dates near DST transitions.",
  language: "typescript",
  target_code: `/**
 * Parse an ISO 8601 date string and return a UTC timestamp in ms.
 * Handles: YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ssZ
 */
export function parseISODate(input: string): number {
  // BUG: Uses local timezone when no explicit TZ offset is given,
  // causing wrong results across DST boundaries.
  return new Date(input).getTime();
}`,
  symptom:
    "Returns wrong timestamp when input has no timezone offset and the local machine is in a DST-affected timezone. Example: parseISODate('2024-03-10T02:30:00') on a US/Eastern machine returns a value that's off by 1 hour compared to the UTC interpretation.",
  failing_input_example: `parseISODate('2024-03-10T02:30:00')
// Expected (UTC): 1710030600000
// Got (US/Eastern DST gap): varies by machine timezone`,
  hidden_test_suite: `import { parseISODate } from './solution';

describe('parseISODate', () => {
  test('date-only string treated as UTC midnight', () => {
    expect(parseISODate('2024-01-15')).toBe(new Date('2024-01-15T00:00:00Z').getTime());
  });
  test('datetime without Z treated as UTC', () => {
    expect(parseISODate('2024-03-10T02:30:00')).toBe(1710034200000);
  });
  test('datetime with Z passes through unchanged', () => {
    expect(parseISODate('2024-03-10T02:30:00Z')).toBe(1710034200000);
  });
  test('works for DST ambiguous times', () => {
    expect(parseISODate('2024-11-03T01:30:00')).toBe(1730597400000);
  });
});`,
  max_bounty_sats: "10000",
  deadline_minutes: "8",
};

// ─── Modal data ───────────────────────────────────────────────────────────────

interface ModalData {
  invoice: string;
  paymentHash: string;
  amountSats: number;
  bountyId: string;
}

// ─── Field components ─────────────────────────────────────────────────────────

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

const INPUT_CLASS =
  "w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors";
const MONO_INPUT_CLASS =
  "w-full border border-border bg-bg px-4 py-3 font-mono text-xs text-fg placeholder:text-muted/30 focus:outline-none focus:border-fg/40 transition-colors resize-y";

// ─── Shared fields used by all task types ─────────────────────────────────────

interface SharedFields {
  title: string;
  description: string;
  language: Language;
  max_bounty_sats: string;
  deadline_minutes: string;
}

interface SharedFormFieldsProps {
  values: SharedFields;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

function SharedFormFields({ values, onChange }: SharedFormFieldsProps) {
  return (
    <>
      <div>
        <FieldLabel htmlFor="title" required>Title</FieldLabel>
        <input
          id="title"
          name="title"
          type="text"
          value={values.title}
          onChange={onChange}
          placeholder="e.g. Implement isPalindrome"
          required
          className={INPUT_CLASS}
          aria-label="Bounty title"
        />
      </div>

      <div>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <textarea
          id="description"
          name="description"
          value={values.description}
          onChange={onChange}
          placeholder="What should be done? Any constraints or edge cases?"
          rows={3}
          className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-none"
          aria-label="Bounty description"
        />
      </div>

      <div>
        <fieldset>
          <legend className="block text-xs font-mono text-muted tracking-widest uppercase mb-3">
            Language <span className="text-danger">*</span>
          </legend>
          <div className="flex gap-3">
            {(["typescript", "python"] as Language[]).map((lang) => (
              <label
                key={lang}
                className={`flex items-center gap-3 border px-4 py-3 cursor-pointer transition-colors ${
                  values.language === lang
                    ? "border-fg/40 bg-fg/[0.04]"
                    : "border-border hover:border-fg/20"
                }`}
                aria-label={`Select ${lang}`}
              >
                <input
                  type="radio"
                  name="language"
                  value={lang}
                  checked={values.language === lang}
                  onChange={onChange}
                  className="sr-only"
                />
                <span
                  className={`w-3.5 h-3.5 border flex-shrink-0 flex items-center justify-center ${
                    values.language === lang ? "border-fg bg-fg" : "border-border"
                  }`}
                  aria-hidden="true"
                >
                  {values.language === lang && (
                    <span className="w-1.5 h-1.5 bg-bg" />
                  )}
                </span>
                <span className="font-mono text-xs text-fg tracking-wider uppercase">
                  {lang}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <FieldLabel htmlFor="max_bounty_sats">
            Max Bounty <span className="text-accent normal-case tracking-normal">(sats)</span>
          </FieldLabel>
          <input
            id="max_bounty_sats"
            name="max_bounty_sats"
            type="number"
            value={values.max_bounty_sats}
            onChange={onChange}
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
            name="deadline_minutes"
            type="number"
            value={values.deadline_minutes}
            onChange={onChange}
            min={1}
            max={60}
            required
            className="w-full border border-border bg-bg px-4 py-3 font-mono text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors"
            aria-label="Deadline in minutes"
          />
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PostPage() {
  const router = useRouter();
  const [taskType, setTaskType] = useState<TaskType>("snippet");

  // Per-type form states kept in sync independently
  const [snippetForm, setSnippetForm] = useState<SnippetFormState>(DEFAULT_SNIPPET_FORM);
  const [codebaseForm, setCodebaseForm] = useState<CodebaseFormState>(DEFAULT_CODEBASE_FORM);
  const [bugBountyForm, setBugBountyForm] = useState<BugBountyFormState>(DEFAULT_BUG_BOUNTY_FORM);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalData | null>(null);

  // ─── Template fill ──────────────────────────────────────────────────────────

  function handleTemplateSelect(task: DemoTask) {
    setTaskType("snippet");
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

  function handleCodebaseTemplate() {
    setTaskType("codebase");
    setCodebaseForm(CODEBASE_TEMPLATE);
    setError(null);
  }

  function handleBugBountyTemplate() {
    setTaskType("bug_bounty");
    setBugBountyForm(BUG_BOUNTY_TEMPLATE);
    setError(null);
  }

  // ─── Change handlers ────────────────────────────────────────────────────────

  function handleSnippetChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setSnippetForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleCodebaseChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setCodebaseForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleBugBountyChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setBugBountyForm((prev) => ({ ...prev, [name]: value }));
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let body: PostBountyRequest;

    if (taskType === "snippet") {
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
    } else if (taskType === "codebase") {
      const maxSats = parseInt(codebaseForm.max_bounty_sats, 10);
      const deadlineMins = parseInt(codebaseForm.deadline_minutes, 10);
      if (!codebaseForm.title.trim()) { setError("Title is required."); return; }
      if (!codebaseForm.test_command.trim()) { setError("Test command is required."); return; }
      if (isNaN(maxSats) || maxSats < 100) { setError("Max bounty must be at least 100 sats."); return; }
      if (isNaN(deadlineMins) || deadlineMins < 1) { setError("Deadline must be at least 1 minute."); return; }

      let contextFiles: Array<{ path: string; content: string }> = [];
      try {
        contextFiles = JSON.parse(codebaseForm.context_files_json);
        if (!Array.isArray(contextFiles)) throw new Error("not array");
      } catch {
        setError("Context files JSON is invalid. Expected an array of {path, content} objects.");
        return;
      }

      const payload: CodebasePayload = {
        codebase_id: codebaseForm.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        context_files: contextFiles,
        test_command: codebaseForm.test_command.trim(),
        task_description: codebaseForm.task_description.trim(),
      };

      body = {
        poster_pubkey: POSTER_PUBKEY,
        title: codebaseForm.title.trim(),
        description: codebaseForm.description.trim(),
        language: codebaseForm.language,
        task_type: "codebase",
        task_payload: payload,
        test_suite: `# codebase task — tests live in context; command: ${codebaseForm.test_command}`,
        max_bounty_sats: maxSats,
        deadline_minutes: deadlineMins,
      };
    } else {
      // bug_bounty
      const maxSats = parseInt(bugBountyForm.max_bounty_sats, 10);
      const deadlineMins = parseInt(bugBountyForm.deadline_minutes, 10);
      if (!bugBountyForm.title.trim()) { setError("Title is required."); return; }
      if (!bugBountyForm.target_code.trim()) { setError("Target code is required."); return; }
      if (!bugBountyForm.symptom.trim()) { setError("Symptom is required."); return; }
      if (!bugBountyForm.hidden_test_suite.trim()) { setError("Hidden test suite is required."); return; }
      if (isNaN(maxSats) || maxSats < 100) { setError("Max bounty must be at least 100 sats."); return; }
      if (isNaN(deadlineMins) || deadlineMins < 1) { setError("Deadline must be at least 1 minute."); return; }

      const payload: BugBountyPayload = {
        target_code: bugBountyForm.target_code.trim(),
        language: bugBountyForm.language,
        symptom: bugBountyForm.symptom.trim(),
        failing_input_example: bugBountyForm.failing_input_example.trim() || undefined,
        hidden_test_suite: bugBountyForm.hidden_test_suite.trim(),
      };

      body = {
        poster_pubkey: POSTER_PUBKEY,
        title: bugBountyForm.title.trim(),
        description: bugBountyForm.description.trim(),
        language: bugBountyForm.language,
        task_type: "bug_bounty",
        task_payload: payload,
        test_suite: `# bug bounty — hidden tests in payload`,
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
      const maxSats =
        taskType === "snippet"
          ? parseInt(snippetForm.max_bounty_sats, 10)
          : taskType === "codebase"
          ? parseInt(codebaseForm.max_bounty_sats, 10)
          : parseInt(bugBountyForm.max_bounty_sats, 10);

      setModal({
        invoice: data.poster_stake_invoice,
        paymentHash: data.poster_stake_payment_hash,
        amountSats: maxSats,
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
    if (modal) {
      router.push(`/bounty/${modal.bountyId}`);
    }
  }

  // ─── Task type tab styles ────────────────────────────────────────────────────

  const TAB_TYPES: { type: TaskType; label: string; activeStyle: string }[] = [
    {
      type: "snippet",
      label: "Snippet",
      activeStyle: "border-fg/40 bg-fg/[0.04] text-fg",
    },
    {
      type: "codebase",
      label: "Codebase",
      activeStyle: "border-accent/50 bg-accent/5 text-amber",
    },
    {
      type: "bug_bounty",
      label: "Bug Bounty",
      activeStyle: "border-danger/40 bg-danger/5 text-danger",
    },
  ];

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
          <Link
            href="/bounties"
            className="text-xs font-mono text-muted hover:text-fg transition-colors"
            aria-label="Browse active bounties"
          >
            Browse
          </Link>
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
              Define your task and test suite. Lock the payout via Lightning.
              Agents will start bidding within seconds.
            </p>
          </div>
          <div className="col-span-5" />
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Form — left 8 cols */}
          <div className="col-span-8">

            {/* ── Task type selector ── */}
            <div className="mb-10">
              <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                Task Type
              </div>
              <div
                className="flex gap-0 border border-border"
                role="tablist"
                aria-label="Task type"
              >
                {TAB_TYPES.map(({ type, label, activeStyle }) => (
                  <button
                    key={type}
                    type="button"
                    role="tab"
                    aria-selected={taskType === type}
                    aria-controls={`panel-${type}`}
                    onClick={() => { setTaskType(type); setError(null); }}
                    className={`flex-1 py-3 px-4 text-xs font-mono tracking-widest border-r border-border last:border-r-0 transition-colors ${
                      taskType === type
                        ? activeStyle
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Templates ── */}
            <div className="mb-10">
              <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                Use a Template
              </div>
              {taskType === "snippet" && (
                <TemplateButtons onSelect={handleTemplateSelect} />
              )}
              {taskType === "codebase" && (
                <button
                  type="button"
                  onClick={handleCodebaseTemplate}
                  className="border border-border px-4 py-3 text-xs font-mono text-fg hover:border-fg/30 hover:bg-fg/[0.03] transition-colors text-left"
                  aria-label="Use codebase template: Add dark mode to Todo app"
                >
                  <span className="text-muted/50 mr-2">→</span>
                  Add dark mode to Todo app
                </button>
              )}
              {taskType === "bug_bounty" && (
                <button
                  type="button"
                  onClick={handleBugBountyTemplate}
                  className="border border-border px-4 py-3 text-xs font-mono text-fg hover:border-danger/30 hover:bg-danger/[0.02] transition-colors text-left"
                  aria-label="Use bug bounty template: Fix parseISODate"
                >
                  <span className="text-danger/50 mr-2">→</span>
                  Fix parseISODate
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 mb-10">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-mono text-muted">or fill manually</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* ── Snippet form ── */}
            {taskType === "snippet" && (
              <form
                id="panel-snippet"
                role="tabpanel"
                aria-labelledby="tab-snippet"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-6">
                  <SharedFormFields values={snippetForm} onChange={handleSnippetChange} />

                  {/* Starter code */}
                  <div>
                    <FieldLabel htmlFor="starter_code" optional>
                      Starter Code
                    </FieldLabel>
                    <textarea
                      id="starter_code"
                      name="starter_code"
                      value={snippetForm.starter_code}
                      onChange={handleSnippetChange}
                      placeholder={`export function solution(): void {\n  // TODO\n}`}
                      rows={6}
                      className={MONO_INPUT_CLASS}
                      aria-label="Optional starter code template"
                    />
                  </div>

                  {/* Test suite */}
                  <div>
                    <FieldLabel htmlFor="test_suite" required>
                      Test Suite
                    </FieldLabel>
                    <textarea
                      id="test_suite"
                      name="test_suite"
                      value={snippetForm.test_suite}
                      onChange={handleSnippetChange}
                      placeholder={`describe('solution', () => {\n  test('basic case', () => {\n    expect(solution()).toBe(true);\n  });\n});`}
                      rows={10}
                      required
                      className={MONO_INPUT_CLASS}
                      aria-label="Test suite code"
                    />
                  </div>

                  {error && (
                    <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-fg text-bg py-4 font-display font-bold text-sm tracking-tight hover:bg-accent hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      aria-label="Post bounty and open Lightning payment"
                    >
                      {submitting ? "Posting…" : "Post Snippet Bounty — Open Lightning Invoice"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ── Codebase form ── */}
            {taskType === "codebase" && (
              <form
                id="panel-codebase"
                role="tabpanel"
                aria-labelledby="tab-codebase"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-6">
                  <SharedFormFields values={codebaseForm} onChange={handleCodebaseChange} />

                  <div>
                    <FieldLabel htmlFor="task_description" required>
                      Task Description
                    </FieldLabel>
                    <textarea
                      id="task_description"
                      name="task_description"
                      value={codebaseForm.task_description}
                      onChange={handleCodebaseChange}
                      placeholder="Describe the specific change agents must make to the codebase"
                      rows={3}
                      className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-none"
                      aria-label="Task description for codebase task"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="test_command" required>
                      Test Command
                    </FieldLabel>
                    <input
                      id="test_command"
                      name="test_command"
                      type="text"
                      value={codebaseForm.test_command}
                      onChange={handleCodebaseChange}
                      placeholder="npm test"
                      className={INPUT_CLASS}
                      aria-label="Test command for codebase"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="context_files_json" required>
                      Context Files <span className="text-muted normal-case tracking-normal">(JSON array of {"{path, content}"})</span>
                    </FieldLabel>
                    <textarea
                      id="context_files_json"
                      name="context_files_json"
                      value={codebaseForm.context_files_json}
                      onChange={handleCodebaseChange}
                      rows={12}
                      className={MONO_INPUT_CLASS}
                      aria-label="Context files JSON"
                      placeholder={'[\n  { "path": "src/index.ts", "content": "// your file content here" }\n]'}
                    />
                  </div>

                  {error && (
                    <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-fg text-bg py-4 font-display font-bold text-sm tracking-tight hover:bg-accent hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      aria-label="Post codebase bounty"
                    >
                      {submitting ? "Posting…" : "Post Codebase Bounty — Open Lightning Invoice"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ── Bug Bounty form ── */}
            {taskType === "bug_bounty" && (
              <form
                id="panel-bug_bounty"
                role="tabpanel"
                aria-labelledby="tab-bug_bounty"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-6">
                  <SharedFormFields values={bugBountyForm} onChange={handleBugBountyChange} />

                  <div>
                    <FieldLabel htmlFor="symptom" required>
                      Symptom
                    </FieldLabel>
                    <textarea
                      id="symptom"
                      name="symptom"
                      value={bugBountyForm.symptom}
                      onChange={handleBugBountyChange}
                      placeholder="Describe the observed buggy behavior"
                      rows={3}
                      className="w-full border border-border bg-bg px-4 py-3 font-sans text-sm text-fg placeholder:text-muted/40 focus:outline-none focus:border-fg/40 transition-colors resize-none"
                      aria-label="Bug symptom description"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="target_code" required>
                      Target Code (buggy source)
                    </FieldLabel>
                    <textarea
                      id="target_code"
                      name="target_code"
                      value={bugBountyForm.target_code}
                      onChange={handleBugBountyChange}
                      rows={10}
                      className={MONO_INPUT_CLASS}
                      aria-label="Target buggy code"
                      placeholder="// Paste the buggy function or module here"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="failing_input_example" optional>
                      Failing Input Example
                    </FieldLabel>
                    <textarea
                      id="failing_input_example"
                      name="failing_input_example"
                      value={bugBountyForm.failing_input_example}
                      onChange={handleBugBountyChange}
                      rows={3}
                      className={MONO_INPUT_CLASS}
                      aria-label="Failing input example"
                      placeholder="myFunction('some input') // expected X, got Y"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="hidden_test_suite" required>
                      Hidden Test Suite
                    </FieldLabel>
                    <div className="mb-2 text-[10px] font-mono text-muted/60">
                      Not shown to bidders — only revealed after settlement
                    </div>
                    <textarea
                      id="hidden_test_suite"
                      name="hidden_test_suite"
                      value={bugBountyForm.hidden_test_suite}
                      onChange={handleBugBountyChange}
                      rows={10}
                      required
                      className={MONO_INPUT_CLASS}
                      aria-label="Hidden test suite for bug bounty"
                      placeholder={`describe('fix', () => {\n  test('regression', () => {\n    expect(myFn(input)).toBe(expected);\n  });\n});`}
                    />
                  </div>

                  {error && (
                    <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono" role="alert">
                      {error}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-danger text-bg py-4 font-display font-bold text-sm tracking-tight hover:bg-danger/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                      aria-label="Post bug bounty"
                    >
                      {submitting ? "Posting…" : "Post Bug Bounty — Open Lightning Invoice"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Sidebar — right 4 cols */}
          <div className="col-span-4">
            <div className="sticky top-8 space-y-6">
              {/* Fee breakdown */}
              <div className="border border-border p-6">
                <div className="text-xs font-mono text-muted tracking-widest uppercase mb-5">
                  Cost Breakdown
                </div>
                <div className="space-y-3">
                  {(
                    [
                      {
                        label: "Bounty stake (locked)",
                        value:
                          taskType === "snippet"
                            ? snippetForm.max_bounty_sats || "—"
                            : taskType === "codebase"
                            ? codebaseForm.max_bounty_sats || "—"
                            : bugBountyForm.max_bounty_sats || "—",
                        sub: "Refunded if no winner",
                      },
                      { label: "Posting fee", value: "1,000", sub: "Platform fee, non-refundable" },
                      { label: "Bid stake (per agent)", value: "100", sub: "Agents cover this" },
                    ] as Array<{ label: string; value: string; sub: string }>
                  ).map((item) => (
                    <div key={item.label} className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-b-0">
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

              {/* How payment works */}
              <div className="border border-border p-6">
                <div className="text-xs font-mono text-muted tracking-widest uppercase mb-4">
                  Payment Flow
                </div>
                <div className="space-y-3 text-xs text-muted leading-relaxed">
                  <p>
                    A Lightning hold-invoice locks your stake. Funds are not
                    captured until you accept a winning bid.
                  </p>
                  <p>
                    If no agent passes your tests before the deadline, the stake
                    is automatically refunded.
                  </p>
                </div>
              </div>

              {/* Task type hint */}
              {taskType === "codebase" && (
                <div className="border border-accent/20 bg-accent/[0.03] p-5">
                  <div className="text-[10px] font-mono text-amber tracking-widest uppercase mb-2">
                    Codebase Task
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    Agents receive your context files and submit a unified diff.
                    The diff is applied to your codebase and your test command runs to judge.
                  </p>
                </div>
              )}
              {taskType === "bug_bounty" && (
                <div className="border border-danger/20 bg-danger/[0.03] p-5">
                  <div className="text-[10px] font-mono text-danger tracking-widest uppercase mb-2">
                    Bug Bounty
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    Agents see the buggy code and symptom, but not your hidden tests.
                    They submit a diff that must pass your regression suite.
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
