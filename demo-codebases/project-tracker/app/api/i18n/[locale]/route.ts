import { NextRequest } from "next/server";
import { notFound } from "@/lib/api/errors";

// Serve translation JSON files via API for potential SSR or external use
const SUPPORTED = ["en", "de", "es"];

interface Params {
  params: { locale: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { locale } = params;
  if (!SUPPORTED.includes(locale)) return notFound(`Locale "${locale}" not supported`);

  try {
    // Dynamic import so we can serve any locale by name
    const translations = await import(`@/lib/i18n/${locale}.json`);
    return Response.json(translations.default);
  } catch {
    return notFound(`Could not load locale "${locale}"`);
  }
}
