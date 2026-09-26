// Rule-based assistant used when no language model is configured (development)
// or the model is unavailable. It understands the most common requests and uses
// the same tools, so answers are always grounded in real workspace data.
import { SECTION_IDS, SECTION_TITLES, searchGuide, type SectionId } from "./guide";
import { runTool, LEAD_STAGE, APPT_STATUS, type ActionProposal, type AssistantContext } from "./tools";
import type { ChatTurn } from "./engine";

type Plan = { reply: string; sections: SectionId[]; navigate?: SectionId; proposals: ActionProposal[] };
type Row = Record<string, unknown>;

const norm = (value: string) => value.toLocaleLowerCase("ru").replace(/ё/g, "е");
const has = (text: string, ...patterns: RegExp[]) => patterns.some(p => p.test(text));
const CHANNEL_WORDS: Array<[RegExp, string]> = [[/телеграм|telegram|\btg\b/, "TELEGRAM"], [/ватсап|вацап|whatsapp|\bwa\b/, "WHATSAPP"], [/e-?mail|почт|емейл|имейл|емаил/, "EMAIL"], [/сайт|виджет|website|widget/, "WEBSITE"]];
const CHANNEL_LABEL: Record<string, string> = { WEBSITE: "Сайт / Website", TELEGRAM: "Telegram", WHATSAPP: "WhatsApp", EMAIL: "Email" };

function when(ctx: AssistantContext, value: unknown) {
  if (typeof value !== "string") return "—";
  return new Date(value).toLocaleString(ctx.locale === "ru" ? "ru-RU" : "en-GB", { timeZone: ctx.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
const t = (ctx: AssistantContext, ru: string, en: string) => (ctx.locale === "ru" ? ru : en);

function sectionFrom(text: string): SectionId | undefined {
  for (const id of SECTION_IDS) {
    const titles = [SECTION_TITLES[id].ru, SECTION_TITLES[id].en].map(norm);
    if (titles.some(title => text.includes(title.slice(0, Math.max(5, title.length - 2))))) return id;
  }
  if (/crm|срм/.test(text)) return "integrations";
  return undefined;
}

async function overview(ctx: AssistantContext): Promise<Plan> {
  const data = (await runTool(ctx, "workspace_overview", {})).data as Row & { employees: Row[]; channels: Row[]; missingChannels: string[]; crm: Row[]; counts: Record<string, number>; leadsByStage: Record<string, number>; topKnowledgeGaps: Row[] };
  const lines = [
    t(ctx, "**Сводка по пространству**", "**Workspace summary**"),
    ...data.employees.map(e => `- ${t(ctx, "Сотрудник", "Employee")} **${e.name}** — ${e.status === "ACTIVE" ? t(ctx, "работает", "active") : String(e.status).toLowerCase()}`),
    `- ${t(ctx, "Каналы", "Channels")}: ${data.channels.filter(c => c.status === "CONNECTED").map(c => CHANNEL_LABEL[String(c.type)]).join(", ") || t(ctx, "не подключены", "none connected")}`,
    `- CRM: ${data.crm.length ? data.crm.map(c => String(c.status)).join(", ") : t(ctx, "не подключена", "not connected")}`,
    `- ${t(ctx, "Клиентов", "Customers")}: **${data.counts.customers}**, ${t(ctx, "открытых диалогов", "open conversations")}: **${data.counts.openConversations}**, ${t(ctx, "ждут менеджера", "need a manager")}: **${data.counts.conversationsNeedingOrWithManager}**`,
    `- ${t(ctx, "Лиды", "Leads")}: ${Object.entries(data.leadsByStage).map(([k, v]) => `${LEAD_STAGE[k as keyof typeof LEAD_STAGE]?.[ctx.locale] ?? k} ${v}`).join(", ") || "0"}; ${t(ctx, "предстоящих записей", "upcoming appointments")}: **${data.counts.upcomingAppointments}**`,
  ];
  if (data.missingChannels.length) lines.push(t(ctx, `Можно подключить: ${data.missingChannels.map(c => CHANNEL_LABEL[c]).join(", ")}.`, `You can still connect: ${data.missingChannels.map(c => CHANNEL_LABEL[c]).join(", ")}.`));
  if (data.topKnowledgeGaps.length) lines.push(t(ctx, `Частые вопросы без ответа: ${data.topKnowledgeGaps.slice(0, 3).map(g => `«${g.question}»`).join(", ")}.`, `Frequent unanswered questions: ${data.topKnowledgeGaps.slice(0, 3).map(g => `“${g.question}”`).join(", ")}.`));
  return { reply: lines.join("\n"), sections: ["analytics", ...(data.missingChannels.length ? ["channels" as const] : [])], proposals: [] };
}

export async function planWithoutModel(ctx: AssistantContext, history: ChatTurn[], page?: SectionId): Promise<Plan> {
  const raw = history.filter(turn => turn.role === "user").at(-1)?.content ?? "";
  const text = norm(raw);
  const single = async (tool: string, args: Record<string, unknown>) => {
    const outcome = await runTool(ctx, tool, args);
    const proposals = outcome.proposal ? [outcome.proposal] : [];
    const error = (outcome.data as Row)?.error;
    return { outcome, proposals, error: typeof error === "string" ? error : undefined };
  };

  // Settings changes.
  if (has(text, /тем[аыуе]|theme|оформлени/)) {
    const theme = has(text, /т[е]мн|черн|dark|ночн/) ? "dark" : has(text, /светл|бел|light|дневн/) ? "light" : has(text, /систем|system|авто/) ? "system" : null;
    if (theme) {
      const r = await single("propose_set_theme", { theme });
      return { reply: r.error ?? t(ctx, "Подготовил смену темы — подтвердите в карточке ниже.", "The theme change is ready — confirm it below."), sections: [], proposals: r.proposals };
    }
  }
  if (has(text, /язык|language/) && has(text, /англ|english|русск|russian/)) {
    const r = await single("propose_set_language", { locale: has(text, /англ|english/) ? "en" : "ru" });
    return { reply: r.error ?? t(ctx, "Подготовил смену языка — подтвердите ниже.", "The language change is ready — confirm below."), sections: [], proposals: r.proposals };
  }
  if (has(text, /уведомлен|notification/) && has(text, /прочит|read|очист|clear/)) {
    const r = await single("propose_mark_notifications_read", {});
    return { reply: r.error ?? t(ctx, "Готово к подтверждению.", "Ready for confirmation."), sections: [], proposals: r.proposals };
  }

  // Navigation.
  if (has(text, /^(?:открой|перейди|покажи раздел|зайди в|зайди|open|go to|show me the)(?:\s|$)/)) {
    const section = sectionFrom(text);
    if (section) return { reply: t(ctx, `Открываю раздел «${SECTION_TITLES[section].ru}».`, `Opening “${SECTION_TITLES[section].en}”.`), sections: [], navigate: section, proposals: [] };
  }

  // How-to questions go to the platform guide first.
  const howTo = has(text, /как |how |где |where |что так|what is|можно ли|can i|зачем|помоги настро|настро|подключ|connect|set up|setup|функционал|возможност|что умеешь|what can/);
  if (howTo) {
    const found = searchGuide(text, 2);
    if (found.length) return { reply: found.map(e => e[ctx.locale]).join("\n\n"), sections: [...new Set(found.map(e => e.section))], proposals: [] };
  }

  const channel = CHANNEL_WORDS.find(([re]) => re.test(text))?.[1];
  if (has(text, /crm|срм|интеграц|синхрон|webhook|вебхук/)) {
    const data = (await runTool(ctx, "crm_status", {})).data as { integrations: Row[]; queue: { pending: number; failed: number } };
    if (!data.integrations.length) return { reply: t(ctx, "CRM пока не подключена. Добавьте Webhook CRM в «Интеграциях»: HTTPS-адрес и секрет подписи, затем нажмите «Проверить».", "No CRM is connected yet. Add a CRM webhook in Integrations: an HTTPS endpoint and signing secret, then press Test."), sections: ["integrations"], proposals: [] };
    const lines = data.integrations.map(i => `- **${i.provider}** — ${i.status}${i.lastSyncAt ? `, ${t(ctx, "синхронизация", "last sync")} ${when(ctx, i.lastSyncAt)}` : ""}${i.lastError ? `\n  ${t(ctx, "Ошибка", "Error")}: ${i.lastError}` : ""}`);
    lines.push(t(ctx, `Очередь событий: ${data.queue.pending} в работе, ${data.queue.failed} с ошибкой.`, `Event queue: ${data.queue.pending} pending, ${data.queue.failed} failed.`));
    return { reply: lines.join("\n"), sections: ["integrations"], proposals: [] };
  }
  if (has(text, /лид|lead|заявк|сделк/)) {
    const stage = has(text, /нов|new/) ? "NEW" : has(text, /квалиф|qualif/) ? "QUALIFIED" : has(text, /выигр|сделк|won/) ? "WON" : has(text, /потер|lost/) ? "LOST" : undefined;
    const rows = (await runTool(ctx, "list_leads", { stage, limit: 10 })).data as Array<Row & { customer: Row }>;
    if (!rows.length) return { reply: t(ctx, "Лидов пока нет. Их создаёт ИИ-сотрудник, когда клиент проявляет интерес — проверьте, что действие «Создавать лиды» разрешено.", "No leads yet. The AI employee creates them when a customer shows interest — make sure “Create leads” is enabled."), sections: ["leads", "actions"], proposals: [] };
    return { reply: [t(ctx, `**Лиды** (${rows.length}):`, `**Leads** (${rows.length}):`), ...rows.map(l => `- **${l.customer.name}** — ${LEAD_STAGE[l.stage as keyof typeof LEAD_STAGE]?.[ctx.locale] ?? l.stage}${l.interest ? `, ${l.interest}` : ""}${l.customer.phone ? `, ${l.customer.phone}` : ""} · ${when(ctx, l.createdAt)}`)].join("\n"), sections: ["leads"], proposals: [] };
  }
  if (has(text, /запис|appointment|брон|календар|приём|прием/)) {
    const period = has(text, /сегодня|today/) ? "today" : has(text, /прошл|past|был/) ? "past" : "upcoming";
    const data = (await runTool(ctx, "list_appointments", { period, limit: 10 })).data as { rows: Array<Row & { customer: Row }> };
    if (!data.rows.length) return { reply: t(ctx, "Записей в этом периоде нет.", "No appointments in this period."), sections: ["appointments"], proposals: [] };
    return { reply: [t(ctx, "**Записи:**", "**Appointments:**"), ...data.rows.map(a => `- ${when(ctx, a.startsAt)} — **${a.customer.name}**, ${a.service} (${APPT_STATUS[a.status as keyof typeof APPT_STATUS]?.[ctx.locale] ?? a.status})`)].join("\n"), sections: ["appointments"], proposals: [] };
  }
  if (channel || has(text, /диалог|переписк|сообщени|чат|conversation|chat|messages|соцсет|social/)) {
    const status = has(text, /менеджер|manager|внимани|attention|помощ/) ? "NEEDS_ATTENTION" : undefined;
    const rows = (await runTool(ctx, "list_conversations", { channel, status, limit: 8 })).data as Array<Row & { customer: Row; lastMessage: Row | null }>;
    if (!rows.length) return { reply: channel ? t(ctx, `В канале ${CHANNEL_LABEL[channel]} диалогов пока нет. Проверьте, что канал подключён в разделе «Каналы».`, `No conversations in ${CHANNEL_LABEL[channel]} yet. Check the channel is connected in Channels.`) : t(ctx, "Диалогов пока нет.", "No conversations yet."), sections: ["channels"], proposals: [] };
    return { reply: [t(ctx, `**Последние диалоги${channel ? ` · ${CHANNEL_LABEL[channel]}` : ""}:**`, `**Recent conversations${channel ? ` · ${CHANNEL_LABEL[channel]}` : ""}:**`), ...rows.map(v => `- **${v.customer.name}** (${CHANNEL_LABEL[String(v.channel)]}) · ${when(ctx, v.updatedAt)}${v.status === "NEEDS_ATTENTION" ? t(ctx, " · нужен менеджер", " · needs a manager") : ""}${v.lastMessage ? `\n  ${v.lastMessage.from === "customer" ? t(ctx, "Клиент", "Customer") : t(ctx, "Ответ", "Reply")}: ${v.lastMessage.text}` : ""}`)].join("\n"), sections: ["conversations"], proposals: [] };
  }
  if (has(text, /клиент|customer|контакт|покупател/)) {
    const query = raw.replace(/.*?(?:клиент[а-я]*|customer[s]?|контакт[а-я]*|покупател[а-я]*)\s*/i, "").replace(/[?!.,]/g, "").trim().split(/\s+/).filter(w => w.length > 1 && !/^(по|о|об|про|about|все|all|мои|my|найди|find|собери|инфу|информацию)$/i.test(w)).slice(0, 2).join(" ");
    const rows = (await runTool(ctx, "search_customers", { query, limit: 8 })).data as Row[];
    if (rows.length === 1) {
      const p = (await runTool(ctx, "customer_profile", { customerId: rows[0].id })).data as Row & { conversations: Array<Row & { lastMessages: Row[] }>; leads: Row[]; appointments: Row[] };
      return { reply: [
        `**${p.name}**${p.phone ? ` · ${p.phone}` : ""}${p.email ? ` · ${p.email}` : ""}`,
        ...p.conversations.map(v => `- ${CHANNEL_LABEL[String(v.channel)]}: ${v.summary ?? v.lastMessages.at(-1)?.text ?? "—"}`),
        p.leads.length ? `- ${t(ctx, "Лиды", "Leads")}: ${p.leads.map(l => `${LEAD_STAGE[l.stage as keyof typeof LEAD_STAGE]?.[ctx.locale] ?? l.stage}${l.interest ? ` (${l.interest})` : ""}`).join(", ")}` : "",
        p.appointments.length ? `- ${t(ctx, "Записи", "Appointments")}: ${p.appointments.map(a => `${a.service} ${when(ctx, a.startsAt instanceof Date ? a.startsAt.toISOString() : a.startsAt)}`).join(", ")}` : "",
      ].filter(Boolean).join("\n"), sections: ["conversations", "leads"], proposals: [] };
    }
    if (!rows.length) return { reply: query ? t(ctx, `Клиентов по запросу «${query}» не нашёл.`, `No customers match “${query}”.`) : t(ctx, "Клиентов пока нет.", "No customers yet."), sections: ["conversations"], proposals: [] };
    return { reply: [t(ctx, `**Клиенты** (${rows.length}):`, `**Customers** (${rows.length}):`), ...rows.map(c => `- **${c.name}**${c.phone ? ` · ${c.phone}` : ""}${c.email ? ` · ${c.email}` : ""} — ${(c.channels as string[]).map(ch => CHANNEL_LABEL[ch]).join(", ") || "—"}; ${t(ctx, "лидов", "leads")} ${c.leads}, ${t(ctx, "записей", "appointments")} ${c.appointments}`), t(ctx, "Напишите имя клиента, и я соберу по нему всю информацию.", "Name a customer and I will collect everything about them.")].join("\n"), sections: ["conversations"], proposals: [] };
  }
  if (has(text, /знани|knowledge|пробел|gap|без ответа|unanswered/)) {
    const data = (await runTool(ctx, "knowledge_overview", {})).data as { sources: Row[]; gaps: Row[] };
    return { reply: [t(ctx, `**Знания**: ${data.sources.length} источн.`, `**Knowledge**: ${data.sources.length} sources`), ...data.sources.slice(0, 8).map(s => `- ${s.title} (${s.type}) — ${s.status}`), ...(data.gaps.length ? [t(ctx, "Вопросы без ответа:", "Unanswered questions:"), ...data.gaps.slice(0, 5).map(g => `- «${g.question}» ×${g.occurrences}`)] : [])].join("\n"), sections: ["knowledge"], proposals: [] };
  }
  if (has(text, /сводк|обзор|статус|что происходит|как дела|summary|overview|status|итог|отчет|report/)) return overview(ctx);

  const found = searchGuide(text, 2);
  if (found.length) return { reply: found.map(e => e[ctx.locale]).join("\n\n"), sections: [...new Set(found.map(e => e.section))], proposals: [] };
  const section = sectionFrom(text);
  if (section) return { reply: t(ctx, `Открываю «${SECTION_TITLES[section].ru}».`, `Opening “${SECTION_TITLES[section].en}”.`), sections: [], navigate: section, proposals: [] };
  return {
    reply: t(ctx,
      "Я помощник Lemiri. Могу:\n- объяснить любой раздел и помочь с настройкой каналов, CRM и знаний;\n- собрать информацию о клиентах, диалогах из Telegram, WhatsApp, Email и сайта, лидах и записях;\n- открыть нужный раздел;\n- подготовить изменение (этап лида, пауза сотрудника, тема, знания) — вы подтверждаете его кнопкой.\nНапример: «Покажи новые лиды», «Что пишут в Telegram?», «Как подключить WhatsApp?».",
      "I am the Lemiri assistant. I can:\n- explain any section and help set up channels, CRM and knowledge;\n- collect information about customers, conversations from Telegram, WhatsApp, Email and the website, leads and appointments;\n- open a section;\n- prepare a change (lead stage, pausing an employee, theme, knowledge) that you confirm with a button.\nFor example: “Show new leads”, “What's new in Telegram?”, “How do I connect WhatsApp?”."),
    sections: page && page !== "overview" ? [page] : [], proposals: [],
  };
}
