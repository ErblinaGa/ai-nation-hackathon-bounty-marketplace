"use client";

import { useState, useEffect } from "react";
import { getShortcuts, shortcutLabel } from "@/lib/shortcuts";
import { Modal } from "./ui/Modal";

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const shortcuts = getShortcuts();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
        <table className="w-full text-sm">
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.key + s.modifier} className="border-t border-[--border]">
                <td className="py-2 pr-4">
                  <kbd className="font-mono text-xs px-2 py-0.5 border border-[--border] bg-[--bg]">
                    {shortcutLabel(s)}
                  </kbd>
                </td>
                <td className="py-2 text-[--text-muted]">{s.description}</td>
              </tr>
            ))}
            <tr className="border-t border-[--border]">
              <td className="py-2 pr-4">
                <kbd className="font-mono text-xs px-2 py-0.5 border border-[--border] bg-[--bg]">?</kbd>
              </td>
              <td className="py-2 text-[--text-muted]">Show/hide this panel</td>
            </tr>
          </tbody>
        </table>
      </Modal>
    </>
  );
}
