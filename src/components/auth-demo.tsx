"use client";

import { useEffect, useState } from "react";
import { CalendarCheck2, UserRoundCheck } from "lucide-react";
import { LemiriGlyph } from "./logo";
import type { Locale } from "@/lib/i18n";

const copy = {
  ru: {
    title: "Алина · администратор",
    status: "на связи",
    client: "Анна, Telegram",
    steps: [
      { from: "client", text: "Здравствуйте! Можно записаться на чистку в субботу?" },
      { from: "ai", text: "Добрый день! В субботу свободно 11:00 и 14:30. Какое время удобнее?" },
      { from: "client", text: "Давайте в 11:00, спасибо" },
      { from: "ai", text: "Готово — жду вас в субботу в 11:00. Напомню накануне." },
    ],
    booked: "Запись создана",
    bookedMeta: "Сб, 11:00 · Чистка",
    lead: "Лид в CRM",
    leadMeta: "Анна С. · +7 702 •••",
  },
  en: {
    title: "Alina · front desk",
    status: "online",
    client: "Anna, Telegram",
    steps: [
      { from: "client", text: "Hi! Can I book a cleaning for Saturday?" },
      { from: "ai", text: "Good afternoon! Saturday has 11:00 and 14:30 open. Which works better?" },
      { from: "client", text: "11:00 works, thanks" },
      { from: "ai", text: "Done — see you Saturday at 11:00. I'll remind you the day before." },
    ],
    booked: "Appointment booked",
    bookedMeta: "Sat, 11:00 · Cleaning",
    lead: "Lead sent to CRM",
    leadMeta: "Anna S. · +7 702 •••",
  },
} as const;

/* Timeline (ms) for each visible beat; the loop restarts after the last one. */
const beats = [600, 1900, 3300, 4600, 5600, 6900, 7700];
const LOOP = 11500;

/** Looping, self-contained product vignette for the sign-in screen. */
export function AuthDemo({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(beats.length);
      return;
    }
    let timers: number[] = [];
    const run = () => {
      setStep(-1);
      timers = beats.map((at, index) => window.setTimeout(() => setStep(index), at));
      timers.push(window.setTimeout(run, LOOP));
    };
    run();
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);
  // beats: 0 client, 1 typing→ai, 2 ai, 3 client, 4 typing→ai, 5 ai, 6 events
  const visible = (index: number) => step >= index;
  const typing = step === 1 || step === 4;
  return (
    <div className="authDemo" aria-hidden="true">
      <div className="authDemoCard">
        <header>
          <span className="authDemoAvatar">
            <LemiriGlyph size={18} />
          </span>
          <div>
            <b>{c.title}</b>
            <small>
              <i />
              {c.status}
            </small>
          </div>
          <em>{c.client}</em>
        </header>
        <div className="authDemoStream">
          {visible(0) && <p className="demoBubble client">{c.steps[0].text}</p>}
          {visible(2) && <p className="demoBubble ai">{c.steps[1].text}</p>}
          {visible(3) && <p className="demoBubble client">{c.steps[2].text}</p>}
          {visible(5) && <p className="demoBubble ai">{c.steps[3].text}</p>}
          {typing && (
            <p className="demoBubble ai demoTyping">
              <i />
              <i />
              <i />
            </p>
          )}
        </div>
      </div>
      <div className={visible(6) ? "authDemoEvents show" : "authDemoEvents"}>
        <span>
          <CalendarCheck2 size={16} />
          <b>{c.booked}</b>
          <small>{c.bookedMeta}</small>
        </span>
        <span>
          <UserRoundCheck size={16} />
          <b>{c.lead}</b>
          <small>{c.leadMeta}</small>
        </span>
      </div>
    </div>
  );
}
