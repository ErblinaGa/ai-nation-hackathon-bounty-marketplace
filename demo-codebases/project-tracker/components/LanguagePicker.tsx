"use client";

import { useEffect, useState } from "react";
import { getLocale, setLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export function LanguagePicker() {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(getLocale());
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    setLocaleState(next);
    setLocale(next);
    // Reload to apply translations globally
    window.location.reload();
  }

  return (
    <select
      value={locale}
      onChange={handleChange}
      className="text-xs font-mono bg-transparent border border-[--border] text-[--text-muted] px-2 py-1 focus:outline-none focus:border-[--accent]"
      aria-label="Select language"
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.code.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
