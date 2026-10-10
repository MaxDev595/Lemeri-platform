"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenCheck, ChevronDown, Globe, RotateCcw, ScanSearch } from "lucide-react";
import { RichText } from "../website-widget";

// «Изучить сайт с помощью ИИ» — one button after the card is connected. The AI
// reads the site (up to 20 pages), writes a short overview of the business and
// adds everything to the knowledge base, so it can answer even if the owner
// filled in nothing. Shown on «Карточка и подключение» and «База знаний».

type StudyState = {
  suggestedUrl: string | null;
  source: null | { id: string; url: string | null; title: string; status: "STUDYING" | "SUMMARIZING" | "READY" | "FAILED"; pages: number; overview: string; studiedAt: string | null; error: string | null; retrying: boolean };
};

const ERRORS: Record<string, { ru: string; en: string }> = {
  URL_REQUIRED: { ru: "Укажите адрес сайта", en: "Enter your website address" },
  INVALID_URL: { ru: "Похоже, адрес указан с ошибкой", en: "The address looks wrong" },
  RATE_LIMITED: { ru: "Слишком часто — попробуйте позже", en: "Too many tries — try again later" },
  FORBIDDEN: { ru: "Недостаточно прав", en: "Not allowed" },
  PLAN_REQUIRED: { ru: "В вашем тарифе закончились источники знаний — смените тариф или удалите лишние", en: "No knowledge sources left on your plan — upgrade or remove some" },
};

export function SiteStudy({ locale, notify, onDone, compact }: { locale: string; notify: (text: string) => void; onDone?: () => void; compact?: boolean }) {
  const ru = locale !== "en";
  const [state, setState] = useState<StudyState | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const wasStudying = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/knowledge/study-site", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as StudyState;
      setState(body);
      setUrl(value => value || body.source?.url || body.suggestedUrl || "");
    } catch { /* keep the previous state */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const studying = state?.source?.status === "STUDYING" || state?.source?.status === "SUMMARIZING";
  const summarizing = state?.source?.status === "SUMMARIZING";
  // Poll while the study runs; tell the parent when it finishes.
  useEffect(() => {
    if (!studying) {
      if (wasStudying.current && state?.source) { wasStudying.current = false; if (state.source.status === "READY") { notify(ru ? `Готово: ИИ изучил сайт (${state.source.pages} стр.)` : `Done: the AI studied ${state.source.pages} pages`); setOpen(true); onDone?.(); } else notify(ru ? "Не удалось изучить сайт" : "Couldn't study the site"); }
      return;
    }
    wasStudying.current = true;
    const poll = window.setInterval(() => void load(), 3000);
    const steps = window.setInterval(() => setStep(value => (value + 1) % 4), 2600);
    return () => { window.clearInterval(poll); window.clearInterval(steps); };
  }, [studying, load, state?.source, notify, onDone, ru]);

  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/knowledge/study-site", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const body = await response.json().catch(() => ({})) as StudyState & { error?: string };
      if (!response.ok) { notify(ERRORS[body.error ?? ""]?.[ru ? "ru" : "en"] ?? (ru ? "Не удалось начать изучение" : "Couldn't start")); return; }
      setState(body); setStep(0);
    } finally { setBusy(false); }
  };

  const source = state?.source;
  const steps = ru ? ["Открываем сайт…", "Читаем страницы: товары, цены, контакты…", "ИИ составляет обзор компании…", "Добавляем в базу знаний…"] : ["Opening the site…", "Reading pages: products, prices, contacts…", "AI writes a company overview…", "Adding to the knowledge base…"];
  const done = source?.status === "READY" && !studying;
  return <section className={compact ? "sxMatch sxStudy compact" : "sxMatch sxStudy"} aria-busy={studying}>
    <div className="sxMatchHead">
      <span className="sxMatchIcon"><ScanSearch size={18}/></span>
      <div>
        <h3>{ru ? "ИИ изучит ваш сайт" : "Let the AI study your website"}</h3>
        <p>{done
          ? (ru ? `Сайт изучен: ${source.pages} стр. и обзор компании в базе знаний. ИИ отвечает по ним, а во время диалога ещё и читает страницу, на которой находится посетитель.` : `Studied: ${source.pages} pages and a company overview are in the knowledge base. During chats the AI also reads the page the visitor is on.`)
          : (ru ? "Одна кнопка — и ИИ прочитает сайт: товары и услуги, цены, доставку, контакты, частые вопросы. Даже если вы ничего не заполняли, он будет знать, что и почём." : "One click and the AI reads your site: products, prices, delivery, contacts, FAQ — so it can answer even if you filled in nothing.")}</p>
      </div>
    </div>
    <form className="sxMatchForm" onSubmit={event => { event.preventDefault(); if (!busy && !studying) void run(); }}>
      <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://your-site.com" inputMode="url" autoComplete="url" disabled={busy || studying} aria-label={ru ? "Адрес сайта" : "Website address"}/>
      <button className="primary" disabled={busy || studying || !url.trim()}>{done ? <RotateCcw size={15}/> : <Globe size={15}/>}{studying ? (summarizing ? steps[2] : steps[step % 2]) : done ? (ru ? "Изучить заново" : "Study again") : (ru ? "Изучить сайт" : "Study the site")}</button>
    </form>
    {studying && <div className="sxMatchProgress" aria-live="polite"><i style={{ width: summarizing ? "80%" : `${(step % 2 + 1) * 28}%` }}/></div>}
    {studying && <small className="sxMuted">{ru ? "Обычно занимает до минуты. Можно уйти со страницы — изучение продолжится." : "Usually takes up to a minute. You can leave the page — it keeps going."}{source?.retrying ? (ru ? " Сайт отвечает медленно, пробуем ещё раз…" : " The site is slow, retrying…") : ""}</small>}
    {source?.status === "FAILED" && !studying && <small className="connectorError">{ru ? "Не получилось прочитать сайт. Проверьте, что адрес верный, сайт открывается без пароля и не закрыт в robots.txt." : "Couldn't read the site. Check the address, that it opens without a password and isn't blocked in robots.txt."}</small>}
    {done && source.overview && <div className="sxMatchResult">
      <button type="button" className="sxStudyToggle" aria-expanded={open} onClick={() => setOpen(value => !value)}><BookOpenCheck size={15}/><b>{ru ? "Что ИИ узнал о компании" : "What the AI learned"}</b><ChevronDown size={15} className={open ? "up" : ""}/></button>
      {open && <div className="sxStudyOverview"><RichText text={source.overview}/></div>}
    </div>}
  </section>;
}
