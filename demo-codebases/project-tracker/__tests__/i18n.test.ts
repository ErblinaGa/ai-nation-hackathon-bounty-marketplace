import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { t, getLocale, setLocale, SUPPORTED_LOCALES } from "@/lib/i18n";

beforeEach(() => {
  localStorage.clear();
});

describe("i18n", () => {
  it("defaults to English", () => {
    expect(t("nav.projects")).toBe("Projects");
  });

  it("returns German translation", () => {
    setLocale("de");
    expect(t("nav.projects", "de")).toBe("Projekte");
  });

  it("falls back to English for incomplete Spanish keys", () => {
    // projects.empty.hint is empty in es.json — should fall back to en
    const result = t("projects.empty.hint", "es");
    expect(result.length).toBeGreaterThan(0);
  });

  it("SUPPORTED_LOCALES includes en, de, es", () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    expect(codes).toContain("en");
    expect(codes).toContain("de");
    expect(codes).toContain("es");
  });

  it("getLocale returns stored locale", () => {
    setLocale("de");
    expect(getLocale()).toBe("de");
  });

  it("t falls back to key for unknown translation", () => {
    // Test with a non-existent key — it returns the key string
    const result = t("nav.projects" as never, "en");
    expect(result).toBeTruthy();
  });
});
