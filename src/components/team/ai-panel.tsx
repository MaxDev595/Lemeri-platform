"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { ArrowUp, BriefcaseBusiness, CalendarClock, Check, CheckSquare, Copy, FileText, Lock, MessageSquare, MoveRight, NotebookPen, Sparkles, UserRound, X } from "lucide-react";
import { templateByKey } from "@/lib/team/catalog";
import { aiError, crm, hub, HubError, Rich, when, type Me } from "./parts";

type Action =
  | { type: "request_report"; memberId: string; memberName: string; template: string; title: string; note: string; dueAt: string | null }
  | { type: "send_message"; memberId: string; memberName: string; text: string }
  | { type: "crm_task"; title: string; taskType: string; dueAt: string | null; customerId: string | null; customerName: string | null; dealId: string | null }
  | { type: "crm_note"; noteType: string; body: string; customerId: string; customerName: string; dealId: string | null }
  | { type: "crm_deal"; title: string; amount: number; customerId: string | null; customerName: string | null }
  | { type: "crm_move"; dealId: string; dealTitle: string; stageId: string; stageName: string; lost: boolean; lostReason: string | null }
  | { type: "crm_done"; taskId: string; title: string }
  | { type: "client_reply"; customerId: string; customerName: string; text: string };
type State = "pending" | "done" | "dismissed" | "busy";
type Turn = { id: string; role: "user" | "assistant"; content: string; client?: { id: string; name: string } | null; actions?: Array<Action & { state?: State }> };

const KIND_RU: Record<string, string> = { TODO: "Задача", CALL: "Звонок", MEETING: "Встреча", EMAIL: "Письмо", NOTE: "Заметка" };
const KIND_EN: Record<string, string> = { TODO: "To-do", CALL: "Call", MEETING: "Meeting", EMAIL: "Email", NOTE: "Note" };

/** Personal work AI: day plan, clients from the CRM, tasks and deals, messages and report requests — every change is confirmed with a button. */
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
      const out = await hub<{ reply: string; actions: Action[]; client?: { id: string; name: string } | null }>("ai/chat", { method: "POST", body: { text: content, history } });
      setTurns(t => [...t, { id: crypto.randomUUID(), role: "assistant", content: out.reply, client: out.client, actions: out.actions.map(a => ({ ...a, state: "pending" as const })) }]);
      onExecuted();
    } catch (error) {
      setTurns(t => [...t, { id: crypto.randomUUID(), role: "assistant", content: aiError(error, locale) }]);
    } finally { setBusy(false); }
  };
  const setAction = (turnId: string, index: number, state: State) => setTurns(t => t.map(turn => turn.id === turnId ? { ...turn, actions: turn.actions?.map((a, i) => i === index ? { ...a, state } : a) } : turn));
  const execute = async (turnId: string, index: number, action: Action) => {
    if (action.type === "client_reply") {
      try { await navigator.clipboard.writeText(action.text); notify(ru ? "Ответ скопирован — вставьте его в диалог с клиентом" : "Reply copied — paste it into the client chat"); setAction(turnId, index, "done"); }
      catch { notify(ru ? "Не удалось скопировать" : "Couldn't copy"); }
      return;
    }
    setAction(turnId, index, "busy");
    try {
      switch (action.type) {
        case "request_report": await hub("tasks", { method: "POST", body: { assigneeMemberId: action.memberId, template: action.template, title: action.title, note: action.note, dueAt: action.dueAt, viaAssistant: true } }); break;
        case "send_message": await hub("messages", { method: "POST", body: { thread: action.memberId === "general" ? "general" : `dm:${[me.id, action.memberId].sort().join(":")}`, body: action.text, aiAssisted: true } }); break;
        case "crm_task": await crm("tasks", "POST", { title: action.title, type: action.taskType, dueAt: action.dueAt, customerId: action.customerId, dealId: action.dealId }); break;
        case "crm_note": await crm("activities", "POST", { type: action.noteType, body: action.body, customerId: action.customerId, dealId: action.dealId }); break;
        case "crm_deal": await crm("deals", "POST", { title: action.title, amount: action.amount, customerId: action.customerId, source: "ai-assistant" }); break;
        case "crm_move": await crm(`deals/${action.dealId}/move`, "POST", { stageId: action.stageId, ...(action.lostReason ? { lostReason: action.lostReason } : {}) }); break;
        case "crm_done": await crm(`tasks/${action.taskId}`, "PATCH", { done: true }); break;
      }
      setAction(turnId, index, "done"); onExecuted();
      notify(DONE_TEXT[action.type][ru ? 0 : 1] + (action.type === "request_report" || action.type === "send_message" ? `: ${action.memberName}` : ""));
    } catch (error) {
      setAction(turnId, index, "pending");
      notify(error instanceof HubError && error.status === 403 ? (ru ? "Недостаточно прав для этого действия" : "You don't have permission for this") : error instanceof HubError && error.code === "LOST_REASON_REQUIRED" ? (ru ? "Укажите причину проигрыша" : "A lost reason is required") : (ru ? "Не удалось выполнить действие" : "Action failed"));
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(text); } };
  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  const quick = ru
    ? [["Что у меня сегодня?", "Что у меня сегодня?"], ["Клиент…", "Что с клиентом "], ["Поставь задачу…", "Поставь задачу: "], ["Кто не сдал отчёт?", "Кто ещё не сдал отчёт?"]]
    : [["My day", "What's on my plate today?"], ["Client…", "What's up with client "], ["Add a task…", "Add a task: "], ["Who hasn't reported?", "Who hasn't reported yet?"]];
  const usage = me.usage;
  const share = usage?.limit ? Math.min(100, Math.round((usage.tokens / usage.limit) * 100)) : 0;

  if (!me.ai) return <aside className="thAi locked">
    <header><span className="thAiLogo"><Sparkles size={16}/></span><div><b>{ru ? "Мой ИИ" : "My AI"}</b><small>{ru ? "Тариф «Сотрудник+ ИИ»" : "Employee+ AI plan"}</small></div></header>
    <div className="thAiLocked"><Lock size={22}/><h4>{ru ? "ИИ для вас не подключён" : "AI isn't enabled for you"}</h4>
      <p>{ru ? "На бесплатном тарифе мессенджер, задания и отчёты работают полностью — без ИИ." : "On the free plan the messenger, tasks and reports work fully — without AI."}</p>
      <ul className="thAiPerks">{(ru ? ["План на день: задачи, сроки, клиенты, которые ждут ответа", "Карточка клиента из CRM за секунду и черновик ответа", "Задачи, заметки и сделки в CRM — одной фразой", "Сводка переписки: что решили и что ждут от вас", "Отчёт на автопилоте из вашей работы в CRM и чатах"] : ["Day plan: tasks, deadlines, clients waiting for you", "Client card from the CRM and a reply draft", "CRM tasks, notes and deals in one sentence", "Chat summary: decisions and what's expected from you", "Reports drafted from your CRM and chat activity"]).map(p => <li key={p}><Check size={13}/>{p}</li>)}</ul>
      <small>{ru ? "Подключает руководитель в разделе «Команда → Управление»." : "Your manager enables it in Team → Manage."}</small></div>
  </aside>;

  return <aside className="thAi">
    <header><span className="thAiLogo"><Sparkles size={16}/></span><div><b>{ru ? "Мой ИИ" : "My AI"}</b><small>{ru ? "Задачи, клиенты, сделки, команда" : "Tasks, clients, deals, team"}</small></div>{turns.length > 0 && <button type="button" className="thIcon" title={ru ? "Очистить" : "Clear"} onClick={() => setTurns([])}><X size={15}/></button>}</header>
    {usage?.limit ? <div className={`thUsage${share >= 90 ? " warn" : ""}`} title={ru ? `Использовано ${usage.tokens.toLocaleString("ru-RU")} из ${usage.limit.toLocaleString("ru-RU")} токенов` : `${usage.tokens} of ${usage.limit} tokens`}><span>{ru ? "Лимит ИИ в этом месяце" : "AI allowance this month"}</span><i><b style={{ width: `${share}%` }}/></i><em>{share}%</em></div> : null}
    {share >= 100 && <p className="thLimitNote" role="status">{ru ? "Месячный лимит ИИ исчерпан — он обновится 1-го числа. Мессенджер, задания и отчёты работают как обычно." : "Your monthly AI allowance is used up — it resets on the 1st. Messenger, tasks and reports keep working."}</p>}
    <div className="thAiList" ref={listRef}>
      {!turns.length && <div className="thAiEmpty"><Sparkles size={22}/><p>{ru ? "Я знаю ваши задачи, сделки и клиентов в CRM, переписку команды и отчёты. Спросите, что делать сегодня, что с клиентом, или попросите поставить задачу — я подготовлю, вы подтвердите." : "I know your CRM tasks, deals and clients, team chats and reports. Ask what to do today, about a client, or to add a task — I prepare it, you confirm."}</p>
        <div className="thChips">{quick.map(([label, value]) => <button type="button" key={label} onClick={() => value!.endsWith(" ") ? setText(value!) : void ask(value!)}>{label}</button>)}</div></div>}
      {turns.map(turn => <div key={turn.id} className={`thAiTurn ${turn.role}`}>
        {turn.role === "assistant" ? <Rich text={turn.content}/> : <p>{turn.content}</p>}
        {turn.client && <a className="thClientLink" href={`/app?view=contacts&contact=${turn.client.id}`} onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent("lemiri:navigate", { detail: { page: "contacts", contactId: turn.client!.id } })); }}><UserRound size={13}/>{ru ? "Открыть карточку" : "Open card"}: {turn.client.name}</a>}
        {turn.actions?.map((action, i) => <Proposal key={i} action={action} locale={locale} onRun={() => execute(turn.id, i, action)} onDismiss={() => setAction(turn.id, i, "dismissed")} onOpenThread={onOpenThread}/>)}
      </div>)}
      {busy && <div className="thAiTurn assistant typing"><i/><i/><i/></div>}
    </div>
    {turns.length > 0 && <div className="thChips compact">{quick.slice(0, 2).map(([label, value]) => <button type="button" key={label} disabled={busy} onClick={() => value!.endsWith(" ") ? setText(value!) : void ask(value!)}>{label}</button>)}</div>}
    <form className="thComposer ai" onSubmit={submit}>
      <textarea rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder={ru ? "Спросите или попросите…" : "Ask or request…"} aria-label={ru ? "Сообщение ИИ" : "Message to AI"}/>
      <button type="submit" className="thSend" disabled={!text.trim() || busy} aria-label={ru ? "Отправить" : "Send"}><ArrowUp size={17}/></button>
    </form>
    <p className="thDisclaimer">{ru ? "ИИ может ошибаться. Проверяйте важное перед подтверждением." : "AI can make mistakes. Check important details before confirming."}</p>
  </aside>;
}

const DONE_TEXT: Record<Action["type"], [string, string]> = {
  request_report: ["Запрос отправлен", "Request sent"], send_message: ["Сообщение отправлено", "Message sent"], crm_task: ["Задача создана в CRM", "CRM task created"],
  crm_note: ["Запись добавлена в историю клиента", "Added to the client's history"], crm_deal: ["Сделка создана", "Deal created"], crm_move: ["Сделка перемещена", "Deal moved"],
  crm_done: ["Задача выполнена", "Task completed"], client_reply: ["Скопировано", "Copied"],
};

function Proposal({ action, locale, onRun, onDismiss, onOpenThread }: { action: Action & { state?: State }; locale: string; onRun: () => void; onDismiss: () => void; onOpenThread: (id: string) => void }) {
  const ru = locale !== "en";
  const kind = (k: string) => (ru ? KIND_RU : KIND_EN)[k] ?? k;
  const head: Record<Action["type"], [ReactNode, string, string]> = {
    request_report: [<FileText key="i" size={15}/>, "Запрос отчёта", "Report request"], send_message: [<MessageSquare key="i" size={15}/>, "Сообщение", "Message"],
    crm_task: [<CalendarClock key="i" size={15}/>, "Задача в CRM", "CRM task"], crm_note: [<NotebookPen key="i" size={15}/>, "Запись в историю клиента", "Client history entry"],
    crm_deal: [<BriefcaseBusiness key="i" size={15}/>, "Новая сделка", "New deal"], crm_move: [<MoveRight key="i" size={15}/>, "Перенести сделку", "Move deal"],
    crm_done: [<CheckSquare key="i" size={15}/>, "Отметить выполненной", "Mark done"], client_reply: [<Copy key="i" size={15}/>, "Черновик ответа клиенту", "Reply draft"],
  };
  const [icon, titleRu, titleEn] = head[action.type];
  const target = "memberName" in action ? action.memberName : "customerName" in action && action.customerName ? action.customerName : "";
  const rows: Array<[string, string]> = [];
  if (action.type === "request_report") { rows.push([ru ? "Отчёт" : "Report", action.title], [ru ? "Форма" : "Template", ru ? templateByKey(action.template).ru : templateByKey(action.template).en]); if (action.dueAt) rows.push([ru ? "Срок" : "Due", when(action.dueAt, locale, true)]); if (action.note) rows.push([ru ? "Комментарий" : "Note", action.note]); }
  if (action.type === "crm_task") { rows.push([kind(action.taskType), action.title], [ru ? "Срок" : "Due", action.dueAt ? when(action.dueAt, locale, true) : (ru ? "без срока" : "no due date")]); }
  if (action.type === "crm_deal") rows.push([ru ? "Сделка" : "Deal", action.title], [ru ? "Сумма" : "Amount", action.amount.toLocaleString(ru ? "ru-RU" : "en-US")]);
  if (action.type === "crm_move") { rows.push([ru ? "Сделка" : "Deal", action.dealTitle], [ru ? "Этап" : "Stage", action.stageName]); if (action.lostReason) rows.push([ru ? "Причина" : "Reason", action.lostReason]); }
  if (action.type === "crm_done") rows.push([ru ? "Задача" : "Task", action.title]);
  if (action.type === "crm_note") rows.push([ru ? "Тип" : "Type", kind(action.noteType)]);
  const body = action.type === "send_message" || action.type === "client_reply" ? action.text : action.type === "crm_note" ? action.body : "";
  const runLabel = action.type === "client_reply" ? (ru ? "Скопировать" : "Copy") : action.type === "send_message" || action.type === "request_report" ? (ru ? "Отправить" : "Send") : (ru ? "Подтвердить" : "Confirm");
  return <div className={`thProposal ${action.state ?? "pending"}${action.type === "crm_move" && action.lost ? " danger" : ""}`}>
    <header>{icon}<b>{ru ? titleRu : titleEn}</b>{target && <span>→ {target}</span>}</header>
    {rows.length > 0 && <dl>{rows.map(([dt, dd]) => <div key={dt}><dt>{dt}</dt><dd>{dd}</dd></div>)}</dl>}
    {body && <p className="thProposalText">{body}</p>}
    {action.state === "done" ? <footer><span className="thDone"><Check size={14}/>{action.type === "client_reply" ? (ru ? "Скопировано" : "Copied") : (ru ? "Готово" : "Done")}</span>{action.type === "send_message" && action.memberId !== "general" && <button type="button" className="thLink" onClick={() => onOpenThread(action.memberId)}>{ru ? "Открыть чат" : "Open chat"}</button>}{action.type === "client_reply" && <button type="button" className="thLink" onClick={onRun}>{ru ? "Ещё раз" : "Copy again"}</button>}</footer>
      : action.state === "dismissed" ? <footer><span className="thMuted">{ru ? "Отменено" : "Dismissed"}</span></footer>
      : <footer><button type="button" className="thBtn primary" disabled={action.state === "busy"} onClick={onRun}>{action.type === "client_reply" ? <Copy size={14}/> : <Check size={14}/>}{action.state === "busy" ? (ru ? "Выполняем…" : "Working…") : runLabel}</button><button type="button" className="thBtn ghost" disabled={action.state === "busy"} onClick={onDismiss}>{ru ? "Не надо" : "Dismiss"}</button></footer>}
  </div>;
}
