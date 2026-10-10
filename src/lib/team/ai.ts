import { jsonCompletion, type TokenMeter } from "@/lib/ai/endpoint";
import type { ActivityFacts, CustomerCard, WorkContext } from "./copilot";
import { REPORT_TEMPLATES, positionByKey, templateByKey, type ReportTemplate } from "./catalog";
import { matchMembers } from "./names";

export type TeamMember = { id: string; name: string; email: string; role: string; position: string | null };
type CrmKind = "TODO" | "CALL" | "MEETING" | "EMAIL";
type NoteKind = "NOTE" | "CALL" | "MEETING" | "EMAIL";
export type TeamAction =
  | { type: "request_report"; memberId: string; memberName: string; template: string; title: string; note: string; dueAt: string | null }
  | { type: "send_message"; memberId: string | "general"; memberName: string; text: string }
  | { type: "crm_task"; title: string; taskType: CrmKind; dueAt: string | null; customerId: string | null; customerName: string | null; dealId: string | null }
  | { type: "crm_note"; noteType: NoteKind; body: string; customerId: string; customerName: string; dealId: string | null }
  | { type: "crm_deal"; title: string; amount: number; customerId: string | null; customerName: string | null }
  | { type: "crm_move"; dealId: string; dealTitle: string; stageId: string; stageName: string; lost: boolean; lostReason: string | null }
  | { type: "crm_done"; taskId: string; title: string }
  | { type: "client_reply"; customerId: string; customerName: string; text: string };
export type TeamAiReply = { reply: string; actions: TeamAction[]; mode: "model" | "rules"; client?: { id: string; name: string } | null };

const templateFor = (member: TeamMember | undefined, text: string) => {
  const t = text.toLowerCase();
  if (/продаж|sales|сделк/.test(t)) return "sales";
  if (/недел|weekly|week/.test(t)) return "weekly";
  if (/финанс|бухг|расход|finance/.test(t)) return "finance";
  if (/маркет|реклам|marketing|smm/.test(t)) return "marketing";
  if (/проект|project|задач/.test(t)) return "project";
  if (/поддерж|обращен|support/.test(t)) return "support";
  if (/свободн|free/.test(t)) return "free";
  if (/день|дневн|daily|сегодн/.test(t)) return "daily";
  return positionByKey(member?.position)?.report ?? "daily";
};

/** Minutes the timezone is ahead of UTC at a moment. */
function tzOffset(timeZone: string, at: Date) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at).map(p => [p.type, p.value]));
    return (Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!) - Math.floor(at.getTime() / 60000) * 60000) / 60000;
  } catch { return 0; }
}
/** "завтра в 11", "до 18:00 сегодня", "послезавтра" → ISO time in the workspace timezone (18:00 by default). */
export function dueFromText(text: string, timeZone = "UTC", now = new Date()) {
  const t = text.toLowerCase();
  const time = t.match(/(?:^|\s)(?:до|к|в|на|by|at)\s*(\d{1,2})(?:[.:](\d{2}))?(?=\s|$|[,.!?]|\s*(?:ч|час|h))/);
  const hour = time ? Math.min(23, Number(time[1])) : 18, minute = time?.[2] ? Math.min(59, Number(time[2])) : 0;
  const days = /послезавтра/.test(t) ? 2 : /завтра|tomorrow/.test(t) ? 1 : /сегодня|today|вечер/.test(t) ? 0 : /через недел|next week|на следующей неделе/.test(t) ? 7 : time ? 0 : null;
  if (days === null) return null;
  const offset = tzOffset(timeZone, now);
  const local = new Date(now.getTime() + offset * 60000); // wall-clock in the workspace timezone, read with UTC getters
  const utc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour, minute) - offset * 60000;
  // "в 11" said at 15:00 with no day means tomorrow.
  return new Date(days === 0 && utc < now.getTime() && !/сегодня|today/.test(t) ? utc + 86400_000 : utc).toISOString();
}

const nameWords = (text: string) => text.replace(/(запроси|запросить|попроси|попросить|потребуй|нужен|нужно|пусть|отч[её]т[а-яёa-z\d_]*|у|от|для|сотрудник[а-яёa-z\d_]*|по|продаж[а-яёa-z\d_]*|за|день|недел[а-яёa-z\d_]*|сегодня|завтра|до|к|и|с|пришл[а-яёa-z\d_]*|сдаст|сдать|напиши|напишите|передай|скажи|сообщи|ему|ей|что|чтобы|please|ask|report|from|send|tell)(?=\s|$|[,.!?:])/gi, " ");

export type OpenTask = { title: string; assignee: string; dueAt: string | null; overdue: boolean };
export type MyTask = { id: string; title: string; requester: string; dueAt: string | null };

export type AssistantInput = {
  text: string; history: Array<{ role: "user" | "assistant"; content: string }>;
  members: TeamMember[]; me: TeamMember; locale: "ru" | "en"; timezone: string;
  /** Reports this person requested that are still open. */ tasks?: OpenTask[];
  /** Reports this person has to write. */ myTasks?: MyTask[];
  work?: WorkContext; canWrite: boolean;
  /** Finds a client by name/phone/email; returns the card when the match is clear. */
  lookup?: (query: string) => Promise<{ card: CustomerCard | null; candidates: Array<{ id: string; name: string }> }>;
  meter?: TokenMeter;
};

const fmt = (value: string | null | undefined, locale: "ru" | "en", tz: string) => value ? new Date(value).toLocaleString(locale === "ru" ? "ru-RU" : "en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const money = (amount: number, currency: string, locale: "ru" | "en") => { try { return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); } catch { return `${amount} ${currency}`; } };
const TASK_TYPE: Record<string, string> = { TODO: "Задача", CALL: "Звонок", MEETING: "Встреча", EMAIL: "Письмо", NOTE: "Заметка" };

/** "клиент Иванов", "по клиенту Ивановой", "client John Smith" → the name to look up. */
export function clientMention(text: string) {
  const m = text.match(/(?:клиент\p{L}*|заказчик\p{L}*|покупател\p{L}*|client|customer)\s+(?:по имени\s+)?[«"]?([\p{L}][\p{L}\d'.-]*(?:\s+[\p{Lu}][\p{L}'.-]*)?)/iu);
  if (!m) return null;
  return m[1]!.replace(/[«»"]/g, "").trim();
}
/** Strips Russian case endings so "Иванову" still finds "Иванов". */
export const nameStem = (word: string) => word.split(/\s+/).map(w => w.length > 4 ? w.replace(/(ому|ему|ой|ей|ом|ым|ую|ою|у|ю|а|я|е|ы|и)$/i, "") : w).join(" ");

function briefText(input: AssistantInput) {
  const { locale, timezone: tz, work, myTasks = [], tasks = [] } = input;
  const ru = locale === "ru";
  const now = Date.now();
  const lines: string[] = [];
  if (myTasks.length) lines.push(ru ? `**Отчёты, которые от вас ждут (${myTasks.length}):**` : `**Reports you owe (${myTasks.length}):**`, ...myTasks.map(t => `- ${t.title} — ${t.requester}${t.dueAt ? ` (${ru ? "до" : "due"} ${fmt(t.dueAt, locale, tz)})` : ""}`));
  const crm = work?.crmTasks ?? [];
  const overdue = crm.filter(t => t.dueAt && Date.parse(t.dueAt) < now);
  const today = crm.filter(t => t.dueAt && Date.parse(t.dueAt) >= now && Date.parse(t.dueAt) < now + 24 * 3600_000);
  if (overdue.length) lines.push(ru ? `**Просрочено в CRM (${overdue.length}):**` : `**Overdue in CRM (${overdue.length}):**`, ...overdue.slice(0, 6).map(t => `- ${t.title}${t.customer ? ` — ${t.customer}` : ""} (${fmt(t.dueAt, locale, tz)})`));
  if (today.length) lines.push(ru ? `**Ближайшие 24 часа:**` : `**Next 24 hours:**`, ...today.slice(0, 8).map(t => `- ${fmt(t.dueAt, locale, tz)} — ${t.title}${t.customer ? ` (${t.customer})` : ""}`));
  if (work?.waiting.length) lines.push(ru ? `**Клиенты ждут ответа человека (${work.waiting.length}):** ${work.waiting.map(w => w.customer).join(", ")}` : `**Clients waiting for a human (${work.waiting.length}):** ${work.waiting.map(w => w.customer).join(", ")}`);
  const unread = (work?.unread ?? []).reduce((a, u) => a + u.unread, 0);
  if (unread) lines.push(ru ? `**Непрочитанных сообщений в команде:** ${unread}` : `**Unread team messages:** ${unread}`);
  if (work?.deals.length) lines.push(ru ? `**Ваши открытые сделки:** ${work.deals.length}, на ${money(work.deals.reduce((a, d) => a + d.amount, 0), work.deals[0]!.currency, locale)}` : `**Your open deals:** ${work.deals.length}`);
  if (tasks.length) lines.push(ru ? `**Вы ждёте отчёты:** ${tasks.map(t => t.assignee).join(", ")}` : `**You're waiting for reports from:** ${tasks.map(t => t.assignee).join(", ")}`);
  return lines.length ? (ru ? "Вот что у вас сейчас:\n" : "Here's your day:\n") + lines.join("\n") : (ru ? "Срочного ничего нет: открытых заданий, просроченных задач и ожидающих клиентов нет." : "Nothing urgent: no open tasks, overdue items or waiting clients.");
}

function cardText(card: CustomerCard, locale: "ru" | "en", tz: string) {
  const ru = locale === "ru";
  const open = card.deals.filter(d => d.status === "OPEN");
  const out = [`**${card.name}**${card.company ? ` · ${card.company}` : ""}${card.phone ? ` · ${card.phone}` : ""}${card.email ? ` · ${card.email}` : ""}`];
  out.push(open.length ? (ru ? "Сделки: " : "Deals: ") + open.map(d => `${d.title} — ${money(d.amount, d.currency, locale)}, «${d.stage}»`).join("; ") : (ru ? "Открытых сделок нет." : "No open deals."));
  if (card.tasks.length) out.push((ru ? "Задачи: " : "Tasks: ") + card.tasks.map(t => `${t.title}${t.dueAt ? ` (${fmt(t.dueAt, locale, tz)})` : ""}`).join("; "));
  const last = card.activity[0];
  if (last) out.push((ru ? "Последнее в истории: " : "Latest note: ") + `${TASK_TYPE[last.type] ?? last.type} — ${last.body.slice(0, 160)}${last.at ? ` (${fmt(last.at, locale, tz)})` : ""}`);
  const msg = card.messages.at(-1);
  if (msg) out.push((ru ? (msg.from === "client" ? "Клиент писал последним: " : "Мы писали последними: ") : (msg.from === "client" ? "Client wrote last: " : "We wrote last: ")) + `«${msg.text.slice(0, 160)}»`);
  return out.join("\n");
}

/** Rule-based understanding used when no model is configured or it fails. */
export function planTeamRules(input: AssistantInput, card: CustomerCard | null = null): TeamAiReply {
  const { text, members, me, locale, tasks = [] } = input;
  const ru = locale === "ru";
  const client = card ? { id: card.id, name: card.name } : null;
  if (/(кто|who).*(не сдал|не прислал|не отправил|haven|not)|просроченн[а-яёa-z\d_]* отч|open reports/i.test(text)) {
    if (!tasks.length) return { reply: ru ? "Все запрошенные отчёты сданы — открытых заданий нет." : "All requested reports are in — no open tasks.", actions: [], mode: "rules" };
    return { reply: (ru ? "Ещё ждём:\n" : "Still waiting for:\n") + tasks.map(t => `- **${t.assignee}** — ${t.title}${t.overdue ? (ru ? " (просрочено)" : " (overdue)") : t.dueAt ? ` (${ru ? "до" : "due"} ${fmt(t.dueAt, locale, input.timezone)})` : ""}`).join("\n"), actions: [], mode: "rules" };
  }
  const wantsTask = /(постав|созда|добав|запланир)[а-яёa-z\d_]*\s+(задач|звон|встреч)|напомни|перезвон|schedule|remind|add a task/i.test(text);
  if (wantsTask && input.canWrite) {
    const title = text.replace(/^.*?(?:постав[а-яёa-z\d_]*|созда[а-яёa-z\d_]*|добав[а-яёa-z\d_]*|запланир[а-яёa-z\d_]*)\s+(?:мне\s+)?(?:задач[а-яёa-z\d_]*)?\s*[:—-]?\s*|^.*?напомни(?:\s+мне)?\s*/i, "").replace(/\s*(?:сегодня|завтра|послезавтра|на неделе)(?:\s+(?:до|к|в)\s*\d{1,2}(?::\d{2})?)?\s*$/i, "").trim() || (ru ? "Связаться с клиентом" : "Follow up");
    const taskType: CrmKind = /звон|call/i.test(text) ? "CALL" : /встреч|meet/i.test(text) ? "MEETING" : /письм|email/i.test(text) ? "EMAIL" : "TODO";
    return { reply: ru ? "Подготовил задачу в CRM — проверьте и подтвердите." : "CRM task ready — check and confirm.", mode: "rules", client,
      actions: [{ type: "crm_task", title: title.charAt(0).toUpperCase() + title.slice(1, 200), taskType, dueAt: dueFromText(text, input.timezone), customerId: card?.id ?? null, customerName: card?.name ?? null, dealId: card?.deals.find(d => d.status === "OPEN")?.id ?? null }] };
  }
  if (card) return { reply: cardText(card, locale, input.timezone), actions: [], mode: "rules", client };
  if (/(что у меня|мои задач|мой день|план на|с чего начать|что сегодня|что делать|what.*(today|my day)|my tasks|brief)/i.test(text)) return { reply: briefText(input), actions: [], mode: "rules" };
  const others = members.filter(m => m.id !== me.id);
  if (/отч[её]т|report/i.test(text) && /(запрос|попрос|потреб|нуж|пусть|пришл|сдаст|request|ask|need)/i.test(text) && input.canWrite) {
    const found = matchMembers(nameWords(text), others);
    if (found.length === 1) {
      const member = found[0]!, template = templateFor(member, text);
      const tpl = templateByKey(template);
      return { reply: ru ? `Подготовил запрос: **${tpl.ru}** от **${member.name}**. Проверьте и отправьте.` : `Prepared a request: **${tpl.en}** from **${member.name}**. Check and send.`, mode: "rules",
        actions: [{ type: "request_report", memberId: member.id, memberName: member.name, template, title: ru ? tpl.ru : tpl.en, note: "", dueAt: dueFromText(text, input.timezone) }] };
    }
    if (found.length > 1) return { reply: ru ? `Нашёл несколько человек: ${found.map(m => m.name).join(", ")}. Уточните, у кого запросить отчёт.` : `Several people match: ${found.map(m => m.name).join(", ")}. Who exactly?`, actions: [], mode: "rules" };
    return { reply: ru ? "Не нашёл такого сотрудника в команде. Напишите имя как в списке слева." : "I couldn't find that teammate. Use the name from the list on the left.", actions: [], mode: "rules" };
  }
  const message = text.match(/^(?:напиши|передай|скажи|сообщи|tell|message)\s+(.+?)(?:[,:—-]\s*|\s+что\s+)(.+)$/i);
  if (message) {
    const general = /всем|команд|общ|everyone|team/i.test(message[1]!);
    const found = general ? [] : matchMembers(message[1]!, others);
    if (general || found.length === 1) return { reply: ru ? "Сообщение готово — проверьте и отправьте." : "Message ready — check and send.", mode: "rules",
      actions: [{ type: "send_message", memberId: general ? "general" : found[0]!.id, memberName: general ? (ru ? "Общий чат" : "General") : found[0]!.name, text: message[2]!.trim() }] };
  }
  return { reply: ru
    ? "Я ваш рабочий помощник. Например:\n- «Что у меня сегодня?»\n- «Что с клиентом Ивановым?»\n- «Поставь задачу: позвонить Иванову завтра в 11»\n- «Напиши Анне: созвон в 15:00»\n- «Запроси отчёт по продажам у Виталика до завтра»"
    : "I'm your work assistant. Try:\n- “What's on my plate today?”\n- “What's up with client Ivanov?”\n- “Add a task: call Ivanov tomorrow at 11”\n- “Tell Anna: call at 3 pm”", actions: [], mode: "rules" };
}

function contextBlock(input: AssistantInput, card: CustomerCard | null, candidates: Array<{ id: string; name: string }>) {
  const { work, myTasks = [], tasks = [], locale: l, timezone: tz } = input;
  const lines: string[] = [];
  lines.push("REPORTS I OWE (team tasks):", myTasks.map(t => `- ${t.title} from ${t.requester}${t.dueAt ? ` due ${fmt(t.dueAt, l, tz)}` : ""}`).join("\n") || "(none)");
  lines.push("REPORTS I REQUESTED, STILL OPEN:", tasks.map(t => `- ${t.assignee}: ${t.title}${t.dueAt ? ` due ${fmt(t.dueAt, l, tz)}` : ""}${t.overdue ? " OVERDUE" : ""}`).join("\n") || "(none)");
  if (work) {
    lines.push("MY OPEN CRM TASKS (id | type | title | due | client):", work.crmTasks.map(t => `${t.id} | ${t.type} | ${t.title} | ${t.dueAt ? fmt(t.dueAt, l, tz) : "-"} | ${t.customer ?? "-"}`).join("\n") || "(none)");
    lines.push("MY OPEN DEALS (id | title | amount | stage | client):", work.deals.map(d => `${d.id} | ${d.title} | ${money(d.amount, d.currency, l)} | ${d.stage} | ${d.customer ?? "-"}`).join("\n") || "(none)");
    lines.push("CLIENTS WAITING FOR A HUMAN REPLY:", work.waiting.map(w => `${w.customer} (${w.channel})`).join(", ") || "(none)");
    lines.push(`UNREAD TEAM MESSAGES: ${work.unread.reduce((a, u) => a + u.unread, 0)}`);
  }
  const stages = [...(work?.stages ?? []), ...(card?.stages ?? [])];
  if (stages.length) lines.push("PIPELINE STAGES (id | name | kind):", [...new Map(stages.map(s => [s.id, s])).values()].map(s => `${s.id} | ${s.name} | ${s.kind}`).join("\n"));
  if (card) {
    lines.push(`CLIENT CARD id=${card.id}: ${card.name}${card.company ? `, company ${card.company}` : ""}${card.phone ? `, phone ${card.phone}` : ""}${card.email ? `, email ${card.email}` : ""}${card.tags.length ? `, tags ${card.tags.join("/")}` : ""}${card.notes ? `. Notes: ${card.notes.slice(0, 300)}` : ""}`);
    lines.push("Client deals (id | title | amount | stage | status):", card.deals.map(d => `${d.id} | ${d.title} | ${money(d.amount, d.currency, l)} | ${d.stage} | ${d.status}`).join("\n") || "(none)");
    lines.push("Client open tasks:", card.tasks.map(t => `${t.id} | ${t.title} | ${t.dueAt ? fmt(t.dueAt, l, tz) : "-"}`).join("\n") || "(none)");
    lines.push("Client history (newest first):", card.activity.map(a => `- ${a.at ? fmt(a.at, l, tz) : ""} ${a.type}${a.author ? ` by ${a.author}` : ""}: ${a.body}`).join("\n") || "(none)");
    lines.push("Latest chat with the client (oldest first):", card.messages.map(m => `${m.from === "client" ? "Client" : "Us"}: ${m.text}`).join("\n") || "(none)");
  } else if (candidates.length > 1) lines.push("SEVERAL CLIENTS MATCH (ask which one):", candidates.map(c => `${c.id} | ${c.name}`).join("\n"));
  return lines.join("\n");
}

export async function runTeamAssistant(input: AssistantInput): Promise<TeamAiReply> {
  const { members, me, locale } = input;
  let card: CustomerCard | null = null, candidates: Array<{ id: string; name: string }> = [];
  const lookup = async (query: string) => { if (!input.lookup || !query) return; const found = await input.lookup(query); card = found.card ?? card; candidates = found.candidates; };
  const mention = clientMention(input.text);
  if (mention) await lookup(mention);
  try {
    const roster = members.filter(m => m.id !== me.id).map(m => `${m.id} | ${m.name} | ${positionByKey(m.position)?.ru ?? m.position ?? "—"} | ${m.role}`).join("\n");
    const templates = REPORT_TEMPLATES.map(t => `${t.key} = ${t.ru}`).join(", ");
    const now = new Date().toLocaleString("ru-RU", { timeZone: input.timezone, dateStyle: "full", timeStyle: "short" });
    const position = positionByKey(me.position)?.ru ?? me.position ?? "сотрудник";
    const actionsSpec = input.canWrite
      ? 'request_report {memberId, template, title, note, dueAt} — ask a teammate for a report (becomes their task); send_message {memberId|"general", text}; crm_task {title, taskType: TODO|CALL|MEETING|EMAIL, dueAt, customerId?, dealId?}; crm_note {noteType: NOTE|CALL|MEETING|EMAIL, body, customerId, dealId?} — log a call/meeting result in client history; crm_deal {title, amount, customerId?}; crm_move {dealId, stageId, lostReason?}; crm_done {taskId} — mark my CRM task done; client_reply {customerId, text} — a draft reply to the client (the user copies it).'
      : 'send_message {memberId|"general", text}; client_reply {customerId, text} — a draft reply the user copies. This user has read-only CRM access: do not offer CRM changes or report requests.';
    const system = () => [
      `You are the personal work assistant of ${me.name} (${position}, role ${me.role}) inside the Lemiri platform. Answer in ${locale === "ru" ? "Russian" : "English"}. Now: ${now} (${input.timezone}).`,
      "You help with their own work: what to do today, clients in the CRM, tasks and deals, team chats and reports. Be concrete and short; use '- ' bullets for lists and **bold** for names. Use only facts from the context below; if something isn't there, say so. Never invent clients, numbers or history.",
      "You never perform actions yourself: you prepare them and the user confirms each with a button. Say it is ready for confirmation, not done.",
      `Actions: ${actionsSpec}`,
      "Ids must come from the context. Resolve teammates by name, including Russian diminutives and cases (Виталик → Виталий). Dates in dueAt are ISO-8601 with the timezone offset.",
      "If the user asks about a client who is not in the context, set \"lookup\" to the client's name, phone or email and return no actions — the system will load the card and ask you again.",
      `Report templates: ${templates}.`,
      'Reply ONLY with JSON: {"reply": string, "lookup": string|null, "actions": [{"type": ..., ...fields}]}.',
      "TEAMMATES (id | name | position | role):", roster || "(no teammates yet)",
      contextBlock(input, card, candidates),
    ].join("\n");
    const transcript = [...input.history.slice(-8).map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`), `User: ${input.text}`].join("\n");
    type Out = { reply?: string; lookup?: string | null; actions?: Array<Record<string, unknown>> };
    let out = await jsonCompletion<Out>(system(), transcript, 1400, input.meter);
    if (out.lookup && !card && input.lookup) {
      await lookup(String(out.lookup).slice(0, 80));
      if (card || candidates.length) out = await jsonCompletion<Out>(system(), transcript, 1400, input.meter);
      else out = { reply: locale === "ru" ? `Не нашёл в CRM клиента «${out.lookup}». Проверьте имя или телефон.` : `No client “${out.lookup}” in the CRM.`, actions: [] };
    }
    const actions = validateActions(out.actions ?? [], input, card);
    if (!out.reply && !actions.length) throw new Error("empty");
    const c = card as CustomerCard | null;
    return { reply: String(out.reply ?? "").slice(0, 4000), actions: actions.slice(0, 5), mode: "model", client: c ? { id: c.id, name: c.name } : null };
  } catch (error) {
    if (!(error instanceof Error && error.message === "NO_MODEL")) console.error("Team assistant model failed", error instanceof Error ? error.message : error);
    return planTeamRules(input, card);
  }
}

/** Keeps only actions whose ids exist in what the user can see, with clean field values. */
function validateActions(raw: Array<Record<string, unknown>>, input: AssistantInput, card: CustomerCard | null): TeamAction[] {
  const { members, me, locale, work, canWrite } = input;
  const byId = new Map(members.map(m => [m.id, m]));
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const customers = new Map<string, string>();
  if (card) customers.set(card.id, card.name);
  for (const t of work?.crmTasks ?? []) if (t.customerId && t.customer) customers.set(t.customerId, t.customer);
  for (const d of work?.deals ?? []) if (d.customerId && d.customer) customers.set(d.customerId, d.customer);
  const deals = new Map<string, { title: string; pipelineId: string }>([...(work?.deals ?? []).map(d => [d.id, d] as const), ...(card?.deals ?? []).map(d => [d.id, d] as const)]);
  const stages = new Map([...(work?.stages ?? []), ...(card?.stages ?? [])].map(st => [st.id, st]));
  const crmTasks = new Map([...(work?.crmTasks ?? []).map(t => [t.id, t.title] as const), ...(card?.tasks ?? []).map(t => [t.id, t.title] as const)]);
  const out: TeamAction[] = [];
  for (const a of raw) {
    const customerId = typeof a.customerId === "string" && customers.has(a.customerId) ? a.customerId : null;
    const dealId = typeof a.dealId === "string" && deals.has(a.dealId) ? a.dealId : null;
    // An id the model made up (not in what the user can see) means the action is unreliable: drop it.
    if ((typeof a.customerId === "string" && a.customerId && !customerId) || (typeof a.dealId === "string" && a.dealId && !dealId)) continue;
    if (a.type === "send_message" && s(a.text, 4000) && (a.memberId === "general" || (typeof a.memberId === "string" && byId.has(a.memberId) && a.memberId !== me.id)))
      out.push({ type: "send_message", memberId: a.memberId as string, memberName: a.memberId === "general" ? (locale === "ru" ? "Общий чат" : "General") : byId.get(a.memberId as string)!.name, text: s(a.text, 4000) });
    else if (a.type === "client_reply" && customerId && s(a.text, 4000))
      out.push({ type: "client_reply", customerId, customerName: customers.get(customerId)!, text: s(a.text, 4000) });
    else if (!canWrite) continue;
    else if (a.type === "request_report" && typeof a.memberId === "string" && byId.has(a.memberId) && a.memberId !== me.id) {
      const member = byId.get(a.memberId)!, template = REPORT_TEMPLATES.some(t => t.key === a.template) ? String(a.template) : templateFor(member, input.text);
      out.push({ type: "request_report", memberId: member.id, memberName: member.name, template, title: s(a.title, 160) || templateByKey(template).ru, note: s(a.note, 1000), dueAt: date(a.dueAt) });
    } else if (a.type === "crm_task" && s(a.title, 200)) {
      const taskType = (["TODO", "CALL", "MEETING", "EMAIL"].includes(String(a.taskType)) ? a.taskType : "TODO") as CrmKind;
      out.push({ type: "crm_task", title: s(a.title, 200), taskType, dueAt: date(a.dueAt), customerId, customerName: customerId ? customers.get(customerId)! : null, dealId });
    } else if (a.type === "crm_note" && customerId && s(a.body, 4000)) {
      const noteType = (["NOTE", "CALL", "MEETING", "EMAIL"].includes(String(a.noteType)) ? a.noteType : "NOTE") as NoteKind;
      out.push({ type: "crm_note", noteType, body: s(a.body, 4000), customerId, customerName: customers.get(customerId)!, dealId });
    } else if (a.type === "crm_deal" && s(a.title, 200)) {
      out.push({ type: "crm_deal", title: s(a.title, 200), amount: Math.max(0, Math.min(1e12, Number(a.amount) || 0)), customerId, customerName: customerId ? customers.get(customerId)! : null });
    } else if (a.type === "crm_move" && dealId && typeof a.stageId === "string" && stages.has(a.stageId) && stages.get(a.stageId)!.pipelineId === deals.get(dealId)!.pipelineId) {
      const stage = stages.get(a.stageId)!;
      out.push({ type: "crm_move", dealId, dealTitle: deals.get(dealId)!.title, stageId: stage.id, stageName: stage.name, lost: stage.kind === "LOST", lostReason: stage.kind === "LOST" ? s(a.lostReason, 300) || null : null });
    } else if (a.type === "crm_done" && typeof a.taskId === "string" && crmTasks.has(a.taskId))
      out.push({ type: "crm_done", taskId: a.taskId, title: crmTasks.get(a.taskId)! });
  }
  return out;
}

// ------------------------------------------------------------------ chat summary
export type ThreadSummary = { summary: string; decisions: string[]; forMe: string[]; questions: string[]; mode: "model" | "rules" };
export async function summarizeThread(input: { messages: Array<{ sender: string; mine: boolean; text: string; kind: string; at: string }>; me: string; title: string; locale: "ru" | "en"; timezone: string; meter?: TokenMeter }): Promise<ThreadSummary> {
  const { messages, locale } = input;
  const ru = locale === "ru";
  try {
    const system = [
      `You summarize a work chat "${input.title}" for ${input.me}. Write in ${ru ? "Russian" : "English"}. Use only what is in the messages; never invent.`,
      "summary: 2-4 sentences on what was discussed. decisions: what was agreed. forMe: requests, deadlines or questions addressed to " + input.me + " (by name, as a reply to them, or to everyone). questions: questions left without an answer. Short items, max 6 each; empty arrays are fine.",
      'Reply ONLY with JSON: {"summary": string, "decisions": string[], "forMe": string[], "questions": string[]}.',
    ].join("\n");
    const transcript = messages.map(m => `[${fmt(m.at, locale, input.timezone)}] ${m.mine ? `${input.me} (me)` : m.sender}${m.kind !== "TEXT" ? ` [${m.kind}]` : ""}: ${m.text.slice(0, 600)}`).join("\n");
    const out = await jsonCompletion<{ summary?: string; decisions?: unknown[]; forMe?: unknown[]; questions?: unknown[] }>(system, transcript.slice(-24000), 900, input.meter);
    const list = (v: unknown[] | undefined) => (v ?? []).map(String).filter(Boolean).slice(0, 6);
    return { summary: String(out.summary ?? "").slice(0, 1200), decisions: list(out.decisions), forMe: list(out.forMe), questions: list(out.questions), mode: "model" };
  } catch (error) {
    if (!(error instanceof Error && error.message === "NO_MODEL")) console.error("Chat summary failed", error instanceof Error ? error.message : error);
    const first = input.me.split(" ")[0]!.toLowerCase();
    const people = new Set(messages.map(m => m.sender));
    return {
      summary: ru ? `${messages.length} сообщений от ${people.size} участников. ИИ сейчас недоступен — ниже то, что удалось найти без него.` : `${messages.length} messages from ${people.size} people. AI is unavailable — here's what could be found without it.`,
      decisions: [],
      forMe: messages.filter(m => !m.mine && (m.text.toLowerCase().includes(first) || m.kind === "REPORT_REQUEST")).slice(-5).map(m => `${m.sender}: ${m.text.slice(0, 160)}`),
      questions: messages.filter(m => !m.mine && /\?\s*$/.test(m.text)).slice(-5).map(m => `${m.sender}: ${m.text.slice(0, 160)}`),
      mode: "rules",
    };
  }
}

export type ReportDraft = { fields: Record<string, string>; issues: string[]; summary: string; mode: "model" | "rules" };

/** Checks a report draft for mistakes and lays it out in the template's fields. */
export async function assistReport(input: { template: ReportTemplate; draft: string; fields: Record<string, string>; title: string; note: string | null; author: string; locale: "ru" | "en"; meter?: TokenMeter }): Promise<ReportDraft> {
  const { template, locale } = input;
  try {
    const fields = template.fields.map(f => `${f.key}: ${locale === "ru" ? f.ru : f.en} — ${locale === "ru" ? f.hintRu : f.hintEn}${f.required ? " (required)" : ""}`).join("\n");
    const system = [
      `You are an editor that turns an employee's notes into a clean report. Write in ${locale === "ru" ? "Russian" : "English"}. Author: ${input.author}.`,
      `Report: "${input.title}"${input.note ? `. Manager's request: ${input.note}` : ""}. Template "${template.ru}" fields:`, fields,
      "Rules: keep every fact and number from the notes; never invent facts, numbers, names or results. Fix spelling, grammar and formatting. Use short '- ' bullet lines inside fields.",
      "List problems in issues: required fields with no information, contradictions, numbers that don't add up, vague statements a manager would ask about, possible typos in numbers. Empty array if none.",
      'Reply ONLY with JSON: {"fields": {fieldKey: string}, "issues": string[], "summary": string (one sentence)}.',
    ].join("\n");
    const existing = Object.entries(input.fields).filter(([, v]) => v?.trim()).map(([k, v]) => `[${k}] ${v}`).join("\n");
    const out = await jsonCompletion<{ fields?: Record<string, unknown>; issues?: unknown[]; summary?: string }>(system, `Notes:\n${input.draft}\n${existing ? `\nAlready filled:\n${existing}` : ""}`, 1600, input.meter);
    const result: Record<string, string> = {};
    for (const f of template.fields) result[f.key] = typeof out.fields?.[f.key] === "string" ? String(out.fields[f.key]).slice(0, 6000) : input.fields[f.key] ?? "";
    return { fields: result, issues: (out.issues ?? []).map(String).filter(Boolean).slice(0, 8), summary: String(out.summary ?? "").slice(0, 300), mode: "model" };
  } catch (error) {
    if (!(error instanceof Error && error.message === "NO_MODEL")) console.error("Report assistant failed", error instanceof Error ? error.message : error);
    const result: Record<string, string> = { ...input.fields };
    const first = template.fields[0]!.key;
    if (input.draft.trim()) result[first] = [result[first], input.draft.trim()].filter(Boolean).join("\n");
    const missing = template.fields.filter(f => f.required && !result[f.key]?.trim()).map(f => (locale === "ru" ? `Не заполнено: «${f.ru}»` : `Missing: “${f.en}”`));
    return { fields: result, issues: missing, summary: "", mode: "rules" };
  }
}


// ------------------------------------------------------------------ report on autopilot
/** Builds a report draft from what the teammate actually did (CRM, chats, tasks) for them to review. */
export async function draftFromActivity(input: { template: ReportTemplate; facts: ActivityFacts; extra: string; title: string; note: string | null; author: string; period: string; locale: "ru" | "en"; timezone: string; meter?: TokenMeter }): Promise<ReportDraft> {
  const { template, facts, locale } = input;
  const ru = locale === "ru";
  const sum = (rows: Array<{ amount: number; currency: string }>) => rows.length ? money(rows.reduce((a, d) => a + d.amount, 0), rows[0]!.currency, locale) : "";
  const factLines = [
    `Period: ${input.period} (since ${fmt(facts.since, locale, input.timezone)})`,
    `Client replies sent: ${facts.replies} in ${facts.conversations} conversations`,
    `Team messages: ${facts.teamMessages}; reports submitted: ${facts.reportsDone}; deal stage moves: ${facts.stageMoves}`,
    "CRM history entries by me:", facts.activities.map(a => `- ${a.at ? fmt(a.at, locale, input.timezone) : ""} ${TASK_TYPE[a.type] ?? a.type}${a.customer ? ` (${a.customer})` : ""}: ${a.body}`).join("\n") || "(none)",
    "CRM tasks completed:", facts.tasksDone.map(t => `- ${t.title}${t.customer ? ` (${t.customer})` : ""}`).join("\n") || "(none)",
    "Deals created:", facts.dealsCreated.map(d => `- ${d.title}: ${money(d.amount, d.currency, locale)}`).join("\n") || "(none)",
    "Deals won:", facts.dealsWon.map(d => `- ${d.title}: ${money(d.amount, d.currency, locale)}`).join("\n") || "(none)",
    "Deals lost:", facts.dealsLost.map(d => `- ${d.title}${d.reason ? ` — ${d.reason}` : ""}`).join("\n") || "(none)",
  ].join("\n");
  try {
    const fields = template.fields.map(f => `${f.key}: ${ru ? f.ru : f.en} — ${ru ? f.hintRu : f.hintEn}${f.required ? " (required)" : ""}`).join("\n");
    const system = [
      `You draft a work report for ${input.author} from their recorded activity. Write in ${ru ? "Russian" : "English"}, first person, concise '- ' bullets.`,
      `Report: "${input.title}"${input.note ? `. Manager's request: ${input.note}` : ""}. Template "${template.ru}" fields:`, fields,
      "Use ONLY the facts and the employee's own notes. Count and sum correctly. Never invent results, plans or numbers. If a field (often the plan) has no facts, leave it empty and add an issue asking the employee to fill it.",
      "issues: what the employee should check or add before sending. summary: one sentence.",
      'Reply ONLY with JSON: {"fields": {fieldKey: string}, "issues": string[], "summary": string}.',
    ].join("\n");
    const out = await jsonCompletion<{ fields?: Record<string, unknown>; issues?: unknown[]; summary?: string }>(system, `FACTS:\n${factLines}\n\nEMPLOYEE NOTES:\n${input.extra || "(none)"}`.slice(0, 24000), 1600, input.meter);
    const result: Record<string, string> = {};
    for (const f of template.fields) result[f.key] = typeof out.fields?.[f.key] === "string" ? String(out.fields[f.key]).slice(0, 6000) : "";
    return { fields: result, issues: (out.issues ?? []).map(String).filter(Boolean).slice(0, 8), summary: String(out.summary ?? "").slice(0, 300), mode: "model" };
  } catch (error) {
    if (!(error instanceof Error && error.message === "NO_MODEL")) console.error("Auto report failed", error instanceof Error ? error.message : error);
    // Without the model: put the facts into the form as-is.
    const done = [
      ...facts.activities.map(a => `- ${TASK_TYPE[a.type] ?? a.type}${a.customer ? ` — ${a.customer}` : ""}: ${a.body}`),
      ...facts.tasksDone.map(t => `- ${ru ? "Выполнено" : "Done"}: ${t.title}${t.customer ? ` (${t.customer})` : ""}`),
      ...(input.extra.trim() ? [input.extra.trim()] : []),
    ].join("\n");
    const metrics = [
      facts.replies ? (ru ? `- Ответов клиентам: ${facts.replies} (диалогов: ${facts.conversations})` : `- Client replies: ${facts.replies} (${facts.conversations} conversations)`) : "",
      facts.dealsCreated.length ? (ru ? `- Новых сделок: ${facts.dealsCreated.length} на ${sum(facts.dealsCreated)}` : `- New deals: ${facts.dealsCreated.length}, ${sum(facts.dealsCreated)}`) : "",
      facts.dealsWon.length ? (ru ? `- Выиграно сделок: ${facts.dealsWon.length} на ${sum(facts.dealsWon)}` : `- Deals won: ${facts.dealsWon.length}, ${sum(facts.dealsWon)}`) : "",
      facts.dealsLost.length ? (ru ? `- Проиграно сделок: ${facts.dealsLost.length}` : `- Deals lost: ${facts.dealsLost.length}`) : "",
      facts.tasksDone.length ? (ru ? `- Закрыто задач: ${facts.tasksDone.length}` : `- Tasks closed: ${facts.tasksDone.length}`) : "",
    ].filter(Boolean).join("\n");
    const deals = [...facts.dealsWon.map(d => `- ${ru ? "Выиграна" : "Won"}: ${d.title} — ${money(d.amount, d.currency, locale)}`), ...facts.dealsCreated.map(d => `- ${ru ? "Новая" : "New"}: ${d.title} — ${money(d.amount, d.currency, locale)}`), ...facts.dealsLost.map(d => `- ${ru ? "Проиграна" : "Lost"}: ${d.title}${d.reason ? ` — ${d.reason}` : ""}`)].join("\n");
    const result: Record<string, string> = Object.fromEntries(template.fields.map(f => [f.key, ""]));
    const keys = template.fields.map(f => f.key);
    const put = (key: string, value: string) => { if (value && keys.includes(key)) result[key] = [result[key], value].filter(Boolean).join("\n"); return Boolean(value && keys.includes(key)); };
    if (!put("deals", deals)) put(keys[0]!, deals);
    put("revenue", facts.dealsWon.length ? sum(facts.dealsWon) : "");
    if (!put("metrics", metrics) && !put("calls", metrics)) put(keys[0]!, metrics);
    put(keys[0]!, done);
    const missing = template.fields.filter(f => f.required && !result[f.key]?.trim()).map(f => (ru ? `Заполните: «${f.ru}»` : `Fill in: “${f.en}”`));
    const empty = !done && !metrics && !deals;
    return { fields: result, issues: [...(empty ? [ru ? "За период в системе нет ваших действий — опишите работу своими словами." : "No recorded activity in the period — describe your work in your own words."] : []), ...missing], summary: "", mode: "rules" };
  }
}
