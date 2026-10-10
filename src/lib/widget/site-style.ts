// "Подобрать под сайт": reads the look of the owner's website (colours, fonts,
// corner radii, light/dark) from its HTML and CSS, and turns it into a card design.
// Pure module (no I/O) so it is unit-tested; fetching lives in site-fetch.ts and the
// AI refinement in the match-design API route. Everything that leaves this module
// goes through normalizeDesign(), so a strange site can never produce a broken card.

import { DEFAULT_DESIGN, FONTS, normalizeDesign, type Colors, type Design, type FontKey } from "./design.ts";

// ------------------------------------------------------------------ colours
type RGB = [number, number, number];
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const hex = ([r, g, b]: RGB) => `#${[r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
export function parseColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4) return hex([0, 1, 2].map(i => parseInt(h[i]! + h[i]!, 16)) as RGB);
    if (h.length === 6 || h.length === 8) { if (h.length === 8 && parseInt(h.slice(6, 8), 16) < 128) return null; return `#${h.slice(0, 6)}`; }
    return null;
  }
  m = v.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const ch = (s: string) => (s.endsWith("%") ? parseFloat(s) * 2.55 : parseFloat(s));
    const a = m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    if (a < 0.5) return null;
    return hex([ch(m[1]!), ch(m[2]!), ch(m[3]!)]);
  }
  m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    if (a < 0.5) return null;
    const h = parseFloat(m[1]!) / 360, s = parseFloat(m[2]!) / 100, l = parseFloat(m[3]!) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return hex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]);
  }
  if (v === "white" || v === "#fff") return "#ffffff";
  if (v === "black") return "#000000";
  return null;
}
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function luminance(h: string) {
  const [r, g, b] = rgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };
function hsl(h: string) {
  const [r, g, b] = rgb(h).map(v => v / 255) as RGB;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}
const isNeutral = (h: string) => { const { s, l } = hsl(h); return s < 0.18 || l > 0.93 || l < 0.08; };
/** Mixes two colours (t = share of b). */
export function mix(a: string, b: string, t: number) { const x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(i => x[i]! + (y[i]! - x[i]!) * t) as RGB); }
/** Text colour that reads on the given background. */
export const readableOn = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#111318") ? "#ffffff" : "#111318");

// ------------------------------------------------------------------ CSS reading
export type SiteTokens = {
  url: string; title: string;
  /** Best guess for the brand colour, or "" when the site is monochrome. */
  accent: string; accentSource: string;
  /** Other brand colours, strongest first. */
  palette: string[];
  background: string; text: string; dark: boolean;
  buttonBg: string; buttonText: string; link: string;
  bodyFont: string; headingFont: string; fonts: string[];
  buttonRadius: number | null; cardRadius: number | null; pill: boolean;
  shadowy: boolean;
};

type Rule = { selector: string; decls: Array<[string, string]> };
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Innermost blocks only: @media wrappers just disappear.
  const re = /([^{}@;]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null, count = 0;
  while ((m = re.exec(clean)) && count++ < 20000) {
    const decls: Array<[string, string]> = [];
    for (const part of m[2]!.split(";")) { const i = part.indexOf(":"); if (i > 0) decls.push([part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).replace(/!important/i, "").trim()]); }
    out.push({ selector: m[1]!.trim().toLowerCase(), decls });
  }
  return out;
}
const BRAND_VAR = /(primary|accent|brand|main|theme|cta|btn|button|highlight|key)/;
const BUTTON_SEL = /(^|[\s,>+~(])(button|\.btn|\.button|\[type=["']?submit|\.cta|input\[type=["']?(submit|button)|\.wp-block-button__link|\.add[_-]to[_-]cart|\.t-btn|\.t-submit|\.uk-button|\.elementor-button|\.shopify-payment-button|\.product-form__submit)/;
const firstFamily = (value: string) => value.split(",").map(item => item.trim().replace(/^["']|["']$/g, "")).find(item => item && !/^(var\(|inherit|initial|unset)/.test(item)) ?? "";
function px(value: string) { const m = value.trim().match(/^([\d.]+)(px|rem|em|%)?/); if (!m) return null; const n = parseFloat(m[1]!); return m[2] === "rem" || m[2] === "em" ? n * 16 : m[2] === "%" ? (n >= 50 ? 999 : null) : n; }

export function readSiteTokens(input: { url: string; html: string; css: string }): SiteTokens {
  const html = input.html.slice(0, 1_500_000);
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join("\n");
  const all = rules(`${inlineCss}\n${input.css}`);
  const title = (html.match(/<title[^>]*>([^<]{0,160})/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const meta = (name: string) => html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]*>`, "i"))?.[0].match(/content=["']([^"']+)/i)?.[1] ?? "";
  const themeColor = parseColor(meta("theme-color")) ?? parseColor(meta("msapplication-TileColor")) ?? "";

  // Custom properties first: frameworks keep the brand colour there.
  const vars = new Map<string, string>();
  for (const rule of all) for (const [k, v] of rule.decls) if (k.startsWith("--") && !vars.has(k)) vars.set(k, v);
  const resolve = (value: string, depth = 0): string => {
    const m = value.match(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/);
    if (!m || depth > 4) return value;
    return resolve(vars.get(m[1]!) ?? m[2] ?? "", depth + 1);
  };
  const colorOf = (value: string) => {
    const v = resolve(value);
    for (const token of v.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(white|black)\b/gi) ?? []) { const c = parseColor(token); if (c) return c; }
    return null;
  };

  const score = new Map<string, { w: number; src: string }>();
  const vote = (c: string | null, w: number, src: string) => { if (!c || isNeutral(c)) return; const cur = score.get(c); score.set(c, { w: (cur?.w ?? 0) + w, src: cur && cur.w >= w ? cur.src : src }); };
  for (const [k, v] of vars) if (BRAND_VAR.test(k)) vote(colorOf(v), /primary|brand|accent/.test(k) ? 12 : 6, "css-var");
  if (themeColor) vote(themeColor, 9, "theme-color");

  let background = "", text = "", buttonBg = "", buttonText = "", link = "", bodyFont = "", headingFont = "";
  const buttonRadii: number[] = [], cardRadii: number[] = [];
  let shadows = 0;
  for (const rule of all) {
    const sel = rule.selector;
    const isBody = /(^|,)\s*(html|body|:root)\s*(,|$)/.test(sel);
    const isButton = BUTTON_SEL.test(sel) && !/:(disabled|focus)/.test(sel);
    const isHeading = /(^|[\s,])h[1-3]\b/.test(sel);
    const isLink = /(^|,)\s*a(:link|:visited)?\s*(,|$)/.test(sel);
    const isCard = /(card|panel|modal|product|tile|box)/.test(sel);
    for (const [k, v] of rule.decls) {
      if (k === "background" || k === "background-color") {
        const c = colorOf(v);
        if (isBody && c && !background) background = c;
        if (isButton && c) { vote(c, sel.includes(":hover") ? 2 : 7, "buttons"); if (!buttonBg && !sel.includes(":hover") && !isNeutral(c)) buttonBg = c; }
        else vote(c, 1, "backgrounds");
      } else if (k === "color") {
        const c = colorOf(v);
        if (isBody && c && !text) text = c;
        if (isButton && c && !buttonText && !sel.includes(":hover")) buttonText = c;
        if (isLink && c) { vote(c, 3, "links"); if (!link) link = c; }
        else vote(c, 0.5, "text");
      } else if (k === "border-color" || k === "border") { if (isButton) vote(colorOf(v), 2, "buttons"); }
      else if (k === "font-family" || k === "font") {
        const family = firstFamily(resolve(k === "font" ? v.replace(/^.*?\d+(px|rem|em|%)?(\/[\d.]+\w*)?\s+/, "") : v));
        if (isBody && family && !bodyFont) bodyFont = family;
        if (isHeading && family && !headingFont) headingFont = family;
      } else if (k === "border-radius") {
        const r = px(resolve(v));
        if (r !== null) { if (isButton) buttonRadii.push(r); else if (isCard) cardRadii.push(r); }
      } else if (k === "box-shadow" && isCard && !/none/.test(v)) shadows++;
    }
  }
  // Inline styles of page builders (Tilda, Wix, Elementor) carry colours too.
  for (const m of html.matchAll(/style=["'][^"']*background(?:-color)?:\s*([^;"']+)/gi)) vote(colorOf(m[1]!), 0.7, "page");
  const googleFamilies = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/gi)].flatMap(m => [...decodeURIComponent(m[1]!.replace(/&amp;/g, "&")).matchAll(/family=([^:&|]+)/g)].map(f => f[1]!.replace(/\+/g, " ")));
  if (!bodyFont && googleFamilies[0]) bodyFont = googleFamilies[0];

  const ranked = [...score.entries()].sort((a, b) => b[1].w - a[1].w);
  const accentEntry = ranked.find(([c]) => { const { l } = hsl(c); return l > 0.18 && l < 0.82; }) ?? ranked[0];
  const bg = background || "#ffffff";
  const median = (list: number[]) => list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]! : null;
  const btnR = median(buttonRadii);
  return {
    url: input.url, title, accent: accentEntry?.[0] ?? "", accentSource: accentEntry?.[1].src ?? "",
    palette: ranked.slice(0, 6).map(([c]) => c),
    background: bg, text: text || (luminance(bg) < 0.35 ? "#f1f1f4" : "#17191f"), dark: luminance(bg) < 0.3,
    buttonBg, buttonText, link,
    bodyFont, headingFont: headingFont || bodyFont, fonts: [...new Set([bodyFont, headingFont, ...googleFamilies].filter(Boolean))].slice(0, 6),
    buttonRadius: btnR === null ? null : Math.min(btnR, 999), cardRadius: median(cardRadii), pill: (btnR ?? 0) >= 40,
    shadowy: shadows >= 2,
  };
}

// ------------------------------------------------------------------ fonts
const FONT_ALIASES: Array<[RegExp, FontKey]> = [
  [/inter\b/, "inter"], [/manrope/, "manrope"], [/roboto(?! ?(mono|slab))/, "roboto"], [/montserrat/, "montserrat"], [/open ?sans/, "opensans"],
  [/nunito/, "nunito"], [/pt ?sans|pt root/, "ptsans"], [/rubik/, "rubik"], [/golos/, "golos"], [/lora/, "lora"], [/mono|code|consol|courier/, "mono"],
  [/onest/, "onest"], [/raleway/, "raleway"], [/plex/, "plex"], [/comfortaa|quicksand|varela round|m ?plus rounded/, "comfortaa"], [/unbounded|druk|bebas|oswald|anton/, "unbounded"],
  [/playfair|bodoni|didot|prata|abril/, "playfair"], [/cormorant|garamond|cinzel|marcellus|tenor/, "cormorant"],
  [/merriweather|georgia|times|pt serif|noto serif|source serif|libre baskerville|lusitana|serif$/, "lora"],
  [/gilroy|proxima|tt (norms|commons|hoves)|circular|graphik|euclid|sf pro|helvetica|arial|segoe|system-ui|-apple-system|blinkmacsystemfont|geist|ys text|yandex sans|lato|work sans|dm sans|poppins|jost|figtree|mulish|ubuntu|exo|source sans/, "system"],
];
export function matchFont(family: string): FontKey | null {
  const name = family.trim().toLowerCase();
  if (!name) return null;
  for (const [key, font] of Object.entries(FONTS) as Array<[FontKey, (typeof FONTS)[FontKey]]>) if (font.label.toLowerCase().split(" (")[0] === name) return key;
  for (const [re, key] of FONT_ALIASES) if (re.test(name)) return key;
  return null;
}
// Poppins, DM Sans and friends are closest to Manrope/Inter among our fonts.
const geometric = /poppins|dm sans|figtree|jost|euclid|gilroy|circular|tt norms|tt commons|graphik/;

// ------------------------------------------------------------------ design
/** Deterministic design from the site's tokens. Also the base the AI refines. */
export function designFromTokens(t: SiteTokens): { design: Design; theme: "light" | "dark" } {
  const accent = t.accent || t.buttonBg || (t.dark ? "#f1f1f4" : "#17191f");
  const accentText = t.buttonText && contrast(t.buttonText, accent) >= 3 ? t.buttonText : readableOn(accent);
  const lightBg = t.dark ? "#ffffff" : t.background;
  const lightText = t.dark ? "#17191f" : (contrast(t.text, lightBg) >= 4.5 ? t.text : "#17191f");
  const palette = (bg: string, text: string, isDark: boolean): Colors => ({
    accent, accentText, background: bg, surface: mix(bg, text, isDark ? 0.06 : 0.035), text, muted: mix(text, bg, 0.42), border: mix(bg, text, isDark ? 0.16 : 0.1),
    userBubble: accent, userText: accentText, botBubble: mix(bg, accent, isDark ? 0.1 : 0.06), botText: text,
    headerBg: bg, headerText: text, button: accent, buttonText: accentText, launcherBg: accent, launcherIcon: accentText,
  });
  const darkBg = t.dark ? t.background : "#15171c";
  const darkText = t.dark && contrast(t.text, darkBg) >= 4.5 ? t.text : "#eceef3";
  const body = matchFont(t.bodyFont) ?? (geometric.test(t.bodyFont.toLowerCase()) ? "manrope" : "system");
  const heading = matchFont(t.headingFont);
  const r = t.buttonRadius;
  const buttonRadius = r === null ? 12 : clamp(Math.round(r), 0, 24);
  const cardRadius = t.cardRadius !== null ? clamp(Math.round(t.cardRadius * 1.2), 4, 28) : r === null ? 18 : t.pill ? 24 : clamp(Math.round(r * 1.6), 4, 26);
  const square = r !== null && r <= 3;
  const design = normalizeDesign({
    ...DEFAULT_DESIGN,
    colors: palette(lightBg, lightText, false), dark: palette(darkBg, darkText, true),
    font: body, headingFont: heading && heading !== body ? heading : "same",
    radius: cardRadius, bubbleRadius: clamp(square ? 4 : Math.round(cardRadius * 0.85), 2, 24), buttonRadius: t.pill ? 24 : buttonRadius,
    bubbleStyle: square ? "square" : t.pill ? "rounded" : "tail",
    shadow: t.shadowy ? "medium" : "soft", borderWidth: 1,
    header: { style: t.accent ? "gradient" : "minimal", showAvatar: true, showStatus: true },
    avatarShape: t.pill ? "circle" : square ? "square" : "rounded",
    launcher: { ...DEFAULT_DESIGN.launcher, shape: t.pill ? "circle" : square ? "square" : "rounded" },
    composer: { ...DEFAULT_DESIGN.composer, style: t.pill ? "pill" : "outlined" },
  });
  // A site has one look: a light site keeps a light card even for dark-mode visitors.
  return { design, theme: t.dark ? "dark" : "light" };
}

/** What the AI may change on top of the deterministic design (all optional, all validated). */
export type DesignPatch = Partial<{
  accent: string; accentText: string; gradientTo: string; useGradient: boolean;
  font: string; headingFont: string; headerStyle: string; bubbleStyle: string; shadow: string;
  radius: number; bubbleRadius: number; buttonRadius: number; launcherShape: string; launcherIcon: string;
  pattern: string; glass: boolean; glow: boolean; messageAnimation: string; typing: string; composerStyle: string;
  teaser: string; launcherLabel: string;
}>;
/** Applies an AI patch safely: unknown values are dropped, colours must keep text readable. */
export function applyPatch(base: Design, patch: DesignPatch): Design {
  const p = patch ?? {};
  const c = (value: unknown) => (typeof value === "string" ? parseColor(value) : null);
  const accent = c(p.accent) ?? base.colors.accent;
  const accentText = (() => { const t = c(p.accentText); return t && contrast(t, accent) >= 3 ? t : contrast(base.colors.accentText, accent) >= 3 ? base.colors.accentText : readableOn(accent); })();
  const tint = (pal: Colors): Colors => ({ ...pal, accent, accentText, userBubble: accent, userText: accentText, button: accent, buttonText: accentText, launcherBg: accent, launcherIcon: accentText });
  const fontKey = (value: unknown) => (typeof value === "string" ? (value in FONTS ? value as FontKey : matchFont(value)) : null);
  const font = fontKey(p.font) ?? base.font;
  const headingFont = p.headingFont === "same" ? "same" : fontKey(p.headingFont) ?? base.headingFont;
  const gradTo = c(p.gradientTo);
  return normalizeDesign({
    ...base,
    colors: tint(base.colors), dark: tint(base.dark), font, headingFont: headingFont === font ? "same" : headingFont,
    radius: p.radius ?? base.radius, bubbleRadius: p.bubbleRadius ?? base.bubbleRadius, buttonRadius: p.buttonRadius ?? base.buttonRadius,
    shadow: p.shadow ?? base.shadow, bubbleStyle: p.bubbleStyle ?? base.bubbleStyle,
    header: { ...base.header, style: p.headerStyle ?? base.header.style },
    launcher: { ...base.launcher, shape: p.launcherShape ?? base.launcher.shape, icon: p.launcherIcon ?? base.launcher.icon, label: typeof p.launcherLabel === "string" ? p.launcherLabel : base.launcher.label },
    accentGradient: { enabled: Boolean(p.useGradient && gradTo && gradTo !== accent), to: gradTo ?? base.accentGradient.to, angle: base.accentGradient.angle },
    effects: { ...base.effects, pattern: p.pattern ?? base.effects.pattern, glass: p.glass ?? base.effects.glass, glow: p.glow ?? base.effects.glow },
    opacity: p.glass === true ? Math.min(base.opacity, 76) : p.glass === false && base.opacity < 85 ? 100 : base.opacity,
    messages: { ...base.messages, animation: p.messageAnimation ?? base.messages.animation, typing: p.typing ?? base.messages.typing },
    composer: { ...base.composer, style: p.composerStyle ?? base.composer.style },
    attention: { ...base.attention, teaser: typeof p.teaser === "string" ? p.teaser : base.attention.teaser },
  });
}

/** Short, model-friendly summary of the tokens (kept small to save tokens). */
export function tokensForPrompt(t: SiteTokens) {
  return { site: t.url, title: t.title, brandColor: t.accent || null, brandColorFrom: t.accentSource || null, otherColors: t.palette.slice(1, 5), pageBackground: t.background, pageText: t.text, darkSite: t.dark, buttonColor: t.buttonBg || null, buttonTextColor: t.buttonText || null, linkColor: t.link || null, bodyFont: t.bodyFont || null, headingFont: t.headingFont || null, buttonRadiusPx: t.buttonRadius, cardRadiusPx: t.cardRadius, pillButtons: t.pill, usesShadows: t.shadowy };
}
