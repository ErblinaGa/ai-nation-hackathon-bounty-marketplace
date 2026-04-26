"use client";

import { shortcutLabel } from "@/lib/shortcuts";

const SHORTCUTS = [
  { key: "p", description: "Go to Projects" },
  { key: "s", description: "Go to Stats" },
  { key: ",", description: "Go to Settings" },
  { key: "?", description: "Show keyboard shortcuts panel" },
  { key: "/", description: "Focus search (when visible)" },
  { key: "Escape", description: "Close modal / dismiss" },
];

export default function KeyboardPage() {
  return (
    <div>
      <h1 className="font-display font-bold text-2xl text-[--text] mb-6">Keyboard Shortcuts</h1>
      <div className="border border-[--border] bg-[--surface]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--border]">
              <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-widest text-[--text-muted]">Key</th>
              <th className="text-left px-4 py-2 font-mono text-xs uppercase tracking-widest text-[--text-muted]">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.key} className="border-t border-[--border]">
                <td className="px-4 py-3">
                  <kbd className="font-mono text-xs px-2 py-0.5 border border-[--border] bg-[--bg] text-[--text]">
                    {s.key}
                  </kbd>
                </td>
                <td className="px-4 py-3 text-[--text-muted]">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-[--text-muted] font-mono">
        Shortcuts are disabled when focus is inside a text input.
      </p>
    </div>
  );
}
