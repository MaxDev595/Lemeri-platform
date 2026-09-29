"use client";

import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type Locale = "ru" | "en";
export type Stage = { id: string; name: string; color: string; kind: "OPEN" | "WON" | "LOST"; probability: number; sort: number; pipelineId: string };
export type Pipeline = { id: string; name: string; isDefault: boolean; stages: Stage[] };
export type Member = { id: string; name: string; email: string; role: string; me: boolean };
export type FieldDef = { id: string; entity: "CUSTOMER" | "DEAL" | "COMPANY"; key: string; label: string; type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN" | "URL"; options: string[]; sort: number };
export type Product = { id: string; name: string; sku: string | null; category: string | null; description: string | null; price: number; currency: string; durationMin: number | null; active: boolean };
export type Bootstrap = { pipelines: Pipeline[]; members: Member[]; fields: FieldDef[]; products: Product[]; tags: string[]; role: string };
export type Opened = { type: "deal" | "contact" | "company"; id: string } | null;

const dict = {
  ru: {
    loading: "Загрузка…", failed: "Не удалось выполнить действие", saved: "Сохранено", deleted: "Удалено", cancel: "Отмена", save: "Сохранить", create: "Создать", delete: "Удалить", edit: "Изменить", close: "Закрыть", add: "Добавить", search: "Поиск…", all: "Все", mine: "Мои", none: "—", confirmDelete: "Удалить без возможности восстановления?",
    newDeal: "Сделка", newContact: "Контакт", newCompany: "Компания", newTask: "Задача", newProduct: "Товар или услуга", title: "Название", amount: "Сумма", stage: "Этап", pipeline: "Воронка", contact: "Контакт", company: "Компания", owner: "Ответственный", expectedClose: "Плановая дата закрытия", tags: "Теги", tagPlaceholder: "Тег и Enter", source: "Источник", created: "Создано", phone: "Телефон", email: "Email", position: "Должность", notes: "Заметки", website: "Сайт", address: "Адрес", industry: "Отрасль", taxId: "ИНН", name: "Имя", description: "Описание",
    board: "Канбан", list: "Список", settings: "Настройки CRM", won: "Успешно", lost: "Отказ", open: "В работе", markWon: "Выиграна", markLost: "Проиграна", reopen: "Вернуть в работу", lostReason: "Причина отказа", lostReasonPrompt: "Почему сделка проиграна?", status: "Статус",
    items: "Товары и услуги", product: "Позиция", price: "Цена", qty: "Кол-во", discount: "Скидка %", total: "Итого", addItem: "Добавить позицию", syncAmount: "Сумма сделки = сумма позиций",
    tasks: "Задачи", timeline: "История", deals: "Сделки", contacts: "Контакты", conversations: "Диалоги", appointments: "Записи", details: "Данные", customFields: "Дополнительные поля",
    note: "Заметка", call: "Звонок", meeting: "Встреча", emailAct: "Письмо", notePlaceholder: "Заметка, итог звонка или встречи…", addNote: "Добавить в историю",
    taskTitle: "Что сделать", due: "Срок", type: "Тип", priority: "Приоритет", low: "Низкий", normal: "Обычный", high: "Высокий", todo: "Задача", overdue: "Просрочено", today: "Сегодня", tomorrow: "Завтра", later: "Позже", noDue: "Без срока", done: "Выполнено", showDone: "Показать выполненные", assignee: "Исполнитель", linkedTo: "Связано с",
    days: "дн.", inStage: "на этапе", openTasks: "задачи", noDeals: "Сделок пока нет", noContacts: "Контактов пока нет", noCompanies: "Компаний пока нет", noTasks: "Задач нет — всё сделано", noProducts: "Каталог пуст", emptyCopy: "Создайте первую запись или дождитесь заявок от ИИ-сотрудника.",
    importCsv: "Импорт CSV", exportCsv: "Экспорт CSV", duplicates: "Дубли", merge: "Объединить", mergeInto: "Объединить в", noDuplicates: "Дублей не найдено", importDone: "Импорт: создано {created}, обновлено {updated}, пропущено {skipped}", importHint: "Колонки: name, phone, email, company, position, tags, notes (или Имя, Телефон, Email, Компания, Должность, Теги, Заметки)",
    selected: "Выбрано: {n}", addTag: "Добавить тег", removeTag: "Убрать тег", assign: "Назначить", bulkDelete: "Удалить выбранные", channels: "Каналы", lastActivity: "Активность", dealsCol: "Сделки", sort: "Сортировка", sortRecent: "По активности", sortName: "По имени", sortCreated: "Новые", hasDeals: "Сделки", withOpenDeals: "С открытыми", withoutDeals: "Без сделок", page: "Стр. {page} из {pages}",
    sku: "Артикул", category: "Категория", duration: "Длительность, мин", active: "Активен", inactive: "Скрыт",
    reports: "Отчёты", period: "Период", d30: "30 дней", d90: "90 дней", d180: "Полгода", d365: "Год", kpiWon: "Выиграно", kpiWinRate: "Конверсия в успех", kpiAvg: "Средний чек", kpiCycle: "Цикл сделки", kpiForecast: "Прогноз по воронке", kpiNew: "Новые сделки", kpiContacts: "Новые контакты", kpiOverdue: "Просроченные задачи", funnel: "Воронка по этапам", revenue: "Выручка по месяцам", bySource: "Сделки по источникам", byOwner: "По менеджерам", lostReasons: "Причины отказов", count: "Кол-во", share: "Доля",
    pipelines: "Воронки", stages: "Этапы", addStage: "Добавить этап", newPipeline: "Новая воронка", makeDefault: "Основная", probability: "Вероятность %", kindOpen: "В работе", kindWon: "Успех", kindLost: "Отказ", fields: "Поля", addField: "Добавить поле", fieldLabel: "Название поля", fieldType: "Тип", options: "Варианты через запятую", entityCustomer: "Контакт", entityDeal: "Сделка", entityCompany: "Компания", tText: "Текст", tNumber: "Число", tDate: "Дата", tSelect: "Список", tBoolean: "Да/нет", tUrl: "Ссылка", yes: "Да", no: "Нет", readOnly: "Только просмотр",
    act: { NOTE: "Заметка", CALL: "Звонок", MEETING: "Встреча", EMAIL: "Письмо", DEAL_CREATED: "Создана сделка", STAGE_CHANGED: "Смена этапа", DEAL_WON: "Сделка выиграна", DEAL_LOST: "Сделка проиграна", TASK_CREATED: "Поставлена задача", TASK_DONE: "Задача выполнена", CONTACT_CREATED: "Создан контакт", CONTACT_MERGED: "Объединены контакты", AI_LEAD: "Заявка от ИИ-сотрудника", APPOINTMENT: "Запись от ИИ-сотрудника", FIELD_CHANGED: "Изменение", MESSAGE: "Сообщение" } as Record<string, string>,
  },
  en: {
    loading: "Loading…", failed: "Action failed", saved: "Saved", deleted: "Deleted", cancel: "Cancel", save: "Save", create: "Create", delete: "Delete", edit: "Edit", close: "Close", add: "Add", search: "Search…", all: "All", mine: "Mine", none: "—", confirmDelete: "Delete permanently?",
    newDeal: "Deal", newContact: "Contact", newCompany: "Company", newTask: "Task", newProduct: "Product or service", title: "Title", amount: "Amount", stage: "Stage", pipeline: "Pipeline", contact: "Contact", company: "Company", owner: "Owner", expectedClose: "Expected close date", tags: "Tags", tagPlaceholder: "Tag + Enter", source: "Source", created: "Created", phone: "Phone", email: "Email", position: "Position", notes: "Notes", website: "Website", address: "Address", industry: "Industry", taxId: "Tax ID", name: "Name", description: "Description",
    board: "Board", list: "List", settings: "CRM settings", won: "Won", lost: "Lost", open: "Open", markWon: "Won", markLost: "Lost", reopen: "Reopen", lostReason: "Lost reason", lostReasonPrompt: "Why was the deal lost?", status: "Status",
    items: "Products & services", product: "Item", price: "Price", qty: "Qty", discount: "Discount %", total: "Total", addItem: "Add item", syncAmount: "Deal amount = items total",
    tasks: "Tasks", timeline: "Timeline", deals: "Deals", contacts: "Contacts", conversations: "Conversations", appointments: "Appointments", details: "Details", customFields: "Custom fields",
    note: "Note", call: "Call", meeting: "Meeting", emailAct: "Email", notePlaceholder: "Note, call or meeting outcome…", addNote: "Add to timeline",
    taskTitle: "What to do", due: "Due", type: "Type", priority: "Priority", low: "Low", normal: "Normal", high: "High", todo: "To-do", overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", later: "Later", noDue: "No due date", done: "Done", showDone: "Show completed", assignee: "Assignee", linkedTo: "Linked to",
    days: "d", inStage: "in stage", openTasks: "tasks", noDeals: "No deals yet", noContacts: "No contacts yet", noCompanies: "No companies yet", noTasks: "No tasks — all done", noProducts: "Catalog is empty", emptyCopy: "Create the first record or wait for leads from your AI employee.",
    importCsv: "Import CSV", exportCsv: "Export CSV", duplicates: "Duplicates", merge: "Merge", mergeInto: "Merge into", noDuplicates: "No duplicates found", importDone: "Import: {created} created, {updated} updated, {skipped} skipped", importHint: "Columns: name, phone, email, company, position, tags, notes",
    selected: "Selected: {n}", addTag: "Add tag", removeTag: "Remove tag", assign: "Assign", bulkDelete: "Delete selected", channels: "Channels", lastActivity: "Activity", dealsCol: "Deals", sort: "Sort", sortRecent: "Recent activity", sortName: "Name", sortCreated: "Newest", hasDeals: "Deals", withOpenDeals: "With open deals", withoutDeals: "Without deals", page: "Page {page} of {pages}",
    sku: "SKU", category: "Category", duration: "Duration, min", active: "Active", inactive: "Hidden",
    reports: "Reports", period: "Period", d30: "30 days", d90: "90 days", d180: "6 months", d365: "Year", kpiWon: "Won", kpiWinRate: "Win rate", kpiAvg: "Average deal", kpiCycle: "Sales cycle", kpiForecast: "Pipeline forecast", kpiNew: "New deals", kpiContacts: "New contacts", kpiOverdue: "Overdue tasks", funnel: "Funnel by stage", revenue: "Revenue by month", bySource: "Deals by source", byOwner: "By owner", lostReasons: "Lost reasons", count: "Count", share: "Share",
    pipelines: "Pipelines", stages: "Stages", addStage: "Add stage", newPipeline: "New pipeline", makeDefault: "Default", probability: "Probability %", kindOpen: "Open", kindWon: "Won", kindLost: "Lost", fields: "Fields", addField: "Add field", fieldLabel: "Field name", fieldType: "Type", options: "Options, comma separated", entityCustomer: "Contact", entityDeal: "Deal", entityCompany: "Company", tText: "Text", tNumber: "Number", tDate: "Date", tSelect: "List", tBoolean: "Yes/no", tUrl: "Link", yes: "Yes", no: "No", readOnly: "Read-only",
    act: { NOTE: "Note", CALL: "Call", MEETING: "Meeting", EMAIL: "Email", DEAL_CREATED: "Deal created", STAGE_CHANGED: "Stage changed", DEAL_WON: "Deal won", DEAL_LOST: "Deal lost", TASK_CREATED: "Task created", TASK_DONE: "Task completed", CONTACT_CREATED: "Contact created", CONTACT_MERGED: "Contacts merged", AI_LEAD: "Lead from AI employee", APPOINTMENT: "Booking by AI employee", FIELD_CHANGED: "Change", MESSAGE: "Message" } as Record<string, string>,
  },
};
export type Copy = typeof dict.ru;
export const copyFor = (locale: Locale): Copy => dict[locale];
export const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/crm/${path}`, { method: init?.method ?? "GET", headers: init?.body === undefined ? undefined : { "content-type": "application/json" }, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, (body as { error?: string }).error ?? String(response.status));
  return body as T;
}

type CrmContextValue = { locale: Locale; c: Copy; boot: Bootstrap; reloadBoot: () => Promise<void>; notify: (text: string) => void; open: (target: Opened) => void; canWrite: boolean; isAdmin: boolean; refreshKey: number; bump: () => void; goConversations: () => void };
export const CrmContext = createContext<CrmContextValue | null>(null);
export function useCrm() { const value = useContext(CrmContext); if (!value) throw new Error("CRM context missing"); return value; }

export function money(value: number, currency = "RUB", locale: Locale = "ru") {
  try { return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { style: "currency", currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value); } catch { return `${Math.round(value)} ${currency}`; }
}
export function shortMoney(value: number, locale: Locale = "ru") {
  const abs = Math.abs(value), ru = locale === "ru";
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}${ru ? " млн" : "M"}`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}${ru ? " тыс" : "K"}`;
  return String(Math.round(value));
}
export function when(value: string | null | undefined, locale: Locale, withTime = true) {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale === "ru" ? "ru-RU" : "en-GB", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });
}
export function daysSince(value: string) { return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)); }
export function toInputDate(value: string | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
export function toInputDateTime(value: string | null | undefined) { if (!value) return ""; const d = new Date(value); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
export function initials(name: string) { const p = name.trim().split(/\s+/); return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?"; }

export function Drawer({ title, subtitle, onClose, children, actions, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".crmModal")) onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="crmDrawerLayer" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className={wide ? "crmDrawer wide" : "crmDrawer"} role="dialog" aria-modal="true">
      <header><div className="crmDrawerTitle"><h2>{title}</h2>{subtitle && <small>{subtitle}</small>}</div><div className="crmDrawerActions">{actions}<button type="button" className="crmIcon" onClick={onClose} aria-label="Close"><X size={18}/></button></div></header>
      <div className="crmDrawerBody">{children}</div>
    </aside>
  </div>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; window.addEventListener("keydown", onKey, true); return () => window.removeEventListener("keydown", onKey, true); }, [onClose]);
  return <div className="crmModalLayer" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="crmModal" role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button type="button" className="crmIcon" onClick={onClose} aria-label="Close"><X size={18}/></button></header><div className="crmModalBody">{children}</div>{footer && <footer>{footer}</footer>}</section>
  </div>;
}

export function TagEditor({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const { c, boot } = useCrm();
  const [draft, setDraft] = useState("");
  const add = (tag: string) => { const t = tag.trim(); if (t && !value.includes(t)) onChange([...value, t]); setDraft(""); };
  const listId = useRef(`tags-${Math.random().toString(36).slice(2)}`).current;
  return <div className="crmTags">
    {value.map(tag => <span key={tag} className="crmTag">{tag}{!disabled && <button type="button" onClick={() => onChange(value.filter(t => t !== tag))} aria-label={`${c.delete} ${tag}`}><X size={11}/></button>}</span>)}
    {!disabled && <input list={listId} value={draft} placeholder={c.tagPlaceholder} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } }} onBlur={() => draft && add(draft)}/>}
    <datalist id={listId}>{boot.tags.filter(t => !value.includes(t)).map(t => <option key={t} value={t}/>)}</datalist>
  </div>;
}

export function MemberSelect({ value, onChange, allowEmpty = true, disabled }: { value: string | null | undefined; onChange: (value: string | null) => void; allowEmpty?: boolean; disabled?: boolean }) {
  const { boot, c } = useCrm();
  return <select value={value ?? ""} disabled={disabled} onChange={e => onChange(e.target.value || null)}>{allowEmpty && <option value="">{c.none}</option>}{boot.members.map(m => <option key={m.id} value={m.id}>{m.name}{m.me ? " ★" : ""}</option>)}</select>;
}

/** Search-as-you-type picker for contacts or companies. */
export function EntityPicker({ kind, value, label, onChange, disabled }: { kind: "contacts" | "companies"; value: { id: string; name: string } | null; label: string; onChange: (value: { id: string; name: string } | null) => void; disabled?: boolean }) {
  const { c } = useCrm();
  const [query, setQuery] = useState(""); const [items, setItems] = useState<Array<{ id: string; name: string; phone?: string | null }>>([]); const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      api<{ rows: Array<{ id: string; name: string; phone: string | null }> } | Array<{ id: string; name: string; phone: string | null }>>(`${kind}?q=${encodeURIComponent(query)}&pageSize=10`).then(result => setItems((Array.isArray(result) ? result : result.rows).slice(0, 10))).catch(() => setItems([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, open, kind]);
  if (value && !open) return <div className="crmPicked"><span>{value.name}</span>{!disabled && <><button type="button" className="crmLink" onClick={() => setOpen(true)}>{c.edit}</button><button type="button" className="crmIcon small" onClick={() => onChange(null)} aria-label={c.delete}><X size={13}/></button></>}</div>;
  if (disabled) return <span className="crmMuted">{c.none}</span>;
  return <div className="crmPicker">
    <input autoFocus={open} value={query} placeholder={`${label}: ${c.search}`} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 150)}/>
    {open && items.length > 0 && <ul>{items.map(item => <li key={item.id}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange({ id: item.id, name: item.name }); setOpen(false); setQuery(""); }}><b>{item.name}</b>{item.phone && <small>{item.phone}</small>}</button></li>)}</ul>}
  </div>;
}

export function CustomFieldsEditor({ entity, value, onChange, disabled }: { entity: FieldDef["entity"]; value: Record<string, unknown> | null | undefined; onChange: (next: Record<string, unknown>) => void; disabled?: boolean }) {
  const { boot, c } = useCrm();
  const fields = boot.fields.filter(f => f.entity === entity);
  if (!fields.length) return null;
  const current = value ?? {};
  const set = (key: string, v: unknown) => onChange({ ...current, [key]: v === "" ? null : v });
  return <div className="crmFieldGrid">{fields.map(f => {
    const v = current[f.key];
    return <label key={f.id}>{f.label}{
      f.type === "BOOLEAN" ? <select disabled={disabled} value={v === true ? "1" : v === false ? "0" : ""} onChange={e => set(f.key, e.target.value === "" ? null : e.target.value === "1")}><option value="">{c.none}</option><option value="1">{c.yes}</option><option value="0">{c.no}</option></select>
      : f.type === "SELECT" ? <select disabled={disabled} value={String(v ?? "")} onChange={e => set(f.key, e.target.value)}><option value="">{c.none}</option>{f.options.map(o => <option key={o}>{o}</option>)}</select>
      : <input disabled={disabled} type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : f.type === "URL" ? "url" : "text"} defaultValue={String(v ?? "")} onBlur={e => { const raw = e.target.value; if (raw !== String(v ?? "")) set(f.key, f.type === "NUMBER" && raw !== "" ? Number(raw) : raw); }}/>
    }</label>;
  })}</div>;
}

export function Empty({ title, copy, action }: { title: string; copy?: string; action?: ReactNode }) {
  return <div className="crmEmpty"><h3>{title}</h3>{copy && <p>{copy}</p>}{action}</div>;
}

export function Avatar({ name }: { name: string }) {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = ["#6254e8", "#1f9d6b", "#b7791f", "#d0424f", "#2f7fd8", "#8b5cf6", "#0f8a8a"];
  return <span className="crmAvatar" style={{ background: hues[h % hues.length] }} title={name}>{initials(name)}</span>;
}
