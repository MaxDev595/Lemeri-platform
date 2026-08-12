"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

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
  },
} as const;

export function WebsiteWidget({ locale, employeeId, employeeName }: { locale: Locale; employeeId: string; employeeName: string }) {
  const copy = widgetCopy[locale];
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [embedAuth, setEmbedAuth] = useState<{ token: string; origin: string }>();
  const seenMessageIds=useRef(new Set<string>());
  const pollCursor=useRef(new Date(0).toISOString());

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
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
      setEmbedAuth({ token: event.data.token, origin: event.origin });
    };
    addEventListener("message", receive);
    window.parent.postMessage({ type: "lemiri:ready" }, "*");
    return () => removeEventListener("message", receive);
  }, []);

  useEffect(()=>{
    if(!conversationId||!visitorId||!embedAuth)return;
    let active=true;
    const poll=async()=>{try{const query=new URLSearchParams({conversationId,visitorId,after:pollCursor.current});const response=await fetch(`/api/widget/${employeeId}/messages?${query}`,{headers:{"x-lemiri-widget-token":embedAuth.token,"x-lemiri-parent-origin":embedAuth.origin}});if(!response.ok)return;const body=await response.json() as {messages:Array<{id:string;content:string;createdAt:string}>};const last=body.messages.at(-1);if(last)pollCursor.current=last.createdAt;const fresh=body.messages.filter(message=>!seenMessageIds.current.has(message.id));if(!active||!fresh.length)return;fresh.forEach(message=>seenMessageIds.current.add(message.id));setMessages(value=>[...value,...fresh.map(message=>({id:message.id,role:"assistant" as const,text:message.content}))])}catch{}};
    poll();const timer=setInterval(poll,2000);return()=>{active=false;clearInterval(timer)};
  },[conversationId,visitorId,embedAuth,employeeId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form).get("message")?.toString().trim();
    if (!input || busy || !visitorId || !embedAuth) return;
    form.reset();
    setMessages((value) => [...value, { role: "user", text: input }]);
    setBusy(true);
    try {
      const response = await fetch(`/api/widget/${employeeId}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-lemiri-widget-token": embedAuth.token, "x-lemiri-parent-origin": embedAuth.origin }, body: JSON.stringify({ visitorId, conversationId, messageId: crypto.randomUUID(), message: input }) });
      const body = await response.json() as { conversationId?: string; messageId?:string; message?: string; error?: string };
      if (!response.ok) throw new Error(body.error === "PLAN_CONVERSATION_LIMIT_REACHED" ? copy.planLimit : copy.sendFailed);
      setConversationId(body.conversationId);
      if(body.messageId)seenMessageIds.current.add(body.messageId);
      setMessages((value) => [...value, { id:body.messageId,role: "assistant", text: body.message ?? copy.sendFailed }]);
    } catch (error) {
      setMessages((value) => [...value, { role: "assistant", text: error instanceof Error ? error.message : copy.connectionFailed }]);
    } finally { setBusy(false); }
  }

  return <main className="publicWidget"><header><span className="widgetAvatar">L</span><div><b>{employeeName}</b><small>{copy.status}</small></div></header><section aria-live="polite">{messages.length === 0 && <div className="widgetWelcome"><span>✦</span><h1>{copy.hello}</h1><p>{copy.help}</p></div>}{messages.map((message, index) => <div className={`widgetBubble ${message.role}`} key={index}>{message.text}</div>)}{busy && <div className="widgetBubble assistant typing">•••</div>}</section><form onSubmit={submit}><input name="message" required maxLength={4000} autoComplete="off" placeholder={embedAuth ? copy.message : copy.connecting} aria-label={copy.messageLabel}/><button disabled={busy || !visitorId || !embedAuth} aria-label={copy.send}>↑</button></form><footer>{copy.powered}</footer></main>;
}
