"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { LemiriGlyph } from "./logo";

type Message = { id?:string; role: "user" | "assistant"; text: string };

const widgetCopy = {
  ru: {
    status: "AI-сотрудник · обычно отвечает сразу",
    hello: "Здравствуйте!",
    help: "Чем я могу помочь?",
    message: "Напишите сообщение…",
    connecting: "Подключение…",
    messageLabel: "Сообщение",
    send: "Отправить",
    powered: "Работает на Lemiri AI",
    sendFailed: "Не удалось отправить сообщение",
    connectionFailed: "Ошибка соединения",
    planLimit: "Лимит новых диалогов временно исчерпан. Пожалуйста, свяжитесь с компанией другим способом.",
    suggestions: ["Сколько стоят услуги?", "Хочу записаться", "Связаться с менеджером"],
  },
  en: {
    status: "AI employee · usually replies immediately",
    hello: "Hello!",
    help: "How can I help?",
    message: "Type a message…",
    connecting: "Connecting…",
    messageLabel: "Message",
    send: "Send",
    powered: "Powered by Lemiri AI",
    sendFailed: "Could not send the message",
    connectionFailed: "Connection error",
    planLimit: "The new conversation limit has been reached. Please contact the company another way.",
    suggestions: ["What are your prices?", "I want to book", "Talk to a manager"],
  },
} as const;

export function WebsiteWidget({ locale, employeeId, employeeName, embedded = false, theme = "auto" }: { locale: Locale; employeeId: string; employeeName: string; embedded?: boolean; theme?: "light" | "dark" | "auto" }) {
  const copy = widgetCopy[locale];
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [embedAuth, setEmbedAuth] = useState<{ token: string; origin: string }>();
  const seenMessageIds=useRef(new Set<string>());
  const authRef=useRef<{ token: string; origin: string }>(undefined);
  const authWaiters=useRef<Array<(value:{ token: string; origin: string })=>void>>([]);
  const pollCursor=useRef(new Date(0).toISOString());

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  // Follows the host card's theme: light, dark, or the visitor's system setting.
  useEffect(() => { document.documentElement.dataset.theme = theme === "auto" ? "" : theme; }, [theme]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!embedded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") window.parent.postMessage({ type: "lemiri:close" }, "*"); };
    const onMessage = (event: MessageEvent) => { if (event.source === window.parent && event.data?.type === "lemiri:focus") inputRef.current?.focus(); };
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
    const key = `lemiri:${employeeId}:visitor`;
    const existing = localStorage.getItem(key);
    if (existing) { setVisitorId(existing); return; }
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    setVisitorId(created);
  }, [employeeId]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "lemiri:configure" || typeof event.data.token !== "string") return;
      const next = { token: event.data.token, origin: event.origin };
      authRef.current = next;
      setEmbedAuth(next);
      authWaiters.current.splice(0).forEach((resolve) => resolve(next));
    };
    addEventListener("message", receive);
    window.parent.postMessage({ type: "lemiri:ready" }, "*");
    // Tokens expire after 10 minutes; renew them ahead of time while the page stays open.
    const renew = window.setInterval(() => window.parent.postMessage({ type: "lemiri:refresh" }, "*"), 8 * 60_000);
    return () => { removeEventListener("message", receive); window.clearInterval(renew); };
  }, []);
  const refreshAuth = () => new Promise<{ token: string; origin: string } | undefined>((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), 5000);
    authWaiters.current.push((value) => { window.clearTimeout(timer); resolve(value); });
    window.parent.postMessage({ type: "lemiri:refresh" }, "*");
  });

  useEffect(()=>{
    if(!conversationId||!visitorId||!embedAuth)return;
    let active=true;
    const poll=async()=>{try{const query=new URLSearchParams({conversationId,visitorId,after:pollCursor.current});const response=await fetch(`/api/widget/${employeeId}/messages?${query}`,{headers:{"x-lemiri-widget-token":embedAuth.token,"x-lemiri-parent-origin":embedAuth.origin}});if(!response.ok)return;const body=await response.json() as {messages:Array<{id:string;content:string;createdAt:string}>};const last=body.messages.at(-1);if(last)pollCursor.current=last.createdAt;const fresh=body.messages.filter(message=>!seenMessageIds.current.has(message.id));if(!active||!fresh.length)return;fresh.forEach(message=>seenMessageIds.current.add(message.id));setMessages(value=>[...value,...fresh.map(message=>({id:message.id,role:"assistant" as const,text:message.content}))])}catch{}};
    poll();const timer=setInterval(poll,2000);return()=>{active=false;clearInterval(timer)};
  },[conversationId,visitorId,embedAuth,employeeId]);

  const streamRef=useRef<HTMLElement>(null);
  useEffect(()=>{const node=streamRef.current;if(node)node.scrollTo({top:node.scrollHeight,behavior:"smooth"})},[messages.length,busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form).get("message")?.toString().trim();
    if (!input || busy || !visitorId || !embedAuth) return;
    form.reset();
    await send(input);
  }
  async function send(input: string) {
    if (!input || busy || !visitorId || !embedAuth) return;
    setMessages((value) => [...value, { role: "user", text: input }]);
    setBusy(true);
    try {
      const messageId = crypto.randomUUID();
      const post = (auth: { token: string; origin: string }) => fetch(`/api/widget/${employeeId}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-lemiri-widget-token": auth.token, "x-lemiri-parent-origin": auth.origin }, body: JSON.stringify({ visitorId, conversationId, messageId, message: input }) });
      let response = await post(authRef.current ?? embedAuth);
      let body = await response.json() as { conversationId?: string; messageId?:string; message?: string; error?: string };
      if (response.status === 403 && body.error === "WIDGET_AUTH_REQUIRED") {
        const renewed = await refreshAuth();
        if (renewed) { response = await post(renewed); body = await response.json() as typeof body; }
      }
      if (!response.ok) throw new Error(body.error === "PLAN_CONVERSATION_LIMIT_REACHED" ? copy.planLimit : copy.sendFailed);
      setConversationId(body.conversationId);
      if(body.messageId)seenMessageIds.current.add(body.messageId);
      setMessages((value) => [...value, { id:body.messageId,role: "assistant", text: body.message ?? copy.sendFailed }]);
    } catch (error) {
      setMessages((value) => [...value, { role: "assistant", text: error instanceof Error ? error.message : copy.connectionFailed }]);
    } finally { setBusy(false); }
  }

  return <main className={embedded ? "publicWidget embedded" : "publicWidget"}>{!embedded && <header><span className="widgetAvatar"><LemiriGlyph size={22}/></span><div><b>{employeeName}</b><small>{copy.status}</small></div></header>}<section aria-live="polite" ref={streamRef}>{messages.length === 0 && <div className="widgetWelcome"><span><LemiriGlyph size={26}/></span><h1>{copy.hello}</h1><p>{copy.help}</p><div className="widgetSuggestions">{copy.suggestions.map(item=><button type="button" key={item} disabled={busy||!visitorId||!embedAuth} onClick={()=>void send(item)}>{item}</button>)}</div></div>}{messages.map((message, index) => <div className={`widgetBubble ${message.role}`} key={index}>{message.text}</div>)}{busy && <div className="widgetBubble assistant typing" aria-label="…"><i/><i/><i/></div>}</section><form onSubmit={submit}><input ref={inputRef} name="message" required maxLength={4000} autoComplete="off" placeholder={embedAuth ? copy.message : copy.connecting} aria-label={copy.messageLabel}/><button disabled={busy || !visitorId || !embedAuth} aria-label={copy.send}><ArrowUp size={18}/></button></form><footer>{copy.powered}</footer></main>;
}
