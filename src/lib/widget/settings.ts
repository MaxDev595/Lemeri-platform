// Website-widget appearance and install state. Stored inside the WEBSITE
// channel's encrypted config next to allowedOrigins, so changing the look in the
// cabinet never changes the embed code the customer already installed.

export type WidgetSettings = {
  accent: string;
  title: string;
  status: string;
  greeting: string;
  help: string;
  suggestions: string[];
  position: "right" | "left";
  theme: "auto" | "light" | "dark";
  autoOpenSeconds: number;
  hostedLink: boolean;
};

export type WebsiteChannelConfig = {
  allowedOrigins: string[];
  widget?: Partial<WidgetSettings>;
  seen?: Record<string, number>;
};

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function normalizeWidgetSettings(raw: unknown): Partial<WidgetSettings> {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<WidgetSettings> = {};
  const accent = str(v.accent, 9);
  if (/^#[0-9a-f]{6}$/i.test(accent)) out.accent = accent.toLowerCase();
  for (const [key, max] of [["title", 60], ["status", 80], ["greeting", 80], ["help", 200]] as const) { const value = str(v[key], max); if (value) out[key] = value; }
  if (Array.isArray(v.suggestions)) out.suggestions = v.suggestions.map(item => str(item, 60)).filter(Boolean).slice(0, 4);
  if (v.position === "left" || v.position === "right") out.position = v.position;
  if (v.theme === "auto" || v.theme === "light" || v.theme === "dark") out.theme = v.theme;
  const seconds = Number(v.autoOpenSeconds);
  if (Number.isFinite(seconds)) out.autoOpenSeconds = Math.max(0, Math.min(120, Math.round(seconds)));
  if (typeof v.hostedLink === "boolean") out.hostedLink = v.hostedLink;
  return out;
}

export function normalizeOrigins(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw.slice(0, 20)) { try { const url = new URL(String(item).trim()); if (url.protocol === "https:" || url.protocol === "http:") out.add(url.origin); } catch { /* skip */ } }
  return [...out];
}

// The same site may be reached with or without "www."; treat both as one.
export function originAllowed(allowed: string[], origin: string | undefined) {
  if (!allowed.length) return true;
  if (!origin) return false;
  const strip = (value: string) => value.replace(/^(https?:\/\/)www\./, "$1");
  return allowed.some(item => item === origin || strip(item) === strip(origin));
}

export const SEEN_THROTTLE_MS = 30 * 60_000;

// Plugin connect flow: the return address must be the same site's wp-admin.
export function parseConnectTarget(site:unknown,returnUrl:unknown){
  try{
    const siteUrl=new URL(String(site));const back=new URL(String(returnUrl));
    if(!/^https?:$/.test(siteUrl.protocol)||back.origin!==siteUrl.origin)return null;
    if(!back.pathname.includes("/wp-admin/"))return null;
    return{origin:siteUrl.origin,back};
  }catch{return null}
}
