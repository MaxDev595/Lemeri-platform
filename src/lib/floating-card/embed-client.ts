// Runs on the customer's website (shipped by /api/widget/[id]/embed.js as source
// text). It renders the same floating card as the in-app Lemiri assistant —
// launcher, drag, resize, docking, pin, maximize, theme — around the chat iframe.
//
// IMPORTANT: must stay self-contained (no imports, no module-level references).

import type { floatingCardRuntime } from "./runtime";
import type { ShellConfig } from "../widget/design";

export type WidgetBootConfig = {
  base: string; employeeId: string; frameUrl: string; tokenUrl: string; token: string;
  name: string; status: string; locale: "ru" | "en";
  labels: { open: string; collapse: string; pin: string; unpin: string; maximize: string; restore: string };
  /** Look configured in the Lemiri cabinet; data-* attributes on the script tag override it. */
  accent?: string; theme?: "auto" | "light" | "dark"; position?: "left" | "right"; autoOpenSeconds?: number;
  /** Card design for the current plan (lib/widget/design.ts → shellConfig). */
  shell?: ShellConfig; avatar?: string;
};

export function lemiriWidgetBootstrap(runtimeFactory: typeof floatingCardRuntime, cfg: WidgetBootConfig) {
  const d = document;
  if (d.getElementById("lemiri-widget-root")) return;
  const script = d.currentScript as HTMLScriptElement | null;
  const themeAttr = script?.dataset.theme;
  const theme = themeAttr === "light" || themeAttr === "dark" || themeAttr === "auto" ? themeAttr : cfg.theme ?? "auto";
  const accentAttr = script?.dataset.accent || cfg.accent || "";
  const accent = /^#[0-9a-f]{3,8}$/i.test(accentAttr) ? accentAttr : "";
  const startOpen = script?.dataset.open === "true";
  const posAttr = script?.dataset.position;
  const position = posAttr === "left" || posAttr === "right" ? posAttr : cfg.position ?? "right";
  if (!d.body) { d.addEventListener("DOMContentLoaded", build, { once: true }); return; }
  build();
  function build() {

  const icons = {
    sparkles: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    message: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
    help: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    chat: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    max: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    min: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>',
    collapse: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  };
  // Design for the current plan; defaults equal the classic Lemiri card.
  type Pal = { accent: string; bg: string; bg2: string; text: string; text3: string; line: string; head: string; headText: string; launcher: string; launcherIcon: string };
  const defLight: Pal = { accent: "#6254e8", bg: "#ffffff", bg2: "#f6f6f9", text: "#17191f", text3: "#6b7080", line: "#e6e7ec", head: "#ffffff", headText: "#17191f", launcher: "#6254e8", launcherIcon: "#ffffff" };
  const defDark: Pal = { accent: "#7466f5", bg: "#15171c", bg2: "#1a1c22", text: "#eceef3", text3: "#9398a6", line: "#2a2d36", head: "#15171c", headText: "#eceef3", launcher: "#7466f5", launcherIcon: "#ffffff" };
  const sh = cfg.shell ?? { light: defLight, dark: defDark, radius: 18, border: 1, shadow: "0 4px 8px rgba(20,20,40,.08),0 28px 72px -12px rgba(20,20,40,.28)", width: 400, height: 640, headerStyle: "gradient", showAvatar: true, showStatus: true, avatarShape: "rounded", launcherIcon: "chat", launcherShape: "rounded", launcherSize: 56, launcherLabel: "", animation: "scale", duration: 200, font: "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", fontHref: "", showOnMobile: true, mobileLauncherSize: 52, mobilePosition: "right", headFont: "", headFontHref: "", gradTo: "", gradAngle: 135, glass: false, blur: 18, opacity: 100, glow: false, pulse: false, teaser: "", teaserDelay: 8 };
  const L = sh.light, D = sh.dark;
  // An accent from data-accent overrides the palette accent (and the launcher/user colours that follow it).
  const fill = (c: string) => (sh.gradTo ? `linear-gradient(${sh.gradAngle}deg,${c},${sh.gradTo})` : c);
  const glassBg = (c: string) => `color-mix(in srgb,${c} ${Math.max(40, sh.opacity)}%,transparent)`;
  const vars = (p: Pal, override: string) => { const a = override || p.accent; const l = override || p.launcher; return `--lw-fill:${fill(a)};--lw-launcher-fill:${fill(l)};--lw-card-bg:${sh.glass ? glassBg(p.bg) : p.bg};--lw-head-glass:${glassBg(p.head)};--lw-bg:${p.bg};--lw-bg2:${p.bg2};--lw-hover:color-mix(in srgb,${p.text} 7%,${p.bg});--lw-text:${p.text};--lw-text3:${p.text3};--lw-line:${p.line};--lw-accent:${a};--lw-head:${p.head};--lw-head-text:${p.headText};--lw-launcher:${l};--lw-launcher-icon:${p.launcherIcon}`; };
  const shapeRadius = (shape: string, size: number) => (shape === "circle" ? "50%" : shape === "square" ? `${Math.round(size * 0.12)}px` : `${Math.round(size * 0.32)}px`);
  const hiddenOnThisScreen = !sh.showOnMobile && window.innerWidth < 640;
  if (hiddenOnThisScreen) return;
  const P = "lemiri-fc-";
  const css = `
.lemiri-root{${vars(L, accent)};--lw-accent-soft:color-mix(in srgb,var(--lw-accent) 14%,transparent);--lw-shadow:${sh.shadow};--lw-radius:${sh.radius}px;--lw-border:${sh.border}px;--lw-dur:${sh.duration}ms;--lw-launch:${sh.launcherSize}px;position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:${sh.font};color-scheme:light}
.lemiri-root[data-theme=dark]{${vars(D, accent)};color-scheme:dark}
@media (prefers-color-scheme:dark){.lemiri-root[data-theme=auto]{${vars(D, accent)};color-scheme:dark}}
.lemiri-root>*{pointer-events:auto}
.lemiri-root *{box-sizing:border-box}
.lemiri-launcher{position:fixed;display:grid;place-items:center;width:var(--lw-launch);height:var(--lw-launch);padding:0;border:0;border-radius:${shapeRadius(sh.launcherShape, sh.launcherSize)};background:var(--lw-launcher-fill);color:var(--lw-launcher-icon);overflow:visible;box-shadow:var(--lw-shadow);cursor:pointer;touch-action:none;user-select:none;transition:transform .2s cubic-bezier(.34,1.4,.64,1);animation:lemiriPop .32s cubic-bezier(.34,1.4,.64,1) both}
.lemiri-launcher:not([data-edge]),.lemiri-launcher[hidden]{display:none}
.lemiri-launcher:hover{transform:scale(1.05)}
.lemiri-launcher:focus-visible{outline:3px solid var(--lw-accent-soft);outline-offset:3px}
.lemiri-launcher[data-dragging=true]{cursor:grabbing;transform:scale(1.08);transition:none}
.lemiri-launcher[data-settling=true]{transition:left .22s cubic-bezier(.16,1,.3,1),top .22s cubic-bezier(.16,1,.3,1)}
.lemiri-launcher em{position:absolute;top:-6px;right:-6px;display:grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border:2px solid var(--lw-bg);border-radius:999px;background:#e5484d;color:#fff;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;font-style:normal}
.lemiri-card{position:fixed;display:flex;flex-direction:column;overflow:hidden;border:var(--lw-border) solid ${sh.glass ? "color-mix(in srgb,var(--lw-line) 60%,transparent)" : "var(--lw-line)"};border-radius:var(--lw-radius);background:var(--lw-card-bg);color:var(--lw-text);box-shadow:var(--lw-shadow)${sh.glow ? ",0 0 0 1px color-mix(in srgb,var(--lw-accent) 22%,transparent),0 24px 90px -24px var(--lw-accent)" : ""};${sh.glass ? `-webkit-backdrop-filter:blur(${sh.blur}px) saturate(1.6);backdrop-filter:blur(${sh.blur}px) saturate(1.6);` : ""}transition:opacity var(--lw-dur) cubic-bezier(.16,1,.3,1),transform var(--lw-dur) cubic-bezier(.16,1,.3,1)}
.lemiri-card:not([data-open]),.lemiri-card[hidden]{display:none}
.lemiri-card[data-entering=true],.lemiri-card[data-closing=true]{opacity:${sh.animation === "none" ? 1 : 0};transform:${sh.animation === "scale" ? "scale(.6)" : sh.animation === "slide" ? "translateY(28px)" : "none"}}
.lemiri-card[data-closing=true]{pointer-events:none}
.lemiri-card[data-settling=true]{transition:left .2s cubic-bezier(.16,1,.3,1),top .2s cubic-bezier(.16,1,.3,1),width .2s cubic-bezier(.16,1,.3,1),height .2s cubic-bezier(.16,1,.3,1)}
.lemiri-card[data-interacting=true]{transition:none;user-select:none}
.lemiri-card[data-interacting=true] iframe{pointer-events:none}
.lemiri-card[data-mobile=true]{border:0;border-radius:0}
@media (max-width:640px){.lemiri-root{--lw-launch:${sh.mobileLauncherSize}px}}
.lemiri-launcher em[hidden]{display:none}
.lemiri-launcher img{width:100%;height:100%;border-radius:inherit;object-fit:cover}
.lemiri-label{position:absolute;bottom:calc(100% + 10px);right:0;max-width:220px;padding:7px 11px;border:1px solid var(--lw-line);border-radius:12px;background:var(--lw-bg);color:var(--lw-text);box-shadow:var(--lw-shadow);font:500 13px/1.3 ${sh.font};white-space:nowrap;pointer-events:none}
.lemiri-launcher[data-edge=left] .lemiri-label{right:auto;left:0}
.lemiri-root[data-open=true] .lemiri-label{display:none}
.lemiri-head{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;border-bottom:${sh.headerStyle === "minimal" ? "0" : "1px solid var(--lw-line)"};color:${sh.headerStyle === "accent" ? "#fff" : "var(--lw-head-text)"};background:${sh.headerStyle === "accent" ? "var(--lw-fill)" : sh.headerStyle === "gradient" ? "radial-gradient(120% 140% at 0 0,var(--lw-accent-soft),transparent 60%),var(--lw-head)" : sh.headerStyle === "minimal" ? "transparent" : sh.headerStyle === "glass" ? "var(--lw-head-glass)" : "var(--lw-head)"};${sh.headerStyle === "glass" ? "-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);" : ""}cursor:grab;touch-action:none;user-select:none}
.lemiri-card[data-pinned=true] .lemiri-head,.lemiri-card[data-maximized=true] .lemiri-head,.lemiri-card[data-mobile=true] .lemiri-head{cursor:default}
.lemiri-head:focus-visible{outline:2px solid var(--lw-accent);outline-offset:-2px}
.lemiri-avatar{position:relative;display:${sh.showAvatar ? "grid" : "none"};flex:none;place-items:center;width:34px;height:34px;border-radius:${shapeRadius(sh.avatarShape, 34)};background:${sh.headerStyle === "accent" ? "rgba(255,255,255,.22)" : "var(--lw-fill)"};color:#fff;font:600 14px/1 ui-sans-serif,system-ui,sans-serif}
.lemiri-avatar:after{content:"";position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border:2px solid var(--lw-bg);border-radius:50%;background:#3cc28f}
.lemiri-title{display:grid;flex:1;min-width:0;line-height:1.25}
.lemiri-title b{overflow:hidden;font-family:${sh.headFont || "inherit"};font-size:14px;font-weight:620;text-overflow:ellipsis;white-space:nowrap}
.lemiri-avatar img{width:100%;height:100%;border-radius:inherit;object-fit:cover}
.lemiri-title small{display:${sh.showStatus ? "block" : "none"};overflow:hidden;color:${sh.headerStyle === "accent" ? "rgba(255,255,255,.82)" : "var(--lw-text3)"};font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.lemiri-tools{display:flex;gap:2px}
.lemiri-tools button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:${sh.headerStyle === "accent" ? "rgba(255,255,255,.85)" : "var(--lw-text3)"};cursor:pointer}
.lemiri-tools button:hover{background:var(--lw-hover);color:var(--lw-text)}
.lemiri-tools button[aria-pressed=true]{background:var(--lw-accent-soft);color:var(--lw-accent)}
.lemiri-card[data-mobile=true] .lemiri-tools .lemiri-desktop{display:none}
.lemiri-frame{flex:1;width:100%;min-height:0;border:0;background:${sh.glass ? "transparent" : "var(--lw-bg2)"};color-scheme:normal}
.lemiri-launcher[data-pulse]:before{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--lw-launcher);opacity:.5;animation:lemiriPulse 2.6s cubic-bezier(.16,1,.3,1) infinite;z-index:-1}
.lemiri-root[data-open=true] .lemiri-launcher:before{animation:none;opacity:0}
.lemiri-teaser{position:absolute;bottom:calc(100% + 14px);right:0;display:flex;align-items:flex-start;gap:8px;width:max-content;max-width:min(260px,calc(100vw - 40px));text-align:left;white-space:normal;padding:12px 14px;border:1px solid var(--lw-line);border-radius:16px;background:var(--lw-card-bg);color:var(--lw-text);box-shadow:var(--lw-shadow);font:500 14px/1.4 ${sh.font};cursor:pointer;animation:lemiriTeaser .45s cubic-bezier(.34,1.4,.64,1) both;${sh.glass ? `-webkit-backdrop-filter:blur(${sh.blur}px);backdrop-filter:blur(${sh.blur}px);` : ""}}
.lemiri-teaser[hidden],.lemiri-root[data-open=true] .lemiri-teaser{display:none}
.lemiri-launcher[data-edge=left] .lemiri-teaser{right:auto;left:0}
.lemiri-launcher[data-teaser] .lemiri-label{display:none}
.lemiri-teaser i{flex:none;width:22px;height:22px;margin:-4px -6px 0 0;padding:0;border-radius:6px;color:var(--lw-text3);font:400 18px/22px ui-sans-serif,system-ui,sans-serif;font-style:normal;text-align:center}
.lemiri-teaser i:hover{background:var(--lw-hover)}
.lemiri-teaser-x{flex:none;width:22px;height:22px;margin:-4px -6px 0 0;padding:0;border:0;border-radius:6px;background:transparent;color:var(--lw-text3);font:400 18px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}
@keyframes lemiriPulse{0%{transform:scale(1);opacity:.45}70%,100%{transform:scale(1.55);opacity:0}}
@keyframes lemiriTeaser{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
.${P}resize{position:absolute;z-index:3;touch-action:none}
.${P}resize-n,.${P}resize-s{left:12px;right:12px;height:8px;cursor:ns-resize}
.${P}resize-e,.${P}resize-w{top:12px;bottom:12px;width:8px;cursor:ew-resize}
.${P}resize-n{top:-3px}.${P}resize-s{bottom:-3px}.${P}resize-e{right:-3px}.${P}resize-w{left:-3px}
.${P}resize-ne,.${P}resize-nw,.${P}resize-se,.${P}resize-sw{width:16px;height:16px}
.${P}resize-ne{top:-3px;right:-3px;cursor:nesw-resize}.${P}resize-sw{bottom:-3px;left:-3px;cursor:nesw-resize}
.${P}resize-nw{top:-3px;left:-3px;cursor:nwse-resize}.${P}resize-se{bottom:-3px;right:-3px;cursor:nwse-resize}
.lemiri-card[data-pinned=true] .${P}resize,.lemiri-card[data-maximized=true] .${P}resize,.lemiri-card[data-mobile=true] .${P}resize{display:none}
.${P}ghost{position:fixed;border:2px dashed var(--lw-accent);border-radius:var(--lw-radius);background:var(--lw-accent-soft);pointer-events:none!important;transition:all .12s cubic-bezier(.16,1,.3,1)}
.${P}ghost[hidden]{display:none}
@keyframes lemiriPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.lemiri-card,.lemiri-launcher,.lemiri-teaser,.lemiri-launcher:before{animation:none;transition:none}}`;

  const style = d.createElement("style"); style.id = "lemiri-widget-style"; style.textContent = css; d.head.appendChild(style);
  const root = d.createElement("div"); root.id = "lemiri-widget-root"; root.className = "lemiri-root"; root.dataset.theme = theme;
  const launcher = d.createElement("button"); launcher.type = "button"; launcher.className = "lemiri-launcher"; launcher.setAttribute("aria-label", cfg.labels.open); launcher.title = cfg.labels.open;
  const safeImg = (src: string) => { const img = d.createElement("img"); img.src = src; img.alt = ""; img.referrerPolicy = "no-referrer"; return img; };
  if (sh.launcherIcon === "avatar" && cfg.avatar) launcher.appendChild(safeImg(cfg.avatar));
  else launcher.innerHTML = icons[(sh.launcherIcon === "avatar" ? "chat" : sh.launcherIcon) as "chat" | "sparkles" | "message" | "help"] || icons.chat;
  if (sh.launcherLabel) { const label = d.createElement("span"); label.className = "lemiri-label"; label.textContent = sh.launcherLabel; launcher.appendChild(label); }
  const badge = d.createElement("em"); badge.hidden = true; launcher.appendChild(badge);
  if (sh.pulse) launcher.dataset.pulse = "";
  // Fonts chosen in the cabinet (Google Fonts); the site keeps its own fonts.
  [sh.fontHref, sh.headFontHref].forEach(href => { if (href && !d.querySelector(`link[data-lemiri-font="${href}"]`)) { const link = d.createElement("link"); link.rel = "stylesheet"; link.href = href; link.dataset.lemiriFont = href; d.head.appendChild(link); } });
  const card = d.createElement("section"); card.className = "lemiri-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", cfg.name);
  const head = d.createElement("header"); head.className = "lemiri-head"; head.tabIndex = 0;
  const avatar = d.createElement("span"); avatar.className = "lemiri-avatar";
  if (cfg.avatar) avatar.appendChild(safeImg(cfg.avatar)); else avatar.textContent = (cfg.name.trim()[0] ?? "A").toUpperCase();
  const title = d.createElement("div"); title.className = "lemiri-title";
  const nameEl = d.createElement("b"); nameEl.textContent = cfg.name; const statusEl = d.createElement("small"); statusEl.textContent = cfg.status; title.append(nameEl, statusEl);
  const tools = d.createElement("div"); tools.className = "lemiri-tools"; tools.dataset.noDrag = "";
  const mkButton = (html: string, label: string, extra = "") => { const b = d.createElement("button"); b.type = "button"; b.innerHTML = html; b.setAttribute("aria-label", label); b.title = label; if (extra) b.className = extra; return b; };
  const pinBtn = mkButton(icons.pin, cfg.labels.pin, "lemiri-desktop"); pinBtn.setAttribute("aria-pressed", "false");
  const maxBtn = mkButton(icons.max, cfg.labels.maximize, "lemiri-desktop");
  const closeBtn = mkButton(icons.collapse, cfg.labels.collapse);
  tools.append(pinBtn, maxBtn, closeBtn); head.append(avatar, title, tools); card.appendChild(head);
  root.append(launcher, card); d.body.appendChild(root);

  // The chat itself loads on first open, so the widget costs nothing until used.
  let frame: HTMLIFrameElement | null = null;
  let token = cfg.token;
  // The page path lets the AI read the page the visitor is looking at.
  const sendToken = () => frame?.contentWindow?.postMessage({ type: "lemiri:configure", token, page: (location.pathname + location.search).slice(0, 300) }, cfg.base);
  function ensureFrame() {
    if (frame) return;
    frame = d.createElement("iframe"); frame.className = "lemiri-frame"; frame.title = cfg.name; frame.allow = "clipboard-write";
    frame.src = `${cfg.frameUrl}${cfg.frameUrl.includes("?") ? "&" : "?"}embedded=1&theme=${theme}`;
    card.appendChild(frame);
  }
  let unread = 0;
  const setUnread = (n: number) => { unread = n; badge.hidden = n === 0; badge.textContent = String(n); };

  const rt = runtimeFactory();
  const ctl = rt.mount({ root, card, launcher, dragHandle: head, storageKey: `lemiri-widget:${cfg.employeeId}:layout`, classPrefix: P,
    initial: { w: sh.width, h: sh.height, ...(startOpen ? { open: true } : {}), ...((window.innerWidth < 640 ? sh.mobilePosition : position) === "left" ? { dockX: "left" as const, launcherEdge: "left" as const } : {}) },
    onChange: s => {
      root.dataset.open = String(s.open);
      pinBtn.setAttribute("aria-pressed", String(s.pinned)); const pinLabel = s.pinned ? cfg.labels.unpin : cfg.labels.pin; pinBtn.setAttribute("aria-label", pinLabel); pinBtn.title = pinLabel;
      maxBtn.innerHTML = s.maximized ? icons.min : icons.max; const maxLabel = s.maximized ? cfg.labels.restore : cfg.labels.maximize; maxBtn.setAttribute("aria-label", maxLabel); maxBtn.title = maxLabel;
      if (s.open) ensureFrame();
    },
    onOpen: () => { setUnread(0); ensureFrame(); window.setTimeout(() => frame?.contentWindow?.postMessage({ type: "lemiri:focus" }, cfg.base), 120); },
  });
  pinBtn.addEventListener("click", () => ctl.setPinned(!ctl.getState().pinned));
  maxBtn.addEventListener("click", () => ctl.toggleMaximize());
  closeBtn.addEventListener("click", () => ctl.close());

  addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== cfg.base || !frame || e.source !== frame.contentWindow) return;
    const type = e.data?.type;
    if (type === "lemiri:ready" || type === "lemiri:where") sendToken();
    else if (type === "lemiri:refresh") fetch(cfg.tokenUrl, { credentials: "omit" }).then(r => (r.ok ? r.json() : null)).then(b => { if (b && b.token) { token = b.token; sendToken(); } }).catch(() => undefined);
    else if (type === "lemiri:close") { ctl.close(); launcher.focus(); }
    else if (type === "lemiri:message" && !ctl.getState().open) setUnread(unread + 1);
  });
  // Optional gentle auto-open, once per visitor session.
  const autoKey = `lemiri-widget:${cfg.employeeId}:auto`;
  if (!startOpen && (cfg.autoOpenSeconds ?? 0) > 0) {
    let already = false; try { already = sessionStorage.getItem(autoKey) === "1"; } catch { /* storage unavailable */ }
    if (!already) window.setTimeout(() => { try { sessionStorage.setItem(autoKey, "1"); } catch { /* storage unavailable */ } if (!ctl.getState().open) ctl.open(); }, (cfg.autoOpenSeconds ?? 0) * 1000);
  }
  // Proactive message next to the chat button, once per visitor session.
  const teaserKey = `lemiri-widget:${cfg.employeeId}:teaser`;
  if (sh.teaser && !startOpen) {
    let seen = false; try { seen = sessionStorage.getItem(teaserKey) === "1"; } catch { /* storage unavailable */ }
    if (!seen) window.setTimeout(() => {
      if (ctl.getState().open) return;
      const bubble = d.createElement("span"); bubble.className = "lemiri-teaser"; bubble.setAttribute("role", "status");
      const text = d.createElement("span"); text.textContent = sh.teaser;
      const x = d.createElement("i"); x.textContent = "×"; x.setAttribute("role", "button"); x.setAttribute("aria-label", cfg.labels.collapse);
      const hide = () => { bubble.remove(); delete launcher.dataset.teaser; try { sessionStorage.setItem(teaserKey, "1"); } catch { /* storage unavailable */ } };
      x.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); hide(); });
      x.addEventListener("pointerdown", e => e.stopPropagation());
      bubble.append(text, x); launcher.appendChild(bubble); launcher.dataset.teaser = "";
      launcher.addEventListener("click", hide, { once: true });
    }, sh.teaserDelay * 1000);
  }
  // Public API for site owners: window.LemiriWidget.open() / .close() / .toggle()
  (window as unknown as { LemiriWidget?: unknown }).LemiriWidget = { open: () => ctl.open(), close: () => ctl.close(), toggle: () => ctl.toggle() };
  }
}
