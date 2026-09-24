"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

/** Sticky header that gains a surface once the page scrolls, plus a mobile sheet menu. */
export function LandingNav({ children, menu }: { children: ReactNode; menu: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("hashchange", close);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <header className={`lnNav${scrolled ? " scrolled" : ""}${open ? " open" : ""}`}>
      <div className="lnNavInner">
        {children}
        <button type="button" className="lnBurger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <div className="lnSheet" onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}>
        {menu}
      </div>
    </header>
  );
}

/** Fills the steps rail and highlights the step closest to the middle of the viewport. */
export function StepsRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = list.getBoundingClientRect();
      const mid = window.innerHeight * 0.55;
      const progress = Math.min(1, Math.max(0, (mid - rect.top) / rect.height));
      list.style.setProperty("--rail", progress.toFixed(3));
      list.querySelectorAll<HTMLElement>(":scope > li").forEach((item) => {
        const r = item.getBoundingClientRect();
        item.classList.toggle("active", r.top < mid);
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <ol className="lnSteps" ref={ref}>
      {children}
    </ol>
  );
}

/** Pointer-follow tilt + spotlight for the hero device. Disabled for coarse pointers and reduced motion. */
export function TiltStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.setProperty("--rx", `${(-y * 5).toFixed(2)}deg`);
        node.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
        node.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`);
        node.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const leave = () => {
      node.style.setProperty("--rx", "0deg");
      node.style.setProperty("--ry", "0deg");
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div className="lnStage" ref={ref}>
      {children}
    </div>
  );
}
