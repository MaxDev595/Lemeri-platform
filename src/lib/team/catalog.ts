// Shared (server + browser): positions an employee can hold and report templates.
// Keep it data-only so it costs little in the Worker bundle.

export type Role = "ADMIN" | "MANAGER" | "VIEWER";
export type Position = { key: string; ru: string; en: string; role: Role; report: string };
export type PositionGroup = { key: string; ru: string; en: string; items: Position[] };

const p = (key: string, ru: string, en: string, role: Role, report: string): Position => ({ key, ru, en, role, report });

export const POSITION_GROUPS: PositionGroup[] = [
  { key: "lead", ru: "Руководство", en: "Leadership", items: [
    p("ceo", "Генеральный директор", "CEO", "ADMIN", "weekly"), p("coo", "Операционный директор", "COO", "ADMIN", "weekly"),
    p("deputy", "Заместитель руководителя", "Deputy head", "ADMIN", "weekly"), p("branch_head", "Руководитель филиала", "Branch manager", "ADMIN", "weekly"),
    p("dept_head", "Руководитель отдела", "Head of department", "ADMIN", "weekly"),
  ] },
  { key: "sales", ru: "Продажи", en: "Sales", items: [
    p("sales_head", "Руководитель отдела продаж", "Head of sales", "ADMIN", "sales"), p("sales_manager", "Менеджер по продажам", "Sales manager", "MANAGER", "sales"),
    p("account_manager", "Менеджер по работе с клиентами", "Account manager", "MANAGER", "sales"), p("b2b_manager", "B2B-менеджер", "B2B manager", "MANAGER", "sales"),
    p("sales_rep", "Торговый представитель", "Sales representative", "MANAGER", "sales"), p("seller", "Продавец-консультант", "Shop assistant", "MANAGER", "daily"),
  ] },
  { key: "service", ru: "Сервис и клиенты", en: "Service & clients", items: [
    p("admin_front", "Администратор", "Front desk administrator", "MANAGER", "daily"), p("support", "Специалист поддержки", "Support specialist", "MANAGER", "support"),
    p("support_lead", "Руководитель поддержки", "Head of support", "ADMIN", "support"), p("call_operator", "Оператор колл-центра", "Call-center operator", "MANAGER", "support"),
    p("receptionist", "Ресепшн", "Receptionist", "MANAGER", "daily"), p("customer_success", "Менеджер по успеху клиентов", "Customer success manager", "MANAGER", "support"),
  ] },
  { key: "marketing", ru: "Маркетинг", en: "Marketing", items: [
    p("cmo", "Директор по маркетингу", "Head of marketing", "ADMIN", "marketing"), p("marketer", "Маркетолог", "Marketer", "MANAGER", "marketing"),
    p("smm", "SMM-специалист", "SMM specialist", "MANAGER", "marketing"), p("target", "Таргетолог", "Paid ads specialist", "MANAGER", "marketing"),
    p("content", "Контент-менеджер", "Content manager", "MANAGER", "marketing"), p("designer", "Дизайнер", "Designer", "MANAGER", "project"),
  ] },
  { key: "finance", ru: "Финансы", en: "Finance", items: [
    p("cfo", "Финансовый директор", "CFO", "ADMIN", "finance"), p("chief_accountant", "Главный бухгалтер", "Chief accountant", "ADMIN", "finance"),
    p("accountant", "Бухгалтер", "Accountant", "MANAGER", "finance"), p("economist", "Экономист / аналитик", "Financial analyst", "MANAGER", "finance"),
    p("cashier", "Кассир", "Cashier", "VIEWER", "daily"),
  ] },
  { key: "ops", ru: "Операции и логистика", en: "Operations & logistics", items: [
    p("ops_manager", "Операционный менеджер", "Operations manager", "MANAGER", "daily"), p("logistician", "Логист", "Logistics coordinator", "MANAGER", "daily"),
    p("warehouse", "Кладовщик", "Warehouse keeper", "VIEWER", "daily"), p("buyer", "Закупщик", "Purchasing manager", "MANAGER", "daily"),
    p("courier", "Курьер / водитель", "Courier / driver", "VIEWER", "daily"), p("production", "Специалист производства", "Production specialist", "VIEWER", "daily"),
  ] },
  { key: "pros", ru: "Специалисты и мастера", en: "Specialists", items: [
    p("doctor", "Врач", "Doctor", "MANAGER", "daily"), p("nurse", "Медсестра / ассистент", "Nurse / assistant", "VIEWER", "daily"),
    p("master", "Мастер (салон, сервис)", "Master (salon, service)", "VIEWER", "daily"), p("teacher", "Преподаватель / тренер", "Teacher / coach", "MANAGER", "daily"),
    p("lawyer", "Юрист", "Lawyer", "MANAGER", "project"), p("engineer", "Инженер / техник", "Engineer / technician", "MANAGER", "project"),
    p("realtor", "Риелтор / агент", "Realtor / agent", "MANAGER", "sales"),
  ] },
  { key: "it", ru: "IT и продукт", en: "IT & product", items: [
    p("cto", "Технический директор", "CTO", "ADMIN", "project"), p("pm", "Менеджер проектов", "Project manager", "MANAGER", "project"),
    p("product", "Продакт-менеджер", "Product manager", "MANAGER", "project"), p("developer", "Разработчик", "Developer", "MANAGER", "project"),
    p("qa", "Тестировщик", "QA engineer", "MANAGER", "project"), p("sysadmin", "Системный администратор", "System administrator", "MANAGER", "project"),
  ] },
  { key: "hr", ru: "HR и офис", en: "HR & office", items: [
    p("hr", "HR-менеджер", "HR manager", "MANAGER", "weekly"), p("recruiter", "Рекрутер", "Recruiter", "MANAGER", "weekly"),
    p("office_manager", "Офис-менеджер", "Office manager", "MANAGER", "daily"), p("assistant", "Ассистент руководителя", "Executive assistant", "MANAGER", "daily"),
  ] },
  { key: "other", ru: "Другое", en: "Other", items: [p("intern", "Стажёр", "Intern", "VIEWER", "daily"), p("other", "Другая должность", "Other role", "VIEWER", "daily")] },
];

export const POSITIONS: Position[] = POSITION_GROUPS.flatMap(g => g.items);
export const positionByKey = (key?: string | null) => POSITIONS.find(x => x.key === key);
export const positionLabel = (key: string | null | undefined, locale: string) => { const found = positionByKey(key); return found ? (locale === "en" ? found.en : found.ru) : key || ""; };

export type TemplateField = { key: string; ru: string; en: string; hintRu: string; hintEn: string; required?: boolean };
export type ReportTemplate = { key: string; ru: string; en: string; fields: TemplateField[] };
const f = (key: string, ru: string, en: string, hintRu: string, hintEn: string, required = false): TemplateField => ({ key, ru, en, hintRu, hintEn, required });

export const REPORT_TEMPLATES: ReportTemplate[] = [
  { key: "daily", ru: "Ежедневный отчёт", en: "Daily report", fields: [
    f("done", "Что сделано", "Done", "Задачи и результаты за день", "Tasks and results today", true), f("metrics", "Цифры", "Numbers", "Звонки, клиенты, продажи — что можно посчитать", "Calls, clients, sales — anything countable"),
    f("problems", "Проблемы", "Problems", "Что мешало, что нужно решить", "Blockers to resolve"), f("plan", "План на завтра", "Plan for tomorrow", "Главные задачи на следующий день", "Top tasks for tomorrow", true),
  ] },
  { key: "weekly", ru: "Еженедельный отчёт", en: "Weekly report", fields: [
    f("results", "Итоги недели", "Results of the week", "Ключевые результаты", "Key results", true), f("metrics", "Показатели", "Metrics", "Цифры против плана", "Numbers vs plan"),
    f("risks", "Риски и проблемы", "Risks & problems", "Что может помешать", "What may block us"), f("plan", "План на неделю", "Plan for next week", "Приоритеты", "Priorities", true),
  ] },
  { key: "sales", ru: "Отчёт по продажам", en: "Sales report", fields: [
    f("calls", "Контакты с клиентами", "Client contacts", "Звонки, встречи, переписки", "Calls, meetings, chats", true), f("deals", "Сделки", "Deals", "Новые, продвинутые, закрытые", "New, moved, closed", true),
    f("revenue", "Выручка", "Revenue", "Сумма оплат / выставленных счетов", "Paid / invoiced amount"), f("pipeline", "Воронка и прогноз", "Pipeline & forecast", "Что закроется в ближайшее время", "What will close soon"),
    f("problems", "Возражения и проблемы", "Objections & problems", "Почему клиенты отказывают", "Why clients say no"),
  ] },
  { key: "support", ru: "Отчёт поддержки", en: "Support report", fields: [
    f("tickets", "Обращения", "Requests", "Сколько и каких обращений", "How many and what kind", true), f("resolved", "Решено", "Resolved", "Что закрыто", "What was closed", true),
    f("escalations", "Эскалации", "Escalations", "Что передано выше", "What was escalated"), f("feedback", "Отзывы клиентов", "Customer feedback", "Повторяющиеся вопросы, жалобы", "Repeated questions, complaints"),
  ] },
  { key: "marketing", ru: "Маркетинговый отчёт", en: "Marketing report", fields: [
    f("campaigns", "Кампании и активности", "Campaigns & activities", "Что запущено", "What was launched", true), f("metrics", "Метрики", "Metrics", "Охваты, клики, лиды, CPL", "Reach, clicks, leads, CPL", true),
    f("budget", "Бюджет", "Budget", "Сколько потрачено", "Spend"), f("insights", "Выводы", "Insights", "Что работает, что нет", "What works and what doesn't"), f("plan", "Следующие шаги", "Next steps", "Что делаем дальше", "What's next"),
  ] },
  { key: "finance", ru: "Финансовый отчёт", en: "Finance report", fields: [
    f("income", "Поступления", "Income", "Суммы и источники", "Amounts and sources", true), f("expenses", "Расходы", "Expenses", "Суммы и статьи", "Amounts and categories", true),
    f("balance", "Остатки и долги", "Balances & debts", "Деньги на счетах, дебиторка, кредиторка", "Cash, receivables, payables"), f("notes", "Комментарии", "Notes", "Отклонения от плана", "Deviations from plan"),
  ] },
  { key: "project", ru: "Отчёт по проекту", en: "Project report", fields: [
    f("progress", "Прогресс", "Progress", "Что готово", "What is done", true), f("next", "Следующие шаги", "Next steps", "Что дальше и в какие сроки", "What's next and when", true),
    f("blockers", "Блокеры", "Blockers", "Что мешает", "What blocks progress"), f("needs", "Нужна помощь", "Help needed", "Решения или ресурсы от руководителя", "Decisions or resources needed"),
  ] },
  { key: "free", ru: "Свободная форма", en: "Free form", fields: [f("text", "Отчёт", "Report", "Опишите своими словами", "Describe in your own words", true)] },
];
export const templateByKey = (key?: string | null) => REPORT_TEMPLATES.find(t => t.key === key) ?? REPORT_TEMPLATES[0]!;
