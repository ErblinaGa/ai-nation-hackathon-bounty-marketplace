"use client";

import { useEffect, useState } from "react";
import { getStoredTheme, setStoredTheme, applyTheme, type Theme } from "@/lib/theme";
import { Button } from "./ui/Button";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  function cycle() {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    setStoredTheme(next);
    applyTheme(next);
  }

  const label = theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycle}
      aria-label={`Switch theme (current: ${theme})`}
      className="font-mono w-8 px-0 text-center"
    >
      {label}
    </Button>
  );
}
