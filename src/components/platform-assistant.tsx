"use client";

import { useEffect } from "react";

// Lemeri's own assistant (Админка → «Ассистент Lemeri»): the regular website card
// of the «Lemeri AI» workspace. /api/widget/platform/embed.js answers with an empty
// script when the assistant is switched off for this place.
export function PlatformAssistant({ place }: { place: "landing" | "app" }) {
  useEffect(() => {
    if (document.getElementById("lemiri-platform-assistant") || document.getElementById("lemiri-widget-root")) return;
    const script = document.createElement("script");
    script.id = "lemiri-platform-assistant"; script.async = true;
    script.src = `/api/widget/platform/embed.js?place=${place}`;
    // Loaded after the page settles so the assistant never slows the first paint.
    const timer = window.setTimeout(() => document.body.appendChild(script), 1200);
    return () => window.clearTimeout(timer);
  }, [place]);
  return null;
}
