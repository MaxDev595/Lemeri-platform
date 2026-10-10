"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Pause, Play, RotateCcw, Save, Sparkles } from "lucide-react";
import { HANDOFF_PRESETS, LANGUAGES, type SalesProfile } from "@/lib/ai/profile";
import { RichText } from "../website-widget";
import { Chips, Field, Section, Segmented, Toggle } from "./ui";

// «ИИ-сотрудник»: who the AI seller is, how it sells, when it asks for contacts and
// when it calls a person — plus a live test chat on the right (real AI, real knowledge).

type Employee = { id: string; name: string; role: string; status: string; goal: string; tone: string; instructions: string; profile: SalesProfile; permissions: Array<{ actionKey: string; enabled: boolean }> };

const T = {
  ru: {
    loading: "Загружаем настройки…", loadFailed: "Не удалось загрузить настройки сотрудника", retry: "Повторить",
    save: "Сохранить", saving: "Сохраняем…", saved: "Настройки сохранены — ИИ уже отвечает по-новому", saveFailed: "Не удалось сохранить. Проверьте поля.",
    working: "Работает на сайте", paused: "На паузе", start: "Запустить", pause: "Пауза", started: "ИИ-продавец запущен", pausedToast: "ИИ-продавец на паузе",
    identity: "Кто это", identityCopy: "Имя и характер видят посетители сайта.",
    name: "Имя сотрудника", role: "Роль", roles: { SALES: "Продавец-консультант", ADMINISTRATOR: "Администратор", SUPPORT: "Поддержка" },
    tone: "Тон", tones: { WARM_PROFESSIONAL: "Тёплый и профессиональный", CONCISE_BUSINESS: "Краткий и деловой", FRIENDLY: "Дружелюбный" },
    language: "Язык ответов", languages: { auto: "Как пишет посетитель", ru: "Русский", en: "English", uk: "Українська", kk: "Қазақша", uz: "O‘zbekcha", de: "Deutsch", es: "Español", fr: "Français", tr: "Türkçe" },
    personality: "Характер", personalityHint: "Например: «энергичный, с лёгким юмором, обращается на «вы»»",
    goals: "Цели диалога", goalsCopy: "Что главное для бизнеса в каждом разговоре.",
    primaryGoal: "Главная цель", primary: { lead: "Получить заявку", sale: "Довести до покупки", consult: "Проконсультировать" },
    goal: "Задача сотрудника", goalHint: "Одной-двумя фразами: что продаёт и кому помогает",
    extraGoals: "Дополнительные цели", extraGoalsHint: "Например: «предлагать подписку», «узнавать, откуда узнали о нас»",
    selling: "Продажи", sellingCopy: "Подбор, сравнение, возражения — только по вашей базе знаний.",
    upsell: "Предлагать дополнительные товары", upsellHint: "Один уместный совет: аксессуар, расширенный вариант",
    askBudget: "Уточнять бюджет", askBudgetHint: "И подбирать варианты под него",
    orderUrl: "Страница заказа или каталога", orderUrlHint: "Куда направлять, когда клиент готов купить",
    leads: "Сбор заявок", leadsCopy: "Как и когда ИИ просит контакты.",
    collect: "Собирать заявки в чате", collectHint: "ИИ сам создаёт заявку, когда клиент оставил контакты",
    timing: "Когда просить контакты", timings: { when_interested: "При явном интересе", early: "Сразу после первого ответа", on_request: "Только если клиент сам захочет" },
    requirePhone: "Обязателен телефон", requireEmail: "Обязателен email", extraFields: "Что ещё спросить", extraFieldsHint: "Например: «город доставки», «размер»",
    privacyUrl: "Политика конфиденциальности", privacyUrlHint: "Ссылка покажется рядом с согласием на передачу контактов",
    handoff: "Передача менеджеру", handoffCopy: "Когда ИИ останавливается и зовёт человека. Вы получите уведомление.",
    handoffOn: "Передавать сложные диалоги менеджеру", notify: "Уведомлять о важных событиях",
    presets: { complaint: "Жалоба", discount: "Просит скидку", custom_order: "Нестандартный заказ", legal: "Юр./мед. вопрос", angry: "Клиент раздражён", asks_human: "Просит человека" },
    handoffWhen: "Своё правило", handoffWhenHint: "Например: «заказ больше 100 000 ₽»",
    rules: "Инструкции и ограничения", rulesCopy: "ИИ следует им в каждом ответе.",
    instructions: "Инструкции", instructionsHint: "Как вести разговор, что важно подчеркнуть, порядок вопросов",
    restrictions: "Ограничения", restrictionsHint: "Чего нельзя: обсуждать конкурентов, обещать сроки, давать скидки…",
    test: "Проверка ответов", testCopy: "Настоящий ИИ с вашей базой знаний. Диалог появится в «Диалоги и заявки».",
    testEmpty: "Спросите так, как спросил бы клиент", testPlaceholder: "Например: что посоветуете до 5000 ₽?", reset: "Новый диалог", testFailed: "ИИ не ответил",
    noChannel: "Чтобы проверить ответы, создайте карточку в разделе «Карточка и подключение».",
    samples: ["Что посоветуете?", "Сколько стоит доставка?", "Хочу оформить заказ"],
  },
  en: {
    loading: "Loading settings…", loadFailed: "Couldn't load the employee settings", retry: "Retry",
    save: "Save", saving: "Saving…", saved: "Saved — the AI already answers the new way", saveFailed: "Couldn't save. Check the fields.",
    working: "Live on the website", paused: "Paused", start: "Start", pause: "Pause", started: "AI seller started", pausedToast: "AI seller paused",
    identity: "Identity", identityCopy: "Visitors see the name and character.",
    name: "Employee name", role: "Role", roles: { SALES: "Sales consultant", ADMINISTRATOR: "Administrator", SUPPORT: "Support" },
    tone: "Tone", tones: { WARM_PROFESSIONAL: "Warm and professional", CONCISE_BUSINESS: "Concise and businesslike", FRIENDLY: "Friendly" },
    language: "Reply language", languages: { auto: "Visitor's language", ru: "Русский", en: "English", uk: "Українська", kk: "Қазақша", uz: "O‘zbekcha", de: "Deutsch", es: "Español", fr: "Français", tr: "Türkçe" },
    personality: "Character", personalityHint: "e.g. “energetic, a little humour, polite”",
    goals: "Conversation goals", goalsCopy: "What matters most for the business.",
    primaryGoal: "Main goal", primary: { lead: "Get a request", sale: "Lead to purchase", consult: "Consult" },
    goal: "Employee's job", goalHint: "One or two sentences: what you sell and to whom",
    extraGoals: "Additional goals", extraGoalsHint: "e.g. “offer the subscription”",
    selling: "Selling", sellingCopy: "Recommendations, comparisons, objections — only from your knowledge base.",
    upsell: "Suggest complementary products", upsellHint: "One relevant tip", askBudget: "Ask about budget", askBudgetHint: "And suggest options within it",
    orderUrl: "Order or catalog page", orderUrlHint: "Where to send a visitor ready to buy",
    leads: "Requests", leadsCopy: "How and when the AI asks for contacts.",
    collect: "Collect requests in chat", collectHint: "The AI creates a request when the visitor shares contacts",
    timing: "When to ask for contacts", timings: { when_interested: "On clear interest", early: "After the first answer", on_request: "Only if the visitor wants" },
    requirePhone: "Phone required", requireEmail: "Email required", extraFields: "Also ask", extraFieldsHint: "e.g. “delivery city”",
    privacyUrl: "Privacy policy", privacyUrlHint: "Shown next to the consent checkbox",
    handoff: "Handoff to a manager", handoffCopy: "When the AI stops and calls a person. You get a notification.",
    handoffOn: "Hand complex dialogs to a manager", notify: "Notify about important events",
    presets: { complaint: "Complaint", discount: "Asks for discount", custom_order: "Custom order", legal: "Legal/medical", angry: "Upset visitor", asks_human: "Asks for a person" },
    handoffWhen: "Custom rule", handoffWhenHint: "e.g. “order above $1000”",
    rules: "Instructions and restrictions", rulesCopy: "Followed in every reply.",
    instructions: "Instructions", instructionsHint: "How to lead the conversation", restrictions: "Restrictions", restrictionsHint: "What the AI must not do",
    test: "Test replies", testCopy: "The real AI with your knowledge. The dialog appears in Conversations & requests.",
    testEmpty: "Ask like a customer would", testPlaceholder: "e.g. what do you recommend under $50?", reset: "New dialog", testFailed: "The AI didn't answer",
    noChannel: "Create the website card first (Card & installation) to test replies.",
    samples: ["What do you recommend?", "How much is delivery?", "I want to order"],
  },
} as const;

export function EmployeeStudio({ locale, employeeId, notify, refresh, hasCard }: { locale: string; employeeId: string; notify: (text: string) => void; refresh: () => void; hasCard: boolean }) {
  const c = T[locale === "en" ? "en" : "ru"];
  const [value, setValue] = useState<Employee | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try { const response = await fetch(`/api/employees/${employeeId}`, { cache: "no-store" }); if (!response.ok) throw new Error(); setValue(await response.json()); }
    catch { setFailed(true); }
  }, [employeeId]);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <div className="sxState"><p>{c.loadFailed}</p><button className="btn" onClick={() => void load()}>{c.retry}</button></div>;
  if (!value) return <div className="sxState"><span className="sxSpinner"/>{c.loading}</div>;

  const set = <K extends keyof Employee>(key: K, next: Employee[K]) => { setValue({ ...value, [key]: next }); setDirty(true); };
  const setProfile = <K extends keyof SalesProfile>(key: K, next: SalesProfile[K]) => { setValue({ ...value, profile: { ...value.profile, [key]: next } }); setDirty(true); };
  const permission = (key: string) => value.permissions.find(item => item.actionKey === key)?.enabled ?? false;
  const setPermission = async (key: string, enabled: boolean) => {
    const response = await fetch("/api/actions/permissions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId, actionKey: key, enabled }) });
    if (response.ok) setValue(current => current && ({ ...current, permissions: current.permissions.some(item => item.actionKey === key) ? current.permissions.map(item => item.actionKey === key ? { ...item, enabled } : item) : [...current.permissions, { actionKey: key, enabled }] }));
    else notify(c.saveFailed);
  };
  const save = async (event?: FormEvent) => {
    event?.preventDefault(); setSaving(true);
    try {
      const response = await fetch(`/api/employees/${employeeId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: value.name, role: value.role, goal: value.goal, tone: value.tone, instructions: value.instructions, profile: value.profile }) });
      if (!response.ok) throw new Error();
      setDirty(false); notify(c.saved); refresh();
    } catch { notify(c.saveFailed); } finally { setSaving(false); }
  };
  const running = value.status === "ACTIVE";
  const toggleRunning = async () => {
    const status = running ? "PAUSED" : "ACTIVE";
    const response = await fetch(`/api/employees/${employeeId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) { set("status", status); setDirty(false); notify(status === "ACTIVE" ? c.started : c.pausedToast); refresh(); } else notify(c.saveFailed);
  };
  const p = value.profile;

  return <div className="sxStudio">
    <form className="sxForm" onSubmit={save}>
      <div className="sxStatusBar"><span className={running ? "status success" : "status paused"}>{running ? c.working : c.paused}</span><button type="button" className={running ? "btn" : "primary"} onClick={toggleRunning}>{running ? <Pause size={15}/> : <Play size={15}/>}{running ? c.pause : c.start}</button></div>
      <Section title={c.identity} copy={c.identityCopy}>
        <div className="sxGrid">
          <Field label={c.name}><input value={value.name} onChange={e => set("name", e.target.value)} minLength={2} maxLength={60} required/></Field>
          <Field label={c.role}><select value={value.role} onChange={e => set("role", e.target.value)}>{Object.entries(c.roles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label={c.tone}><select value={value.tone} onChange={e => set("tone", e.target.value)}>{Object.entries(c.tones).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label={c.language}><select value={p.language} onChange={e => setProfile("language", e.target.value as SalesProfile["language"])}>{LANGUAGES.map(key => <option key={key} value={key}>{c.languages[key]}</option>)}</select></Field>
          <Field wide label={c.personality} hint={c.personalityHint}><input value={p.personality} onChange={e => setProfile("personality", e.target.value)} maxLength={600}/></Field>
        </div>
      </Section>
      <Section title={c.goals} copy={c.goalsCopy}>
        <Segmented label={c.primaryGoal} value={p.primaryGoal} onChange={next => setProfile("primaryGoal", next)} options={(["lead", "sale", "consult"] as const).map(key => ({ value: key, label: c.primary[key] }))}/>
        <Field wide label={c.goal} hint={c.goalHint}><textarea rows={2} value={value.goal} onChange={e => set("goal", e.target.value)} minLength={10} maxLength={500} required/></Field>
        <Field wide label={c.extraGoals} hint={c.extraGoalsHint}><input value={p.goals} onChange={e => setProfile("goals", e.target.value)} maxLength={800}/></Field>
      </Section>
      <Section title={c.selling} copy={c.sellingCopy}>
        <Toggle label={c.upsell} hint={c.upsellHint} checked={p.upsell} onChange={next => setProfile("upsell", next)}/>
        <Toggle label={c.askBudget} hint={c.askBudgetHint} checked={p.askBudget} onChange={next => setProfile("askBudget", next)}/>
        <Field wide label={c.orderUrl} hint={c.orderUrlHint}><input type="url" value={p.orderUrl} onChange={e => setProfile("orderUrl", e.target.value)} placeholder="https://" maxLength={500}/></Field>
      </Section>
      <Section title={c.leads} copy={c.leadsCopy}>
        <Toggle label={c.collect} hint={c.collectHint} checked={permission("createLead")} onChange={next => void setPermission("createLead", next)}/>
        <Field wide label={c.timing}><Segmented label={c.timing} value={p.contactTiming} onChange={next => setProfile("contactTiming", next)} options={(["when_interested", "early", "on_request"] as const).map(key => ({ value: key, label: c.timings[key] }))}/></Field>
        <div className="sxGrid">
          <Toggle label={c.requirePhone} checked={p.requirePhone} onChange={next => setProfile("requirePhone", next)}/>
          <Toggle label={c.requireEmail} checked={p.requireEmail} onChange={next => setProfile("requireEmail", next)}/>
        </div>
        <Field wide label={c.extraFields} hint={c.extraFieldsHint}><input value={p.extraFields} onChange={e => setProfile("extraFields", e.target.value)} maxLength={300}/></Field>
        <Field wide label={c.privacyUrl} hint={c.privacyUrlHint}><input type="url" value={p.privacyUrl} onChange={e => setProfile("privacyUrl", e.target.value)} placeholder="https://" maxLength={500}/></Field>
      </Section>
      <Section title={c.handoff} copy={c.handoffCopy}>
        <Toggle label={c.handoffOn} checked={permission("handoffToHuman")} onChange={next => void setPermission("handoffToHuman", next)}/>
        <Toggle label={c.notify} checked={permission("notifyManager")} onChange={next => void setPermission("notifyManager", next)}/>
        <Chips values={p.handoffPresets} onChange={next => setProfile("handoffPresets", next)} options={HANDOFF_PRESETS.map(key => ({ value: key, label: c.presets[key] }))}/>
        <Field wide label={c.handoffWhen} hint={c.handoffWhenHint}><input value={p.handoffWhen} onChange={e => setProfile("handoffWhen", e.target.value)} maxLength={800}/></Field>
      </Section>
      <Section title={c.rules} copy={c.rulesCopy}>
        <Field wide label={c.instructions} hint={c.instructionsHint}><textarea rows={4} value={value.instructions} onChange={e => set("instructions", e.target.value)} maxLength={4000}/></Field>
        <Field wide label={c.restrictions} hint={c.restrictionsHint}><textarea rows={3} value={p.restrictions} onChange={e => setProfile("restrictions", e.target.value)} maxLength={1500}/></Field>
      </Section>
      <div className={dirty ? "sxSaveBar show" : "sxSaveBar"}><button className="primary" disabled={saving}><Save size={15}/>{saving ? c.saving : c.save}</button></div>
    </form>
    <TestChat locale={locale} employeeId={employeeId} hasCard={hasCard} copy={c} dirty={dirty}/>
  </div>;
}

function TestChat({ locale, employeeId, hasCard, copy, dirty }: { locale: string; employeeId: string; hasCard: boolean; copy: (typeof T)["ru"] | (typeof T)["en"]; dirty: boolean }) {
  const [session, setSession] = useState(() => `playground-${employeeId}-${Date.now().toString(36)}`);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [busy, setBusy] = useState(false);
  const stream = useRef<HTMLDivElement>(null);
  useEffect(() => { stream.current?.scrollTo({ top: stream.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setMessages(value => [...value, { role: "user", text }]); setBusy(true);
    try {
      const response = await fetch(`/api/widget/${employeeId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visitorId: session, conversationId, messageId: crypto.randomUUID(), name: locale === "en" ? "Test visitor" : "Тестовый посетитель", message: text }) });
      const body = await response.json().catch(() => ({})) as { message?: string; conversationId?: string };
      if (body.conversationId) setConversationId(body.conversationId);
      setMessages(value => [...value, { role: "assistant", text: response.ok && body.message ? body.message : copy.testFailed }]);
    } catch { setMessages(value => [...value, { role: "assistant", text: copy.testFailed }]); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const text = String(new FormData(form).get("message") ?? ""); form.reset(); void send(text); };
  return <aside className="sxTest">
    <header><Sparkles size={15}/><div><b>{copy.test}</b><small>{copy.testCopy}</small></div><button type="button" className="iconButton" title={copy.reset} aria-label={copy.reset} onClick={() => { setSession(`playground-${employeeId}-${Date.now().toString(36)}`); setConversationId(undefined); setMessages([]); }}><RotateCcw size={15}/></button></header>
    {dirty && <p className="sxNote">{locale === "en" ? "Save the settings to test the new behaviour." : "Сохраните настройки, чтобы проверить новое поведение."}</p>}
    <div className="sxTestStream" ref={stream}>
      {!hasCard ? <p className="sxMuted">{copy.noChannel}</p> : messages.length === 0 ? <div className="sxTestEmpty"><p>{copy.testEmpty}</p><div className="sxChips">{copy.samples.map(sample => <button type="button" key={sample} onClick={() => void send(sample)}>{sample}</button>)}</div></div>
        : messages.map((message, index) => <div key={index} className={`sxBubble ${message.role}`}><RichText text={message.text}/></div>)}
      {busy && <div className="sxBubble assistant typing"><i/><i/><i/></div>}
    </div>
    <form onSubmit={submit}><input name="message" placeholder={copy.testPlaceholder} disabled={!hasCard} autoComplete="off" maxLength={4000}/><button className="primary" disabled={busy || !hasCard} aria-label="→"><ArrowUp size={16}/></button></form>
  </aside>;
}
