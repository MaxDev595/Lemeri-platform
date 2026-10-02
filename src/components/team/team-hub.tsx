"use client";

// Team tab: messenger on the left (chats + tasks), the open conversation in the
// middle and the team AI assistant on the right. Loaded client-only.

import { FormEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, CheckCheck, ClipboardList, Hash, MessageSquare, Search, Settings2, Sparkles, Users } from "lucide-react";
import { positionLabel } from "@/lib/team/catalog";
import { CrmFailure, CrmSkeleton } from "../crm/loader";
import { TeamAiPanel } from "./ai-panel";
import { ManageTeam } from "./manage";
import { dayLabel, hub, isOnline, ReportComposer, StatusPill, TaskCard, TeamAvatar, when, type Me, type Member, type Message, type Task } from "./parts";

type Boot = { me: Me; members: Member[]; unread: Array<{ thread: string; unread: number }>; last: Array<{ thread: string; body: string; kind: string; createdAt: string; senderMemberId: string | null }>; tasks: Task[] };
const dmKey = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

export default function TeamHub({ locale, notify, manage }: { locale: string; notify: (text: string) => void; manage: ReactNode }) {
  const ru = locale !== "en";
  const [boot, setBoot] = useState<Boot | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const [thread, setThread] = useState<string>("general");
  const [tab, setTab] = useState<"chats" | "tasks">("chats");
  const [pane, setPane] = useState<"list" | "chat" | "ai">("chat");
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState(false);
  const [reporting, setReporting] = useState<Task | null>(null);
  const [cancelling, setCancelling] = useState<Task | null>(null);

  const load = useCallback(async () => {
    try { setBoot(await hub<Boot>("bootstrap")); setFailed(null); } catch (error) { setFailed(error); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000); return () => window.clearInterval(timer); }, [load]);

  const me = boot?.me;
  const tasksById = useMemo(() => new Map((boot?.tasks ?? []).map(t => [t.id, t])), [boot?.tasks]);
  const unreadBy = useMemo(() => new Map((boot?.unread ?? []).map(u => [u.thread, u.unread])), [boot?.unread]);
  const lastBy = useMemo(() => new Map((boot?.last ?? []).map(l => [l.thread, l])), [boot?.last]);
  const others = useMemo(() => (boot?.members ?? []).filter(m => m.id !== me?.id), [boot?.members, me?.id]);
  const peer = thread.startsWith("dm:") && me ? others.find(m => thread === dmKey(me.id, m.id)) : undefined;
  const openMember = (memberId: string) => { if (!me) return; setThread(dmKey(me.id, memberId)); setTab("chats"); setPane("chat"); };

  if (!boot && failed) return <CrmFailure error={failed} locale={locale} onRetry={load}/>;
  if (!boot || !me) return <CrmSkeleton locale={locale} variant="list" label={ru ? "Загружаем команду…" : "Loading team…"}/>;

  const isAdmin = ["OWNER", "ADMIN"].includes(me.role);
  const term = search.trim().toLowerCase();
  const chats = [{ key: "general", name: ru ? "Общий чат" : "General", sub: ru ? `${boot.members.length} участников` : `${boot.members.length} members`, member: undefined as Member | undefined },
    ...others.map(m => ({ key: dmKey(me.id, m.id), name: m.name, sub: positionLabel(m.position, locale) || m.email, member: m }))]
    .filter(c => !term || c.name.toLowerCase().includes(term) || c.sub.toLowerCase().includes(term))
    .sort((a, b) => (a.key === "general" ? -1 : b.key === "general" ? 1 : 0) || (unreadBy.get(b.key) ?? 0) - (unreadBy.get(a.key) ?? 0) || (lastBy.get(b.key)?.createdAt ?? "").localeCompare(lastBy.get(a.key)?.createdAt ?? "") || a.name.localeCompare(b.name));
  const incoming = boot.tasks.filter(t => t.assigneeMemberId === me.id && t.status === "OPEN");
  const outgoing = boot.tasks.filter(t => t.requesterMemberId === me.id && t.status === "OPEN");
  const closed = boot.tasks.filter(t => t.status !== "OPEN").slice(0, 20);
  const preview = (key: string) => { const l = lastBy.get(key); if (!l) return ""; const prefix = l.senderMemberId === me.id ? (ru ? "Вы: " : "You: ") : ""; return prefix + (l.kind === "REPORT_REQUEST" ? (ru ? "📋 Запрос отчёта" : "📋 Report request") : l.kind === "REPORT" ? (ru ? "✅ Отчёт" : "✅ Report") : l.kind === "TASK_CANCELLED" ? (ru ? "Запрос отменён" : "Request cancelled") : l.body); };
  const nameOf = (id: string) => boot.members.find(m => m.id === id)?.name ?? "—";

  return <div className={`teamHub pane-${pane}`}>
    <nav className="thMobileTabs" aria-label={ru ? "Разделы" : "Sections"}>
      <button type="button" className={pane === "list" ? "on" : ""} onClick={() => setPane("list")}><Users size={15}/>{ru ? "Чаты" : "Chats"}</button>
      <button type="button" className={pane === "chat" ? "on" : ""} onClick={() => setPane("chat")}><MessageSquare size={15}/>{ru ? "Переписка" : "Chat"}</button>
      <button type="button" className={pane === "ai" ? "on" : ""} onClick={() => setPane("ai")}><Sparkles size={15}/>{ru ? "ИИ" : "AI"}</button>
    </nav>

    <aside className="thSide">
      <div className="thSideHead">
        <div className="thSeg"><button type="button" className={tab === "chats" ? "on" : ""} onClick={() => setTab("chats")}><MessageSquare size={14}/>{ru ? "Чаты" : "Chats"}{[...unreadBy.values()].reduce((a, b) => a + b, 0) > 0 && <em>{[...unreadBy.values()].reduce((a, b) => a + b, 0)}</em>}</button><button type="button" className={tab === "tasks" ? "on" : ""} onClick={() => setTab("tasks")}><ClipboardList size={14}/>{ru ? "Задания" : "Tasks"}{incoming.length > 0 && <em>{incoming.length}</em>}</button></div>
        {isAdmin && <button type="button" className="thIcon" title={ru ? "Управление командой" : "Manage team"} onClick={() => setManaging(true)}><Settings2 size={16}/></button>}
      </div>
      {tab === "chats" ? <>
        <label className="thSearch"><Search size={14}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={ru ? "Поиск людей…" : "Search people…"}/></label>
        <ul className="thChats">{chats.map(c => { const unread = unreadBy.get(c.key) ?? 0; return <li key={c.key}><button type="button" className={thread === c.key ? "on" : ""} onClick={() => { setThread(c.key); setPane("chat"); }}>
          <TeamAvatar name={c.name} general={c.key === "general"} online={isOnline(c.member)}/>
          <span className="thChatText"><b>{c.name}</b><small>{preview(c.key) || c.sub}</small></span>
          <span className="thChatMeta"><time>{when(lastBy.get(c.key)?.createdAt, locale)}</time>{unread > 0 && <em>{unread}</em>}</span>
        </button></li>; })}
          {others.length === 0 && <li className="thEmptyHint">{ru ? "Пока вы в команде один. " : "You're the only one here. "}{isAdmin && <button type="button" className="thLink" onClick={() => setManaging(true)}>{ru ? "Пригласить сотрудников" : "Invite teammates"}</button>}</li>}
        </ul>
      </> : <div className="thTasks">
        <TaskGroup title={ru ? "Мне поручено" : "Assigned to me"} tasks={incoming} empty={ru ? "Нет открытых заданий" : "No open tasks"} who={t => nameOf(t.requesterMemberId)} locale={locale} onOpen={t => openMember(t.requesterMemberId)} action={t => <button type="button" className="thBtn primary" onClick={() => setReporting(t)}>{ru ? "Отчёт" : "Report"}</button>}/>
        <TaskGroup title={ru ? "Я запросил" : "Requested by me"} tasks={outgoing} empty={ru ? "Вы ничего не запрашивали" : "Nothing requested"} who={t => nameOf(t.assigneeMemberId)} locale={locale} onOpen={t => openMember(t.assigneeMemberId)}/>
        {closed.length > 0 && <TaskGroup title={ru ? "Недавно закрытые" : "Recently closed"} tasks={closed} empty="" who={t => t.requesterMemberId === me.id ? nameOf(t.assigneeMemberId) : nameOf(t.requesterMemberId)} locale={locale} onOpen={t => openMember(t.requesterMemberId === me.id ? t.assigneeMemberId : t.requesterMemberId)}/>}
      </div>}
    </aside>

    <ChatPane key={thread} thread={thread} me={me} peer={peer} members={boot.members} tasksById={tasksById} locale={locale} notify={notify} onActivity={load}
      onReport={setReporting} onCancel={setCancelling} onBack={() => setPane("list")}/>

    <TeamAiPanel me={me} locale={locale} notify={notify} onExecuted={load} onOpenThread={openMember}/>

    {reporting && <ReportComposer task={reporting} me={me} locale={locale} notify={notify} onClose={() => setReporting(null)} onSent={load}/>}
    {cancelling && <CancelDialog task={cancelling} locale={locale} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); void load(); notify(ru ? "Запрос отменён" : "Request cancelled"); }} notify={notify}/>}
    {managing && <ManageTeam members={boot.members} me={me.id} locale={locale} notify={notify} onClose={() => setManaging(false)} onChanged={load}>{manage}</ManageTeam>}
  </div>;
}

function TaskGroup({ title, tasks, empty, who, locale, onOpen, action }: { title: string; tasks: Task[]; empty: string; who: (t: Task) => string; locale: string; onOpen: (t: Task) => void; action?: (t: Task) => ReactNode }) {
  return <section className="thTaskGroup"><h5>{title}<span>{tasks.length || ""}</span></h5>
    {tasks.length ? <ul>{tasks.map(t => <li key={t.id}><button type="button" className="thTaskItem" onClick={() => onOpen(t)}><span><b>{t.title}</b><small>{who(t)}{t.dueAt ? ` · ${when(t.dueAt, locale, true)}` : ""}</small></span><StatusPill task={t} locale={locale}/></button>{action?.(t)}</li>)}</ul> : empty && <p className="thMuted">{empty}</p>}
  </section>;
}

function CancelDialog({ task, locale, onClose, onDone, notify }: { task: Task; locale: string; onClose: () => void; onDone: () => void; notify: (t: string) => void }) {
  const ru = locale !== "en";
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { await hub(`tasks/${task.id}/cancel`, { method: "POST", body: { reason } }); onDone(); } catch { notify(ru ? "Не удалось отменить" : "Couldn't cancel"); setBusy(false); } };
  return <div className="crmModalLayer" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><form className="crmModal thCancel" onSubmit={submit}>
    <header><h3>{ru ? "Отменить запрос?" : "Cancel the request?"}</h3></header>
    <div className="crmModalBody"><p className="thMuted">{task.title}</p><label>{ru ? "Причина (увидит сотрудник)" : "Reason (the teammate will see it)"}<input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} autoFocus/></label></div>
    <footer><div className="thSpacer"/><button type="button" className="thBtn ghost" onClick={onClose}>{ru ? "Назад" : "Back"}</button><button className="thBtn danger" disabled={busy}>{ru ? "Отменить запрос" : "Cancel request"}</button></footer>
  </form></div>;
}

function ChatPane({ thread, me, peer, members, tasksById, locale, notify, onActivity, onReport, onCancel, onBack }: { thread: string; me: Me; peer?: Member; members: Member[]; tasksById: Map<string, Task>; locale: string; notify: (t: string) => void; onActivity: () => void; onReport: (t: Task) => void; onCancel: (t: Task) => void; onBack: () => void }) {
  const ru = locale !== "en";
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const cursor = useRef<string | null>(null);
  const stick = useRef(true);
  const general = thread === "general";

  const pull = useCallback(async (initial = false) => {
    try {
      const params = new URLSearchParams({ thread, ...(cursor.current && !initial ? { after: cursor.current } : {}) });
      const out = await hub<{ messages: Message[]; peerReadAt: string | null }>(`messages?${params}`);
      setPeerReadAt(out.peerReadAt);
      if (initial) setMessages(out.messages);
      else if (out.messages.length) { setMessages(prev => { const seen = new Set((prev ?? []).map(m => m.id)); return [...(prev ?? []), ...out.messages.filter(m => !seen.has(m.id))]; }); onActivity(); }
      const last = (initial ? out.messages : out.messages).at(-1); if (last) cursor.current = last.createdAt;
    } catch { if (initial) setMessages([]); }
  }, [thread, onActivity]);
  useEffect(() => { cursor.current = null; stick.current = true; void pull(true); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void pull(); }, 3000); return () => window.clearInterval(timer); }, [pull]);
  useEffect(() => { const node = listRef.current; if (node && stick.current) node.scrollTop = node.scrollHeight; }, [messages, tasksById]);

  const send = async () => {
    const body = text.trim(); if (!body || sending) return;
    setSending(true); setText(""); stick.current = true;
    try { await hub("messages", { method: "POST", body: { thread, body } }); await pull(); onActivity(); }
    catch { setText(body); notify(ru ? "Сообщение не отправлено" : "Message not sent"); }
    finally { setSending(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } };
  const byId = new Map(members.map(m => [m.id, m]));
  const title = general ? (ru ? "Общий чат" : "General") : peer?.name ?? "—";
  const subtitle = general ? (ru ? "Сообщения видит вся команда" : "Everyone on the team sees these") : peer ? [positionLabel(peer.position, locale), isOnline(peer) ? (ru ? "в сети" : "online") : peer.lastSeenAt ? `${ru ? "был(а)" : "seen"} ${when(peer.lastSeenAt, locale)}` : ""].filter(Boolean).join(" · ") : "";

  return <section className="thChat">
    <header className="thChatHead">
      <button type="button" className="thIcon thBack" onClick={onBack} aria-label={ru ? "К списку" : "Back"}>‹</button>
      <TeamAvatar name={title} general={general} online={isOnline(peer)} size={38}/>
      <div><b>{general && <Hash size={14}/>}{title}</b><small>{subtitle}</small></div>
    </header>
    <div className="thMessages" ref={listRef} onScroll={e => { const n = e.currentTarget; stick.current = n.scrollHeight - n.scrollTop - n.clientHeight < 80; }}>
      {messages === null ? <CrmSkeleton locale={locale} variant="list" label={ru ? "Загружаем переписку…" : "Loading messages…"}/>
        : messages.length === 0 ? <div className="thEmptyChat"><MessageSquare size={26}/><p>{general ? (ru ? "Здесь общается вся команда. Напишите первое сообщение." : "This is where the whole team talks. Say hi.") : (ru ? `Начните переписку с ${title}. Задания и отчёты тоже появятся здесь.` : `Start a conversation with ${title}. Tasks and reports show up here too.`)}</p></div>
        : messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const mine = m.senderMemberId === me.id;
          const grouped = prev && !newDay && prev.senderMemberId === m.senderMemberId && prev.kind === "TEXT" && m.kind === "TEXT" && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          const sender = m.senderMemberId ? byId.get(m.senderMemberId) : undefined;
          const read = mine && !general && peerReadAt && new Date(peerReadAt) >= new Date(m.createdAt);
          return <div key={m.id}>
            {newDay && <div className="thDay"><span>{dayLabel(m.createdAt, locale)}</span></div>}
            {m.kind === "TEXT" ? <div className={`thMsg${mine ? " mine" : ""}${grouped ? " grouped" : ""}`}>
              {!mine && !grouped && general && <TeamAvatar name={sender?.name ?? "?"} size={30}/>}
              <div className="thBubble">
                {!mine && !grouped && general && <b className="thSender">{sender?.name ?? "—"}</b>}
                <p>{m.body}</p>
                <span className="thTime">{m.aiAssisted && <Sparkles size={10} aria-label={ru ? "написано с ИИ" : "written with AI"}/>}{when(m.createdAt, locale)}{mine && !general && (read ? <CheckCheck size={13}/> : <Check size={13}/>)}</span>
              </div>
            </div> : <div className={`thMsg card${mine ? " mine" : ""}`}><TaskCard message={m} task={m.taskId ? tasksById.get(m.taskId) : undefined} me={me} members={members} locale={locale} onReport={onReport} onCancel={onCancel}/><span className="thTime">{when(m.createdAt, locale)}</span></div>}
          </div>;
        })}
    </div>
    <form className="thComposer" onSubmit={e => { e.preventDefault(); void send(); }}>
      <textarea rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} placeholder={ru ? `Сообщение${general ? " для всей команды" : ""}…` : `Message${general ? " to everyone" : ""}…`} aria-label={ru ? "Сообщение" : "Message"} maxLength={8000}/>
      <button type="submit" className="thSend" disabled={!text.trim() || sending} aria-label={ru ? "Отправить" : "Send"}><ArrowUp size={17}/></button>
    </form>
  </section>;
}
