// What the in-app assistant knows about the Lemiri platform itself. Every entry
// maps to a section of the dashboard so answers can offer "open this section".

export type SectionId = "overview" | "employees" | "conversations" | "leads" | "appointments" | "knowledge" | "actions" | "rules" | "channels" | "integrations" | "analytics" | "team" | "billing" | "settings" | "notifications" | "testing";
export const SECTION_IDS: SectionId[] = ["overview", "employees", "conversations", "leads", "appointments", "knowledge", "actions", "rules", "channels", "integrations", "analytics", "team", "billing", "settings", "notifications", "testing"];

type Entry = { id: string; section: SectionId; keywords: string[]; ru: string; en: string };

export const SECTION_TITLES: Record<SectionId, { ru: string; en: string }> = {
  overview: { ru: "Обзор", en: "Overview" }, employees: { ru: "Сотрудники", en: "Employees" }, conversations: { ru: "Диалоги", en: "Conversations" },
  leads: { ru: "Лиды", en: "Leads" }, appointments: { ru: "Записи", en: "Appointments" }, knowledge: { ru: "Знания", en: "Knowledge" },
  actions: { ru: "Действия", en: "Actions" }, rules: { ru: "Правила", en: "Rules" }, channels: { ru: "Каналы", en: "Channels" },
  integrations: { ru: "Интеграции", en: "Integrations" }, analytics: { ru: "Аналитика", en: "Analytics" }, team: { ru: "Команда", en: "Team" },
  billing: { ru: "Тариф и использование", en: "Plan & usage" }, settings: { ru: "Настройки", en: "Settings" },
  notifications: { ru: "Уведомления", en: "Notifications" }, testing: { ru: "Тестирование", en: "Testing" },
};

export const GUIDE: Entry[] = [
  { id: "platform", section: "overview", keywords: ["платформ", "что умеет", "возможност", "lemiri", "функционал", "platform", "features", "what can"],
    ru: "Lemiri — платформа ИИ-сотрудников. ИИ-сотрудник отвечает клиентам 24/7 в чате на сайте, Telegram, WhatsApp и Email, опирается на вашу базу знаний, создаёт лиды и записи, передаёт сложные вопросы менеджеру и отправляет события в CRM. Раздел «Обзор» показывает ключевые метрики и статус сотрудника (запуск/пауза).",
    en: "Lemiri is an AI-employee platform. An AI employee answers customers 24/7 in the website chat, Telegram, WhatsApp and Email, relies on your knowledge base, creates leads and appointments, hands complex questions to a manager and sends events to your CRM. Overview shows key metrics and lets you start or pause the employee." },
  { id: "employees", section: "employees", keywords: ["сотрудник", "создать сотрудник", "роль", "тон", "пауз", "запуст", "лимит", "employee", "tone", "pause", "start"],
    ru: "Сотрудники: «Новый сотрудник» → имя, роль (администратор, продажи, поддержка), цель и тон. Кнопка запуска делает сотрудника активным (число активных ограничено тарифом), пауза останавливает ответы. Можно назначить ответственного из команды.",
    en: "Employees: “New employee” → name, role (administrator, sales, support), goal and tone. Start makes the employee active (the number of active employees depends on the plan); pause stops replies. You can assign a responsible teammate." },
  { id: "knowledge", section: "knowledge", keywords: ["знани", "база", "документ", "pdf", "faq", "сайт", "обуч", "прайс", "knowledge", "document", "upload", "website", "train"],
    ru: "Знания — то, на что опирается ИИ. Типы: «Текст», «FAQ» (вопрос/ответ), «Сайт» (адрес страницы — Lemiri прочитает сайт) и «Документ» (PDF, DOCX, TXT, CSV, XLSX до 10 МБ). После добавления источник индексируется и получает статус «Готов». Если ИИ не нашёл ответа, вопрос попадает в пробелы знаний.",
    en: "Knowledge is what the AI relies on. Types: Text, FAQ (question/answer), Website (a page URL — Lemiri reads the site) and Document (PDF, DOCX, TXT, CSV, XLSX up to 10 MB). Each source is indexed and becomes “Ready”. Questions the AI could not answer are collected as knowledge gaps." },
  { id: "channels", section: "channels", keywords: ["канал", "подключ", "telegram", "телеграм", "whatsapp", "ватсап", "email", "почт", "сайт", "виджет", "embed", "код", "channel", "connect", "widget"],
    ru: "Каналы: выберите тип и сотрудника.\n• Сайт — укажите разрешённые сайты, затем скопируйте код виджета и вставьте перед </body>. Виджет — такая же карточка, как этот помощник: сворачивается, перетаскивается, меняет размер, прилипает к краям. Тема виджета по умолчанию как в системе посетителя; можно задать в коде data-theme='light' или 'dark' и свой цвет data-accent='#6254e8'.\n• Telegram — токен бота из @BotFather и секрет webhook (любая строка от 16 символов).\n• WhatsApp — Access token, Phone number ID, Verify token и App secret из Meta for Developers; webhook указывается в Meta.\n• Email — входящий адрес и секрет webhook; письма пересылаются на webhook Lemiri.\nКлючи шифруются и не возвращаются в браузер.",
    en: "Channels: choose a type and an employee.\n• Website — list allowed sites, then copy the widget code and paste it before </body>. The widget is the same card as this assistant: collapsible, draggable, resizable and docks to edges. The widget theme follows the visitor's system by default; set data-theme='light' or 'dark' and your colour with data-accent='#6254e8' on the script tag.\n• Telegram — bot token from @BotFather and a webhook secret (16+ characters).\n• WhatsApp — Access token, Phone number ID, Verify token and App secret from Meta for Developers; set the webhook in Meta.\n• Email — inbound address and webhook secret; forward mail to the Lemiri webhook.\nKeys are encrypted and never returned to the browser." },
  { id: "integrations", section: "integrations", keywords: ["crm", "интеграц", "webhook", "вебхук", "amo", "bitrix", "битрикс", "синхрон", "integration", "sync"],
    ru: "Интеграции → Webhook CRM: публичный HTTPS-адрес и секрет подписи (от 24 символов), при необходимости заголовок Authorization. После сохранения нажмите «Проверить». Лиды и записи отправляются подписанными событиями (HMAC SHA-256, заголовок x-lemiri-signature) через очередь с повторами.",
    en: "Integrations → CRM webhook: a public HTTPS endpoint and a signing secret (24+ characters), optionally an Authorization header. Save, then press “Test”. Leads and appointments are sent as signed events (HMAC SHA-256, x-lemiri-signature header) through a retrying queue." },
  { id: "conversations", section: "conversations", keywords: ["диалог", "переписк", "перехват", "менеджер", "ответить", "handoff", "conversation", "take over", "reply"],
    ru: "Диалоги — все переписки со всех каналов. Можно открыть диалог, «Перехватить» его (ИИ перестаёт отвечать) и ответить клиенту от менеджера, затем вернуть диалог ИИ. Диалоги, где ИИ попросил помощи, отмечаются как требующие менеджера.",
    en: "Conversations lists chats from every channel. Open one, “Take over” (the AI stops replying), answer as a manager, then hand it back to the AI. Chats where the AI asked for help are flagged for a manager." },
  { id: "leads", section: "leads", keywords: ["лид", "заявк", "сделк", "воронк", "этап", "lead", "stage", "deal"],
    ru: "Лиды создаёт ИИ-сотрудник, когда клиент проявляет интерес (действие «Создавать лиды» должно быть разрешено). Этапы: Новый → Квалифицирован → Сделка / Потерян. Лиду можно назначить ответственного.",
    en: "Leads are created by the AI employee when a customer shows interest (the “Create leads” action must be enabled). Stages: New → Qualified → Won / Lost. Leads can be assigned to a teammate." },
  { id: "appointments", section: "appointments", keywords: ["запис", "календар", "приём", "бронир", "appointment", "booking", "calendar"],
    ru: "Записи создаёт ИИ, когда клиент выбирает время (действие «Создавать записи» должно быть разрешено; учитываются рабочие часы из настроек). Запись можно подтвердить, завершить или отменить.",
    en: "Appointments are booked by the AI when a customer picks a time (the “Create appointments” action must be enabled; working hours from Settings apply). You can confirm, complete or cancel them." },
  { id: "actions", section: "actions", keywords: ["действи", "разреш", "запрет", "права", "action", "permission", "allow"],
    ru: "Действия — что ИИ-сотруднику разрешено делать: создавать лиды, записи, передавать менеджеру, уведомлять команду и т.д. Переключатели включаются для каждого сотрудника отдельно.",
    en: "Actions define what the AI employee may do: create leads, appointments, hand off to a manager, notify the team, etc. Toggles are per employee." },
  { id: "rules", section: "rules", keywords: ["правил", "автоматиз", "триггер", "rule", "automation", "trigger"],
    ru: "Правила (автоматизации): триггер (ответ ИИ, передача менеджеру, новое сообщение) и шаги-действия. Новые правила создаются выключенными — включите переключатель после проверки.",
    en: "Rules (automations): a trigger (AI response, handoff, new message) plus action steps. New rules are created disabled — switch them on after review." },
  { id: "testing", section: "testing", keywords: ["тест", "проверить ответ", "песочниц", "playground", "test"],
    ru: "Тестирование: песочница для переписки с сотрудником и тест-кейсы — вопрос клиента, ожидаемый фрагмент ответа и ожидаемая передача менеджеру. Запускайте тесты после изменения знаний.",
    en: "Testing: a playground to chat with the employee and test cases — a customer message, an expected answer fragment and expected handoff. Run them after changing knowledge." },
  { id: "analytics", section: "analytics", keywords: ["аналитик", "статистик", "метрик", "конверс", "отчёт", "analytics", "stats", "report"],
    ru: "Аналитика: диалоги, лиды, записи, доля ответов без менеджера и активность за период, плюс подсказки ИИ по улучшению.",
    en: "Analytics: conversations, leads, appointments, share handled without a manager and activity over time, plus AI improvement insights." },
  { id: "team", section: "team", keywords: ["команд", "пригла", "роль", "доступ", "team", "invite", "role", "access"],
    ru: "Команда: приглашение по email с ролью. Владелец и администратор настраивают всё; менеджер работает с диалогами, лидами и записями; наблюдатель только смотрит.",
    en: "Team: invite by email with a role. Owner and admin configure everything; manager works with conversations, leads and appointments; viewer is read-only." },
  { id: "billing", section: "billing", keywords: ["тариф", "оплат", "подписк", "лимит", "цена", "billing", "plan", "price", "limit", "subscription"],
    ru: "Тариф и использование: текущий план, лимиты диалогов, активных сотрудников, базы знаний и действий ИИ, смена тарифа через оплату.",
    en: "Plan & usage: current plan, limits for conversations, active employees, knowledge and AI actions, and plan changes via checkout." },
  { id: "settings", section: "settings", keywords: ["настройк", "тем", "тёмн", "светл", "язык", "часов", "пояс", "рабоч", "логотип", "экспорт", "удалить", "settings", "theme", "dark", "light", "language", "timezone", "export"],
    ru: "Настройки: название и логотип компании, язык, часовой пояс, рабочие часы, тема (светлая, тёмная, как в системе), срок хранения данных, экспорт данных и удаление пространства.",
    en: "Settings: company name and logo, language, time zone, working hours, theme (light, dark, system), data retention, data export and workspace deletion." },
  { id: "assistant", section: "overview", keywords: ["помощник", "карточк", "перемест", "размер", "закреп", "свернуть", "assistant", "card", "move", "resize", "pin"],
    ru: "Эта карточка: тяните за шапку, чтобы переместить; тяните за края и углы, чтобы изменить размер; у края экрана она прилипает к нему или к углу. Кнопка-булавка фиксирует положение, двойной клик по шапке разворачивает на весь экран, Esc или «—» сворачивают в кнопку, которая прилипает к ближайшему краю. Горячая клавиша — Ctrl+J (⌘J).",
    en: "This card: drag the header to move it; drag edges and corners to resize; near a screen edge it docks to the edge or corner. The pin locks it, double-clicking the header maximizes it, Esc or “—” collapses it into a button that sticks to the nearest edge. Shortcut: Ctrl+J (⌘J)." },
];

function normalize(value: string) { return value.toLocaleLowerCase("ru").replace(/ё/g, "е"); }

export function searchGuide(query: string, limit = 3) {
  const q = normalize(query);
  const scored = GUIDE.map(entry => ({ entry, score: entry.keywords.reduce((sum, keyword) => sum + (q.includes(normalize(keyword)) ? keyword.length : 0), 0) }));
  return scored.filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(item => item.entry);
}

export function guideForSection(section: SectionId) { return GUIDE.find(entry => entry.section === section && entry.id !== "assistant"); }
