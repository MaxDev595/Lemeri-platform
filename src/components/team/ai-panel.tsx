"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, FileText, Lock, MessageSquare, Sparkles, X } from "lucide-react";
import { templateByKey } from "@/lib/team/catalog";
import { hub, HubError, Rich, when, type Me } from "./parts";

type Action =
  | { type: "request_report"; memberId: string; memberName: string; template: string; title: string; note: string; dueAt: string | null }
  | { type: "send_message"; memberId: string; memberName: string; text: string };
type Turn = { id: string; role: "user" | "assistant"; content: string; actions?: Array<Action & { state?: "pending" | "done" | "dismissed" | "busy" }> };

/** Team AI: understands "ask Vitaly for a report", finds the person, prepares the action for one-click confirmation. */
export function TeamAiPanel({ me, locale, notify, onExecuted, onOpenThread }: { me: Me; locale: string; notify: (text: string) => void; onExecuted: () => void; onOpenThread: (memberId: string) => void }) {
  const ru = locale !== "en";
  const storageKey = `lemiri:team-ai:${me.id}`;
  const [turns, setTurns] = useState<Turn[]>(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as Turn[]; } catch { return []; } });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(turns.slice(-30))); } catch { /* storage unavailable */ } listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [turns, storageKey]);

  const ask = async (value: string) => {
    const content = value.trim(); if (!content || busy) return;
    const history = turns.slice(-8).map(t => ({ role: t.role, content: t.content }));
    setTurns(t => [...t, { id: crypto.randomUUID(), role: "user", content }]); setText(""); setBusy(true);
    try {
      const out = await hub<{ reply: string; actions: Action[] }>("ai/chat", { method: "POST", body: { text: content, history } });
      setTurns(t => [...t, { id: crypto.randomUUID(), role: "assistant", content: out.reply, actions: out.actions.map(a => ({ ...a, state: "pending" as const })) }]);
    } catch (error) {
      setTurns(t => [...t, { id: crypto.randomUUID(), role: "assistant", content: error instanceof HubError && error.code === "AI_SEAT_REQUIRED" ? (ru ? "ИИ-помощник доступен на тарифе «Сотрудник+ ИИ»." : "The AI assistant requires the Employee+ AI plan.") : (ru ? "Не получилось ответить. Попробуйте ещё раз." : "Something went wrong. Try again.") }]);
    } finally { setBusy(false); }
  };
  const setAction = (turnId: string, index: number, state: "pending" | "done" | "dismissed" | "busy") => setTurns(t => t.map(turn => turn.id === turnId ? { ...turn, actions: turn.actions?.map((a, i) => i === index ? { ...a, state } : a) } : turn));
  const execute = async (turnId: string, index: number, action: Action) => {
    setAction(turnId, index, "busy");
    try {
      if (action.type === "request_report") await hub("tasks", { method: "POST", body: { assigneeMemberId: action.memberId, template: action.template, title: action.title, note: action.note, dueAt: action.dueAt, viaAssistant: true } });
      else await hub("messages", { method: "POST", body: { thread: action.memberId === "general" ? "general" : `dm:${[me.id, action.memberId].sort().join(":")}`, body: action.text, aiAssisted: true } });
      setAction(turnId, index, "done"); onExecuted();
      notify(action.type === "request_report" ? (ru ? `Запрос отправлен: ${action.memberName}` : `Request sent to ${action.memberName}`) : (ru ? "Сообщение отправлено" : "Message sent"));
    } catch { setAction(turnId, index, "pending"); notify(ru ? "Не удалось выполнить действие" : "Action failed"); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(text); } };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  const suggestions = ru ? ["Запроси отчёт у …", "Напиши всем: планёрка в 10:00", "Кто ещё не сдал отчёт?"] : ["Ask … for a report", "Tell everyone: stand-up at 10", "Who hasn't reported yet?"];

  if (!me.ai) return <aside className="thAi locked">
    <header><span className="thAiLogo"><Sparkles size={16}/></span><div><b>{ru ? "ИИ-помощник" : "AI assistant"}</b><small>{ru ? "Тариф «Сотрудник+ ИИ»" : "Employee+ AI plan"}</small></div></header>
    <div className="thAiLocked"><Lock size={22}/><h4>{ru ? "ИИ для сотрудника не подключён" : "AI isn't enabled for you"}</h4><p>{ru ? "На бесплатном тарифе мессенджер, задания и отчёты работают полностью — без ИИ. С «Сотрудник+ ИИ» помощник пишет отчёты, проверяет их на ошибки и оформляет по шаблону." : "On the free plan the messenger, tasks and reports work fully — without AI. With Employee+ AI the assistant writes reports, checks them for mistakes and formats them."}</p><small>{ru ? "Подключает руководитель в разделе «Команда → Управление»." : "Your manager enables it in Team → Manage."}</small></div>
  </aside>;

  return <aside className="thAi">
    <header><span className="thAiLogo"><Sparkles size={16}/></span><div><b>{ru ? "ИИ-помощник команды" : "Team AI assistant"}</b><small>{ru ? "Находит людей, ставит задания, пишет сообщения" : "Finds people, sets tasks, writes messages"}</small></div>{turns.length > 0 && <button type="button" className="thIcon" title={ru ? "Очистить" : "Clear"} onClick={() => setTurns([])}><X size={15}/></button>}</header>
    <div className="thAiList" ref={listRef}>
      {!turns.length && <div className="thAiEmpty"><Sparkles size={22}/><p>{ru ? "Скажите, что нужно — например, «Запроси отчёт по продажам у Виталика до завтра». Я найду сотрудника и подготовлю запрос, вам останется подтвердить." : "Tell me what you need — e.g. “Ask Vitaly for a sales report by tomorrow”. I'll find the person and prepare the request for you to confirm."}</p><div className="thChips">{suggestions.map(s => <button type="button" key={s} onClick={() => setText(s.replace("…", "").trim() + (s.includes("…") ? " " : ""))}>{s}</button>)}</div></div>}
      {turns.map(turn => <div key={turn.id} className={`thAiTurn ${turn.role}`}>
        {turn.role === "assistant" ? <Rich text={turn.content}/> : <p>{turn.content}</p>}
        {turn.actions?.map((action, i) => <div key={i} className={`thProposal ${action.state}`}>
          <header>{action.type === "request_report" ? <FileText size={15}/> : <MessageSquare size={15}/>}<b>{action.type === "request_report" ? (ru ? "Запрос отчёта" : "Report request") : (ru ? "Сообщение" : "Message")}</b><span>→ {action.memberName}</span></header>
          {action.type === "request_report" ? <dl><div><dt>{ru ? "Отчёт" : "Report"}</dt><dd>{action.title}</dd></div><div><dt>{ru ? "Форма" : "Template"}</dt><dd>{ru ? templateByKey(action.template).ru : templateByKey(action.template).en}</dd></div>{action.dueAt && <div><dt>{ru ? "Срок" : "Due"}</dt><dd>{when(action.dueAt, locale, true)}</dd></div>}{action.note && <div><dt>{ru ? "Комментарий" : "Note"}</dt><dd>{action.note}</dd></div>}</dl> : <p className="thProposalText">{action.text}</p>}
          {action.state === "done" ? <footer><span className="thDone"><Check size={14}/>{ru ? "Отправлено" : "Sent"}</span>{action.memberId !== "general" && <button type="button" className="thLink" onClick={() => onOpenThread(action.memberId)}>{ru ? "Открыть чат" : "Open chat"}</button>}</footer>
            : action.state === "dismissed" ? <footer><span className="thMuted">{ru ? "Отменено" : "Dismissed"}</span></footer>
            : <footer><button type="button" className="thBtn primary" disabled={action.state === "busy"} onClick={() => execute(turn.id, i, action)}><Check size={14}/>{action.state === "busy" ? (ru ? "Отправляем…" : "Sending…") : (ru ? "Отправить" : "Send")}</button><button type="button" className="thBtn ghost" disabled={action.state === "busy"} onClick={() => setAction(turn.id, i, "dismissed")}>{ru ? "Не надо" : "Dismiss"}</button></footer>}
        </div>)}
      </div>)}
      {busy && <div className="thAiTurn assistant typing"><i/><i/><i/></div>}
    </div>
    <form className="thComposer ai" onSubmit={submit}>
      <textarea rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder={ru ? "Попросите ИИ…" : "Ask the AI…"} aria-label={ru ? "Сообщение ИИ" : "Message to AI"}/>
      <button type="submit" className="thSend" disabled={!text.trim() || busy} aria-label={ru ? "Отправить" : "Send"}><ArrowUp size={17}/></button>
    </form>
    <p className="thDisclaimer">{ru ? "ИИ может ошибаться. Проверяйте важное перед отправкой." : "AI can make mistakes. Check important details before sending."}</p>
  </aside>;
}
