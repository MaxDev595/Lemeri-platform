import { jsonCompletion } from "@/lib/ai/endpoint";
import { REPORT_TEMPLATES, positionByKey, templateByKey, type ReportTemplate } from "./catalog";
import { matchMembers } from "./names";

export type TeamMember = { id: string; name: string; email: string; role: string; position: string | null };
export type TeamAction =
  | { type: "request_report"; memberId: string; memberName: string; template: string; title: string; note: string; dueAt: string | null }
  | { type: "send_message"; memberId: string | "general"; memberName: string; text: string };
export type TeamAiReply = { reply: string; actions: TeamAction[]; mode: "model" | "rules" };

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

function dueFromText(text: string, now = new Date()) {
  const t = text.toLowerCase();
  const at = (days: number, hour = 18) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const hour = Number(t.match(/(?:до|к|by)\s*(\d{1,2})(?::00|[.:]\d{2})?\s*(?:ч|час|h|$|\s)/)?.[1] ?? 18);
  if (/послезавтра/.test(t)) return at(2, hour);
  if (/завтра|tomorrow/.test(t)) return at(1, hour);
  if (/сегодня|today|до вечера|к вечеру/.test(t)) return at(0, hour);
  if (/недел|week/.test(t)) return at(7, hour);
  return null;
}

const nameWords = (text: string) => text.replace(/(запроси|запросить|попроси|попросить|потребуй|нужен|нужно|пусть|отч[её]т\w*|у|от|для|сотрудник\w*|по|продаж\w*|за|день|недел\w*|сегодня|завтра|до|к|и|с|пришл\w*|сдаст|сдать|напиши|напишите|передай|скажи|сообщи|ему|ей|что|чтобы|please|ask|report|from|send|tell)(?=\s|$|[,.!?:])/gi, " ");

/** Rule-based understanding used when no model is configured or it fails. */
export type OpenTask = { title: string; assignee: string; dueAt: string | null; overdue: boolean };

export function planTeamRules(text: string, members: TeamMember[], meId: string, locale: "ru" | "en", tasks: OpenTask[] = []): TeamAiReply {
  const ru = locale === "ru";
  if (/(кто|who).*(не сдал|не прислал|не отправил|haven|not)|просроч|overdue|открыт\w* задан|open tasks/i.test(text)) {
    if (!tasks.length) return { reply: ru ? "Все запрошенные отчёты сданы — открытых заданий нет." : "All requested reports are in — no open tasks.", actions: [], mode: "rules" };
    return { reply: (ru ? "Ещё ждём:\n" : "Still waiting for:\n") + tasks.map(t => `- **${t.assignee}** — ${t.title}${t.overdue ? (ru ? " (просрочено)" : " (overdue)") : t.dueAt ? ` (${ru ? "до" : "due"} ${new Date(t.dueAt).toLocaleString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}`).join("\n"), actions: [], mode: "rules" };
  }
  const others = members.filter(m => m.id !== meId);
  if (/отч[её]т|report/i.test(text) && /(запрос|попрос|потреб|нуж|пусть|пришл|сдаст|request|ask|need)/i.test(text)) {
    const found = matchMembers(nameWords(text), others);
    if (found.length === 1) {
      const member = found[0]!, template = templateFor(member, text);
      const tpl = templateByKey(template);
      return { reply: ru ? `Подготовил запрос: **${tpl.ru}** от **${member.name}**. Проверьте и отправьте.` : `Prepared a request: **${tpl.en}** from **${member.name}**. Check and send.`, mode: "rules",
        actions: [{ type: "request_report", memberId: member.id, memberName: member.name, template, title: ru ? tpl.ru : tpl.en, note: "", dueAt: dueFromText(text) }] };
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
    ? "Я помогу с командой. Например:\n- «Запроси отчёт по продажам у Виталика до завтра»\n- «Напиши Анне: созвон в 15:00»\n- «Напиши всем: завтра выходной»"
    : "I can help with the team. Try:\n- “Ask Vitaly for a sales report by tomorrow”\n- “Tell Anna: call at 3 pm”\n- “Tell everyone: tomorrow is a day off”", actions: [], mode: "rules" };
}

export async function runTeamAssistant(input: { text: string; history: Array<{ role: "user" | "assistant"; content: string }>; members: TeamMember[]; me: TeamMember; locale: "ru" | "en"; timezone: string; tasks?: OpenTask[] }): Promise<TeamAiReply> {
  const { members, me, locale } = input;
  try {
    const roster = members.filter(m => m.id !== me.id).map(m => `${m.id} | ${m.name} | ${positionByKey(m.position)?.ru ?? m.position ?? "—"} | ${m.role}`).join("\n");
    const templates = REPORT_TEMPLATES.map(t => `${t.key} = ${t.ru}`).join(", ");
    const now = new Date().toLocaleString("ru-RU", { timeZone: input.timezone, dateStyle: "full", timeStyle: "short" });
    const system = [
      `You are the team assistant inside the Lemiri platform. You help ${me.name} (${me.role}) coordinate teammates. Answer in ${locale === "ru" ? "Russian" : "English"}. Now: ${now} (${input.timezone}).`,
      "You never perform actions yourself — you prepare them, the user confirms with a button. Say it's ready for confirmation, not done.",
      "Supported actions: request_report (ask a teammate for a report — creates a task they must complete) and send_message (a message to a teammate, or memberId \"general\" for the whole team).",
      "Resolve people by name, including Russian diminutives and case forms (Виталик/Виталику → Виталий). If ambiguous or not found, ask a short question and return no actions.",
      `Report templates: ${templates}. Pick the one that fits the request or the person's position.`,
      'Reply ONLY with JSON: {"reply": string, "actions": [{"type":"request_report","memberId":string,"template":string,"title":string,"note":string,"dueAt":ISO-8601|null} | {"type":"send_message","memberId":string,"text":string}]}.',
      "Keep reply short. Never invent teammates. Teammates (id | name | position | role):", roster || "(no teammates yet)",
      "Reports this user requested that are still open:", (input.tasks ?? []).map(t => `- ${t.assignee}: ${t.title}${t.dueAt ? ` (due ${t.dueAt})` : ""}${t.overdue ? " OVERDUE" : ""}`).join("\n") || "(none)",
    ].join("\n");
    const transcript = [...input.history.slice(-8).map(t => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`), `User: ${input.text}`].join("\n");
    const out = await jsonCompletion<{ reply?: string; actions?: Array<Record<string, unknown>> }>(system, transcript);
    const byId = new Map(members.map(m => [m.id, m]));
    const actions: TeamAction[] = [];
    for (const a of out.actions ?? []) {
      if (a.type === "request_report" && typeof a.memberId === "string" && byId.has(a.memberId) && a.memberId !== me.id) {
        const member = byId.get(a.memberId)!, template = REPORT_TEMPLATES.some(t => t.key === a.template) ? String(a.template) : templateFor(member, input.text);
        const due = typeof a.dueAt === "string" && !Number.isNaN(Date.parse(a.dueAt)) ? new Date(a.dueAt).toISOString() : null;
        actions.push({ type: "request_report", memberId: member.id, memberName: member.name, template, title: String(a.title || templateByKey(template).ru).slice(0, 160), note: String(a.note ?? "").slice(0, 1000), dueAt: due });
      } else if (a.type === "send_message" && typeof a.text === "string" && a.text.trim() && (a.memberId === "general" || (typeof a.memberId === "string" && byId.has(a.memberId) && a.memberId !== me.id))) {
        actions.push({ type: "send_message", memberId: a.memberId as string, memberName: a.memberId === "general" ? (locale === "ru" ? "Общий чат" : "General") : byId.get(a.memberId as string)!.name, text: a.text.slice(0, 4000) });
      }
    }
    if (!out.reply && !actions.length) throw new Error("empty");
    return { reply: String(out.reply ?? "").slice(0, 3000), actions: actions.slice(0, 5), mode: "model" };
  } catch (error) {
    if (!(error instanceof Error && error.message === "NO_MODEL")) console.error("Team assistant model failed", error instanceof Error ? error.message : error);
    return planTeamRules(input.text, members, me.id, locale, input.tasks);
  }
}

export type ReportDraft = { fields: Record<string, string>; issues: string[]; summary: string; mode: "model" | "rules" };

/** Checks a report draft for mistakes and lays it out in the template's fields. */
export async function assistReport(input: { template: ReportTemplate; draft: string; fields: Record<string, string>; title: string; note: string | null; author: string; locale: "ru" | "en" }): Promise<ReportDraft> {
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
    const out = await jsonCompletion<{ fields?: Record<string, unknown>; issues?: unknown[]; summary?: string }>(system, `Notes:\n${input.draft}\n${existing ? `\nAlready filled:\n${existing}` : ""}`, 1600);
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

