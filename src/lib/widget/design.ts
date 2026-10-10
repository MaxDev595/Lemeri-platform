// Website card design. Three tiers follow the plan (lib/billing/plans.ts):
//   basic    (Trial)   — colour, name, greeting, side, theme
//   standard (Starter) — + avatar, subtitle, quick questions, auto-open, ready-made styles
//   custom   (Custom)  — the full visual editor below, plus saved presets
// Everything is validated and clamped here, so a stored design can never break a
// customer's site. Pure module: used by the API, the embed script config, the chat
// iframe and the cabinet editor.

import type { DesignTier } from "@/lib/billing/plans";

export const FONTS = {
  system: { label: "Системный", css: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif", google: "" },
  inter: { label: "Inter", css: "'Inter',system-ui,sans-serif", google: "Inter:wght@400;500;600;700" },
  manrope: { label: "Manrope", css: "'Manrope',system-ui,sans-serif", google: "Manrope:wght@400;500;600;700" },
  roboto: { label: "Roboto", css: "'Roboto',system-ui,sans-serif", google: "Roboto:wght@400;500;700" },
  montserrat: { label: "Montserrat", css: "'Montserrat',system-ui,sans-serif", google: "Montserrat:wght@400;500;600;700" },
  opensans: { label: "Open Sans", css: "'Open Sans',system-ui,sans-serif", google: "Open+Sans:wght@400;500;600;700" },
  nunito: { label: "Nunito", css: "'Nunito',system-ui,sans-serif", google: "Nunito:wght@400;600;700" },
  ptsans: { label: "PT Sans", css: "'PT Sans',system-ui,sans-serif", google: "PT+Sans:wght@400;700" },
  rubik: { label: "Rubik", css: "'Rubik',system-ui,sans-serif", google: "Rubik:wght@400;500;600;700" },
  golos: { label: "Golos Text", css: "'Golos Text',system-ui,sans-serif", google: "Golos+Text:wght@400;500;600;700" },
  lora: { label: "Lora (с засечками)", css: "'Lora',Georgia,serif", google: "Lora:wght@400;500;600;700" },
  mono: { label: "JetBrains Mono", css: "'JetBrains Mono',ui-monospace,monospace", google: "JetBrains+Mono:wght@400;500;700" },
} as const;
export type FontKey = keyof typeof FONTS;
export const fontHref = (key: FontKey) => FONTS[key].google ? `https://fonts.googleapis.com/css2?family=${FONTS[key].google}&display=swap` : "";

export type Colors = {
  accent: string; accentText: string; background: string; surface: string; text: string; muted: string; border: string;
  userBubble: string; userText: string; botBubble: string; botText: string; headerBg: string; headerText: string;
  button: string; buttonText: string; launcherBg: string; launcherIcon: string;
};
export type Design = {
  colors: Colors;
  /** Separate palette used when the visitor's site/system is dark. */
  dark: Colors;
  font: FontKey; fontSize: number;
  width: number; height: number;
  radius: number; bubbleRadius: number; buttonRadius: number;
  shadow: "none" | "soft" | "medium" | "strong"; borderWidth: number; opacity: number;
  background: { type: "solid" | "gradient"; from: string; to: string; angle: number };
  bubbleStyle: "rounded" | "tail" | "square";
  header: { style: "solid" | "accent" | "gradient" | "minimal"; showAvatar: boolean; showStatus: boolean };
  avatarShape: "circle" | "rounded" | "square";
  launcher: { icon: "chat" | "sparkles" | "message" | "help" | "avatar"; shape: "circle" | "rounded" | "square"; size: number; label: string };
  welcome: { layout: "bubble" | "hero"; title: string; text: string; showSuggestions: boolean };
  animation: { open: "scale" | "slide" | "fade" | "none"; durationMs: number };
  appearance: { showOnMobile: boolean; mobileLauncherSize: number; mobilePosition: "right" | "left" };
};
export type DesignPreset = { id: string; name: string; design: Design; savedAt: string };

const LIGHT: Colors = {
  accent: "#6254e8", accentText: "#ffffff", background: "#ffffff", surface: "#f6f6f9", text: "#17191f", muted: "#6b7080", border: "#e6e7ec",
  userBubble: "#6254e8", userText: "#ffffff", botBubble: "#f1f1f6", botText: "#17191f", headerBg: "#ffffff", headerText: "#17191f",
  button: "#6254e8", buttonText: "#ffffff", launcherBg: "#6254e8", launcherIcon: "#ffffff",
};
const DARK: Colors = {
  accent: "#7466f5", accentText: "#ffffff", background: "#15171c", surface: "#1a1c22", text: "#eceef3", muted: "#9398a6", border: "#2a2d36",
  userBubble: "#7466f5", userText: "#ffffff", botBubble: "#23262e", botText: "#eceef3", headerBg: "#15171c", headerText: "#eceef3",
  button: "#7466f5", buttonText: "#ffffff", launcherBg: "#7466f5", launcherIcon: "#ffffff",
};

export const DEFAULT_DESIGN: Design = {
  colors: LIGHT, dark: DARK, font: "system", fontSize: 14, width: 400, height: 640,
  radius: 18, bubbleRadius: 16, buttonRadius: 12, shadow: "medium", borderWidth: 1, opacity: 100,
  background: { type: "solid", from: "#ffffff", to: "#f3f1ff", angle: 160 },
  bubbleStyle: "tail", header: { style: "gradient", showAvatar: true, showStatus: true }, avatarShape: "rounded",
  launcher: { icon: "chat", shape: "rounded", size: 56, label: "" },
  welcome: { layout: "bubble", title: "", text: "", showSuggestions: true },
  animation: { open: "scale", durationMs: 200 },
  appearance: { showOnMobile: true, mobileLauncherSize: 52, mobilePosition: "right" },
};

/** Ready-made styles available from Starter. Each is a full design. */
export const READY_STYLES: Record<string, { label: string; design: Design }> = {
  classic: { label: "Классика", design: DEFAULT_DESIGN },
  minimal: { label: "Минимал", design: { ...DEFAULT_DESIGN, radius: 12, bubbleRadius: 10, buttonRadius: 8, shadow: "soft", bubbleStyle: "rounded", header: { style: "minimal", showAvatar: true, showStatus: false }, launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle" }, colors: { ...LIGHT, botBubble: "#f4f4f5", border: "#ececef" } } },
  soft: { label: "Мягкий", design: { ...DEFAULT_DESIGN, radius: 26, bubbleRadius: 22, buttonRadius: 22, font: "nunito", shadow: "soft", background: { type: "gradient", from: "#ffffff", to: "#f4f1ff", angle: 170 }, avatarShape: "circle", launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle", icon: "sparkles" } } },
  dark: { label: "Тёмный", design: { ...DEFAULT_DESIGN, colors: { ...DARK }, header: { style: "solid", showAvatar: true, showStatus: true }, shadow: "strong" } },
  contrast: { label: "Контраст", design: { ...DEFAULT_DESIGN, radius: 6, bubbleRadius: 6, buttonRadius: 4, borderWidth: 2, shadow: "none", bubbleStyle: "square", font: "inter", header: { style: "accent", showAvatar: true, showStatus: true }, launcher: { ...DEFAULT_DESIGN.launcher, shape: "square" }, colors: { ...LIGHT, border: "#17191f", botBubble: "#ffffff" } } },
  business: { label: "Деловой", design: { ...DEFAULT_DESIGN, font: "manrope", radius: 14, bubbleRadius: 12, header: { style: "accent", showAvatar: true, showStatus: true }, bubbleStyle: "rounded", launcher: { ...DEFAULT_DESIGN.launcher, icon: "message" } } },
};
export type ReadyStyle = keyof typeof READY_STYLES;

// ------------------------------------------------------------------ validation
const HEX = /^#[0-9a-f]{6}$/i;
const color = (value: unknown, fallback: string) => (typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback);
const num = (value: unknown, min: number, max: number, fallback: number) => { const n = Number(value); return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback; };
const pick = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (list as readonly string[]).includes(String(value)) ? value as T : fallback;
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
// Plain text only: rendered with textContent / React text, never as HTML.
const str = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "");
const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

function normalizeColors(raw: unknown, base: Colors): Colors {
  const v = obj(raw);
  return Object.fromEntries(Object.keys(base).map(key => [key, color(v[key], base[key as keyof Colors])])) as Colors;
}

export function normalizeDesign(raw: unknown, base: Design = DEFAULT_DESIGN): Design {
  const v = obj(raw), bg = obj(v.background), header = obj(v.header), launcher = obj(v.launcher), welcome = obj(v.welcome), animation = obj(v.animation), appearance = obj(v.appearance);
  return {
    colors: normalizeColors(v.colors, base.colors), dark: normalizeColors(v.dark, base.dark),
    font: pick(v.font, Object.keys(FONTS) as FontKey[], base.font), fontSize: num(v.fontSize, 12, 18, base.fontSize),
    width: num(v.width, 320, 480, base.width), height: num(v.height, 440, 760, base.height),
    radius: num(v.radius, 0, 28, base.radius), bubbleRadius: num(v.bubbleRadius, 2, 24, base.bubbleRadius), buttonRadius: num(v.buttonRadius, 0, 24, base.buttonRadius),
    shadow: pick(v.shadow, ["none", "soft", "medium", "strong"], base.shadow), borderWidth: num(v.borderWidth, 0, 3, base.borderWidth), opacity: num(v.opacity, 85, 100, base.opacity),
    background: { type: pick(bg.type, ["solid", "gradient"], base.background.type), from: color(bg.from, base.background.from), to: color(bg.to, base.background.to), angle: num(bg.angle, 0, 360, base.background.angle) },
    bubbleStyle: pick(v.bubbleStyle, ["rounded", "tail", "square"], base.bubbleStyle),
    header: { style: pick(header.style, ["solid", "accent", "gradient", "minimal"], base.header.style), showAvatar: bool(header.showAvatar, base.header.showAvatar), showStatus: bool(header.showStatus, base.header.showStatus) },
    avatarShape: pick(v.avatarShape, ["circle", "rounded", "square"], base.avatarShape),
    launcher: { icon: pick(launcher.icon, ["chat", "sparkles", "message", "help", "avatar"], base.launcher.icon), shape: pick(launcher.shape, ["circle", "rounded", "square"], base.launcher.shape), size: num(launcher.size, 44, 64, base.launcher.size), label: str(launcher.label, 30) },
    welcome: { layout: pick(welcome.layout, ["bubble", "hero"], base.welcome.layout), title: str(welcome.title, 80), text: str(welcome.text, 240), showSuggestions: bool(welcome.showSuggestions, base.welcome.showSuggestions) },
    animation: { open: pick(animation.open, ["scale", "slide", "fade", "none"], base.animation.open), durationMs: num(animation.durationMs, 0, 600, base.animation.durationMs) },
    appearance: { showOnMobile: bool(appearance.showOnMobile, base.appearance.showOnMobile), mobileLauncherSize: num(appearance.mobileLauncherSize, 40, 64, base.appearance.mobileLauncherSize), mobilePosition: pick(appearance.mobilePosition, ["right", "left"], base.appearance.mobilePosition) },
  };
}

export function normalizePresets(raw: unknown): DesignPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((item, index) => { const v = obj(item); return { id: str(v.id, 40) || `p${index}`, name: str(v.name, 40) || `Стиль ${index + 1}`, design: normalizeDesign(v.design), savedAt: str(v.savedAt, 40) || new Date(0).toISOString() }; });
}

/** Avatar: https URL or a small data:image (uploaded in the cabinet, resized to ≤ 160 px). */
export function normalizeAvatar(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(raw) && raw.length <= 90_000) return raw;
  try { const url = new URL(raw); return url.protocol === "https:" && raw.length <= 500 ? url.toString() : ""; } catch { return ""; }
}

// ------------------------------------------------------------------ plan tiers
export type StoredLook = {
  accent?: string; title?: string; status?: string; greeting?: string; help?: string; suggestions?: string[];
  position?: "right" | "left"; theme?: "auto" | "light" | "dark"; autoOpenSeconds?: number; hostedLink?: boolean;
  avatarUrl?: string; style?: string; leadForm?: boolean; design?: Design; presets?: DesignPreset[];
};
/** What the card actually shows for a plan tier. Stored Custom settings stay untouched in the database after a downgrade. */
export type ResolvedLook = {
  title?: string; status?: string; greeting?: string; help?: string; suggestions?: string[];
  position: "right" | "left"; theme: "auto" | "light" | "dark"; autoOpenSeconds: number; hostedLink: boolean;
  avatarUrl: string; leadForm: boolean; design: Design; tier: DesignTier;
};

export function resolveLook(stored: StoredLook | undefined, tier: DesignTier): ResolvedLook {
  const s = stored ?? {};
  const withAccent = (design: Design, accent?: string) => accent && HEX.test(accent) ? { ...design, colors: { ...design.colors, accent, userBubble: accent, button: accent, launcherBg: accent }, dark: { ...design.dark, accent, userBubble: accent, button: accent, launcherBg: accent } } : design;
  const base = { title: s.title, greeting: s.greeting, help: s.help, position: s.position ?? "right", theme: s.theme ?? "auto", hostedLink: s.hostedLink !== false, leadForm: s.leadForm !== false, tier };
  if (tier === "basic") return { ...base, status: undefined, suggestions: undefined, autoOpenSeconds: 0, avatarUrl: "", design: withAccent(DEFAULT_DESIGN, s.accent) };
  const standard = { ...base, status: s.status, suggestions: s.suggestions, autoOpenSeconds: s.autoOpenSeconds ?? 0, avatarUrl: s.avatarUrl ?? "" };
  if (tier === "standard" || !s.design) {
    const ready = READY_STYLES[s.style ?? "classic"]?.design ?? DEFAULT_DESIGN;
    return { ...standard, design: withAccent(ready, s.accent) };
  }
  return { ...standard, design: normalizeDesign(s.design) };
}

// ------------------------------------------------------------------ CSS
const SHADOWS = { none: "none", soft: "0 2px 6px rgba(20,20,40,.06),0 12px 32px -12px rgba(20,20,40,.18)", medium: "0 4px 8px rgba(20,20,40,.08),0 28px 72px -12px rgba(20,20,40,.28)", strong: "0 8px 16px rgba(20,20,40,.16),0 36px 90px -10px rgba(20,20,40,.45)" };
const alpha = (hex: string, opacity: number) => `${hex}${Math.round((opacity / 100) * 255).toString(16).padStart(2, "0")}`;

/** CSS custom properties for the chat iframe (website-widget.tsx). */
export function chatVars(design: Design, dark: boolean): Record<string, string> {
  const c = dark ? design.dark : design.colors;
  const bg = design.background.type === "gradient" && !dark ? `linear-gradient(${design.background.angle}deg,${alpha(design.background.from, design.opacity)},${alpha(design.background.to, design.opacity)})` : alpha(c.background, design.opacity);
  const r = design.bubbleRadius;
  const tail = design.bubbleStyle === "tail" ? Math.min(6, r) : design.bubbleStyle === "square" ? Math.min(4, r) : r;
  return {
    "--lw-font": FONTS[design.font].css, "--lw-fs": `${design.fontSize}px`,
    "--lw-accent": c.accent, "--lw-accent-text": c.accentText, "--lw-bg": bg, "--lw-surface": c.surface, "--lw-text": c.text, "--lw-muted": c.muted, "--lw-border": c.border,
    "--lw-user": c.userBubble, "--lw-user-text": c.userText, "--lw-bot": c.botBubble, "--lw-bot-text": c.botText,
    "--lw-btn": c.button, "--lw-btn-text": c.buttonText, "--lw-btn-radius": `${design.buttonRadius}px`,
    "--lw-bubble-r": `${design.bubbleStyle === "square" ? Math.min(6, r) : r}px`, "--lw-bubble-tail": `${tail}px`,
    "--lw-head-bg": c.headerBg, "--lw-head-text": c.headerText,
  };
}

/** Values the embed shell (embed-client.ts) needs. Kept small: it is inlined into embed.js. */
export function shellConfig(design: Design) {
  return {
    light: { accent: design.colors.accent, bg: design.colors.background, bg2: design.colors.surface, text: design.colors.text, text3: design.colors.muted, line: design.colors.border, head: design.colors.headerBg, headText: design.colors.headerText, launcher: design.colors.launcherBg, launcherIcon: design.colors.launcherIcon },
    dark: { accent: design.dark.accent, bg: design.dark.background, bg2: design.dark.surface, text: design.dark.text, text3: design.dark.muted, line: design.dark.border, head: design.dark.headerBg, headText: design.dark.headerText, launcher: design.dark.launcherBg, launcherIcon: design.dark.launcherIcon },
    radius: design.radius, border: design.borderWidth, shadow: SHADOWS[design.shadow], width: design.width, height: design.height,
    headerStyle: design.header.style, showAvatar: design.header.showAvatar, showStatus: design.header.showStatus, avatarShape: design.avatarShape,
    launcherIcon: design.launcher.icon, launcherShape: design.launcher.shape, launcherSize: design.launcher.size, launcherLabel: design.launcher.label,
    animation: design.animation.open, duration: design.animation.durationMs, font: FONTS[design.font].css, fontHref: fontHref(design.font),
    showOnMobile: design.appearance.showOnMobile, mobileLauncherSize: design.appearance.mobileLauncherSize, mobilePosition: design.appearance.mobilePosition,
  };
}
export type ShellConfig = ReturnType<typeof shellConfig>;

// ------------------------------------------------------------------ saving by plan
const STANDARD_KEYS = ["status", "suggestions", "autoOpenSeconds", "avatarUrl", "style"] as const;
const CUSTOM_KEYS = ["design", "presets"] as const;
/**
 * Applies plan rules to a save: fields above the plan keep their stored value
 * (so a downgrade never deletes Custom work), everything else is replaced.
 */
export function mergeForTier(stored: Partial<StoredLook> | undefined, incoming: Partial<StoredLook>, tier: "basic" | "standard" | "custom"): Partial<StoredLook> {
  const next: Partial<StoredLook> = { ...incoming };
  const keep = (keys: readonly (keyof StoredLook)[]) => { for (const key of keys) { if (stored && stored[key] !== undefined) (next as Record<string, unknown>)[key] = stored[key]; else delete next[key]; } };
  if (tier === "basic") keep([...STANDARD_KEYS, ...CUSTOM_KEYS]);
  else if (tier === "standard") keep(CUSTOM_KEYS);
  return next;
}

