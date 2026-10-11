# Отложенный функционал Lemeri AI

Lemeri AI сейчас продаётся как **один продукт — ИИ-продавец для сайта** (см. `docs/CLAUDE_CONTEXT.md`).
Всё, что ниже, **сохранено в коде и в базе**, но выключено в активном интерфейсе и закрыто на сервере.

## Как это устроено

- Флаги модулей: `src/lib/features.ts`. По умолчанию всё выключено.
- Включение через переменную окружения `LEMIRI_FEATURES` (через запятую), например `LEMIRI_FEATURES="crm,team"`. Значение `all` включает всё.
- Сервер: API выключенного модуля отвечает `404 {"error":"FEATURE_DISABLED"}`.
- Интерфейс:
  - навигация собирается в `navSections()` в `src/components/platform.tsx`;
  - включённые модули появляются в группе «Отложенные модули».
- Таблицы и данные не удалялись. Миграции только добавляют (additive). Ни одна разрушительная операция не выполнялась.

| Ключ флага | Модуль | Статус |
|---|---|---|
| `crm` | Полноценная CRM: сделки, воронки, контакты, компании, задачи, товары, отчёты, свои поля | Реализовано |
| `team` | Команда: мессенджер, запросы отчётов (задания), аккаунты сотрудников, коды присоединения, ИИ-помощник руководителя, ИИ для сотрудников («Сотрудник+ ИИ»), учёт токенов | Реализовано |
| `messengers` | Telegram, WhatsApp Cloud, Email (входящие и исходящие) | Реализовано |
| `integrations` | Интеграции с внешними CRM: подписанные вебхуки, очередь доставки, повторы | Реализовано |
| `automations` | Правила и автоматизации (триггеры, условия, шаги) | Реализовано |
| `appointments` | Онлайн-запись: действие `createAppointment`, рабочие часы, защита от двойной записи, страница «Записи» | Реализовано, в лендинге «Скоро» |
| `actionsPage` | Страница прав действий ИИ. В MVP права вынесены переключателями на экран «ИИ-сотрудник» | Реализовано |
| `analyticsPro` | Расширенная аналитика и ИИ-инсайты | Частично реализовано |
| `workspaceAssistant` | ИИ-ассистент владельца в кабинете (плавающая карточка с инструментами по CRM, лидам и записям) | Реализовано |
| `multiWorkspace` | Несколько рабочих пространств у одного пользователя и переключение между ними | Реализовано |

## Подробно по модулям

### CRM (`crm`)
- **Код:**
  - интерфейс: `src/components/crm/*` (crm-app, deals, contacts, more, panels, core, loader), `src/styles/crm.css`;
  - API: `src/app/api/crm/[...path]/route.ts` — один маршрутизатор, кроме `health` все пути закрыты флагом;
  - серверная логика: `src/lib/crm/service.ts`;
  - схема: `src/lib/crm/schema-sql.ts`, `schema.ts`.
- **Данные:** `Company`, `Pipeline`, `PipelineStage`, `Deal`, `DealItem`, `Product`, `CrmTask`, `CrmActivity`, `CrmFieldDefinition`. Миграция `prisma/migrations/20260928000000_crm`.
- **Автомиграция:**
  - `applyCrmSchema()` применяет всю схему (CRM + team) одной функцией Postgres `_lemiri_apply_schema` — это укладывается в лимит subrequests у Workers;
  - текущая версия маркера — `crm-4`;
  - схема применяется при обращении к `/api/crm/*` (включая `health`), поэтому таблицы существуют даже при выключенной CRM.
- **Связь с MVP:** создание сделки из лида (`createDealFromLead`) вызывается только при включённом `crm` (`src/lib/actions/registry.ts`).
- **Для включения:** `LEMIRI_FEATURES=crm`. В навигации появится «CRM».
- **Риски:**
  - +объём бандла Worker (интерфейс CRM грузится только на клиенте);
  - при одновременном включении `crm` и `workspaceAssistant` ассистент снова получит инструменты CRM.

### Команда и ИИ для сотрудников (`team`)
- **Код:**
  - серверная часть: `src/lib/team/*` (router, ai, copilot, catalog, names, schema-sql);
  - интерфейс: `src/components/team/*`, `src/styles/team.css`;
  - онбординг сотрудника: `src/app/onboarding`, `src/components/team/join-*`;
  - регистрация «сотрудник/владелец»: `src/components/auth-form.tsx` (prop `employeeAccounts`) и `src/app/actions/auth.ts` (`registerEmployee`).
  - старое управление участниками: `src/app/api/team/*`.
- **API:** `/api/crm/team/*` — работает внутри CRM-маршрута, но закрыт отдельным флагом `team`.
- **Данные:**
  - таблицы: `TeamMessage`, `TeamRead`, `TeamTask`, `WorkspaceJoinCode`, `JoinRequest`, `TeamAiUsage`;
  - колонки: `User.accountType`, `User.position`, `WorkspaceMember.position/aiSeat/lastSeenAt`.
- **Тариф «Сотрудник+ ИИ»:** $59 в месяц, 5 млн токенов (`AI_SEAT_PRICE_USD`, `AI_SEAT_MONTHLY_TOKENS` в `src/lib/team/catalog.ts`). Оплата мест не подключена.
- **Для включения:** `LEMIRI_FEATURES=team`. Без `crm` ИИ сотрудника не увидит CRM-данные: запросы к ним упадут, потому что CRM-маршрут закрыт. Включать вместе: `crm,team`.
- **Риски:** код пользователя-сотрудника (accountType=EMPLOYEE) остаётся в `session.ts` и `onboarding`. Он безопасен: без флага такие аккаунты не создаются.

### Мессенджеры (`messengers`)
- **Код:** коннекторы `src/lib/connectors/telegram.ts`, `whatsapp.ts`, `email.ts`, `ingest.ts`, `registry.ts`; вебхуки `src/app/api/webhooks/[type]/[channelId]/route.ts`.
- **Закрыто:**
  - создание каналов этих типов (`/api/channels` POST — только `WEBSITE`);
  - входящие вебхуки.
- **Данные:** `Channel` (type TELEGRAM/WHATSAPP/EMAIL, зашифрованный config) и `BackgroundJob` (OUTBOUND_CHANNEL_MESSAGE).
- **Для включения:**
  1. `LEMIRI_FEATURES=messengers`;
  2. для Email — `RESEND_API_KEY` и `EMAIL_FROM`;
  3. в навигации появится «Каналы».
- **Риски:**
  - уже подключённые Telegram-боты при выключенном флаге получают 404 на вебхук. Telegram повторит доставку и через сутки отбросит сообщения;
  - после включения webhook нужно зарегистрировать заново: переподключить канал.

### Интеграции с внешними CRM (`integrations`)
- **Код:** `src/lib/integrations/*`, `src/app/api/integrations/*`.
- **Данные:** `Integration`, `BackgroundJob`.
- **Как работает:** события `lead.created`, `appointment.*`, `deal.*` подписываются HMAC.
- **В MVP:** очередь событий из `createLead` остаётся. Без записей `Integration` она ничего не отправляет. Из формы заявки виджета события ставятся в очередь только при включённом флаге.
- **Для включения:** `LEMIRI_FEATURES=integrations`.

### Автоматизации (`automations`)
- **Код:** `src/lib/automations/*`, `src/app/api/automations/*`.
- **Данные:** `Automation`.
- **Важно:** `triggerAutomations()` вызывается из оркестратора и виджета всегда. Без сохранённых правил это пустая операция.
- **Для включения:** `LEMIRI_FEATURES=automations`.

### Онлайн-запись (`appointments`)
- **Код:**
  - действие `createAppointment` в `src/lib/actions/registry.ts` (рабочие часы, двойная запись);
  - API `src/app/api/appointments/*`;
  - страница «Записи» в `platform.tsx`.
- **Данные:** `Appointment`.
- **Закрыто:** оркестратор не передаёт модели `createAppointment`, пока флаг выключен (`src/lib/ai/orchestrator.ts`). Права на действие в базе сохранены.
- **Для включения:**
  1. `LEMIRI_FEATURES=appointments`;
  2. убрать «Онлайн-запись» из `COMING_SOON` в `src/lib/billing/offer.ts`;
  3. описать функцию в тарифах.
- **Нужно доделать для продажи:** интеграцию с календарём (Google Calendar) — её пока нет.

### ИИ-ассистент владельца (`workspaceAssistant`)
- **Код:** `src/components/assistant-card.tsx`, `src/lib/assistant/*` (engine, planner, tools, guide), API `src/app/api/assistant/route.ts`.
- **Что умеет:** инструменты по CRM, лидам, записям, навигации и настройкам, с подтверждением действий.
- **Для включения:** `LEMIRI_FEATURES=workspaceAssistant`. Инструменты CRM работают только вместе с `crm`.

### Несколько рабочих пространств (`multiWorkspace`)
- **Код:** `src/app/api/workspaces/switch/route.ts`, переключатель в сайдбаре `platform.tsx`, `selectActiveMembership` в `src/lib/auth`.
- **Сейчас:** пользователь работает в своём основном пространстве. Переключатель скрыт, API закрыт.

### Расширенная аналитика (`analyticsPro`)
- **Код:** `AnalyticsView`, `InsightsPanel` в `platform.tsx`; API `src/app/api/insights`, `src/app/api/analytics`. `/api/analytics` открыт: им пользуется базовая аналитика.
- **Статус:** частично реализовано. Есть графики событий и ИИ-инсайты. Нет анализа продаж и воронки — это Phase 2.

## Только запланировано (кода нет)
- Instagram.
- Интеграция с календарём (Google Calendar).
- Синхронизация товаров и остатков (YML/CSV-фид, API магазина).
- ERP-интеграции.
- Публичный REST API.
- Мультиагентная архитектура.
- Тарифы Pro и Business.
- Уведомления о заявках на почту и в мессенджеры. Сейчас есть только уведомления в кабинете.
- Расширенная мультиязычность: язык ответа ИИ уже настраивается, но нет интерфейса виджета на других языках.

## Общие риски при повторной активации
1. **Размер Worker.** На бесплатном тарифе Cloudflare лимит 3 MiB gzip, сейчас ≈3047 KiB. Перед включением крупных модулей нужен Workers Paid.
2. **Лимит subrequests.** На Free — 50 на запрос. Новые серверные модули должны делать мало запросов к БД. Схема применяется одним запросом.
3. **Тарифы.** Возвращённые функции нужно явно описать в `src/lib/billing/offer.ts` и `docs/CLAUDE_CONTEXT.md`. Нельзя показывать недоступное как доступное.
4. **Права.** Серверные проверки ролей (`canWorkspace`, `need(ctx, …)`) остались на месте. Флаг — дополнительный барьер, а не замена прав.
