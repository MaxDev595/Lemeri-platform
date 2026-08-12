import type { Locale } from "@/lib/i18n";

export function localeHref(path: string, locale: Locale) {
  return `${path}${path.includes("?") ? "&" : "?"}lang=${locale}`;
}

export function safeReturnTo(value: unknown) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : undefined;
}
