"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, PartyPopper, X } from "lucide-react";

// «Шаги запуска» at the top of the platform's main page: Регистрация → Онбординг →
// Создание карточки → «Lemeri AI готов к работе». Shown on /app while the AI seller
// is being set up (onboarding form below it) and on the dashboard until the card has
// loaded on the customer's site; the finished state can be hidden.

export type SetupStage = "onboarding" | "card" | "ready";

const COPY = {
  ru: {
    title: "Запуск Lemeri AI", steps: [
      { title: "Регистрация", text: "Аккаунт создан" },
      { title: "Онбординг", text: "ИИ-сотрудник: роль, цели, знания о бизнесе" },
      { title: "Создание карточки", text: "Вид чата и установка на сайт" },
    ],
    ready: "Lemeri AI готов к работе", readyText: "Карточка работает на вашем сайте — ИИ отвечает посетителям и собирает заявки.",
    now: "Сейчас", cardCta: "Создать карточку", cardHint: "Шаг засчитается, когда карточка откроется на вашем сайте.", hide: "Скрыть",
  },
  en: {
    title: "Launching Lemeri AI", steps: [
      { title: "Sign-up", text: "Account created" },
      { title: "Onboarding", text: "AI employee: role, goals, business knowledge" },
      { title: "Card", text: "Chat look and install on your site" },
    ],
    ready: "Lemeri AI is ready to work", readyText: "The card is live on your website — the AI answers visitors and collects requests.",
    now: "Now", cardCta: "Create the card", cardHint: "The step completes once the card opens on your website.", hide: "Hide",
  },
} as const;

export function SetupSteps({ locale, stage, onCard, storageKey }: { locale: string; stage: SetupStage; onCard?: () => void; storageKey?: string }) {
  const c = COPY[locale === "en" ? "en" : "ru"];
  const [hidden, setHidden] = useState(false);
  useEffect(() => { if (stage === "ready" && storageKey) { try { setHidden(window.localStorage.getItem(storageKey) === "1"); } catch { /* storage unavailable */ } } }, [stage, storageKey]);
  if (hidden) return null;
  const current = stage === "onboarding" ? 1 : stage === "card" ? 2 : 3;
  const hide = () => { setHidden(true); try { if (storageKey) window.localStorage.setItem(storageKey, "1"); } catch { /* storage unavailable */ } };
  return <section className={`setupSteps${stage === "ready" ? " ready" : ""}`} aria-label={c.title}>
    <ol>
      {c.steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return <li key={step.title} className={state} aria-current={state === "current" ? "step" : undefined}>
          <span className="setupDot">{state === "done" ? <Check size={14} /> : index + 1}</span>
          <div><b>{step.title}</b><small>{state === "current" ? `${c.now}: ${step.text}` : step.text}</small></div>
        </li>;
      })}
      <li className={stage === "ready" ? "done final" : "todo final"}>
        <span className="setupDot">{stage === "ready" ? <PartyPopper size={14} /> : <Check size={14} />}</span>
        <div><b>{c.ready}</b>{stage === "ready" ? <small>{c.readyText}</small> : null}</div>
      </li>
    </ol>
    {stage === "card" && onCard ? <div className="setupAction"><button type="button" className="primary" onClick={onCard}>{c.cardCta}<ArrowRight size={15} /></button><small>{c.cardHint}</small></div> : null}
    {stage === "ready" && storageKey ? <button type="button" className="iconButton setupHide" onClick={hide} aria-label={c.hide} title={c.hide}><X size={16} /></button> : null}
  </section>;
}
