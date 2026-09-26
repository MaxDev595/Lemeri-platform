// Runs on the customer's website (shipped by /api/widget/[id]/embed.js as source
// text). It renders the same floating card as the in-app Lemiri assistant —
// launcher, drag, resize, docking, pin, maximize, theme — around the chat iframe.
//
// IMPORTANT: must stay self-contained (no imports, no module-level references).

import type { floatingCardRuntime } from "./runtime";

export type WidgetBootConfig = {
  base: string; employeeId: string; frameUrl: string; tokenUrl: string; token: string;
  name: string; status: string; locale: "ru" | "en";
  labels: { open: string; collapse: string; pin: string; unpin: string; maximize: string; restore: string };
};

export function lemiriWidgetBootstrap(runtimeFactory: typeof floatingCardRuntime, cfg: WidgetBootConfig) {
  const d = document;
  if (d.getElementById("lemiri-widget-root")) return;
  const script = d.currentScript as HTMLScriptElement | null;
  const themeAttr = script?.dataset.theme;
  const theme = themeAttr === "light" || themeAttr === "dark" ? themeAttr : "auto";
  const accentAttr = script?.dataset.accent ?? "";
  const accent = /^#[0-9a-f]{3,8}$/i.test(accentAttr) ? accentAttr : "";
  const startOpen = script?.dataset.open === "true";
  if (!d.body) { d.addEventListener("DOMContentLoaded", build, { once: true }); return; }
  build();
  function build() {

  const icons = {
    chat: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    max: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
    min: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>',
    collapse: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  };
  const P = "lemiri-fc-";
  const css = `
.lemiri-root{--lw-bg:#fff;--lw-bg2:#f6f6f9;--lw-hover:#f0f0f4;--lw-text:#17191f;--lw-text3:#6b7080;--lw-line:#e6e7ec;--lw-accent:${accent || "#6254e8"};--lw-accent-soft:color-mix(in srgb,var(--lw-accent) 14%,transparent);--lw-shadow:0 4px 8px rgba(20,20,40,.08),0 28px 72px -12px rgba(20,20,40,.28);position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color-scheme:light}
.lemiri-root[data-theme=dark]{--lw-bg:#15171c;--lw-bg2:#1a1c22;--lw-hover:#23262e;--lw-text:#eceef3;--lw-text3:#9398a6;--lw-line:#2a2d36;--lw-accent:${accent || "#7466f5"};--lw-shadow:0 4px 8px rgba(0,0,0,.3),0 28px 72px -12px rgba(0,0,0,.7);color-scheme:dark}
@media (prefers-color-scheme:dark){.lemiri-root[data-theme=auto]{--lw-bg:#15171c;--lw-bg2:#1a1c22;--lw-hover:#23262e;--lw-text:#eceef3;--lw-text3:#9398a6;--lw-line:#2a2d36;--lw-accent:${accent || "#7466f5"};--lw-shadow:0 4px 8px rgba(0,0,0,.3),0 28px 72px -12px rgba(0,0,0,.7);color-scheme:dark}}
.lemiri-root>*{pointer-events:auto}
.lemiri-root *{box-sizing:border-box}
.lemiri-launcher{position:fixed;display:grid;place-items:center;width:56px;height:56px;padding:0;border:0;border-radius:18px;background:var(--lw-accent);color:#fff;box-shadow:var(--lw-shadow);cursor:pointer;touch-action:none;user-select:none;transition:transform .2s cubic-bezier(.34,1.4,.64,1);animation:lemiriPop .32s cubic-bezier(.34,1.4,.64,1) both}
.lemiri-launcher:not([data-edge]),.lemiri-launcher[hidden]{display:none}
.lemiri-launcher:hover{transform:scale(1.05)}
.lemiri-launcher:focus-visible{outline:3px solid var(--lw-accent-soft);outline-offset:3px}
.lemiri-launcher[data-dragging=true]{cursor:grabbing;transform:scale(1.08);transition:none}
.lemiri-launcher[data-settling=true]{transition:left .22s cubic-bezier(.16,1,.3,1),top .22s cubic-bezier(.16,1,.3,1)}
.lemiri-launcher em{position:absolute;top:-6px;right:-6px;display:grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border:2px solid var(--lw-bg);border-radius:999px;background:#e5484d;color:#fff;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;font-style:normal}
.lemiri-card{position:fixed;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--lw-line);border-radius:18px;background:var(--lw-bg);color:var(--lw-text);box-shadow:var(--lw-shadow);transition:opacity .18s cubic-bezier(.16,1,.3,1),transform .2s cubic-bezier(.16,1,.3,1)}
.lemiri-card:not([data-open]),.lemiri-card[hidden]{display:none}
.lemiri-card[data-entering=true],.lemiri-card[data-closing=true]{opacity:0;transform:scale(.6)}
.lemiri-card[data-closing=true]{pointer-events:none}
.lemiri-card[data-settling=true]{transition:left .2s cubic-bezier(.16,1,.3,1),top .2s cubic-bezier(.16,1,.3,1),width .2s cubic-bezier(.16,1,.3,1),height .2s cubic-bezier(.16,1,.3,1)}
.lemiri-card[data-interacting=true]{transition:none;user-select:none}
.lemiri-card[data-interacting=true] iframe{pointer-events:none}
.lemiri-card[data-mobile=true]{border:0;border-radius:0}
.lemiri-head{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;border-bottom:1px solid var(--lw-line);background:radial-gradient(120% 140% at 0 0,var(--lw-accent-soft),transparent 60%),var(--lw-bg);cursor:grab;touch-action:none;user-select:none}
.lemiri-card[data-pinned=true] .lemiri-head,.lemiri-card[data-maximized=true] .lemiri-head,.lemiri-card[data-mobile=true] .lemiri-head{cursor:default}
.lemiri-head:focus-visible{outline:2px solid var(--lw-accent);outline-offset:-2px}
.lemiri-avatar{position:relative;display:grid;flex:none;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--lw-accent);color:#fff;font:600 14px/1 ui-sans-serif,system-ui,sans-serif}
.lemiri-avatar:after{content:"";position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border:2px solid var(--lw-bg);border-radius:50%;background:#3cc28f}
.lemiri-title{display:grid;flex:1;min-width:0;line-height:1.25}
.lemiri-title b{overflow:hidden;font-size:14px;font-weight:620;text-overflow:ellipsis;white-space:nowrap}
.lemiri-title small{overflow:hidden;color:var(--lw-text3);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.lemiri-tools{display:flex;gap:2px}
.lemiri-tools button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--lw-text3);cursor:pointer}
.lemiri-tools button:hover{background:var(--lw-hover);color:var(--lw-text)}
.lemiri-tools button[aria-pressed=true]{background:var(--lw-accent-soft);color:var(--lw-accent)}
.lemiri-card[data-mobile=true] .lemiri-tools .lemiri-desktop{display:none}
.lemiri-frame{flex:1;width:100%;min-height:0;border:0;background:var(--lw-bg2)}
.${P}resize{position:absolute;z-index:3;touch-action:none}
.${P}resize-n,.${P}resize-s{left:12px;right:12px;height:8px;cursor:ns-resize}
.${P}resize-e,.${P}resize-w{top:12px;bottom:12px;width:8px;cursor:ew-resize}
.${P}resize-n{top:-3px}.${P}resize-s{bottom:-3px}.${P}resize-e{right:-3px}.${P}resize-w{left:-3px}
.${P}resize-ne,.${P}resize-nw,.${P}resize-se,.${P}resize-sw{width:16px;height:16px}
.${P}resize-ne{top:-3px;right:-3px;cursor:nesw-resize}.${P}resize-sw{bottom:-3px;left:-3px;cursor:nesw-resize}
.${P}resize-nw{top:-3px;left:-3px;cursor:nwse-resize}.${P}resize-se{bottom:-3px;right:-3px;cursor:nwse-resize}
.lemiri-card[data-pinned=true] .${P}resize,.lemiri-card[data-maximized=true] .${P}resize,.lemiri-card[data-mobile=true] .${P}resize{display:none}
.${P}ghost{position:fixed;border:2px dashed var(--lw-accent);border-radius:18px;background:var(--lw-accent-soft);pointer-events:none!important;transition:all .12s cubic-bezier(.16,1,.3,1)}
.${P}ghost[hidden]{display:none}
@keyframes lemiriPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.lemiri-card,.lemiri-launcher{animation:none;transition:none}}`;

  const style = d.createElement("style"); style.id = "lemiri-widget-style"; style.textContent = css; d.head.appendChild(style);
  const root = d.createElement("div"); root.id = "lemiri-widget-root"; root.className = "lemiri-root"; root.dataset.theme = theme;
  const launcher = d.createElement("button"); launcher.type = "button"; launcher.className = "lemiri-launcher"; launcher.setAttribute("aria-label", cfg.labels.open); launcher.title = cfg.labels.open; launcher.innerHTML = icons.chat;
  const badge = d.createElement("em"); badge.hidden = true; launcher.appendChild(badge);
  const card = d.createElement("section"); card.className = "lemiri-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", cfg.name);
  const head = d.createElement("header"); head.className = "lemiri-head"; head.tabIndex = 0;
  const avatar = d.createElement("span"); avatar.className = "lemiri-avatar"; avatar.textContent = (cfg.name.trim()[0] ?? "A").toUpperCase();
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
  const sendToken = () => frame?.contentWindow?.postMessage({ type: "lemiri:configure", token }, cfg.base);
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
    initial: startOpen ? { open: true } : undefined,
    onChange: s => {
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
    if (type === "lemiri:ready") sendToken();
    else if (type === "lemiri:refresh") fetch(cfg.tokenUrl, { credentials: "omit" }).then(r => (r.ok ? r.json() : null)).then(b => { if (b && b.token) { token = b.token; sendToken(); } }).catch(() => undefined);
    else if (type === "lemiri:close") { ctl.close(); launcher.focus(); }
    else if (type === "lemiri:message" && !ctl.getState().open) setUnread(unread + 1);
  });
  // Public API for site owners: window.LemiriWidget.open() / .close() / .toggle()
  (window as unknown as { LemiriWidget?: unknown }).LemiriWidget = { open: () => ctl.open(), close: () => ctl.close(), toggle: () => ctl.toggle() };
  }
}
