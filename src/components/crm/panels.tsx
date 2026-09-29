"use client";

import { FormEvent, useState } from "react";
import { CalendarClock, Check, CheckCircle2, Circle, MessageSquare, Phone, StickyNote, Trash2, Users, Mail, Sparkles, ArrowRightLeft, Trophy, XCircle, ListChecks, UserPlus, CalendarCheck } from "lucide-react";
import { api, toInputDateTime, useCrm, when, MemberSelect } from "./core";

export type Activity = { id: string; type: string; body: string | null; meta: Record<string, unknown> | null; authorName: string | null; authorUserId: string | null; createdAt: string };
export type Task = { id: string; title: string; description: string | null; type: string; priority: string; dueAt: string | null; completedAt: string | null; assignee: { id: string; name: string } | null; customerId: string | null; dealId: string | null; companyId: string | null; customer?: { id: string; name: string } | null; deal?: { id: string; title: string } | null; company?: { id: string; name: string } | null };
export type Target = { customerId?: string | null; dealId?: string | null; companyId?: string | null };

const icons: Record<string, typeof StickyNote> = { NOTE: StickyNote, CALL: Phone, MEETING: Users, EMAIL: Mail, DEAL_CREATED: Sparkles, STAGE_CHANGED: ArrowRightLeft, DEAL_WON: Trophy, DEAL_LOST: XCircle, TASK_CREATED: ListChecks, TASK_DONE: CheckCircle2, CONTACT_CREATED: UserPlus, CONTACT_MERGED: Users, AI_LEAD: Sparkles, APPOINTMENT: CalendarCheck, MESSAGE: MessageSquare };

export function NoteComposer({ target, onDone }: { target: Target; onDone: () => void }) {
  const { c, notify, canWrite } = useCrm();
  const [type, setType] = useState<"NOTE" | "CALL" | "MEETING" | "EMAIL">("NOTE");
  const [busy, setBusy] = useState(false);
  if (!canWrite) return null;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget; const body = String(new FormData(form).get("body") ?? "").trim(); if (!body) return;
    setBusy(true);
    try { await api("activities", { method: "POST", body: { type, body, ...target } }); form.reset(); onDone(); } catch { notify(c.failed); } finally { setBusy(false); }
  };
  return <form className="crmComposer" onSubmit={submit}>
    <div className="crmSegment small">{(["NOTE", "CALL", "MEETING", "EMAIL"] as const).map(t => <button type="button" key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{c.act[t]}</button>)}</div>
    <textarea name="body" rows={2} placeholder={c.notePlaceholder} required maxLength={10000}/>
    <button className="crmBtn primary" disabled={busy}>{c.addNote}</button>
  </form>;
}

export function Timeline({ activities, extra = [], onChanged }: { activities: Activity[]; extra?: Array<{ id: string; at: string; title: string; body?: string | null; onClick?: () => void }>; onChanged: () => void }) {
  const { c, locale, notify, canWrite } = useCrm();
  const items = [...activities.map(a => ({ kind: "a" as const, at: a.createdAt, a })), ...extra.map(x => ({ kind: "x" as const, at: x.at, x }))].sort((p, q) => q.at.localeCompare(p.at));
  if (!items.length) return <p className="crmMuted">{c.none}</p>;
  const remove = async (id: string) => { try { await api(`activities/${id}`, { method: "DELETE" }); onChanged(); } catch { notify(c.failed); } };
  return <ol className="crmTimeline">{items.map(item => {
    if (item.kind === "x") return <li key={`x-${item.x.id}`} className="msg"><span className="crmTlIcon"><MessageSquare size={14}/></span><div><b>{item.x.onClick ? <button type="button" className="crmLink" onClick={item.x.onClick}>{item.x.title}</button> : item.x.title}</b>{item.x.body && <p>{item.x.body}</p>}<small>{when(item.at, locale)}</small></div></li>;
    const a = item.a, Icon = icons[a.type] ?? StickyNote;
    const meta = a.meta as { from?: string; to?: string; startsAt?: string; dueAt?: string } | null;
    const manual = ["NOTE", "CALL", "MEETING", "EMAIL"].includes(a.type);
    return <li key={a.id} className={`t-${a.type.toLowerCase()}`}><span className="crmTlIcon"><Icon size={14}/></span><div>
      <b>{c.act[a.type] ?? a.type}{meta?.to ? `: ${meta.from ? `${meta.from} → ` : ""}${meta.to}` : ""}</b>
      {a.body && <p>{a.body}</p>}
      {meta?.startsAt && <p>{when(meta.startsAt, locale)}</p>}
      <small>{a.authorName ?? ""}{a.authorName ? " · " : ""}{when(a.createdAt, locale)}{manual && canWrite && <button type="button" className="crmIcon tiny" onClick={() => remove(a.id)} aria-label={c.delete}><Trash2 size={12}/></button>}</small>
    </div></li>;
  })}</ol>;
}

export function taskBucket(task: Task) {
  if (task.completedAt) return "done";
  if (!task.dueAt) return "noDue";
  const due = new Date(task.dueAt), now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday.getTime() + 86_400_000), startAfter = new Date(startToday.getTime() + 2 * 86_400_000);
  if (due < now) return "overdue";
  if (due < startTomorrow) return "today";
  if (due < startAfter) return "tomorrow";
  return "later";
}

export function TaskRow({ task, onChanged, showLinks }: { task: Task; onChanged: () => void; showLinks?: boolean }) {
  const { c, locale, notify, canWrite, open } = useCrm();
  const bucket = taskBucket(task);
  const toggle = async () => { try { await api(`tasks/${task.id}`, { method: "PATCH", body: { done: !task.completedAt } }); onChanged(); } catch { notify(c.failed); } };
  const remove = async () => { try { await api(`tasks/${task.id}`, { method: "DELETE" }); onChanged(); } catch { notify(c.failed); } };
  return <li className={`crmTask ${bucket} p-${task.priority.toLowerCase()}`}>
    <button type="button" className="crmCheck" onClick={toggle} disabled={!canWrite} aria-label={c.done}>{task.completedAt ? <Check size={14}/> : <Circle size={14}/>}</button>
    <div>
      <b>{task.title}</b>
      <small>
        {task.type !== "TODO" && <span className="crmChip">{c.act[task.type] ?? task.type}</span>}
        {task.dueAt && <span className={bucket === "overdue" ? "crmDue bad" : "crmDue"}><CalendarClock size={12}/>{when(task.dueAt, locale)}</span>}
        {task.assignee && <span>{task.assignee.name}</span>}
        {showLinks && task.deal && <button type="button" className="crmLink" onClick={() => open({ type: "deal", id: task.deal!.id })}>{task.deal.title}</button>}
        {showLinks && task.customer && <button type="button" className="crmLink" onClick={() => open({ type: "contact", id: task.customer!.id })}>{task.customer.name}</button>}
        {showLinks && task.company && <button type="button" className="crmLink" onClick={() => open({ type: "company", id: task.company!.id })}>{task.company.name}</button>}
      </small>
      {task.description && <p>{task.description}</p>}
    </div>
    {canWrite && <button type="button" className="crmIcon tiny" onClick={remove} aria-label={c.delete}><Trash2 size={13}/></button>}
  </li>;
}

export function TaskComposer({ target, onDone, compact }: { target: Target; onDone: () => void; compact?: boolean }) {
  const { c, notify, canWrite, boot } = useCrm();
  const me = boot.members.find(m => m.me)?.id ?? null;
  const [assignee, setAssignee] = useState<string | null>(me);
  const [busy, setBusy] = useState(false);
  if (!canWrite) return null;
  const tomorrowAt10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return toInputDateTime(d.toISOString()); };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
    const dueRaw = String(data.get("dueAt") ?? "");
    setBusy(true);
    try {
      await api("tasks", { method: "POST", body: { title: String(data.get("title")), type: String(data.get("type") ?? "TODO"), priority: String(data.get("priority") ?? "NORMAL"), dueAt: dueRaw ? new Date(dueRaw).toISOString() : null, assigneeMemberId: assignee, ...target } });
      form.reset(); onDone();
    } catch { notify(c.failed); } finally { setBusy(false); }
  };
  return <form className={compact ? "crmTaskForm compact" : "crmTaskForm"} onSubmit={submit}>
    <input name="title" required maxLength={200} placeholder={c.taskTitle}/>
    <select name="type" defaultValue="TODO"><option value="TODO">{c.todo}</option><option value="CALL">{c.call}</option><option value="MEETING">{c.meeting}</option><option value="EMAIL">{c.emailAct}</option></select>
    <input name="dueAt" type="datetime-local" defaultValue={tomorrowAt10()} aria-label={c.due}/>
    <select name="priority" defaultValue="NORMAL" aria-label={c.priority}><option value="LOW">{c.low}</option><option value="NORMAL">{c.normal}</option><option value="HIGH">{c.high}</option></select>
    <MemberSelect value={assignee} onChange={setAssignee} allowEmpty={false}/>
    <button className="crmBtn primary" disabled={busy}>{c.add}</button>
  </form>;
}
