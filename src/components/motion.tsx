"use client";

import { useEffect, useRef, useState } from "react";

const REVEAL_SELECTOR = ".reveal:not(.is-visible), [data-stagger]:not(.is-visible)";

/**
 * Global scroll-reveal driver. Mounted once in the root layout.
 * Marks <html> with `.motion` (the CSS only hides reveal targets once this
 * class exists), then watches the DOM for `.reveal` / `[data-stagger]`
 * elements and flags them `.is-visible` as they enter the viewport.
 */
export function RevealRoot() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) return;
    root.classList.add("motion");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 },
    );
    const scan = () => document.querySelectorAll(REVEAL_SELECTOR).forEach((node) => io.observe(node));
    scan();
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
      root.classList.remove("motion");
    };
  }, []);
  return null;
}

/** Animated number. Counts from the previous value to the next one with an ease-out curve. */
export function CountUp({
  value,
  duration = 900,
  format,
}: {
  value: number;
  duration?: number;
  format?: (value: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    let start = 0;
    const origin = from.current;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(origin + (value - origin) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    const run = () => (raf = requestAnimationFrame(tick));
    const el = node.current;
    if (el && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) {
          io.disconnect();
          run();
        }
      });
      io.observe(el);
      return () => {
        io.disconnect();
        cancelAnimationFrame(raf);
      };
    }
    run();
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const rounded = Number.isInteger(value) ? Math.round(shown) : Math.round(shown * 10) / 10;
  return (
    <span ref={node} className="num">
      {format ? format(rounded) : rounded.toLocaleString("ru-RU")}
    </span>
  );
}
