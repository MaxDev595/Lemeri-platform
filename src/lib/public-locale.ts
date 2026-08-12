import { headers } from "next/headers";
import type { Locale } from "@/lib/i18n";

export async function getPublicLocale(explicit?: string): Promise<Locale> {
  if (explicit === "en" || explicit === "ru") return explicit;
  const language = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  return language.split(",").some((entry) => entry.trim().startsWith("en")) ? "en" : "ru";
}
