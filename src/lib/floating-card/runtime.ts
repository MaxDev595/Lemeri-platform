// Floating card runtime shared by the in-app Lemiri assistant and the customer
// website widget (embed.js). It owns geometry and interaction only: dragging,
// resizing from every edge/corner, docking to edges/corners, pinning,
// maximizing, collapsing into a launcher that attaches to the nearest screen
// edge, and remembering the layout.
//
// IMPORTANT: `floatingCardRuntime` must stay fully self-contained (no imports,
// no references to module-level values). embed.js ships it to customer sites as
// source text via `floatingCardRuntime.toString()`.

export type Edge = "left" | "right" | "top" | "bottom";
export type DockX = "left" | "right" | null;
export type DockY = "top" | "bottom" | null;
export type Viewport = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type CardState = Rect & {
  dockX: DockX; dockY: DockY; pinned: boolean; open: boolean; maximized: boolean;
  launcherEdge: Edge; launcherOffset: number; launcherMoved: boolean;
};
export type MountOptions = {
  root: HTMLElement; card: HTMLElement; launcher: HTMLElement; dragHandle: HTMLElement;
  storageKey?: string; classPrefix?: string; initial?: Partial<CardState>;
  onChange?: (state: CardState) => void; onOpen?: () => void; onClose?: () => void;
};
export type CardController = {
  open(): void; close(): void; toggle(): void; setPinned(value: boolean): void; toggleMaximize(): void;
  getState(): CardState; isMobile(): boolean; destroy(): void;
};

export function floatingCardRuntime() {
  const MARGIN = 16, SNAP = 32, MIN_W = 320, MIN_H = 380, LAUNCHER = 56, MOBILE = 640, DRAG_SLOP = 4;
  const defaults: CardState = { x: 0, y: 0, w: 400, h: 640, dockX: "right", dockY: "bottom", pinned: false, open: false, maximized: false, launcherEdge: "right", launcherOffset: 1, launcherMoved: false };

  function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), Math.max(min, max)); }
  function fitSize(w: number, h: number, vp: Viewport) {
    const maxW = vp.w - MARGIN * 2, maxH = vp.h - MARGIN * 2;
    return { w: clamp(w, Math.min(MIN_W, maxW), maxW), h: clamp(h, Math.min(MIN_H, maxH), maxH) };
  }
  /** Where the card is on screen for a given state (docked sides follow the viewport). */
  function resolveRect(s: CardState, vp: Viewport): Rect {
    if (s.maximized) return { x: MARGIN, y: MARGIN, w: Math.max(0, vp.w - MARGIN * 2), h: Math.max(0, vp.h - MARGIN * 2) };
    const { w, h } = fitSize(s.w, s.h, vp);
    const x = s.dockX === "left" ? MARGIN : s.dockX === "right" ? vp.w - w - MARGIN : clamp(s.x, MARGIN, vp.w - w - MARGIN);
    const y = s.dockY === "top" ? MARGIN : s.dockY === "bottom" ? vp.h - h - MARGIN : clamp(s.y, MARGIN, vp.h - h - MARGIN);
    return { x, y, w, h };
  }
  /** Which edges a rectangle is close enough to stick to. */
  function dockFor(r: Rect, vp: Viewport): { dockX: DockX; dockY: DockY } {
    const dl = r.x - MARGIN, dr = vp.w - (r.x + r.w) - MARGIN, dt = r.y - MARGIN, db = vp.h - (r.y + r.h) - MARGIN;
    const dockX: DockX = dl <= SNAP && dl <= dr ? "left" : dr <= SNAP ? "right" : null;
    const dockY: DockY = dt <= SNAP && dt <= db ? "top" : db <= SNAP ? "bottom" : null;
    return { dockX, dockY };
  }
  function nearestEdge(cx: number, cy: number, vp: Viewport): Edge {
    const d: Array<[Edge, number]> = [["left", cx], ["right", vp.w - cx], ["top", cy], ["bottom", vp.h - cy]];
    return d.reduce((best, item) => (item[1] < best[1] ? item : best))[0];
  }
  function edgeLength(edge: Edge, vp: Viewport) { return edge === "left" || edge === "right" ? vp.h : vp.w; }
  /** Top-left corner of the launcher button for an edge + fractional offset along it. */
  function launcherPosition(edge: Edge, offset: number, vp: Viewport) {
    const half = LAUNCHER / 2, len = edgeLength(edge, vp);
    const center = clamp(offset * len, MARGIN + half, len - MARGIN - half);
    if (edge === "left") return { x: MARGIN, y: center - half };
    if (edge === "right") return { x: vp.w - MARGIN - LAUNCHER, y: center - half };
    if (edge === "top") return { x: center - half, y: MARGIN };
    return { x: center - half, y: vp.h - MARGIN - LAUNCHER };
  }
  /** Where the launcher goes when the card closes: its docked edge/corner, otherwise the nearest edge. */
  function launcherFromCard(s: CardState, vp: Viewport): { launcherEdge: Edge; launcherOffset: number } {
    const r = resolveRect(s, vp), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (!s.maximized && s.dockX && s.dockY) return { launcherEdge: s.dockX, launcherOffset: s.dockY === "top" ? 0 : 1 };
    if (!s.maximized && s.dockX) return { launcherEdge: s.dockX, launcherOffset: cy / vp.h };
    if (!s.maximized && s.dockY) return { launcherEdge: s.dockY, launcherOffset: cx / vp.w };
    const edge = nearestEdge(cx, cy, vp);
    return { launcherEdge: edge, launcherOffset: edge === "left" || edge === "right" ? cy / vp.h : cx / vp.w };
  }
  /** Card placement when opened from a launcher the user moved: attached to the same edge, next to it. */
  function cardFromLauncher(s: CardState, vp: Viewport): Partial<CardState> {
    const p = launcherPosition(s.launcherEdge, s.launcherOffset, vp), { w, h } = fitSize(s.w, s.h, vp);
    const lcx = p.x + LAUNCHER / 2, lcy = p.y + LAUNCHER / 2, vertical = s.launcherEdge === "left" || s.launcherEdge === "right";
    if (vertical) {
      const y = clamp(lcy - h / 2, MARGIN, vp.h - h - MARGIN);
      const dockY: DockY = y <= MARGIN + 1 ? "top" : y >= vp.h - h - MARGIN - 1 ? "bottom" : null;
      return { w, h, x: 0, y, dockX: s.launcherEdge as DockX, dockY, maximized: false };
    }
    const x = clamp(lcx - w / 2, MARGIN, vp.w - w - MARGIN);
    const dockX: DockX = x <= MARGIN + 1 ? "left" : x >= vp.w - w - MARGIN - 1 ? "right" : null;
    return { w, h, x, y: 0, dockX, dockY: s.launcherEdge as DockY, maximized: false };
  }
  /** New rectangle while resizing from a handle ("n", "se", ...). */
  function resizeRect(start: Rect, dir: string, dx: number, dy: number, vp: Viewport): Rect {
    let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
    const minW = Math.min(MIN_W, vp.w - MARGIN * 2), minH = Math.min(MIN_H, vp.h - MARGIN * 2);
    if (dir.includes("w")) left = clamp(left + dx, MARGIN, right - minW);
    if (dir.includes("e")) right = clamp(right + dx, left + minW, vp.w - MARGIN);
    if (dir.includes("n")) top = clamp(top + dy, MARGIN, bottom - minH);
    if (dir.includes("s")) bottom = clamp(bottom + dy, top + minH, vp.h - MARGIN);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
  function sanitize(value: unknown): Partial<CardState> {
    if (!value || typeof value !== "object") return {};
    const v = value as Record<string, unknown>, out: Partial<CardState> = {};
    for (const key of ["x", "y", "w", "h", "launcherOffset"] as const) if (typeof v[key] === "number" && Number.isFinite(v[key])) out[key] = v[key] as number;
    for (const key of ["pinned", "open", "maximized", "launcherMoved"] as const) if (typeof v[key] === "boolean") out[key] = v[key] as boolean;
    if (v.dockX === "left" || v.dockX === "right" || v.dockX === null) out.dockX = v.dockX;
    if (v.dockY === "top" || v.dockY === "bottom" || v.dockY === null) out.dockY = v.dockY;
    if (v.launcherEdge === "left" || v.launcherEdge === "right" || v.launcherEdge === "top" || v.launcherEdge === "bottom") out.launcherEdge = v.launcherEdge;
    return out;
  }

  function mount(opts: MountOptions): CardController {
    const { root, card, launcher, dragHandle } = opts;
    const prefix = opts.classPrefix ?? "fc-";
    const win = root.ownerDocument.defaultView ?? window;
    let saved: Partial<CardState> = {};
    if (opts.storageKey) { try { saved = sanitize(JSON.parse(win.localStorage.getItem(opts.storageKey) ?? "null")); } catch { saved = {}; } }
    let s: CardState = { ...defaults, ...sanitize(opts.initial), ...saved };
    let interacting = false;
    const cleanups: Array<() => void> = [];
    const listen = (target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) => { target.addEventListener(type, handler, options); cleanups.push(() => target.removeEventListener(type, handler, options)); };
    const vp = (): Viewport => ({ w: win.document.documentElement.clientWidth || win.innerWidth, h: win.innerHeight });
    const isMobile = () => vp().w < MOBILE;
    const persist = () => { if (!opts.storageKey) return; try { win.localStorage.setItem(opts.storageKey, JSON.stringify(s)); } catch { /* storage unavailable */ } };

    const ghost = win.document.createElement("div");
    ghost.className = `${prefix}ghost`; ghost.hidden = true; ghost.setAttribute("aria-hidden", "true");
    root.appendChild(ghost);
    const handles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(dir => {
      const el = win.document.createElement("div");
      el.className = `${prefix}resize ${prefix}resize-${dir}`; el.dataset.dir = dir; el.setAttribute("aria-hidden", "true");
      card.appendChild(el); return el;
    });

    function paint(r: Rect) { Object.assign(card.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); }
    function apply() {
      const v = vp(), mobile = isMobile();
      card.dataset.open = String(s.open); card.dataset.pinned = String(s.pinned); card.dataset.maximized = String(s.maximized);
      card.dataset.mobile = String(mobile); card.dataset.dock = [s.dockX, s.dockY].filter(Boolean).join(" ") || "free";
      // Full-screen sheet on phones; the page underneath must not scroll.
      const lockScroll = mobile && s.open, docStyle = win.document.documentElement.style;
      if (lockScroll && card.dataset.scrollLock !== "true") { card.dataset.scrollLock = "true"; card.dataset.prevOverflow = docStyle.overflow; docStyle.overflow = "hidden"; }
      else if (!lockScroll && card.dataset.scrollLock === "true") { delete card.dataset.scrollLock; docStyle.overflow = card.dataset.prevOverflow ?? ""; }
      if (mobile) Object.assign(card.style, { left: "0px", top: "0px", width: `${win.innerWidth}px`, height: `${v.h}px` });
      else if (!interacting) paint(resolveRect(s, v));
      const lp = launcherPosition(s.launcherEdge, s.launcherOffset, v);
      Object.assign(launcher.style, { left: `${lp.x}px`, top: `${lp.y}px` });
      launcher.dataset.edge = s.launcherEdge; launcher.hidden = s.open;
      card.hidden = !s.open && !card.dataset.closing;
      opts.onChange?.({ ...s });
    }
    function update(patch: Partial<CardState>, save = true) { s = { ...s, ...patch }; apply(); if (save) persist(); }
    function settle() { card.dataset.settling = "true"; win.setTimeout(() => { delete card.dataset.settling; }, 220); }
    function originFromLauncher() {
      const v = vp(), r = isMobile() ? { x: 0, y: 0, w: v.w, h: v.h } : resolveRect(s, v), lp = launcherPosition(s.launcherEdge, s.launcherOffset, v);
      card.style.transformOrigin = `${lp.x + LAUNCHER / 2 - r.x}px ${lp.y + LAUNCHER / 2 - r.y}px`;
    }

    const controller: CardController = {
      open() {
        if (s.open) return;
        const patch: Partial<CardState> = { open: true, launcherMoved: false };
        if (s.launcherMoved) Object.assign(patch, cardFromLauncher(s, vp()));
        delete card.dataset.closing; s = { ...s, ...patch }; originFromLauncher(); apply(); persist();
        card.dataset.entering = "true"; win.requestAnimationFrame(() => win.requestAnimationFrame(() => { delete card.dataset.entering; }));
        opts.onOpen?.();
      },
      close() {
        if (!s.open) return;
        s = { ...s, ...launcherFromCard(s, vp()), open: false, launcherMoved: false };
        originFromLauncher(); card.dataset.closing = "true"; apply(); persist();
        win.setTimeout(() => { delete card.dataset.closing; card.hidden = !s.open; }, 200);
        opts.onClose?.();
      },
      toggle() { if (s.open) controller.close(); else controller.open(); },
      setPinned(value) { update({ pinned: value }); },
      toggleMaximize() { if (!isMobile()) { settle(); update({ maximized: !s.maximized }); } },
      getState: () => ({ ...s }),
      isMobile,
      destroy() { cleanups.splice(0).forEach(fn => fn()); ghost.remove(); handles.forEach(el => el.remove()); if (card.dataset.scrollLock === "true") win.document.documentElement.style.overflow = card.dataset.prevOverflow ?? ""; },
    };

    // Pointer gestures (drag card, resize card, drag launcher) share one tracker.
    type Gesture = { kind: "move" | "resize" | "launcher"; dir: string; sx: number; sy: number; start: Rect; moved: boolean; target: HTMLElement; id: number };
    let g: Gesture | null = null;
    const interactive = (el: EventTarget | null) => el instanceof win.Element && !!el.closest("button, a, input, textarea, select, [data-no-drag]");
    function begin(e: PointerEvent, kind: Gesture["kind"], dir: string, target: HTMLElement) {
      const v = vp();
      const start = kind === "launcher" ? { ...launcherPosition(s.launcherEdge, s.launcherOffset, v), w: LAUNCHER, h: LAUNCHER } : resolveRect(s, v);
      g = { kind, dir, sx: e.clientX, sy: e.clientY, start, moved: false, target, id: e.pointerId };
      try { target.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    }
    function showGhost(r: Rect | null) {
      if (!r) { ghost.hidden = true; return; }
      ghost.hidden = false; Object.assign(ghost.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
    listen(dragHandle, "pointerdown", ((e: PointerEvent) => {
      if (e.button !== 0 || interactive(e.target) || s.pinned || s.maximized || isMobile()) return;
      e.preventDefault(); begin(e, "move", "", dragHandle);
    }) as EventListener);
    handles.forEach(el => listen(el, "pointerdown", ((e: PointerEvent) => {
      if (e.button !== 0 || s.pinned || s.maximized || isMobile()) return;
      e.preventDefault(); e.stopPropagation(); begin(e, "resize", el.dataset.dir ?? "se", el);
    }) as EventListener));
    listen(launcher, "pointerdown", ((e: PointerEvent) => { if (e.button === 0) begin(e, "launcher", "", launcher); }) as EventListener);
    listen(win, "pointermove", ((e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy, v = vp();
      if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      if (!g.moved) { g.moved = true; interacting = true; card.dataset.interacting = "true"; launcher.dataset.dragging = String(g.kind === "launcher"); }
      if (g.kind === "launcher") {
        Object.assign(launcher.style, { left: `${clamp(g.start.x + dx, 0, v.w - LAUNCHER)}px`, top: `${clamp(g.start.y + dy, 0, v.h - LAUNCHER)}px` });
        return;
      }
      const r = g.kind === "move"
        ? { ...g.start, x: clamp(g.start.x + dx, MARGIN, v.w - g.start.w - MARGIN), y: clamp(g.start.y + dy, MARGIN, v.h - g.start.h - MARGIN) }
        : resizeRect(g.start, g.dir, dx, dy, v);
      paint(r);
      const d = dockFor(r, v);
      showGhost(d.dockX || d.dockY ? resolveRect({ ...s, ...r, ...d, maximized: false }, v) : null);
    }) as EventListener);
    const finish = ((e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const gesture = g; g = null; interacting = false; showGhost(null);
      delete card.dataset.interacting; delete launcher.dataset.dragging;
      try { gesture.target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      const v = vp();
      if (gesture.kind === "launcher") {
        if (!gesture.moved) { controller.open(); return; }
        const x = clamp(gesture.start.x + e.clientX - gesture.sx, 0, v.w - LAUNCHER), y = clamp(gesture.start.y + e.clientY - gesture.sy, 0, v.h - LAUNCHER);
        const cx = x + LAUNCHER / 2, cy = y + LAUNCHER / 2, edge = nearestEdge(cx, cy, v);
        launcher.dataset.settling = "true"; win.setTimeout(() => { delete launcher.dataset.settling; }, 220);
        update({ launcherEdge: edge, launcherOffset: edge === "left" || edge === "right" ? cy / v.h : cx / v.w, launcherMoved: true });
        return;
      }
      if (!gesture.moved) return;
      const r = { x: parseFloat(card.style.left), y: parseFloat(card.style.top), w: parseFloat(card.style.width), h: parseFloat(card.style.height) };
      settle(); update({ ...r, ...dockFor(r, v) });
    }) as EventListener;
    listen(win, "pointerup", finish); listen(win, "pointercancel", finish);

    listen(dragHandle, "dblclick", ((e: MouseEvent) => { if (!interactive(e.target)) controller.toggleMaximize(); }) as EventListener);
    // Keyboard: arrows move the card, Shift+arrows resize it, Esc collapses it.
    listen(dragHandle, "keydown", ((e: KeyboardEvent) => {
      if (e.target !== dragHandle || s.pinned || s.maximized || isMobile()) return;
      const step = 24, v = vp(), r = resolveRect(s, v);
      const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const d = delta[e.key]; if (!d) return;
      e.preventDefault();
      const next = e.shiftKey ? resizeRect(r, `${d[0] > 0 ? "e" : d[0] < 0 ? "w" : ""}${d[1] > 0 ? "s" : d[1] < 0 ? "n" : ""}`, Math.abs(d[0]) ? step : 0, Math.abs(d[1]) ? step : 0, v)
        : { ...r, x: clamp(r.x + d[0], MARGIN, v.w - r.w - MARGIN), y: clamp(r.y + d[1], MARGIN, v.h - r.h - MARGIN) };
      settle(); update({ ...next, ...dockFor(next, v) });
    }) as EventListener);
    listen(card, "keydown", ((e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); controller.close(); launcher.focus(); } }) as EventListener);
    listen(launcher, "keydown", ((e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); controller.open(); } }) as EventListener);
    listen(win, "resize", (() => apply()) as EventListener);

    apply();
    return controller;
  }

  return { MARGIN, SNAP, MIN_W, MIN_H, LAUNCHER, MOBILE, defaults, clamp, fitSize, resolveRect, dockFor, nearestEdge, launcherPosition, launcherFromCard, cardFromLauncher, resizeRect, sanitize, mount };
}
