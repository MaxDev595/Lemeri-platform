// Website card design. Three tiers follow the plan (lib/billing/plans.ts):
//   basic    (Trial)   — name, greeting, side, light or dark theme; the design itself is fixed
//   standard (Starter) — + subtitle, quick questions, auto-open, the AI's first message; design still fixed
//   custom   (Custom)  — colour, avatar, ready-made styles, fonts, the full visual editor and saved presets
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
  onest: { label: "Onest", css: "'Onest',system-ui,sans-serif", google: "Onest:wght@400;500;600;700" },
  raleway: { label: "Raleway", css: "'Raleway',system-ui,sans-serif", google: "Raleway:wght@400;500;600;700" },
  plex: { label: "IBM Plex Sans", css: "'IBM Plex Sans',system-ui,sans-serif", google: "IBM+Plex+Sans:wght@400;500;600;700" },
  comfortaa: { label: "Comfortaa (мягкий)", css: "'Comfortaa',system-ui,sans-serif", google: "Comfortaa:wght@400;500;600;700" },
  unbounded: { label: "Unbounded (акцентный)", css: "'Unbounded',system-ui,sans-serif", google: "Unbounded:wght@400;500;600;700" },
  playfair: { label: "Playfair Display (премиум)", css: "'Playfair Display',Georgia,serif", google: "Playfair+Display:wght@400;500;600;700" },
  cormorant: { label: "Cormorant (люкс)", css: "'Cormorant Garamond',Georgia,serif", google: "Cormorant+Garamond:wght@400;500;600;700" },
} as const;
export type FontKey = keyof typeof FONTS;
export const fontHref = (key: FontKey) => FONTS[key].google ? `https://fonts.googleapis.com/css2?family=${FONTS[key].google}&display=swap` : "";

export type Colors = {
  accent: string; accentText: string; background: string; surface: string; text: string; muted: string; border: string;
  userBubble: string; userText: string; botBubble: string; botText: string; headerBg: string; headerText: string;
  button: string; buttonText: string; launcherBg: string; launcherIcon: string;
};
export type HeaderStyle = "solid" | "accent" | "gradient" | "minimal" | "glass";
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
  header: { style: HeaderStyle; showAvatar: boolean; showStatus: boolean };
  avatarShape: "circle" | "rounded" | "square";
  launcher: { icon: "chat" | "sparkles" | "message" | "help" | "avatar"; shape: "circle" | "rounded" | "square"; size: number; label: string };
  welcome: { layout: "bubble" | "hero"; title: string; text: string; showSuggestions: boolean };
  animation: { open: "scale" | "slide" | "fade" | "none"; durationMs: number };
  appearance: { showOnMobile: boolean; mobileLauncherSize: number; mobilePosition: "right" | "left" };
  /** Font for the name and welcome title; "same" = body font. */
  headingFont: FontKey | "same";
  /** Accent as a gradient (visitor bubbles, buttons, launcher, coloured header). */
  accentGradient: { enabled: boolean; to: string; angle: number };
  effects: {
    /** Frosted glass: translucent card with the site blurred behind it. */
    glass: boolean; blur: number;
    /** Texture over the chat background. */
    pattern: "none" | "dots" | "grid" | "diagonal" | "aurora" | "noise"; patternOpacity: number;
    /** Soft accent-coloured glow around the open card. */
    glow: boolean;
  };
  messages: { animation: "rise" | "pop" | "fade" | "none"; typing: "dots" | "wave" | "pulse"; avatar: boolean; shadow: boolean };
  composer: { style: "outlined" | "filled" | "pill"; sendIcon: "arrow" | "send" | "sparkle"; placeholder: string };
  /** Attention: a pulse ring on the chat button and a proactive message bubble next to it. */
  attention: { pulse: boolean; teaser: string; teaserDelay: number };
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
  headingFont: "same",
  accentGradient: { enabled: false, to: "#9b5cf6", angle: 135 },
  effects: { glass: false, blur: 18, pattern: "none", patternOpacity: 12, glow: false },
  messages: { animation: "rise", typing: "dots", avatar: false, shadow: false },
  composer: { style: "outlined", sendIcon: "arrow", placeholder: "" },
  attention: { pulse: false, teaser: "", teaserDelay: 8 },
};

/** Ready-made styles available from Starter. Each is a full design. */
export const READY_STYLES: Record<string, { label: string; design: Design }> = {
  classic: { label: "Классика", design: DEFAULT_DESIGN },
  minimal: { label: "Минимал", design: { ...DEFAULT_DESIGN, radius: 12, bubbleRadius: 10, buttonRadius: 8, shadow: "soft", bubbleStyle: "rounded", header: { style: "minimal", showAvatar: true, showStatus: false }, launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle" }, colors: { ...LIGHT, botBubble: "#f4f4f5", border: "#ececef" } } },
  soft: { label: "Мягкий", design: { ...DEFAULT_DESIGN, radius: 26, bubbleRadius: 22, buttonRadius: 22, font: "nunito", shadow: "soft", background: { type: "gradient", from: "#ffffff", to: "#f4f1ff", angle: 170 }, avatarShape: "circle", launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle", icon: "sparkles" } } },
  dark: { label: "Тёмный", design: { ...DEFAULT_DESIGN, colors: { ...DARK }, header: { style: "solid", showAvatar: true, showStatus: true }, shadow: "strong" } },
  contrast: { label: "Контраст", design: { ...DEFAULT_DESIGN, radius: 6, bubbleRadius: 6, buttonRadius: 4, borderWidth: 2, shadow: "none", bubbleStyle: "square", font: "inter", header: { style: "accent", showAvatar: true, showStatus: true }, launcher: { ...DEFAULT_DESIGN.launcher, shape: "square" }, colors: { ...LIGHT, border: "#17191f", botBubble: "#ffffff" } } },
  business: { label: "Деловой", design: { ...DEFAULT_DESIGN, font: "manrope", radius: 14, bubbleRadius: 12, header: { style: "accent", showAvatar: true, showStatus: true }, bubbleStyle: "rounded", launcher: { ...DEFAULT_DESIGN.launcher, icon: "message" } } },
  glass: { label: "Стекло", design: { ...DEFAULT_DESIGN, font: "onest", radius: 24, bubbleRadius: 18, buttonRadius: 24, opacity: 72, shadow: "soft", bubbleStyle: "rounded",
    colors: { ...LIGHT, background: "#ffffff", surface: "#ffffff", botBubble: "#ffffff", border: "#ffffff", headerBg: "#ffffff" },
    dark: { ...DARK, background: "#14161c", surface: "#1d2028", botBubble: "#262a34", border: "#3a3f4c", headerBg: "#14161c" },
    header: { style: "glass", showAvatar: true, showStatus: true }, avatarShape: "circle",
    launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle", icon: "sparkles" },
    accentGradient: { enabled: true, to: "#a855f7", angle: 135 },
    effects: { glass: true, blur: 22, pattern: "none", patternOpacity: 10, glow: true },
    messages: { animation: "pop", typing: "wave", avatar: false, shadow: true }, composer: { style: "pill", sendIcon: "sparkle", placeholder: "" } } },
  aurora: { label: "Аврора", design: { ...DEFAULT_DESIGN, font: "manrope", radius: 22, bubbleRadius: 18, shadow: "medium", bubbleStyle: "rounded",
    colors: { ...LIGHT, accent: "#4f46e5", userBubble: "#4f46e5", button: "#4f46e5", launcherBg: "#4f46e5", botBubble: "#ffffff", surface: "#ffffff" },
    background: { type: "gradient", from: "#f5f3ff", to: "#ecfeff", angle: 150 },
    header: { style: "glass", showAvatar: true, showStatus: true }, avatarShape: "circle",
    launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle", icon: "sparkles" },
    accentGradient: { enabled: true, to: "#06b6d4", angle: 120 },
    effects: { glass: false, blur: 18, pattern: "aurora", patternOpacity: 30, glow: true },
    messages: { animation: "rise", typing: "wave", avatar: true, shadow: true }, composer: { style: "pill", sendIcon: "send", placeholder: "" },
    attention: { pulse: true, teaser: "", teaserDelay: 8 } } },
  luxe: { label: "Люкс", design: { ...DEFAULT_DESIGN, font: "manrope", headingFont: "playfair", radius: 10, bubbleRadius: 8, buttonRadius: 6, shadow: "strong", bubbleStyle: "square", borderWidth: 1,
    colors: { accent: "#c9a45c", accentText: "#14120e", background: "#14120e", surface: "#1d1a14", text: "#f3ead8", muted: "#a89a7f", border: "#3a3224", userBubble: "#c9a45c", userText: "#14120e", botBubble: "#221e17", botText: "#f3ead8", headerBg: "#14120e", headerText: "#f3ead8", button: "#c9a45c", buttonText: "#14120e", launcherBg: "#14120e", launcherIcon: "#c9a45c" },
    dark: { accent: "#c9a45c", accentText: "#14120e", background: "#0f0d0a", surface: "#1a1712", text: "#f3ead8", muted: "#a89a7f", border: "#352e21", userBubble: "#c9a45c", userText: "#14120e", botBubble: "#1f1b15", botText: "#f3ead8", headerBg: "#0f0d0a", headerText: "#f3ead8", button: "#c9a45c", buttonText: "#14120e", launcherBg: "#0f0d0a", launcherIcon: "#c9a45c" },
    header: { style: "solid", showAvatar: true, showStatus: true }, avatarShape: "circle",
    launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle", icon: "message" },
    accentGradient: { enabled: true, to: "#e8cf94", angle: 135 },
    effects: { glass: false, blur: 18, pattern: "diagonal", patternOpacity: 8, glow: false },
    messages: { animation: "fade", typing: "pulse", avatar: false, shadow: false }, composer: { style: "filled", sendIcon: "send", placeholder: "" } } },
  neon: { label: "Неон", design: { ...DEFAULT_DESIGN, font: "unbounded", fontSize: 13, radius: 16, bubbleRadius: 14, shadow: "strong", bubbleStyle: "rounded",
    colors: { accent: "#22d3ee", accentText: "#06121a", background: "#0b0f1a", surface: "#121829", text: "#e6f6ff", muted: "#8aa0b8", border: "#1f2a44", userBubble: "#22d3ee", userText: "#06121a", botBubble: "#141c30", botText: "#e6f6ff", headerBg: "#0b0f1a", headerText: "#e6f6ff", button: "#22d3ee", buttonText: "#06121a", launcherBg: "#22d3ee", launcherIcon: "#06121a" },
    dark: { accent: "#22d3ee", accentText: "#06121a", background: "#0b0f1a", surface: "#121829", text: "#e6f6ff", muted: "#8aa0b8", border: "#1f2a44", userBubble: "#22d3ee", userText: "#06121a", botBubble: "#141c30", botText: "#e6f6ff", headerBg: "#0b0f1a", headerText: "#e6f6ff", button: "#22d3ee", buttonText: "#06121a", launcherBg: "#22d3ee", launcherIcon: "#06121a" },
    header: { style: "minimal", showAvatar: true, showStatus: true }, avatarShape: "rounded",
    launcher: { ...DEFAULT_DESIGN.launcher, shape: "rounded", icon: "sparkles" },
    accentGradient: { enabled: true, to: "#a855f7", angle: 120 },
    effects: { glass: false, blur: 18, pattern: "grid", patternOpacity: 14, glow: true },
    messages: { animation: "pop", typing: "wave", avatar: false, shadow: false }, composer: { style: "filled", sendIcon: "sparkle", placeholder: "" },
    attention: { pulse: true, teaser: "", teaserDelay: 8 } } },
  pastel: { label: "Пастель", design: { ...DEFAULT_DESIGN, font: "comfortaa", radius: 28, bubbleRadius: 22, buttonRadius: 22, shadow: "soft", bubbleStyle: "rounded",
    colors: { ...LIGHT, accent: "#f472b6", userBubble: "#fbcfe8", userText: "#5b1a3b", button: "#f472b6", launcherBg: "#f472b6", botBubble: "#fef3f8", border: "#fbe1ee", surface: "#fff7fb", headerBg: "#fff7fb" },
    background: { type: "gradient", from: "#fff7fb", to: "#f0f9ff", angle: 160 },
    header: { style: "minimal", showAvatar: true, showStatus: true }, avatarShape: "circle",
    launcher: { ...DEFAULT_DESIGN.launcher, shape: "circle", icon: "chat" },
    effects: { glass: false, blur: 18, pattern: "dots", patternOpacity: 14, glow: false },
    messages: { animation: "pop", typing: "dots", avatar: true, shadow: false }, composer: { style: "pill", sendIcon: "arrow", placeholder: "" },
    welcome: { layout: "hero", title: "", text: "", showSuggestions: true } } },
  editorial: { label: "Журнал", design: { ...DEFAULT_DESIGN, font: "plex", headingFont: "cormorant", radius: 4, bubbleRadius: 4, buttonRadius: 2, shadow: "medium", bubbleStyle: "square", borderWidth: 1,
    colors: { ...LIGHT, accent: "#111111", accentText: "#ffffff", userBubble: "#111111", button: "#111111", launcherBg: "#111111", botBubble: "#f5f3ee", background: "#fffdf8", surface: "#f5f3ee", border: "#e4e0d6", headerBg: "#fffdf8" },
    header: { style: "minimal", showAvatar: false, showStatus: true },
    launcher: { ...DEFAULT_DESIGN.launcher, shape: "square", icon: "message" },
    effects: { glass: false, blur: 18, pattern: "noise", patternOpacity: 10, glow: false },
    messages: { animation: "fade", typing: "pulse", avatar: false, shadow: false }, composer: { style: "outlined", sendIcon: "arrow", placeholder: "" },
    welcome: { layout: "hero", title: "", text: "", showSuggestions: true } } },
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
  const grad = obj(v.accentGradient), fx = obj(v.effects), msg = obj(v.messages), composer = obj(v.composer), attention = obj(v.attention);
  const glass = bool(fx.glass, base.effects.glass);
  return {
    colors: normalizeColors(v.colors, base.colors), dark: normalizeColors(v.dark, base.dark),
    font: pick(v.font, Object.keys(FONTS) as FontKey[], base.font), fontSize: num(v.fontSize, 12, 18, base.fontSize),
    width: num(v.width, 320, 480, base.width), height: num(v.height, 440, 760, base.height),
    radius: num(v.radius, 0, 28, base.radius), bubbleRadius: num(v.bubbleRadius, 2, 24, base.bubbleRadius), buttonRadius: num(v.buttonRadius, 0, 24, base.buttonRadius),
    shadow: pick(v.shadow, ["none", "soft", "medium", "strong"], base.shadow), borderWidth: num(v.borderWidth, 0, 3, base.borderWidth), opacity: num(v.opacity, glass ? 55 : 85, 100, base.opacity),
    background: { type: pick(bg.type, ["solid", "gradient"], base.background.type), from: color(bg.from, base.background.from), to: color(bg.to, base.background.to), angle: num(bg.angle, 0, 360, base.background.angle) },
    bubbleStyle: pick(v.bubbleStyle, ["rounded", "tail", "square"], base.bubbleStyle),
    header: { style: pick(header.style, ["solid", "accent", "gradient", "minimal", "glass"], base.header.style), showAvatar: bool(header.showAvatar, base.header.showAvatar), showStatus: bool(header.showStatus, base.header.showStatus) },
    avatarShape: pick(v.avatarShape, ["circle", "rounded", "square"], base.avatarShape),
    launcher: { icon: pick(launcher.icon, ["chat", "sparkles", "message", "help", "avatar"], base.launcher.icon), shape: pick(launcher.shape, ["circle", "rounded", "square"], base.launcher.shape), size: num(launcher.size, 44, 64, base.launcher.size), label: str(launcher.label, 30) },
    welcome: { layout: pick(welcome.layout, ["bubble", "hero"], base.welcome.layout), title: str(welcome.title, 80), text: str(welcome.text, 240), showSuggestions: bool(welcome.showSuggestions, base.welcome.showSuggestions) },
    animation: { open: pick(animation.open, ["scale", "slide", "fade", "none"], base.animation.open), durationMs: num(animation.durationMs, 0, 600, base.animation.durationMs) },
    appearance: { showOnMobile: bool(appearance.showOnMobile, base.appearance.showOnMobile), mobileLauncherSize: num(appearance.mobileLauncherSize, 40, 64, base.appearance.mobileLauncherSize), mobilePosition: pick(appearance.mobilePosition, ["right", "left"], base.appearance.mobilePosition) },
    headingFont: pick(v.headingFont, ["same", ...Object.keys(FONTS)] as Array<FontKey | "same">, base.headingFont),
    accentGradient: { enabled: bool(grad.enabled, base.accentGradient.enabled), to: color(grad.to, base.accentGradient.to), angle: num(grad.angle, 0, 360, base.accentGradient.angle) },
    effects: { glass, blur: num(fx.blur, 4, 32, base.effects.blur), pattern: pick(fx.pattern, ["none", "dots", "grid", "diagonal", "aurora", "noise"], base.effects.pattern), patternOpacity: num(fx.patternOpacity, 2, 40, base.effects.patternOpacity), glow: bool(fx.glow, base.effects.glow) },
    messages: { animation: pick(msg.animation, ["rise", "pop", "fade", "none"], base.messages.animation), typing: pick(msg.typing, ["dots", "wave", "pulse"], base.messages.typing), avatar: bool(msg.avatar, base.messages.avatar), shadow: bool(msg.shadow, base.messages.shadow) },
    composer: { style: pick(composer.style, ["outlined", "filled", "pill"], base.composer.style), sendIcon: pick(composer.sendIcon, ["arrow", "send", "sparkle"], base.composer.sendIcon), placeholder: str(composer.placeholder, 60) },
    attention: { pulse: bool(attention.pulse, base.attention.pulse), teaser: str(attention.teaser, 90), teaserDelay: num(attention.teaserDelay, 2, 60, base.attention.teaserDelay) },
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
  /** The AI writes first (Starter and Custom). */
  proactive?: Proactive;
};
/** First messages from the AI: shown with an unread badge on the closed card, then at the top of the chat. */
export type Proactive = { enabled: boolean; messages: string[]; delay: number };
export const DEFAULT_PROACTIVE: Proactive = { enabled: false, messages: [], delay: 6 };
export function normalizeProactive(raw: unknown): Proactive {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const messages = Array.isArray(v.messages) ? v.messages.map(item => typeof item === "string" ? item.replace(/[\u0000-\u0008\u000b-\u001f<>]/g, "").trim().slice(0, 300) : "").filter(Boolean).slice(0, 3) : [];
  const delay = Number(v.delay);
  return { enabled: v.enabled === true && messages.length > 0, messages, delay: Number.isFinite(delay) ? Math.max(0, Math.min(120, Math.round(delay))) : DEFAULT_PROACTIVE.delay };
}
/** What the card actually shows for a plan tier. Stored Custom settings stay untouched in the database after a downgrade. */
export type ResolvedLook = {
  title?: string; status?: string; greeting?: string; help?: string; suggestions?: string[];
  position: "right" | "left"; theme: "auto" | "light" | "dark"; autoOpenSeconds: number; hostedLink: boolean;
  avatarUrl: string; leadForm: boolean; design: Design; tier: DesignTier; proactive: Proactive;
};

export function resolveLook(stored: StoredLook | undefined, tier: DesignTier): ResolvedLook {
  const s = stored ?? {};
  const withAccent = (design: Design, accent?: string) => accent && HEX.test(accent) ? { ...design, colors: { ...design.colors, accent, userBubble: accent, button: accent, launcherBg: accent }, dark: { ...design.dark, accent, userBubble: accent, button: accent, launcherBg: accent } } : design;
  // Trial and Starter: the Lemeri design as is, only light or dark ("auto" shows light).
  const fixedTheme = s.theme === "dark" ? "dark" as const : "light" as const;
  const base = { title: s.title, greeting: s.greeting, help: s.help, position: s.position ?? "right", theme: tier === "custom" ? s.theme ?? "auto" : fixedTheme, hostedLink: s.hostedLink !== false, leadForm: s.leadForm !== false, tier, avatarUrl: "", design: DEFAULT_DESIGN };
  if (tier === "basic") return { ...base, status: undefined, suggestions: undefined, autoOpenSeconds: 0, proactive: DEFAULT_PROACTIVE };
  const standard = { ...base, status: s.status, suggestions: s.suggestions, autoOpenSeconds: s.autoOpenSeconds ?? 0, proactive: normalizeProactive(s.proactive) };
  if (tier === "standard") return standard;
  const avatarUrl = s.avatarUrl ?? "";
  if (!s.design) return { ...standard, avatarUrl, design: withAccent(READY_STYLES[s.style ?? "classic"]?.design ?? DEFAULT_DESIGN, s.accent) };
  return { ...standard, avatarUrl, design: normalizeDesign(s.design) };
}

// ------------------------------------------------------------------ CSS
const SHADOWS = { none: "none", soft: "0 2px 6px rgba(20,20,40,.06),0 12px 32px -12px rgba(20,20,40,.18)", medium: "0 4px 8px rgba(20,20,40,.08),0 28px 72px -12px rgba(20,20,40,.28)", strong: "0 8px 16px rgba(20,20,40,.16),0 36px 90px -10px rgba(20,20,40,.45)" };
const alpha = (hex: string, opacity: number) => `${hex}${Math.round((opacity / 100) * 255).toString(16).padStart(2, "0")}`;

/** Background texture for the chat (CSS background-image), drawn at --lw-pattern-o opacity. */
export function patternImage(design: Design, c: Colors) {
  const ink = c.text, accent = c.accent, to = design.accentGradient.enabled ? design.accentGradient.to : c.accent;
  switch (design.effects.pattern) {
    case "dots": return `radial-gradient(${ink} 1px,transparent 1.6px) 0 0/16px 16px`;
    case "grid": return `linear-gradient(${ink} 1px,transparent 1px) 0 0/22px 22px,linear-gradient(90deg,${ink} 1px,transparent 1px) 0 0/22px 22px`;
    case "diagonal": return `repeating-linear-gradient(45deg,${ink} 0 1px,transparent 1px 11px)`;
    case "aurora": return `radial-gradient(70% 55% at 0% 0%,${accent},transparent 70%),radial-gradient(60% 50% at 100% 15%,${to},transparent 70%),radial-gradient(60% 40% at 50% 100%,${accent},transparent 75%)`;
    case "noise": return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
    default: return "none";
  }
}
/** Accent fill: a gradient when enabled, otherwise the plain colour. */
export const accentFill = (design: Design, base: string) => design.accentGradient.enabled ? `linear-gradient(${design.accentGradient.angle}deg,${base},${design.accentGradient.to})` : base;

/** CSS custom properties for the chat iframe (website-widget.tsx). */
export function chatVars(design: Design, dark: boolean): Record<string, string> {
  const c = dark ? design.dark : design.colors;
  const bg = design.background.type === "gradient" && !dark ? `linear-gradient(${design.background.angle}deg,${alpha(design.background.from, design.opacity)},${alpha(design.background.to, design.opacity)})` : alpha(c.background, design.opacity);
  const r = design.bubbleRadius;
  const tail = design.bubbleStyle === "tail" ? Math.min(6, r) : design.bubbleStyle === "square" ? Math.min(4, r) : r;
  return {
    "--lw-font": FONTS[design.font].css, "--lw-fs": `${design.fontSize}px`,
    "--lw-head-font": FONTS[design.headingFont === "same" ? design.font : design.headingFont].css,
    "--lw-accent": c.accent, "--lw-accent-text": c.accentText, "--lw-bg": bg, "--lw-surface": c.surface, "--lw-text": c.text, "--lw-muted": c.muted, "--lw-border": c.border,
    "--lw-user": c.userBubble, "--lw-user-fill": accentFill(design, c.userBubble), "--lw-user-text": c.userText, "--lw-bot": c.botBubble, "--lw-bot-text": c.botText,
    "--lw-btn": c.button, "--lw-btn-fill": accentFill(design, c.button), "--lw-btn-text": c.buttonText, "--lw-btn-radius": `${design.buttonRadius}px`,
    "--lw-accent-fill": accentFill(design, c.accent),
    "--lw-bubble-r": `${design.bubbleStyle === "square" ? Math.min(6, r) : r}px`, "--lw-bubble-tail": `${tail}px`,
    "--lw-head-bg": c.headerBg, "--lw-head-text": c.headerText,
    "--lw-pattern": patternImage(design, c), "--lw-pattern-o": String(design.effects.pattern === "aurora" ? design.effects.patternOpacity / 100 : design.effects.patternOpacity / 200),
    "--lw-blur": `${design.effects.blur}px`,
  };
}

/** Values the embed shell (embed-client.ts) needs. Kept small: it is inlined into embed.js. */
export function shellConfig(design: Design) {
  const heading = design.headingFont === "same" ? design.font : design.headingFont;
  return {
    light: { accent: design.colors.accent, bg: design.colors.background, bg2: design.colors.surface, text: design.colors.text, text3: design.colors.muted, line: design.colors.border, head: design.colors.headerBg, headText: design.colors.headerText, launcher: design.colors.launcherBg, launcherIcon: design.colors.launcherIcon },
    dark: { accent: design.dark.accent, bg: design.dark.background, bg2: design.dark.surface, text: design.dark.text, text3: design.dark.muted, line: design.dark.border, head: design.dark.headerBg, headText: design.dark.headerText, launcher: design.dark.launcherBg, launcherIcon: design.dark.launcherIcon },
    radius: design.radius, border: design.borderWidth, shadow: SHADOWS[design.shadow], width: design.width, height: design.height,
    headerStyle: design.header.style, showAvatar: design.header.showAvatar, showStatus: design.header.showStatus, avatarShape: design.avatarShape,
    launcherIcon: design.launcher.icon, launcherShape: design.launcher.shape, launcherSize: design.launcher.size, launcherLabel: design.launcher.label,
    animation: design.animation.open, duration: design.animation.durationMs, font: FONTS[design.font].css, fontHref: fontHref(design.font),
    headFont: FONTS[heading].css, headFontHref: heading === design.font ? "" : fontHref(heading),
    showOnMobile: design.appearance.showOnMobile, mobileLauncherSize: design.appearance.mobileLauncherSize, mobilePosition: design.appearance.mobilePosition,
    /** "" = solid accent; otherwise the second gradient colour and angle. */
    gradTo: design.accentGradient.enabled ? design.accentGradient.to : "", gradAngle: design.accentGradient.angle,
    glass: design.effects.glass, blur: design.effects.blur, opacity: design.opacity, glow: design.effects.glow,
    pulse: design.attention.pulse, teaser: design.attention.teaser, teaserDelay: design.attention.teaserDelay,
  };
}
export type ShellConfig = ReturnType<typeof shellConfig>;

// ------------------------------------------------------------------ saving by plan
const STANDARD_KEYS = ["status", "suggestions", "autoOpenSeconds", "proactive"] as const;
const CUSTOM_KEYS = ["design", "presets", "accent", "avatarUrl", "style"] as const;
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

