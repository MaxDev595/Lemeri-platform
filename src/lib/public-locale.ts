import type { Locale } from "@/lib/i18n";

/**
 * Language of public pages (landing, login, sign-up). Russian by default;
 * English only when chosen explicitly with the RU/EN switch (?lang=en).
 * The browser's Accept-Language is ignored on purpose: most Russian-speaking
 * visitors also list English there, which used to open the site in English.
 * The language picked at sign-up becomes the workspace language (cabinet).
 */
export async function getPublicLocale(explicit?: string): Promise<Locale> {
  return explicit === "en" ? "en" : "ru";
}
