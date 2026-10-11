"use client";

import { CSSProperties, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, ClipboardList, SendHorizontal, Sparkles, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { chatVars, fontHref, type ResolvedLook } from "@/lib/widget/design";
import { LemiriGlyph } from "./logo";

type Message = { id?: string; role: "user" | "assistant"; text: string };

const widgetCopy = {
  ru: {
    status: "ИИ-консультант · обычно отвечает сразу", hello: "Здравствуйте!", help: "Помогу выбрать и отвечу на вопросы.",
    message: "Напишите сообщение…", connecting: "Подключение…", messageLabel: "Сообщение", send: "Отправить",
    powered: "Lemeri AI · ИИ может ошибаться", disclaimer: "ИИ может ошибаться", sendFailed: "Не удалось отправить сообщение", connectionFailed: "Ошибка соединения",
    suggestions: ["Помогите выбрать", "Сколько стоит?", "Доставка и оплата"],
    lead: "Оставить заявку", leadTitle: "Заявка", leadCopy: "Оставьте контакты — менеджер свяжется с вами.",
    name: "Имя", phone: "Телефон", email: "Email", interest: "Что вас интересует", budget: "Бюджет", comment: "Комментарий",
    consent: (company: string) => `Я согласен(а) на передачу моих контактных данных компании «${company}» для связи по моему запросу.`,
    privacy: "Политика конфиденциальности", submit: "Отправить заявку", sending: "Отправляем…",
    contactRequired: "Укажите телефон или email", consentRequired: "Нужно ваше согласие на передачу контактов",
    leadDone: "Спасибо! Заявка отправлена — менеджер свяжется с вами.", leadFailed: "Не удалось отправить заявку. Попробуйте ещё раз.",
    preview: "Это предпросмотр: так ИИ будет отвечать посетителям.",
  },
  en: {
    status: "AI consultant · usually replies instantly", hello: "Hello!", help: "I'll help you choose and answer your questions.",
    message: "Type a message…", connecting: "Connecting…", messageLabel: "Message", send: "Send",
    powered: "Lemeri AI · AI can make mistakes", disclaimer: "AI can make mistakes", sendFailed: "Could not send the message", connectionFailed: "Connection error",
    suggestions: ["Help me choose", "How much is it?", "Delivery & payment"],
    lead: "Leave a request", leadTitle: "Request", leadCopy: "Leave your contacts and a manager will get back to you.",
    name: "Name", phone: "Phone", email: "Email", interest: "What are you interested in", budget: "Budget", comment: "Comment",
    consent: (company: string) => `I agree that my contact details are passed to ${company} to contact me about my request.`,
    privacy: "Privacy policy", submit: "Send request", sending: "Sending…",
    contactRequired: "Enter a phone or email", consentRequired: "Please confirm consent to share your contacts",
    leadDone: "Thank you! Your request was sent — a manager will contact you.", leadFailed: "Couldn't send the request. Please try again.",
    preview: "This is a preview: this is how the AI will answer visitors.",
  },
} as const;

// ------------------------------------------------------------------ safe rich text
// Only **bold**, [title](https://url), bare https URLs and "- " lists. Everything is
// rendered as React text, so model output can never inject HTML into the page.
const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;
  let last = 0, match: RegExpExecArray | null, i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const href = match[3] ?? match[4];
    if (match[1]) out.push(<b key={`${key}b${i++}`}>{match[1]}</b>);
    else if (href && SAFE_URL.test(href)) out.push(<a key={`${key}a${i++}`} href={href} target="_blank" rel="noopener noreferrer nofollow">{match[2] ?? href.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</a>);
    else out.push(match[0]);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = []; let list: ReactNode[] = [];
  text.split("\n").forEach((line, index) => {
    if (/^\s*[-•*]\s+/.test(line)) { list.push(<li key={index}>{inline(line.replace(/^\s*[-•*]\s+/, ""), `l${index}`)}</li>); return; }
    if (list.length) { blocks.push(<ul key={`u${index}`}>{list}</ul>); list = []; }
    if (line.trim()) blocks.push(<p key={index}>{inline(line, `p${index}`)}</p>);
  });
  if (list.length) blocks.push(<ul key="ul">{list}</ul>);
  return <>{blocks}</>;
}

type Auth = { token: string; origin: string };

export function WebsiteWidget({ locale, employeeId, employeeName, company = "", privacyUrl = "", embedded = false, theme = "auto", look, preview = false, previewDark, previewSample = true }: {
  locale: Locale; employeeId: string; employeeName: string; company?: string; privacyUrl?: string; embedded?: boolean; theme?: "light" | "dark" | "auto";
  look: ResolvedLook; preview?: boolean; previewDark?: boolean; /** Preview with a sample dialog (true) or the empty welcome screen (false). */ previewSample?: boolean;
}) {
  const base = widgetCopy[locale];
  const design = look.design;
  const copy = { ...base, hello: design.welcome.title || look.greeting || base.hello, help: design.welcome.text || look.help || base.help, status: look.status || base.status, suggestions: look.suggestions?.length ? look.suggestions : base.suggestions };
  const title = look.title || employeeName;
  const [messages, setMessages] = useState<Message[]>(() => preview && previewSample ? [{ role: "user", text: locale === "en" ? "I need a gift for a runner, budget around $50" : "Нужен подарок бегуну, бюджет около 5000 ₽" }, { role: "assistant", text: locale === "en" ? "Great choice! Two options fit your budget:\n- **Running belt** — light, fits a phone\n- **Wireless earbuds** — water resistant\nShall I tell you about delivery? [Catalog](https://example.com)" : "Отличный повод! Под ваш бюджет подойдут:\n- **Беговой пояс** — лёгкий, помещается телефон\n- **Беспроводные наушники** — защита от влаги\nРассказать о доставке? [Каталог](https://example.com)" }] : []);
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [embedAuth, setEmbedAuth] = useState<Auth>();
  const [leadOpen, setLeadOpen] = useState(false);
  const seenMessageIds = useRef(new Set<string>());
  const authRef = useRef<Auth>(undefined);
  const authWaiters = useRef<Array<(value: Auth) => void>>([]);
  const pollCursor = useRef(new Date(0).toISOString());
  const pageRef = useRef("");
  const ready = preview || Boolean(visitorId && embedAuth);

  // Light / dark follows the card (or the visitor's system for "auto").
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => { const query = matchMedia("(prefers-color-scheme: dark)"); setSystemDark(query.matches); const on = () => setSystemDark(query.matches); query.addEventListener("change", on); return () => query.removeEventListener("change", on); }, []);
  const dark = previewDark ?? (theme === "dark" || (theme === "auto" && systemDark));
  const vars = useMemo(() => chatVars(design, dark), [design, dark]);
  const font = fontHref(design.font);
  const headFont = design.headingFont !== "same" && design.headingFont !== design.font ? fontHref(design.headingFont) : "";
  const SendIcon = design.composer.sendIcon === "send" ? SendHorizontal : design.composer.sendIcon === "sparkle" ? Sparkles : ArrowUp;
  const classes = ["publicWidget", "lw", embedded && "embedded", preview && "preview", `bubbles-${design.bubbleStyle}`, `msg-${design.messages.animation}`, `typing-${design.messages.typing}`, `composer-${design.composer.style}`,
    design.messages.shadow && "msg-shadow", design.effects.glass && "fx-glass", design.effects.pattern !== "none" && "fx-pattern"].filter(Boolean).join(" ");

  useEffect(() => { if (!preview) document.documentElement.lang = locale; }, [locale, preview]);
  useEffect(() => { if (!preview) document.documentElement.dataset.theme = theme === "auto" ? "" : theme; }, [theme, preview]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!embedded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") window.parent.postMessage({ type: "lemiri:close" }, "*"); };
    const onMessage = (event: MessageEvent) => { if (event.source === window.parent && event.data?.type === "lemiri:focus") { inputRef.current?.focus(); window.parent.postMessage({ type: "lemiri:where" }, "*"); } };
    addEventListener("keydown", onKey); addEventListener("message", onMessage);
    return () => { removeEventListener("keydown", onKey); removeEventListener("message", onMessage); };
  }, [embedded]);
  const assistantCount = useRef(0);
  useEffect(() => {
    const count = messages.filter(message => message.role === "assistant").length;
    if (embedded && count > assistantCount.current) window.parent.postMessage({ type: "lemiri:message" }, "*");
    assistantCount.current = count;
  }, [messages, embedded]);
  useEffect(() => {
    if (preview) return;
    const key = `lemiri:${employeeId}:visitor`;
    let existing: string | null = null;
    try { existing = localStorage.getItem(key); } catch { /* storage blocked */ }
    if (existing) { setVisitorId(existing); return; }
    const created = crypto.randomUUID();
    try { localStorage.setItem(key, created); } catch { /* storage blocked: one visitor id per page view */ }
    setVisitorId(created);
  }, [employeeId, preview]);
  // Hosted chat page (a direct link, no website): Lemeri's own origin issues the token.
  const hostedToken = async () => {
    try { const response = await fetch(`/api/widget/${employeeId}/token`, { method: "POST" }); const body = await response.json() as { token?: string }; if (!body.token) return undefined; const next = { token: body.token, origin: window.location.origin }; authRef.current = next; setEmbedAuth(next); return next; } catch { return undefined; }
  };
  useEffect(() => {
    if (embedded || preview) return;
    void hostedToken();
    const renew = window.setInterval(() => void hostedToken(), 8 * 60_000);
    return () => window.clearInterval(renew);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, employeeId, preview]);
  useEffect(() => {
    if (!embedded || preview) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "lemiri:configure" || typeof event.data.token !== "string") return;
      const next = { token: event.data.token, origin: event.origin };
      if (typeof event.data.page === "string") pageRef.current = event.data.page.slice(0, 300);
      if (authRef.current && authRef.current.token === next.token && authRef.current.origin === next.origin) return; // page update only
      authRef.current = next; setEmbedAuth(next);
      authWaiters.current.splice(0).forEach(resolve => resolve(next));
    };
    addEventListener("message", receive);
    window.parent.postMessage({ type: "lemiri:ready" }, "*");
    // Tokens expire after 10 minutes; renew them ahead of time while the page stays open.
    const renew = window.setInterval(() => window.parent.postMessage({ type: "lemiri:refresh" }, "*"), 8 * 60_000);
    return () => { removeEventListener("message", receive); window.clearInterval(renew); };
  }, [embedded, preview]);
  const refreshAuth = () => !embedded ? hostedToken() : new Promise<Auth | undefined>(resolve => {
    const timer = window.setTimeout(() => resolve(undefined), 5000);
    authWaiters.current.push(value => { window.clearTimeout(timer); resolve(value); });
    window.parent.postMessage({ type: "lemiri:refresh" }, "*");
  });
  const authedFetch = async (path: string, body: unknown) => {
    const post = (auth: Auth) => fetch(`/api/widget/${employeeId}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-lemiri-widget-token": auth.token, "x-lemiri-parent-origin": auth.origin }, body: JSON.stringify(body) });
    let response = await post(authRef.current ?? embedAuth!);
    let json = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.status === 403 && json.error === "WIDGET_AUTH_REQUIRED") { const renewed = await refreshAuth(); if (renewed) { response = await post(renewed); json = await response.json().catch(() => ({})) as Record<string, unknown>; } }
    return { response, json };
  };

  // Manager replies (and anything sent after a handoff) arrive by polling.
  useEffect(() => {
    if (!conversationId || !visitorId || !embedAuth) return;
    let active = true;
    const poll = async () => {
      try {
        const query = new URLSearchParams({ conversationId, visitorId, after: pollCursor.current });
        const response = await fetch(`/api/widget/${employeeId}/messages?${query}`, { headers: { "x-lemiri-widget-token": embedAuth.token, "x-lemiri-parent-origin": embedAuth.origin } });
        if (!response.ok) return;
        const body = await response.json() as { messages: Array<{ id: string; content: string; createdAt: string }> };
        if (!active) return;
        const fresh = body.messages.filter(message => !seenMessageIds.current.has(message.id));
        if (body.messages.length) pollCursor.current = body.messages.at(-1)!.createdAt;
        if (!fresh.length) return;
        fresh.forEach(message => seenMessageIds.current.add(message.id));
        setMessages(value => [...value, ...fresh.map(message => ({ id: message.id, role: "assistant" as const, text: message.content }))]);
      } catch { /* next poll */ }
    };
    void poll(); const timer = setInterval(poll, 2000);
    return () => { active = false; clearInterval(timer); };
  }, [conversationId, visitorId, embedAuth, employeeId]);

  const streamRef = useRef<HTMLElement>(null);
  useEffect(() => { const node = streamRef.current; if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); }, [messages.length, busy, leadOpen]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form).get("message")?.toString().trim();
    if (!input || busy || !ready) return;
    form.reset();
    await send(input);
  }
  async function send(input: string) {
    if (!input || busy || !ready) return;
    setMessages(value => [...value, { role: "user", text: input }]);
    if (preview) { setMessages(value => [...value, { role: "assistant", text: copy.preview }]); return; }
    setBusy(true);
    try {
      const { response, json } = await authedFetch("messages", { visitorId, conversationId, messageId: crypto.randomUUID(), message: input, ...(pageRef.current ? { page: pageRef.current } : {}) });
      if (!response.ok) throw new Error(copy.sendFailed);
      setConversationId(json.conversationId as string);
      if (json.messageId) seenMessageIds.current.add(String(json.messageId));
      setMessages(value => [...value, { id: json.messageId as string | undefined, role: "assistant", text: String(json.message ?? copy.sendFailed) }]);
    } catch (error) {
      setMessages(value => [...value, { role: "assistant", text: error instanceof Error ? error.message : copy.connectionFailed }]);
    } finally { setBusy(false); }
  }

  const avatar = (size: number) => look.avatarUrl
    ? <img className="lwAvatarImg" src={look.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer"/>
    : <LemiriGlyph size={Math.round(size * 0.58)}/>;
  const shape = design.avatarShape === "circle" ? "50%" : design.avatarShape === "square" ? "6px" : "30%";
  const welcome = design.welcome.layout === "hero"
    ? <div className="lwWelcome hero"><span className="lwWelcomeAvatar" style={{ borderRadius: shape }}>{avatar(64)}</span><h1>{copy.hello}</h1><p>{copy.help}</p></div>
    : <div className="lwWelcome"><span className="lwWelcomeAvatar small" style={{ borderRadius: shape }}>{avatar(40)}</span><div className="lwBubble assistant"><b>{copy.hello}</b> {copy.help}</div></div>;

  const bubble = (message: Message, index: number) => {
    const node = <div className={`lwBubble ${message.role}`} key={index}><RichText text={message.text}/></div>;
    return design.messages.avatar && message.role === "assistant" ? <div className="lwRowAi" key={index}><span className="lwMsgAvatar" style={{ borderRadius: shape }}>{avatar(26)}</span>{node}</div> : node;
  };

  return <main className={classes} data-dark={dark ? "true" : "false"} style={vars as CSSProperties}>
    {font && <link rel="stylesheet" href={font}/>}
    {headFont && <link rel="stylesheet" href={headFont}/>}
    {!embedded && <header className={`lwHead ${design.header.style}`}>{design.header.showAvatar && <span className="lwHeadAvatar" style={{ borderRadius: shape }}>{avatar(38)}</span>}<div><b>{title}</b>{design.header.showStatus && <small>{copy.status}</small>}</div></header>}
    <section aria-live="polite" ref={streamRef}>
      {messages.length === 0 && welcome}
      {messages.length === 0 && design.welcome.showSuggestions && <div className="lwSuggestions">{copy.suggestions.map(item => <button type="button" key={item} disabled={busy || !ready} onClick={() => void send(item)}>{item}</button>)}</div>}
      {messages.map(bubble)}
      {busy && <div className="lwBubble assistant typing" aria-label="…"><i/><i/><i/></div>}
      {leadOpen && <LeadForm copy={copy} company={company || title} privacyUrl={privacyUrl} onClose={() => setLeadOpen(false)} onSend={async values => {
        if (preview) { setLeadOpen(false); setMessages(value => [...value, { role: "assistant", text: copy.leadDone }]); return null; }
        const { response, json } = await authedFetch("lead", { ...values, visitorId, conversationId, page: embedAuth?.origin ?? "" });
        if (!response.ok) return json.error === "CONTACT_REQUIRED" ? copy.contactRequired : json.error === "CONSENT_REQUIRED" ? copy.consentRequired : copy.leadFailed;
        setLeadOpen(false); setMessages(value => [...value, { role: "assistant", text: copy.leadDone }]); return null;
      }}/>}
    </section>
    {look.leadForm && !leadOpen && <button type="button" className="lwLeadButton" disabled={!ready} onClick={() => setLeadOpen(true)}><ClipboardList size={14}/>{copy.lead}</button>}
    <form className="lwComposer" onSubmit={submit}><input ref={inputRef} name="message" required maxLength={4000} autoComplete="off" placeholder={ready ? (design.composer.placeholder || copy.message) : copy.connecting} aria-label={copy.messageLabel}/><button disabled={busy || !ready} aria-label={copy.send}><SendIcon size={18}/></button></form>
    <footer>{look.tier === "custom" ? copy.disclaimer : copy.powered}</footer>
  </main>;
}

type Copy = { contactRequired: string; consentRequired: string; leadFailed: string; leadTitle: string; leadCopy: string; name: string; phone: string; email: string; interest: string; budget: string; comment: string; privacy: string; submit: string; sending: string; consent: (company: string) => string };
function LeadForm({ copy, company, privacyUrl, onClose, onSend }: { copy: Copy; company: string; privacyUrl: string; onClose: () => void; onSend: (values: Record<string, unknown>) => Promise<string | null> }) {
  const [error, setError] = useState(""); const [sending, setSending] = useState(false);
  const consentText = copy.consent(company);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    if (!data.phone?.trim() && !data.email?.trim()) { setError(copy.contactRequired); return; }
    if (data.consent !== "on") { setError(copy.consentRequired); return; }
    setSending(true); setError("");
    const failure = await onSend({ name: data.name, phone: data.phone, email: data.email, interest: data.interest, budget: data.budget, comment: data.comment, consent: true, consentText }).catch(() => copy.leadFailed);
    setSending(false); if (failure) setError(failure);
  };
  return <form className="lwLead" onSubmit={submit}>
    <header><b><Check size={14}/>{copy.leadTitle}</b><button type="button" onClick={onClose} aria-label="×"><X size={14}/></button></header>
    <p>{copy.leadCopy}</p>
    <label>{copy.name}<input name="name" required minLength={2} maxLength={120} autoComplete="name"/></label>
    <div className="lwRow"><label>{copy.phone}<input name="phone" type="tel" maxLength={40} autoComplete="tel" pattern="[+0-9 ()\-]*"/></label><label>{copy.email}<input name="email" type="email" maxLength={200} autoComplete="email"/></label></div>
    <label>{copy.interest}<input name="interest" maxLength={200}/></label>
    <div className="lwRow"><label>{copy.budget}<input name="budget" maxLength={120}/></label><label>{copy.comment}<input name="comment" maxLength={1000}/></label></div>
    <label className="lwConsent"><input type="checkbox" name="consent" required/><span>{consentText}{privacyUrl && <> <a href={privacyUrl} target="_blank" rel="noopener noreferrer">{copy.privacy}</a></>}</span></label>
    {error && <p className="lwError" role="alert">{error}</p>}
    <button className="lwPrimary" disabled={sending}>{sending ? copy.sending : copy.submit}</button>
  </form>;
}
