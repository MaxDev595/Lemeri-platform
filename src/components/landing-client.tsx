"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import Lenis from "lenis";

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

/**
 * Headline word that types itself, pauses, erases and moves on to the next one.
 * The server renders the first word in full, so the heading reads correctly
 * without JavaScript and for screen readers (the animated copy is aria-hidden).
 */
export function TypeCycle({ words }: { words: readonly string[] }) {
  const [text, setText] = useState(words[0] ?? "");
  useEffect(() => {
    // Switching the landing language keeps this component mounted; start over
    // with the new words instead of showing the previous language's text.
    setText(words[0] ?? "");
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let index = 0;
    let length = words[0]!.length;
    let deleting = true;
    let timer = 0;
    const tick = () => {
      const word = words[index]!;
      if (deleting) {
        length -= 1;
        setText(word.slice(0, length));
        if (length <= 0) {
          deleting = false;
          index = (index + 1) % words.length;
          timer = window.setTimeout(tick, 320);
          return;
        }
        timer = window.setTimeout(tick, 38);
        return;
      }
      const next = words[index]!;
      length += 1;
      setText(next.slice(0, length));
      if (length >= next.length) {
        deleting = true;
        timer = window.setTimeout(tick, 2400);
        return;
      }
      timer = window.setTimeout(tick, 70 + Math.random() * 40);
    };
    timer = window.setTimeout(tick, 2600);
    return () => window.clearTimeout(timer);
  }, [words]);
  return (
    <span className="lnType">
      <span className="srOnly">{words[0]}</span>
      <em aria-hidden="true">{text || "\u200b"}</em>
      <i className="lnCaret" aria-hidden="true" />
    </span>
  );
}

/**
 * Inertial smooth scrolling for the landing only (the app keeps native scroll).
 * Uses Lenis over native scroll, so sticky elements, IntersectionObserver
 * reveals and keyboard scrolling keep working. Off for reduced motion.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => 1 - Math.pow(1 - t, 4),
      smoothWheel: true,
      wheelMultiplier: 0.95,
    });
    // In-page links glide to their section; sections carry their own top padding,
    // so aligning the section edge with the viewport keeps headings below the nav.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      const id = link?.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: 0, duration: 1.3 });
      history.replaceState(null, "", `#${id}`);
    };
    document.addEventListener("click", onClick);
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick);
      lenis.destroy();
    };
  }, []);
  return null;
}
