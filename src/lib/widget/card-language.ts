// The card speaks the language the owner picked. Greeting, help text, status,
// quick questions and the AI's first messages are stored as typed; when some of
// them are in another language (written earlier in English, a ready style, an
// older AI suggestion) they are translated once and saved back to the channel.
// Pure helpers first — tested with node directly (tests/widget-design.test.ts).

export type CardLanguage = "ru" | "en";
export type CardTexts = { greeting?: string; help?: string; status?: string; suggestions?: string[]; proactive?: string[] };

const CYRILLIC = /[А-Яа-яЁёІіЇїЄєҚқҒғҮүҰұӨөҺһӘә]/;

/** True when a visible text is clearly not in the chosen language. */
export function wrongLanguage(text: string | undefined, lang: CardLanguage) {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (lang === "ru") return !CYRILLIC.test(value) && /[A-Za-z]{3,}/.test(value);
  return CYRILLIC.test(value);
}

/** Only the texts that need translating (empty object when everything matches). */
export function textsToTranslate(texts: CardTexts, lang: CardLanguage): CardTexts {
  const out: CardTexts = {};
  for (const key of ["greeting", "help", "status"] as const) if (wrongLanguage(texts[key], lang)) out[key] = texts[key];
  for (const key of ["suggestions", "proactive"] as const) { const list = texts[key] ?? []; if (list.some(item => wrongLanguage(item, lang))) out[key] = list; }
  return out;
}

const tried = new Map<string, number>();

/**
 * Translates the mismatched texts with the model (one call, ≤6 s) and saves them in
 * the channel config. Returns the merged widget settings, or null when nothing was
 * translated (no model, timeout, bad answer). Tried at most once per 10 min per card.
 */
export async function translateCardTexts(channelId: string, need: CardTexts, lang: CardLanguage) {
  const last = tried.get(channelId) ?? 0;
  if (Date.now() - last < 10 * 60_000) return null;
  tried.set(channelId, Date.now());
  const { jsonCompletion } = await import("@/lib/ai/endpoint");
  const system = `Translate the website chat card texts into ${lang === "ru" ? "Russian" : "English"}. Keep the meaning, tone, brand and product names, length and list order. Return JSON with exactly the same keys and value types as the input.`;
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 6000));
  const result = await Promise.race([jsonCompletion<Record<string, unknown>>(system, JSON.stringify(need), 600).catch(() => null), timeout]);
  if (!result) return null;
  const str = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : undefined;
  const list = (value: unknown, size: number, max: number) => Array.isArray(value) && value.length === size ? value.map(item => str(item, max)) : undefined;
  const patch: Record<string, unknown> = {};
  if (need.greeting) patch.greeting = str(result.greeting, 80);
  if (need.help) patch.help = str(result.help, 200);
  if (need.status) patch.status = str(result.status, 80);
  if (need.suggestions) { const value = list(result.suggestions, need.suggestions.length, 60); if (value?.every(Boolean)) patch.suggestions = value; }
  const proactive = need.proactive ? list(result.proactive, need.proactive.length, 300) : undefined;
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete patch[key];
  if (!Object.keys(patch).length && !proactive?.every(Boolean)) return null;
  const [{ db }, { decryptCredentials, encryptCredentials }] = await Promise.all([import("@/lib/db"), import("@/lib/security/encryption")]);
  const fresh = await db.channel.findUnique({ where: { id: channelId }, select: { configEncrypted: true } });
  if (!fresh?.configEncrypted) return null;
  const current = decryptCredentials<{ widget?: Record<string, unknown> } & Record<string, unknown>>(fresh.configEncrypted);
  const widget: Record<string, unknown> = { ...(current.widget ?? {}), ...patch };
  if (proactive?.every(Boolean)) widget.proactive = { ...((current.widget?.proactive as Record<string, unknown> | undefined) ?? {}), messages: proactive, language: lang };
  await db.channel.update({ where: { id: channelId }, data: { configEncrypted: encryptCredentials({ ...current, widget }) } });
  return widget;
}
