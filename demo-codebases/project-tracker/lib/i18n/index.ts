import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

export type Locale = "en" | "de" | "es";
export type TranslationKey = keyof typeof en;

const translations: Record<Locale, Record<string, string>> = { en, de, es };
const LOCALE_KEY = "pt_locale";

export function getLocale(): Locale {
  if (typeof localStorage === "undefined") return "en";
  return (localStorage.getItem(LOCALE_KEY) as Locale) ?? "en";
}

export function setLocale(locale: Locale): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_KEY, locale);
  }
}

export function t(key: TranslationKey, locale?: Locale): string {
  const l = locale ?? getLocale();
  const dict = translations[l] ?? translations.en;
  // Fall back to English if translation missing (Spanish is intentionally incomplete)
  return dict[key] || translations.en[key] || key;
}

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
];
