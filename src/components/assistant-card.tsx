"use client";

import { FormEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Maximize2, Minimize2, Minus, Pin, PinOff, RotateCcw, Sparkles, X } from "lucide-react";
import { floatingCardRuntime, type CardController } from "@/lib/floating-card/runtime";
import { LemiriGlyph } from "./logo";

type Section = "overview" | "employees" | "conversations" | "leads" | "appointments" | "knowledge" | "actions" | "rules" | "channels" | "integrations" | "analytics" | "team" | "billing" | "settings" | "notifications" | "testing";
type Proposal = {
  id: string; kind: string; title: string; details: string[]; danger?: boolean;
  request: { method: string; path: string; body?: unknown };
  effect?: { theme?: "light" | "dark" | "system"; locale?: "ru" | "en"; navigate?: Section };
  state?: "pending" | "running" | "done" | "cancelled" | "failed"; error?: string;
};
type Msg = { id: string; role: "user" | "assistant"; text: string; sections?: Section[]; proposals?: Proposal[]; failed?: boolean };

const copy = {
  ru: {
    title: "Lemiri Помощник", status: "Видит данные вашего пространства", open: "Открыть помощника (Ctrl+J)", collapse: "Свернуть", pin: "Закрепить положение", unpin: "Открепить", maximize: "Развернуть", restore: "Вернуть размер", reset: "Новый диалог",
    hello: "Чем помочь?", intro: "Спросите про функции платформы, соберу данные по клиентам, диалогам и CRM, открою нужный раздел или подготовлю изменение — вы подтвердите его кнопкой.",
    placeholder: "Спросите что угодно…", send: "Отправить", thinking: "Думаю", failed: "Не получилось ответить. Попробуйте ещё раз.", rateLimited: "Слишком много запросов, подождите минуту.",
    confirm: "Подтвердить", cancel: "Отмена", done: "Выполнено", cancelled: "Отменено", running: "Выполняю…", actionFailed: "Не удалось выполнить", openSection: "Открыть", hint: "Enter — отправить · Shift+Enter — новая строка",
    pinnedNote: "Положение закреплено", resized: "Тяните за края, чтобы изменить размер",
    sections: { overview: "Обзор", employees: "Сотрудники", conversations: "Диалоги", leads: "Лиды", appointments: "Записи", knowledge: "Знания", actions: "Действия", rules: "Правила", channels: "Каналы", integrations: "Интеграции", analytics: "Аналитика", team: "Команда", billing: "Тариф", settings: "Настройки", notifications: "Уведомления", testing: "Тестирование" },
  },
  en: {
    title: "Lemiri Assistant", status: "Sees your workspace data", open: "Open assistant (Ctrl+J)", collapse: "Collapse", pin: "Lock position", unpin: "Unlock", maximize: "Maximize", restore: "Restore size", reset: "New chat",
    hello: "How can I help?", intro: "Ask about platform features, I can collect data on customers, conversations and CRM, open a section or prepare a change for you to confirm.",
    placeholder: "Ask anything…", send: "Send", thinking: "Thinking", failed: "Could not answer. Please try again.", rateLimited: "Too many requests, wait a minute.",
    confirm: "Confirm", cancel: "Cancel", done: "Done", cancelled: "Cancelled", running: "Running…", actionFailed: "Failed", openSection: "Open", hint: "Enter to send · Shift+Enter for a new line",
    pinnedNote: "Position locked", resized: "Drag the edges to resize",
    sections: { overview: "Overview", employees: "Employees", conversations: "Conversations", leads: "Leads", appointments: "Appointments", knowledge: "Knowledge", actions: "Actions", rules: "Rules", channels: "Channels", integrations: "Integrations", analytics: "Analytics", team: "Team", billing: "Plan", settings: "Settings", notifications: "Notifications", testing: "Testing" },
  },
} as const;

const suggestions: Record<"ru" | "en", Partial<Record<Section, string[]>> & { default: string[] }> = {
  ru: {
    default: ["Сводка по пространству", "Что нового в Telegram?", "Покажи новые лиды", "Что умеет платформа?"],
    channels: ["Как подключить WhatsApp?", "Как встроить чат на сайт?", "Что пишут в Telegram?"],
    integrations: ["Проверь статус CRM", "Как подключить CRM?"],
    leads: ["Покажи новые лиды", "Какие лиды квалифицированы?"],
    conversations: ["Какие диалоги ждут менеджера?", "Что пишут в WhatsApp?", "Покажи клиентов"],
    appointments: ["Записи на сегодня", "Предстоящие записи"],
    knowledge: ["Какие вопросы без ответа?", "Как добавить прайс-лист?"],
    settings: ["Включи тёмную тему", "Что есть в настройках?"],
    employees: ["Как настроить сотрудника?", "Сводка по пространству"],
    actions: ["Что может делать ИИ-сотрудник?", "Как разрешить записи?"],
  },
  en: {
    default: ["Workspace summary", "What's new in Telegram?", "Show new leads", "What can the platform do?"],
    channels: ["How do I connect WhatsApp?", "How do I add the chat to my website?", "What's new in Telegram?"],
    integrations: ["Check CRM status", "How do I connect a CRM?"],
    leads: ["Show new leads", "Which leads are qualified?"],
    conversations: ["Which chats need a manager?", "What's new in WhatsApp?", "Show customers"],
    appointments: ["Appointments today", "Upcoming appointments"],
    knowledge: ["Which questions are unanswered?", "How do I add a price list?"],
    settings: ["Switch to dark theme", "What's in settings?"],
    employees: ["How do I set up an employee?", "Workspace summary"],
    actions: ["What can the AI employee do?", "How do I allow bookings?"],
  },
};

/** Minimal, safe markdown: **bold**, "- " bullets and line breaks. */
function RichText({ text }: { text: string }) {
  const inline = (line: string, key: string): ReactNode[] => line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => part.startsWith("**") && part.endsWith("**") ? <b key={`${key}-${i}`}>{part.slice(2, -2)}</b> : <span key={`${key}-${i}`}>{part}</span>);
  const blocks: ReactNode[] = []; let list: ReactNode[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>); list = []; } };
  text.split("\n").forEach((raw, index) => {
    const bullet = raw.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
    if (bullet) { list.push(<li key={index}>{inline(bullet[1], String(index))}</li>); return; }
    if (/^\s{2,}\S/.test(raw) && list.length) { list.push(<li key={index} className="asContinuation">{inline(raw.trim(), String(index))}</li>); return; }
    flush();
    if (raw.trim()) blocks.push(<p key={index}>{inline(raw, String(index))}</p>);
  });
  flush();
  return <>{blocks}</>;
}

const runtime = floatingCardRuntime();

export function AssistantCard({ locale, workspaceId, page, onNavigate, onLocaleChange, refresh, notify }: {
  locale: "ru" | "en"; workspaceId: string; page: Section;
  onNavigate: (section: Section) => void; onLocaleChange: (locale: "ru" | "en") => void; refresh: () => void; notify: (message: string) => void;
}) {
  const c = copy[locale];
  const chatKey = `lemiri:assistant:${workspaceId}:chat`;
  const rootRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLElement>(null), launcherRef = useRef<HTMLButtonElement>(null), headerRef = useRef<HTMLElement>(null);
  const streamRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<CardController | null>(null);
  const [ui, setUi] = useState({ open: false, pinned: false, maximized: false, mobile: false });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);

  useEffect(() => {
    const root = rootRef.current, card = cardRef.current, launcher = launcherRef.current, header = headerRef.current;
    if (!root || !card || !launcher || !header) return;
    const mobileNow = () => (document.documentElement.clientWidth || window.innerWidth) < runtime.MOBILE;
    const ctl = runtime.mount({ root, card, launcher, dragHandle: header, storageKey: "lemiri:assistant:layout", classPrefix: "fc-",
      onChange: s => { openRef.current = s.open; const mobile = mobileNow(); setUi(prev => (prev.open === s.open && prev.pinned === s.pinned && prev.maximized === s.maximized && prev.mobile === mobile ? prev : { open: s.open, pinned: s.pinned, maximized: s.maximized, mobile })); },
      onOpen: () => { setUnread(0); window.setTimeout(() => inputRef.current?.focus(), 60); },
    });
    controller.current = ctl;
    return () => { ctl.destroy(); controller.current = null; };
  }, []);

  const [hydratedKey, setHydratedKey] = useState("");
  useEffect(() => {
    let saved: Msg[] = [];
    try { const raw = JSON.parse(window.localStorage.getItem(chatKey) ?? "[]"); if (Array.isArray(raw)) saved = raw.slice(-40); } catch { saved = []; }
    // A prepared change is never re-offered after a reload.
    setMessages(saved.map(m => ({ ...m, proposals: m.proposals?.map(p => (p.state === "pending" || p.state === "running" ? { ...p, state: "cancelled" as const } : p)) })));
    setHydratedKey(chatKey);
  }, [chatKey]);
  useEffect(() => { if (hydratedKey !== chatKey) return; try { window.localStorage.setItem(chatKey, JSON.stringify(messages.slice(-40))); } catch { /* storage unavailable */ } }, [messages, chatKey, hydratedKey]);
  useEffect(() => { const node = streamRef.current; if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); }, [messages.length, busy, ui.open]);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") { event.preventDefault(); controller.current?.toggle(); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(async (text: string) => {
    const content = text.trim(); if (!content || busy) return;
    const next: Msg[] = [...messages, { id: crypto.randomUUID(), role: "user", text: content }];
    setMessages(next); setBusy(true);
    try {
      const history = next.filter(m => !m.failed).slice(-16).map(m => ({ role: m.role, content: m.text.slice(0, 4000) }));
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history, page, locale }) });
      const body = await response.json().catch(() => ({})) as { reply?: string; sections?: Section[]; navigate?: Section; proposals?: Proposal[]; error?: string };
      if (!response.ok || !body.reply) throw new Error(response.status === 429 ? c.rateLimited : c.failed);
      setMessages(value => [...value, { id: crypto.randomUUID(), role: "assistant", text: body.reply!, sections: body.sections ?? [], proposals: (body.proposals ?? []).map(p => ({ ...p, state: "pending" })) }]);
      if (body.navigate) onNavigate(body.navigate);
      if (!openRef.current) setUnread(value => value + 1);
    } catch (error) {
      setMessages(value => [...value, { id: crypto.randomUUID(), role: "assistant", text: error instanceof Error ? error.message : c.failed, failed: true }]);
    } finally { setBusy(false); }
  }, [busy, messages, page, locale, c, onNavigate]);

  const setProposal = (messageId: string, proposalId: string, patch: Partial<Proposal>) => setMessages(value => value.map(m => m.id !== messageId ? m : { ...m, proposals: m.proposals?.map(p => p.id === proposalId ? { ...p, ...patch } : p) }));
  const confirm = async (message: Msg, p: Proposal) => {
    setProposal(message.id, p.id, { state: "running", error: undefined });
    try {
      const response = await fetch(p.request.path, { method: p.request.method, headers: p.request.body === undefined ? undefined : { "content-type": "application/json" }, body: p.request.body === undefined ? undefined : JSON.stringify(p.request.body) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error === "FORBIDDEN" ? (locale === "ru" ? "нет прав" : "not allowed") : body.error ?? String(response.status));
      setProposal(message.id, p.id, { state: "done" });
      if (p.effect?.theme) document.documentElement.dataset.theme = p.effect.theme === "system" ? "" : p.effect.theme;
      if (p.effect?.locale) onLocaleChange(p.effect.locale);
      if (p.effect?.navigate) onNavigate(p.effect.navigate);
      notify(`${c.done}: ${p.title}`);
      refresh();
    } catch (error) {
      setProposal(message.id, p.id, { state: "failed", error: error instanceof Error ? error.message : "" });
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = inputRef.current?.value ?? ""; if (inputRef.current) { inputRef.current.value = ""; inputRef.current.style.height = ""; } void send(value); };
  const onInputKey = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } };
  const autosize = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; };
  const chips = suggestions[locale][page] ?? suggestions[locale].default;

  return <div ref={rootRef} className="fcRoot" data-assistant="">
    <button ref={launcherRef} type="button" className="fcLauncher" aria-label={c.open} title={c.open} aria-expanded={ui.open}>
      <LemiriGlyph size={26}/><span className="fcLauncherPulse" aria-hidden="true"/>{unread > 0 && <em>{unread}</em>}
    </button>
    <section ref={cardRef} className="fcCard assistantCard" role="dialog" aria-label={c.title}>
      <header ref={headerRef} className="fcHeader" tabIndex={0} aria-roledescription={locale === "ru" ? "перемещаемая панель" : "movable panel"} title={ui.pinned ? c.pinnedNote : undefined}>
        <span className="asAvatar"><LemiriGlyph size={20}/></span>
        <div className="asTitle"><b>{c.title}</b><small><i/><span>{c.status}</span></small></div>
        <div className="asTools" data-no-drag="">
          <button type="button" onClick={() => { setMessages([]); inputRef.current?.focus(); }} aria-label={c.reset} title={c.reset}><RotateCcw size={15}/></button>
          {!ui.mobile && <button type="button" className={ui.pinned ? "on" : ""} onClick={() => controller.current?.setPinned(!ui.pinned)} aria-pressed={ui.pinned} aria-label={ui.pinned ? c.unpin : c.pin} title={ui.pinned ? c.unpin : c.pin}>{ui.pinned ? <PinOff size={15}/> : <Pin size={15}/>}</button>}
          {!ui.mobile && <button type="button" onClick={() => controller.current?.toggleMaximize()} aria-label={ui.maximized ? c.restore : c.maximize} title={ui.maximized ? c.restore : c.maximize}>{ui.maximized ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button>}
          <button type="button" onClick={() => controller.current?.close()} aria-label={c.collapse} title={c.collapse}><Minus size={16}/></button>
        </div>
      </header>
      <div className="asStream" ref={streamRef} aria-live="polite">
        {!messages.length && <div className="asWelcome"><span><Sparkles size={22}/></span><h2>{c.hello}</h2><p>{c.intro}</p></div>}
        {messages.map(m => <div key={m.id} className={`asMsg ${m.role}${m.failed ? " failed" : ""}`}>
          <div className="asBubble"><RichText text={m.text}/></div>
          {!!m.proposals?.length && m.proposals.map(p => <div key={p.id} className={`asAction ${p.state ?? "pending"}${p.danger ? " danger" : ""}`}>
            <b>{p.title}</b>{p.details.filter(Boolean).map((d, i) => <small key={i}>{d}</small>)}
            {p.state === "pending" || p.state === "failed" ? <div className="asActionButtons">
              {p.state === "failed" && <span className="asActionError">{c.actionFailed}{p.error ? `: ${p.error}` : ""}</span>}
              <button type="button" className="ghost" onClick={() => setProposal(m.id, p.id, { state: "cancelled" })}><X size={14}/>{c.cancel}</button>
              <button type="button" className={p.danger ? "dangerButton" : "primary"} onClick={() => void confirm(m, p)}><Check size={14}/>{c.confirm}</button>
            </div> : <span className="asActionState">{p.state === "running" ? c.running : p.state === "done" ? <><Check size={14}/>{c.done}</> : c.cancelled}</span>}
          </div>)}
          {!!m.sections?.length && <div className="asLinks">{m.sections.map(s => <button type="button" key={s} onClick={() => onNavigate(s)}>{c.openSection}: {c.sections[s]}</button>)}</div>}
        </div>)}
        {busy && <div className="asMsg assistant"><div className="asBubble asTyping" aria-label={c.thinking}><i/><i/><i/></div></div>}
      </div>
      {!busy && <div className="asChips">{chips.map(item => <button type="button" key={item} onClick={() => void send(item)}>{item}</button>)}</div>}
      <form className="asComposer" onSubmit={submit}>
        <textarea ref={inputRef} name="message" rows={1} maxLength={4000} placeholder={c.placeholder} aria-label={c.placeholder} onKeyDown={onInputKey} onInput={e => autosize(e.currentTarget)}/>
        <button type="submit" className="primary" disabled={busy} aria-label={c.send}><ArrowUp size={17}/></button>
      </form>
      <footer className="asHint">{c.hint}</footer>
    </section>
  </div>;
}
