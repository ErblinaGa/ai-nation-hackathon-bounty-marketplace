"use client";

import { useEffect, useState } from "react";
import { getStoredTheme, setStoredTheme, applyTheme, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/Button";

const themes: { value: Theme; label: string; desc: string }[] = [
  { value: "light", label: "Light", desc: "Always light" },
  { value: "dark", label: "Dark", desc: "Always dark" },
  { value: "system", label: "System", desc: "Follows OS preference" },
];

export default function AppearancePage() {
  const [current, setCurrent] = useState<Theme>("system");

  useEffect(() => {
    setCurrent(getStoredTheme());
  }, []);

  function handleSelect(theme: Theme) {
    setCurrent(theme);
    setStoredTheme(theme);
    applyTheme(theme);
  }

  return (
    <div>
      <h1 className="font-display font-bold text-2xl text-[--text] mb-6">Appearance</h1>
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-3">Theme</p>
        {themes.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => handleSelect(t.value)}
            className={`w-full flex items-center justify-between px-4 py-3 border text-left transition-colors ${
              current === t.value
                ? "border-[--accent] text-[--accent]"
                : "border-[--border] text-[--text] hover:border-[--accent]"
            }`}
            aria-pressed={current === t.value}
            aria-label={`Select ${t.label} theme`}
          >
            <div>
              <p className="font-medium text-sm">{t.label}</p>
              <p className="text-xs text-[--text-muted]">{t.desc}</p>
            </div>
            {current === t.value && <span className="font-mono text-xs">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
