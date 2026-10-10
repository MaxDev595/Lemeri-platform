"use client";

import { FormEvent, ReactNode, useState } from "react";
import { Ban, CheckCircle2, Clock3, FileText, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { Modal } from "../crm/core";
import { templateByKey } from "@/lib/team/catalog";

export type Usage = { tokens: number; requests: number };
export type Member = { id: string; name: string; email: string; role: string; position: string | null; aiSeat: boolean; lastSeenAt: string | null; usage?: Usage };
export type Task = { id: string; title: string; note: string | null; template: string; requesterMemberId: string; assigneeMemberId: string; status: "OPEN" | "DONE" | "CANCELLED"; dueAt: string | null; report: { template: string; fields: Record<string, string> } | null; aiAssisted: boolean; createdAt: string; completedAt: string | null; cancelledAt: string | null; cancelReason: string | null };
export type Message = { id: string; thread: string; senderMemberId: string | null; kind: "TEXT" | "REPORT_REQUEST" | "REPORT" | "TASK_CANCELLED" | "SYSTEM"; body: string; taskId: string | null; aiAssisted: boolean; meta: Record<string, unknown> | null; createdAt: string };
export type Me = { id: string; role: string; ai: boolean; name: string; usage?: Usage & { limit: number | null } };

/** Short Russian/English message for AI errors (no seat, monthly limit, anything else). */
export function aiError(error: unknown, locale: string) {
  const ru = locale !== "en";
  if (error instanceof HubError && error.code === "AI_SEAT_REQUIRED") return ru ? "ИИ доступен на тарифе «Сотрудник+ ИИ». Попросите руководителя включить его." : "AI requires the Employee+ AI plan. Ask your manager to enable it.";
  if (error instanceof HubError && error.code === "AI_LIMIT_REACHED") return ru ? "Месячный лимит ИИ исчерпан. Он обновится 1-го числа — или руководитель может связаться с поддержкой." : "Your monthly AI allowance is used up. It resets on the 1st.";
  return ru ? "Не получилось — попробуйте ещё раз." : "Something went wrong — try again.";
}
/** CRM calls made from team AI cards (same permissions as the CRM screens). */
export async function crm<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/crm/${path}`, { method, cache: "no-store", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await response.json().catch(() => ({}));
  if (!response.ok) throw new HubError(response.status, (out as { error?: string }).error ?? String(response.status));
  return out as T;
}

export class HubError extends Error { constructor(public status: number, public code: string, public detail?: string) { super(code); } }
export async function hub<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/crm/team/${path}`, { method: init?.method ?? "GET", cache: "no-store", headers: init?.body === undefined ? undefined : { "content-type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new HubError(response.status, (body as { error?: string }).error ?? String(response.status), (body as { detail?: string }).detail);
  return body as T;
}

const hues = ["#6254e8", "#1f9d6b", "#b7791f", "#d0424f", "#2f7fd8", "#8b5cf6", "#0f8a8a", "#c2410c"];
export function initials(value: string) { const p = value.trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase(); }
export function TeamAvatar({ name, online, size = 36, general = false }: { name: string; online?: boolean; size?: number; general?: boolean }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span className="thAvatar" style={{ width: size, height: size, background: general ? "var(--accent)" : hues[h % hues.length], fontSize: size * 0.38 }} aria-hidden="true">{general ? "#" : initials(name)}{online && <i/>}</span>;
}
export const isOnline = (m?: Member | null) => Boolean(m?.lastSeenAt && Date.now() - new Date(m.lastSeenAt).getTime() < 2.5 * 60_000);

export function when(value: string | null | undefined, locale: string, withDay = false) {
  if (!value) return "";
  const d = new Date(value), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const fmt = (o: Intl.DateTimeFormatOptions) => d.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", o);
  if (sameDay && !withDay) return fmt({ hour: "2-digit", minute: "2-digit" });
  return fmt({ day: "numeric", month: "short", ...(withDay || !sameDay ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
export function dayLabel(value: string, locale: string) {
  const d = new Date(value), now = new Date(); const y = new Date(now); y.setDate(now.getDate() - 1);
  const ru = locale !== "en";
  if (d.toDateString() === now.toDateString()) return ru ? "Сегодня" : "Today";
  if (d.toDateString() === y.toDateString()) return ru ? "Вчера" : "Yesterday";
  return d.toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** Tiny markdown: **bold**, line breaks and "- " bullets. */
export function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = []; let list: ReactNode[] = [];
  const inline = (s: string, key: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") ? <b key={`${key}-${i}`}>{part.slice(2, -2)}</b> : <span key={`${key}-${i}`}>{part}</span>);
  lines.forEach((line, i) => {
    if (/^\s*[-•]\s+/.test(line)) { list.push(<li key={i}>{inline(line.replace(/^\s*[-•]\s+/, ""), String(i))}</li>); return; }
    if (list.length) { out.push(<ul key={`u${i}`}>{list}</ul>); list = []; }
    out.push(line.trim() ? <p key={i}>{inline(line, String(i))}</p> : <br key={i}/>);
  });
  if (list.length) out.push(<ul key="last">{list}</ul>);
  return <div className="thRich">{out}</div>;
}

export function StatusPill({ task, locale }: { task: Task; locale: string }) {
  const ru = locale !== "en";
  const overdue = task.status === "OPEN" && task.dueAt && new Date(task.dueAt) < new Date();
  if (task.status === "DONE") return <span className="thPill ok"><CheckCircle2 size={12}/>{ru ? "Выполнено" : "Done"}</span>;
  if (task.status === "CANCELLED") return <span className="thPill muted"><Ban size={12}/>{ru ? "Отменено" : "Cancelled"}</span>;
  return <span className={`thPill ${overdue ? "bad" : "wait"}`}><Clock3 size={12}/>{overdue ? (ru ? "Просрочено" : "Overdue") : (ru ? "Ожидает отчёт" : "Waiting")}</span>;
}

export function AiBadge({ locale }: { locale: string }) {
  return <span className="thAiBadge" title={locale !== "en" ? "Текст подготовлен с помощью ИИ. ИИ может ошибаться." : "Prepared with AI. AI can make mistakes."}><Sparkles size={11}/>{locale !== "en" ? "Выполнено с помощью ИИ" : "Done with AI"}</span>;
}

export function ReportView({ task, locale }: { task: Task; locale: string }) {
  const tpl = templateByKey(task.report?.template ?? task.template);
  const ru = locale !== "en";
  return <div className="thReport">{tpl.fields.map(f => task.report?.fields[f.key] ? <section key={f.key}><h5>{ru ? f.ru : f.en}</h5><Rich text={task.report.fields[f.key]!}/></section> : null)}</div>;
}

/** Request / report / cancellation cards shown inside the chat. */
export function TaskCard({ message, task, me, members, locale, onReport, onCancel }: { message: Message; task: Task | undefined; me: Me; members: Member[]; locale: string; onReport: (task: Task) => void; onCancel: (task: Task) => void }) {
  const ru = locale !== "en";
  if (!task) return <div className="thCard"><p className="thMuted">{message.body}</p></div>;
  const tpl = templateByKey(task.template);
  const requester = members.find(m => m.id === task.requesterMemberId)?.name ?? "—";
  const assignee = members.find(m => m.id === task.assigneeMemberId)?.name ?? "—";
  if (message.kind === "REPORT") return <div className="thCard report">
    <header><span className="thCardIcon ok"><FileText size={16}/></span><div><b>{ru ? "Отчёт" : "Report"}: {task.title}</b><small>{assignee} → {requester} · {ru ? tpl.ru : tpl.en}</small></div></header>
    {task.aiAssisted && <AiBadge locale={locale}/>}
    <ReportView task={task} locale={locale}/>
  </div>;
  if (message.kind === "TASK_CANCELLED") return <div className="thCard muted"><header><span className="thCardIcon muted"><Ban size={16}/></span><div><b>{ru ? "Запрос отменён" : "Request cancelled"}: {task.title}</b><small>{requester}{task.cancelReason ? ` · ${task.cancelReason}` : ""}</small></div></header></div>;
  const mine = task.assigneeMemberId === me.id, asked = task.requesterMemberId === me.id;
  return <div className={`thCard request ${task.status.toLowerCase()}`}>
    <header><span className="thCardIcon"><FileText size={16}/></span><div><b>{task.title}</b><small>{ru ? "Запрос отчёта" : "Report request"} · {requester} → {assignee}</small></div><StatusPill task={task} locale={locale}/></header>
    {task.note && <p className="thCardNote">{task.note}</p>}
    <dl className="thCardMeta"><div><dt>{ru ? "Форма" : "Template"}</dt><dd>{ru ? tpl.ru : tpl.en}</dd></div>{task.dueAt && <div><dt>{ru ? "Срок" : "Due"}</dt><dd>{when(task.dueAt, locale, true)}</dd></div>}{(message.meta as { viaAssistant?: boolean } | null)?.viaAssistant && <div><dt>{ru ? "Создано" : "Created"}</dt><dd>{ru ? "через ИИ-помощника" : "via AI assistant"}</dd></div>}</dl>
    {task.status === "OPEN" && <footer>
      {mine && <button type="button" className="thBtn primary" onClick={() => onReport(task)}><FileText size={14}/>{ru ? "Написать отчёт" : "Write report"}</button>}
      {asked && <button type="button" className="thBtn ghost danger" onClick={() => onCancel(task)}><Ban size={14}/>{ru ? "Отменить запрос" : "Cancel request"}</button>}
      {mine && !asked && <small className="thMuted">{ru ? "Отменить задание может только тот, кто его поставил." : "Only the requester can cancel this task."}</small>}
    </footer>}
  </div>;
}

/** Report editor: the employee writes it themselves, or lets the AI check and lay it out. */
export function ReportComposer({ task, me, locale, onClose, onSent, notify }: { task: Task; me: Me; locale: string; onClose: () => void; onSent: () => void; notify: (text: string) => void }) {
  const ru = locale !== "en";
  const tpl = templateByKey(task.template);
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(tpl.fields.map(f => [f.key, ""])));
  const [draft, setDraft] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [busy, setBusy] = useState<"" | "ai" | "auto" | "send">("");
  const [period, setPeriod] = useState<"day" | "week" | "month">(["weekly", "project", "marketing", "finance"].includes(tpl.key) ? "week" : "day");
  const [found, setFound] = useState<string>("");
  // Report on autopilot: the AI collects what you did in the CRM and chats and drafts the report.
  const runAuto = async () => {
    setBusy("auto");
    try {
      const out = await hub<{ fields: Record<string, string>; issues: string[]; mode: string; facts: { activities: number; tasksDone: number; deals: number; replies: number } }>("ai/autodraft", { method: "POST", body: { taskId: task.id, period, extra: draft } });
      setFields(prev => ({ ...prev, ...Object.fromEntries(Object.entries(out.fields).filter(([, v]) => typeof v === "string" && v.trim())) }));
      setIssues(out.issues); if (out.mode === "model") setUsedAi(true);
      const f = out.facts;
      setFound(ru ? `Найдено: записей в CRM — ${f.activities}, закрытых задач — ${f.tasksDone}, сделок — ${f.deals}, ответов клиентам — ${f.replies}.` : `Found: ${f.activities} CRM notes, ${f.tasksDone} tasks done, ${f.deals} deals, ${f.replies} client replies.`);
      notify(out.mode === "model" ? (ru ? "Черновик собран из вашей работы — проверьте и дополните" : "Draft built from your work — review and add details") : (ru ? "ИИ недоступен — данные перенесены в форму как есть" : "AI unavailable — data moved into the form as is"));
    } catch (error) { notify(aiError(error, locale)); }
    finally { setBusy(""); }
  };
  const missing = tpl.fields.filter(f => f.required && !fields[f.key]?.trim());
  const runAi = async () => {
    setBusy("ai");
    try {
      const out = await hub<{ fields: Record<string, string>; issues: string[]; mode: string }>("ai/report", { method: "POST", body: { taskId: task.id, draft, fields } });
      setFields(prev => ({ ...prev, ...Object.fromEntries(Object.entries(out.fields).filter(([, v]) => typeof v === "string")) }));
      setIssues(out.issues); if (out.mode === "model") setUsedAi(true);
      notify(out.mode === "model" ? (ru ? "ИИ проверил и оформил отчёт — проверьте перед отправкой" : "AI checked and formatted the report — review before sending") : (ru ? "ИИ сейчас недоступен — текст перенесён в форму" : "AI is unavailable — the text was moved into the form"));
    } catch (error) { notify(aiError(error, locale)); }
    finally { setBusy(""); }
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (missing.length) return;
    setBusy("send");
    try { await hub(`tasks/${task.id}/report`, { method: "POST", body: { fields, aiAssisted: usedAi } }); notify(ru ? "Отчёт отправлен" : "Report sent"); onSent(); onClose(); }
    catch (error) { notify(error instanceof HubError && error.code === "TASK_CLOSED" ? (ru ? "Задание уже закрыто" : "The task is already closed") : (ru ? "Не удалось отправить отчёт" : "Couldn't send the report")); setBusy(""); }
  };
  return <Modal title={`${ru ? "Отчёт" : "Report"}: ${task.title}`} onClose={onClose} footer={<>
    {usedAi && <AiBadge locale={locale}/>}
    <div className="thSpacer"/>
    <button type="button" className="thBtn ghost" onClick={onClose}>{ru ? "Отмена" : "Cancel"}</button>
    <button type="submit" form="thReportForm" className="thBtn primary" disabled={busy !== "" || missing.length > 0}>{busy === "send" ? (ru ? "Отправляем…" : "Sending…") : (ru ? "Отправить отчёт" : "Send report")}</button>
  </>}>
    <form id="thReportForm" className="thReportForm" onSubmit={send}>
      {task.note && <p className="thCardNote">{task.note}</p>}
      <section className={`thAiDraft${me.ai ? "" : " locked"}`}>
        <header><Wand2 size={15}/><b>{ru ? "Отчёт с ИИ" : "Report with AI"}</b></header>
        {me.ai ? <>
          <div className="thAutoRow">
            <div><b>{ru ? "Собрать из моей работы" : "Build from my work"}</b><small>{ru ? "ИИ возьмёт ваши звонки, заметки, задачи и сделки в CRM и ответы клиентам" : "AI uses your CRM calls, notes, tasks, deals and client replies"}</small></div>
            <select value={period} onChange={e => setPeriod(e.target.value as "day" | "week" | "month")} aria-label={ru ? "Период" : "Period"}><option value="day">{ru ? "за сутки" : "last day"}</option><option value="week">{ru ? "за неделю" : "last week"}</option><option value="month">{ru ? "за месяц" : "last month"}</option></select>
            <button type="button" className="thBtn primary" onClick={runAuto} disabled={busy !== ""}><Wand2 size={14}/>{busy === "auto" ? (ru ? "Собираем…" : "Building…") : (ru ? "Собрать" : "Build")}</button>
          </div>
          {found && <small className="thMuted thFound">{found}</small>}
          <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder={ru ? "Или расскажите своими словами: что сделали, цифры, проблемы, планы. ИИ исправит ошибки и разложит по форме. Эти заметки учитываются и при сборке." : "Or describe it in your own words: what you did, numbers, problems, plans. The AI fixes mistakes and fills the form. These notes are also used when building."}/>
          <div className="thRow"><small className="thMuted">{ru ? "ИИ может ошибаться — проверьте текст перед отправкой." : "AI can make mistakes — review before sending."}</small><button type="button" className="thBtn" onClick={runAi} disabled={busy !== "" || (!draft.trim() && !Object.values(fields).some(v => v.trim()))}><Sparkles size={14}/>{busy === "ai" ? (ru ? "Проверяем…" : "Checking…") : (ru ? "Проверить и оформить" : "Check & format")}</button></div>
        </> : <p className="thMuted">{ru ? "ИИ для отчётов доступен на тарифе «Сотрудник+ ИИ». Попросите руководителя включить его — или заполните форму вручную ниже." : "AI reports are available on the Employee+ AI plan. Ask your manager to enable it — or fill in the form below."}</p>}
      </section>
      {issues.length > 0 && <div className="thIssues" role="status"><b><TriangleAlert size={14}/>{ru ? "ИИ нашёл, что стоит проверить" : "Worth checking"}</b><ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
      {tpl.fields.map(f => <label key={f.key}><span>{ru ? f.ru : f.en}{f.required && <em>*</em>}</span><textarea rows={f.key === "text" ? 8 : 3} value={fields[f.key] ?? ""} onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={ru ? f.hintRu : f.hintEn}/></label>)}
    </form>
  </Modal>;
}
