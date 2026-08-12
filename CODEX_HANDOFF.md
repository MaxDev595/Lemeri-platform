# Lemiri AI — Codex handoff

Дата фиксации: 2026-08-11  
Рабочий каталог: `C:\Users\pc\Documents\Codex\2026-08-11\pnpm-dev`

## Текущий статус

### Финальный brand/UI/UX блок 2026-08-11

- Подключены локальные `Lemiri Sans` Regular/Medium/SemiBold/Bold (400/500/600/700) из `public/fonts`; старые семейства шрифтов удалены из CSS.
- Подключены предоставленные логотипы: полный wordmark и компактный знак в `public/brand`; компонент `Logo` использует оптимизированный `next/image`.
- Финальная палитра приведена к `#17191f`, `#6f7482`, `#f3f4f7`, `#fafaff`, `#eeecff`, `#5546dc`, `#e4e6ec`, `#6254e8`, `#7163f3`, `#ffffff`.
- Реализованы премиальные поверхности, скругления, состояния кнопок/полей/select, плавные переходы, появление секций, hover/press-анимации и `prefers-reduced-motion`.
- Десктопный интерфейс масштабирован до 125%; текст и крупные кнопки увеличены, рендеринг шрифта настроен на чёткость.
- Sidebar теперь сворачивается/разворачивается; выбор пространства оформлен, роли из него и подпись Owner из профиля убраны, выбранное пространство имеет светло-серую заливку.
- Глобальный поиск работает кликом и через `Ctrl/Cmd+K`, поддерживает фильтрацию и переход к разделу.
- Статистика переключается между 1/2/3 неделями, 1/2/3 месяцами, полугодием и годом; сервер отдаёт события за 365 дней.
- Действия журнала локализуются на русский вместе с типами сущностей.
- Toast остановки/запуска сотрудника исправлен: светлая поверхность, чёрный читаемый текст.
- Ручное создание лидов и записей удалено из UI; POST API возвращает `405 AI_MANAGED_RESOURCE`. ИИ продолжает создавать их через внутренний action registry.
- Загрузка документов в знаниях получила оформленную кнопку выбора файла.
- Прайсинг отображает Free $0/14 дней, Starter $19, Pro $49, Business $99 и Enterprise по запросу.
- Настройки поддерживают загрузку логотипа файлом (до 1,5 МБ), preview/removal и сохранение data URL; часовой пояс выбирается из списка.
- Тёмная тема получила отдельные поверхности, границы, поля, карточки и контраст; системная тема разрешается через `matchMedia`.
- Проверки после блока: `npm test` — PASS 44/44; `npm run typecheck` — PASS; `next build` компилирует production bundle успешно, после чего Windows sandbox останавливает дочерний TypeScript worker с известным `spawn EPERM`.
- Локальный Docker image автоматически не пересобран: sandbox отклоняет доступ к `dockerDesktopLinuxEngine` named pipe. Для визуальной проверки требуется `docker compose --profile smoke up -d --build`, затем `Ctrl+Shift+R`.

### Full HTTP runtime smoke 2026-08-11

- Добавлен Linux Compose profile `smoke`: production standalone image приложения запускается рядом с PostgreSQL/pgvector на `http://localhost:3100`; DB доступна приложению по внутреннему `postgres:5432`.
- Docker build context оптимизирован: `.npm-cache` (около 193 МБ) исключён вместе с `.next` и `node_modules`.
- Реальный Next standalone container успешно поднят. `/api/health/live` возвращает `200` с `status: ok`.
- Добавлен повторяемый gate `npm run test:http-smoke` (`scripts/http-smoke.mjs`) с настраиваемыми `SMOKE_BASE_URL`, `DATABASE_URL` и `SMOKE_CRON_SECRET`.
- HTTP smoke дважды прошёл полный критический путь через настоящий HTTP и PostgreSQL: регистрация через Next Server Action → `303 /onboarding` → HttpOnly session → защищённая onboarding page → mock AI preview/attestation → публикация ACTIVE AI employee → background knowledge indexing → knowledge health 100 → origin-bound public widget token → widget message/AI response → manager takeover → human reply → signed visitor polling → lead → appointment → `/app`.
- Проверенные HTTP статусы последнего прогона: register 303, onboarding 200, preview 200, publish 303, knowledge 200, widget 200, takeover 200, human reply 201, lead 201, appointment 201, manager app 200. Widget polling вернул AI и human messages.
- Каждый smoke run удаляет созданный workspace/user через Prisma. Дополнительно удалены 2 тестовых workspace/user от прерванных прогонов; остаток `http-smoke-%@lemiri.local` равен 0.
- Первый API preview с `Origin: http://127.0.0.1:3100` был корректно отклонён `403 INVALID_ORIGIN`, поскольку configured origin был `http://localhost:3100`; повтор с точным origin прошёл. Это подтверждает fail-closed origin enforcement в runtime.
- Standalone Next всегда выставляет `NODE_ENV=production`, поэтому старый smoke image возвращает readiness `503 configuration:error` для mock provider, хотя runtime flow работает. Добавлен `LEMIRI_LOCAL_SMOKE=true`, разрешающий mock readiness только при точном loopback `PUBLIC_APP_URL` (`localhost`/`127.0.0.1`). Внешний HTTPS origin с тем же флагом по-прежнему fail-closed; добавлен regression test.
- Новый image успешно собран и контейнер пересоздан. Финальная проверка: `/api/health/live` — `200`; `/api/health/ready` — `200`, `database: ok`.
- Dockerfile использует BuildKit npm cache, `--prefer-offline`, retries/extended fetch timeout и IPv4-first DNS для dependency, builder и runtime stages. Это устранило длительное зависание Linux `npm ci` в Docker Desktop.
- Финальные проверки нового image: `npm run test:http-smoke` — PASS; `npm run test:db-smoke` — PASS с vector query/cascade cleanup; `npm test` — PASS, 44/44; `npm run typecheck` — PASS; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.

### PostgreSQL/pgvector migration и live DB smoke 2026-08-11

- Docker PostgreSQL/pgvector поднят и отвечает в контейнере `pnpm-dev-postgres-1`; из-за уже занятого системным PostgreSQL host port `5432` compose переведён на `127.0.0.1:55432` (`55432:5432`).
- Initial migration `20260811000000_initial` реально применена к чистой БД `lemiri` атомарно через PostgreSQL 16 `psql --single-transaction`. Prisma Windows schema engine не использовался, поскольку sandbox запрещает его запуск с `spawn EPERM`.
- Состояние миграции зарегистрировано в совместимой таблице `_prisma_migrations` с SHA-256 `4a5350087d0e05331979322c3c8b99b82183e67666b66b104053fc0f27b3157f`.
- Проверено напрямую: 36 public tables с учётом `_prisma_migrations`, extension `vector` установлен, migration record активен и checksum совпадает.
- Добавлен повторяемый integration gate `npm run test:db-smoke` (`scripts/runtime-db-smoke.mjs`). Он использует переданный `DATABASE_URL`, не содержит production secrets и после себя удаляет smoke workspace/user.
- Live DB smoke создаёт настоящие связанные записи User → Workspace/OWNER member/settings → ACTIVE AI employee/settings → Knowledge source/document/chunk/vector → Customer/conversation/messages/handoff → Lead/appointment/channel/analytics. Проверяются relation loading, vector distance query и cascade cleanup.
- Два последовательных запуска DB smoke — PASS; последний результат: 1 member, 1 employee, 1 knowledge chunk/vector match, 2 messages, 1 handoff, 1 lead, 1 appointment, 1 channel, 1 analytics event, cleanup PASS.
- Финальные gates после migration: `npm test` — PASS, 43/43; `npm run typecheck` — PASS; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- Next production code компилируется успешно. Sandbox затем запрещает fork сначала TypeScript worker, а при временном пропуске встроенного typecheck — page-data worker (`spawn EPERM`). Временные параметры build полностью возвращены; `next.config.ts` не ослаблен. Поэтому HTTP-level auth/onboarding/widget smoke в этой сессии ещё не выполнен.

### Live manager conversation updates 2026-08-11

- Завершён текущий логический блок human reply: экран менеджера теперь подписывается на `GET /api/conversations/[id]/events` через native `EventSource` и обновляет server-rendered данные при появлении сообщения.
- SSE endpoint сначала проверяет сессию и существование conversation именно в активном workspace; чужой ID возвращает `404` и не открывает поток.
- `Last-Event-ID` валидируется перед созданием cursor. Невалидное значение безопасно заменяется на текущее время минус одна секунда.
- Сервер отправляет только минимальные поля сообщения, задаёт reconnect delay, heartbeat и anti-buffering headers. Флаг `querying` не допускает наложения Prisma polling queries.
- Abort/cancel очищают interval и закрывают stream. Клиент снимает event listener и закрывает `EventSource` при смене диалога или unmount.
- Callback обновления хранится в `useRef`, поэтому смена identity функции `router.refresh` не вызывает постоянные переподключения SSE.
- Добавлены 3 regression-теста для tenant scope/cursor, lifecycle потока и client cleanup.
- Финальные проверки: `npm test` — PASS, 43/43; `npm run typecheck` — PASS; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- Git-проверка повторно невозможна: `C:\Users\pc\Documents\Codex\2026-08-11\pnpm-dev` не является Git-репозиторием.
- Production build повторно проверен после блока: Next.js/Turbopack успешно собрал optimized bundle (`Compiled successfully in 8.6s`), после чего sandbox запретил запуск отдельного TypeScript worker с `spawn EPERM`. Ошибок компиляции приложения не выявлено; это остаётся ограничением окружения, а не найденной code-level ошибкой.
- Runtime infrastructure перепроверена: Docker Desktop Linux Engine не запущен (`dockerDesktopLinuxEngine` pipe отсутствует). При этом на `127.0.0.1:5432` работает другой локальный PostgreSQL 16, но в нём нет роли `lemiri`; compose credentials не относятся к этому инстансу. Системный `psql` подтвердил это напрямую. Без запуска Docker либо предоставления отдельной тестовой БД initial migration применять нельзя.
- `prisma validate` с целевым `DATABASE_URL` — PASS. `prisma migrate status` не дошёл до подключения: sandbox запретил запуск `schema-engine-windows.exe` с `spawn EPERM`.
- После запуска Docker обнаружен конфликт: системный PostgreSQL уже занимает host port `5432`, из-за чего project container останавливался. `docker-compose.yml` и `.env.example` переведены на изолированный host port `55432`; внутри контейнера PostgreSQL по-прежнему слушает стандартный `5432`.

### End-to-end human reply after handoff 2026-08-11

- После takeover менеджер теперь действительно может продолжить разговор из UI: добавлена RU/EN форма ответа в активном `HUMAN_ACTIVE` диалоге и tenant/RBAC-protected `POST /api/conversations/[id]/messages`.
- Reply разрешён только после takeover. В одной transaction создаётся OUTBOUND Message, conversation закрепляется за текущим member, открытые handoffs переводятся в `RESOLVED`, создаётся `HUMAN_RESPONSE` analytics event.
- Для Telegram/WhatsApp/email в той же transaction создаётся `OUTBOUND_CHANNEL_MESSAGE` background job с recipient из tenant customer external ID. При недоступном/неподключённом канале ответ не сохраняется как якобы доставленный.
- Для WEBSITE добавлен signed polling endpoint на widget message route. Он проверяет HMAC widget token, parent origin, employee, conversation ID и точный visitor external ID; чужой conversation нельзя прочитать по одному ID.
- Widget опрашивает ответы каждые 2 секунды, ведёт message-ID deduplication и timestamp cursor с `gte`, поэтому не теряет сообщения с одинаковым timestamp и не перечитывает всю историю бесконечно. Polling ограничен rate limit.
- Немедленный AI response теперь возвращает `messageId`, чтобы polling не дублировал уже показанный ответ.
- Добавлены regression-тесты takeover requirement, atomic external delivery job и website visitor binding. Проверки: `npm run typecheck` — PASS; `npm test` — PASS, 40/40; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.

### Stable employee role/tone keys 2026-08-11

- Новые AI-сотрудники сохраняют locale-independent canonical keys: роли `ADMINISTRATOR`/`SALES`/`SUPPORT`, тона `WARM_PROFESSIONAL`/`CONCISE_BUSINESS`/`FRIENDLY`.
- Employee validation принимает стабильные keys и временно нормализует старые русские значения, поэтому ранее созданные формы/данные не ломаются. Неизвестные role/tone отклоняются.
- Onboarding отправляет stable keys; configuration digest и test attestation привязаны к ним. Permission defaults теперь сравнивают `SUPPORT`, а не локализованную строку.
- RU/EN UI отображает keys через единый domain mapper. Старые русские records также отображаются корректно.
- Production orchestrator и onboarding preview переводят keys обратно в понятные локализованные бизнес-описания перед передачей AI provider; технические enum-like значения не попадают в system prompt.
- Добавлены тесты legacy normalization, stable input и RU/EN rendering. Проверки: `npm run typecheck` — PASS; `npm test` — PASS, 38/38; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.

### Granular manager assignments 2026-08-11

- Реализовано буквальное требование раздела 43 мастер-промпта: участника workspace можно назначить ответственным за конкретный диалог, лид и AI-сотрудника.
- Assignment хранится через nullable relation на `WorkspaceMember`, а не глобальный user ID. API одновременно проверяет entity workspace и member workspace; VIEWER не может быть ответственным. Удаление участника делает assignment `NULL` через FK `ON DELETE SET NULL`.
- Добавлена capability `MANAGE_ASSIGNMENTS` для OWNER/ADMIN/MANAGER, tenant-scoped `PUT /api/assignments` и audit events `WORK_ASSIGNED`/`WORK_UNASSIGNED`.
- Takeover автоматически переводит conversation в `HUMAN_ACTIVE` и назначает текущего workspace member ответственным.
- В UI добавлены локализованные RU/EN controls назначения на карточках AI-сотрудников, в заголовке активного диалога и в таблице лидов.
- Prisma schema/initial migration дополнены тремя FK и индексами; количество моделей/таблиц не изменилось (35).
- Проверки: `prisma validate` — PASS; `npm run typecheck` — PASS; `npm test` — PASS, 37/37; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.

### Отдельный lifecycle password reset tokens 2026-08-11

- Password reset больше не переиспользует `Session`. Добавлена отдельная `PasswordResetToken` модель/таблица с hash, expiry, cascade relation и индексами.
- `userId` уникален: у пользователя может существовать только одна актуальная reset-ссылка. Выпуск токена сериализуется user-specific PostgreSQL advisory transaction lock, поэтому параллельные forgot-password requests не создают несколько валидных ссылок.
- Reset token потребляется атомарным `DELETE ... WHERE expiresAt > CURRENT_TIMESTAMP RETURNING userId` внутри той же transaction, где обновляется password hash, отзываются все sessions и удаляются остальные reset tokens. Повторный или конкурентный reset не может пройти дважды.
- Ошибка отправки Resend удаляет только токен конкретного письма; `SESSION_CLEANUP` теперь также удаляет истёкшие `PasswordResetToken`.
- Initial migration и Prisma relation обновлены; общее число моделей/таблиц теперь 35. `prisma generate` обновил generated TypeScript API модели, но снова получил известный Windows `EPERM` при финальном rename query engine DLL.
- Добавлен regression-тест отдельной persistence-модели и atomic consume query. Проверки: `prisma validate` — PASS; `npm run typecheck` — PASS; `npm test` — PASS, 35/35; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.

### Stripe event ordering cursor 2026-08-11

- В `Subscription` добавлены `providerEventId` и `providerEventCreatedAt`; соответствующие колонки включены в ещё не применённую initial PostgreSQL migration.
- Checkout и subscription webhook mutations сериализуются workspace-specific PostgreSQL advisory transaction lock. Внутри той же transaction читается cursor, выполняется mutation и сохраняется новый cursor.
- Повтор события с тем же Stripe event ID и событие со строго более старым `created` подтверждаются, но возвращают `ignored: STALE_EVENT` и не меняют подписку. Разные события одной секунды разрешены, поскольку Stripe timestamp имеет секундную точность.
- Webhook теперь требует валидные `id`, `type`, `data.object` и положительный `created` timestamp.
- Добавлены unit-тесты duplicate, stale, equal-second и newer event semantics.
- Проверки после изменения схемы: `prisma validate` — PASS; `npm run typecheck` — PASS; `npm test` — PASS, 34/34; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- Live migration/runtime подтверждение по-прежнему требует доступного PostgreSQL/pgvector; Docker Engine в предыдущих проверках отсутствовал.

### Stripe webhook integrity и encoding gate 2026-08-11

- Stripe subscription plan теперь определяется только точным совпадением фактического price ID с `STRIPE_START_PRICE_ID`/`STRIPE_GROWTH_PRICE_ID`. Неизвестный price для `ACTIVE`/`TRIALING` fail-closed и больше не превращается автоматически в START или GROWTH из metadata.
- Для cancel/past-due/deleted events без line items сохраняется последний известный plan, но применяется неактивный status, поэтому entitlement немедленно откатывается к TRIAL и отключение подписки не игнорируется.
- Subscription event сначала связывается с существующим `externalPlanId`/`externalCustomerId`; конфликт metadata workspace с уже сохранённой привязкой игнорируется как `WORKSPACE_BINDING_MISMATCH`. Неизвестный workspace не создаёт orphan subscription.
- Checkout session требует совпадения `client_reference_id` и metadata workspace. Для нового checkout создаётся `INCOMPLETE`, а существующая активная подписка не понижается до прихода authoritative subscription event.
- Webhook возвращает контролируемые ответы для malformed JSON/invalid event. Проверка Stripe signature поддерживает несколько `v1` значений при ротации webhook secret.
- Добавлены тесты multi-signature rotation, exact price mapping, unknown active price и cancellation без price.
- Байтовый scan подтвердил, что остальные исходники не содержат характерных mojibake-последовательностей; искажённый ранний вывод был особенностью PowerShell decoding. Добавлен автоматический encoding regression test по `src`.
- После изменений: `npm run typecheck` — PASS; `npm test` — PASS, 33/33; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- Защита от duplicate/out-of-order Stripe events реализована через provider event cursor и advisory transaction lock.

### Enforcement месячного лимита диалогов 2026-08-11

- `conversationLimit` из центрального plan catalog теперь реально enforced во всех production ingress-путях, создающих диалоги: public website widget и Telegram/WhatsApp/email connector ingest.
- Проверка месячного UTC-периода и создание Conversation выполняются атомарно внутри одной Prisma transaction под workspace-specific PostgreSQL advisory lock. Параллельные новые посетители не могут превысить тарифный cap.
- После получения lock ingress повторно ищет conversation по tenant/channel/external ID: повторное сообщение в существующий диалог разрешено даже при исчерпанном лимите и не расходует новую единицу.
- Widget возвращает `402 PLAN_CONVERSATION_LIMIT_REACHED` и показывает посетителю локализованное RU/EN объяснение. Connector webhook подтверждает получение, но возвращает для конкретного сообщения `rejected: true` с машинным кодом, предотвращая бессмысленные provider retries.
- Connector customer creation переведён на tenant-scoped upsert; conversation и `CONVERSATION_STARTED` analytics event создаются в одной transaction. Его message-idempotency использует общий `P2002` classifier.
- Public widget переписан чистым UTF-8; последующий байтовый scan подтвердил отсутствие mojibake в остальных исходниках (искажение раннего вывода было артефактом PowerShell decoding).
- Unit-тест entitlement дополнен точными границами conversation cap для TRIAL и GROWTH. После изменений: `npm run typecheck` — PASS; `npm test` — PASS, 31/31; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.

### Enforcement лимита AI-сотрудников 2026-08-11

- Тарифный `employeeLimit` теперь реально применяется при публикации сотрудника из onboarding и при переводе существующего сотрудника в `ACTIVE` через API.
- Проверка выполняется внутри той же Prisma transaction, что и mutation, под workspace-specific PostgreSQL advisory transaction lock. Параллельные activation requests не могут одновременно пройти проверку и превысить лимит.
- Entitlement берётся из центрального `billingPlans`; подписки со статусом кроме `ACTIVE`/`TRIALING`, а также неизвестные планы безопасно получают лимиты `TRIAL`.
- API возвращает `409 PLAN_EMPLOYEE_LIMIT_REACHED`; server action показывает локализованную RU/EN ошибку и не создаёт частично настроенного сотрудника.
- Добавлены unit-тесты разрешённых статусов subscription, fallback плана и границ employee cap. После изменений: `npm run typecheck` — PASS; `npm test` — PASS, 31/31; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- Месячный `conversationLimit` из каталога пока только отображается и учитывается, но ещё не enforced. Его нужно реализовать следующим отдельным блоком с атомарным созданием новых conversations во всех ingress-путях.

### Усиление widget idempotency 2026-08-11

- Закрыта concurrent race при создании widget conversation: `P2002` на уникальном `(workspaceId, channelType, externalId)` теперь приводит к безопасному перечитыванию записи-победителя с повторной проверкой `employeeId`, а не к HTTP 500.
- Закрыта concurrent race при создании входящего widget message: `P2002` по `externalId` возвращает тот же idempotent duplicate-response, что и обычный повторный запрос; automation и AI не запускаются второй раз.
- Добавлен изолированный helper `src/lib/db-errors.ts`, который распознаёт только Prisma unique constraint code `P2002`, не поглощая остальные ошибки.
- Добавлен unit-тест этого error classification. После изменений: `npm run typecheck` — PASS; `npm test` — PASS, 30/30; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- Попытка добавить официальный ESLint 9 / `eslint-config-next` gate не изменила manifest или lockfile: системный npm cache недоступен на запись, а установка с локальным cache зависла до таймаута. В рабочем каталоге осталась служебная `.npm-cache`; sandbox policy не разрешила её удалить.

### Финализация текущего блока 2026-08-11

- Завершена локализация оставшихся server-generated строк: widget и connector ingest, фоновые jobs, knowledge/analytics/insights API, team invite email и уведомления, orchestrator handoff, каталог действий и dashboard fallback-роли.
- Исправлен критичный invite flow: неавторизованный пользователь возвращается на исходный `/invite/[token]` после входа, приглашение больше не теряется.
- `returnTo` проходит same-origin проверку: разрешены только абсолютные внутренние пути; protocol-relative и внешние URL отклоняются.
- Чистые locale helpers вынесены в `src/lib/locale-utils.ts`. Клиентский `AuthForm` больше не импортирует модуль с `next/headers`, что устраняет потенциальное нарушение Next.js client/server boundary.
- Добавлены unit-тесты формирования locale URL и защиты `returnTo` от open redirect.
- Финальные проверки блока: `npm run typecheck` — PASS; `npm test` — PASS, 29/29; `npm audit --omit=dev --audit-level=moderate` — PASS, 0 vulnerabilities.
- `npm run build` в текущем запуске завис после вызова `next build` без дополнительного вывода и был остановлен внешним таймаутом. Ранее compilation доходила до успешного завершения и падала только на `spawn EPERM`; полноценный успешный build в этой sandbox-среде по-прежнему не подтверждён.
- Docker Desktop Linux Engine по-прежнему недоступен (`dockerDesktopLinuxEngine` named pipe отсутствует), поэтому initial migration и PostgreSQL runtime smoke не запускались.
- Рабочий каталог не является Git-репозиторием; `git status` и `git diff` недоступны.

### Продолжение 2026-08-11

- Повторно подтверждено: рабочий каталог не является Git-репозиторием, поэтому `git status` и `git diff` недоступны.
- Docker Desktop Linux Engine всё ещё недоступен через `dockerDesktopLinuxEngine`; живая проверка initial migration остаётся заблокирована инфраструктурой.
- Полностью локализован RU/EN экран Channels, удалён неиспользуемый `LegacyChannelsView`.
- Полностью локализованы RU/EN экраны Actions, Automations и Integrations, включая статусы, триггеры, toast/confirm/error states и locale-aware дату синхронизации.
- Полностью локализованы RU/EN экраны Analytics и Insights; даты журнала учитывают locale, ошибка загрузки insights имеет отдельное состояние.
- Полностью локализованы RU/EN экраны Team и Notifications; добавлены явные ошибки изменения роли, удаления участника и отметки уведомлений.
- Полностью локализованы RU/EN экраны Billing и Settings, включая тарифы, статусы подписки, locale-aware числа/даты, рабочие дни, retention и privacy UI.
- Полностью локализованы RU/EN TestLab и Playground; добавлены явные load/create/run/delete/send error states и блокировка тестов без AI-сотрудника.
- Полностью локализованы RU/EN login/register/forgot/reset-password: язык выбирается через `?lang=`, затем `Accept-Language`; server-action ошибки и reset email локализованы.
- Locale регистрации сохраняется сразу в `WorkspaceSettings`, поэтому onboarding и workspace продолжают работу на выбранном языке.
- Полностью локализован шестишаговый onboarding отдельным типобезопасным domain dictionary без изменения канонических role/tone values.
- Полностью локализован public website widget на основе locale рабочего пространства; внутренние API error codes больше не показываются посетителю.
- Для channel/integration secrets отключено browser autocomplete; добавлены явные состояния отсутствия AI-сотрудников/действий и ошибки update/delete.
- После всех изменений продолжения: `npm run typecheck` — PASS; `npm test` — PASS, 27/27.

Создан работающий фундамент production SaaS-платформы Lemiri AI на Next.js 16, React 19, TypeScript, Prisma и PostgreSQL/pgvector. Это не набор mock-страниц: основные пользовательские операции выполняются через реальные API, транзакции и persistent-модели.

Полная цель мастер-промпта ещё не доказана как завершённая. Главные незакрытые пункты: применение initial migration на живом PostgreSQL, production-provider smoke с настоящими credentials и финальный requirement-by-requirement runtime-аудит.

## Что реализовано

### Авторизация, безопасность и multi-tenancy

- Регистрация, вход, выход и scrypt-хеширование паролей.
- Серверные сессии с HttpOnly cookie, сроком жизни, IP hash и user-agent.
- Password reset через одноразовый domain-separated token и Resend.
- Workspace membership и роли `OWNER`, `ADMIN`, `MANAGER`, `VIEWER`.
- Централизованная RBAC-матрица для product actions.
- Безопасное переключение активного workspace: cookie принимается только для workspace, членом которого является пользователь.
- Tenant scope применяется в API и запросах Prisma.
- Rate limiting для auth, widget и onboarding preview.
- AES-256-GCM для credentials интеграций и каналов.
- Audit log, operational events, privacy export, workspace deletion API и retention job.
- Production runtime config работает fail-closed при отсутствии обязательных секретов/provider configuration.

### AI-сотрудники и onboarding

- CRUD AI-сотрудников со статусами `DRAFT`, `TRAINING`, `TESTING`, `ACTIVE`, `PAUSED`, `ERROR`.
- Бизнес-роли: администратор, менеджер продаж, поддержка.
- Настройки: цель, тон, дополнительные инструкции, handoff rules.
- Шестишаговый onboarding:
  1. роль;
  2. шаблон бизнеса;
  3. поведение и handoff;
  4. первые знания;
  5. website/CRM connections;
  6. реальная пробная AI-беседа и публикация.
- Preview использует тот же `configuredAIProvider`, что и production conversations; actions в preview запрещены.
- Успешный preview выдаёт HMAC-attestation на 30 минут, привязанную к digest всей конфигурации.
- Публикация с `ACTIVE` запрещена сервером без действительной attestation.
- Изменение формы сбрасывает preview token; сервер также повторно сверяет digest.
- Инструкции и handoff rules передаются OpenAI provider и в preview, и в реальных диалогах.

### AI/RAG и действия

- OpenAI Responses API со strict JSON schema.
- Development-only mock provider; production config требует `AI_PROVIDER=openai`.
- Embeddings API, knowledge chunking, pgvector retrieval и проверка source IDs.
- AI не должен выдумывать отсутствующие факты; при нехватке знаний создаётся handoff/knowledge gap.
- Разрешённые действия передаются модели только из enabled permissions.
- Реализованы действия: create lead, create appointment, notify manager, handoff to human.
- ActionExecution хранит вход, выход, статус и причину ошибки.
- Ошибка action переводит разговор человеку вместо ложного подтверждения успеха.

### Knowledge

- Источники: text, FAQ, website и документы.
- Документы: PDF, DOCX, TXT, CSV, XLSX, лимит загрузки.
- Website crawl с robots.txt, SSRF-защитой и DNS/IP validation.
- Background jobs для crawl/indexing с retry и восстановлением stale lease.
- Knowledge health, gaps и insights.
- Текущий логический блок RU/EN завершён: health score, gaps, source types, upload/form, table statuses, errors и empty state используют типобезопасный словарь.

### Диалоги, handoff и website widget

- Conversations/messages сохраняются в PostgreSQL-моделях.
- Human takeover останавливает дальнейшие AI-ответы.
- Handoff создаёт notification и analytics event.
- Website widget защищён HMAC-token, привязанным к employee, browser-observed parent origin и expiry.
- Allowed origins нормализуются до origin.
- Widget token передаётся postMessage handshake, а не query string.
- Visitor ID возвращает посетителя в тот же диалог после reload.
- Message UUID обеспечивает idempotency повторных запросов.
- Widget CSP допускает embedding; остальная платформа остаётся с `frame-ancestors 'none'`.

### CRM, каналы и integrations

- Website, Telegram, WhatsApp и email connector infrastructure.
- Telegram webhook secret verification.
- WhatsApp Meta signature verification.
- CRM signed webhook integration с очередью и test endpoint.
- Встроенное создание лидов и записей.
- Inbound message после takeover сохраняется и уведомляет менеджера, но не запускает AI.

### Automations, testing и analytics

- Триггеры `MESSAGE_RECEIVED`, `AI_RESPONSE`, `HANDOFF_CREATED`.
- Automation conditions и последовательность action steps.
- Regression test cases для AI employee с expected text/handoff.
- Analytics events для conversations, leads, appointments, handoffs и AI responses.
- Dashboard sparklines и totals строятся из реальных событий, не demo data.
- Knowledge insights и operational logging.

### Billing, team и settings

- Stripe checkout и webhook signature validation.
- Central plan catalog: TRIAL, START, GROWTH.
- Usage: messages, conversations, actions, AI usage, knowledge bytes, active employees.
- Invitations, acceptance flow и изменение ролей команды.
- Workspace settings: name, locale, timezone, theme, retention, analytics, AI training opt-in.
- Добавлены logo URL и working hours с server-side validation.
- Privacy export исключает пароли и encrypted credentials.

### UI и локализация

- Responsive desktop/mobile shell, drawer, cards, tables, chat, onboarding и dark theme.
- Навигация хранит стабильные `PageId`, а не русские подписи.
- RU/EN словари типобезопасны: английский каталог обязан содержать каждый русский ключ.
- Локализованы shell, dashboard, employee readiness, empty states и даты.
- Полностью локализованы Employees, Conversations, Leads, Appointments и Knowledge.
- Feature dispatcher переписан с большой тернарной строки на явный `switch` и передаёт locale рабочим модулям.

### Deployment

- Dockerfile с standalone Next output и non-root user.
- `.dockerignore`, `.env.example`, health live/ready endpoints.
- Initial PostgreSQL migration включает `CREATE EXTENSION vector`, enums, 35 таблиц, индексы, unique constraints и foreign keys.
- Пустой дублирующий migration directory удалён.

## Что проверено

Последний запуск 2026-08-11:

```text
npm run typecheck
PASS — tsc --noEmit

npm test
PASS — 27/27 tests

npm audit --omit=dev --audit-level=moderate
PASS — found 0 vulnerabilities

npm run build
Next compilation PASS
Final worker FAILED — spawn EPERM
```

Production build дошёл до:

```text
Creating an optimized production build ...
Compiled successfully
Running TypeScript ...
spawn EPERM
```

То есть Turbopack production compilation успешна; отказ происходит при создании дочернего процесса в текущей Windows sandbox-среде.

Дополнительно ранее проверено:

- Prisma schema содержит 35 моделей, initial SQL — 35 соответствующих таблиц, missing/extra отсутствуют.
- OpenAI citation validation и allowed action validation.
- Auth hashing и password reset token separation.
- Credential encryption.
- Telegram/WhatsApp/Stripe signatures.
- Workspace membership selection.
- Widget origin-bound token и expiry.
- Robots.txt handling и knowledge extraction/chunking.
- Billing plan catalog.
- Production runtime config fail-closed.
- Onboarding attestation binding, tamper rejection и expiry.
- AI provider получает business instructions и handoff rules.

## Что осталось

### 1. Живая проверка PostgreSQL migration

Initial SQL создан и статически сверен, но `prisma migrate deploy` не был доказан на живой БД. Docker Desktop Linux Engine не доступен через named pipe в этой среде.

Нужно на машине с работающим Docker/PostgreSQL:

```powershell
docker compose up -d db
npm run db:deploy
npm run db:generate
```

После этого выполнить smoke flow: register → onboarding → knowledge indexing → widget message → AI response/handoff → lead/appointment.

### 2. Завершить RU/EN

Основной RU/EN UI завершён для Channels, Integrations, Actions/Automations, Analytics/Insights, Team/Billing/Settings/Notifications, TestLab/Playground, auth, onboarding и public widget. Основные server-generated notifications/errors также локализованы.

Остаются динамические бизнес-данные и отдельные fallback literals; `src/components/platform.tsx` всё ещё слишком большой и его дальнейшее разделение упростит контроль i18n.

### 3. Финальный runtime-аудит мастер-промпта

Нужен проход по всем 94 разделам исходного prompt с доказательством каждого требования через UI/API/runtime. Особое внимание:

- реальная delivery Telegram/WhatsApp/email с валидными provider credentials;
- Stripe checkout/webhook в test mode;
- Resend reset email;
- OpenAI Responses + embeddings на реальном ключе;
- CRM webhook retry/idempotency;
- automation execution;
- privacy deletion/export;
- mobile viewport и keyboard accessibility.

### 4. Дополнительные production improvements

- Разделить `src/components/platform.tsx` на domain components.
- Удалить неиспользуемый `LegacyChannelsView` и возможный `src/lib/demo-data.ts` после проверки imports.
- Добавить lint script/ESLint configuration.
- Добавить Playwright E2E для auth/onboarding/widget/takeover.
- Добавить integration tests с настоящим ephemeral PostgreSQL/pgvector.
- Concurrent idempotency widget message/create conversation с обработкой `P2002` race реализована.
- Password reset вынесен из `Session` в отдельную одноразовую `PasswordResetToken` модель с atomic consume.
- Granular manager assignment к conversations/leads/employees реализован согласно разделу 43 мастер-промпта.
- Enforcement тарифных лимитов сотрудников и месячных conversations реализован атомарно.

## Известные проблемы и ограничения

1. `npm run build` компилирует production bundle, но завершается `spawn EPERM` на финальном Next TypeScript worker в sandbox.
2. `prisma generate` обновляет generated types, затем иногда получает `EPERM` при rename `query_engine-windows.dll.node`, вероятно из-за file lock.
3. Docker Desktop Linux Engine не поднят/недоступен, поэтому migration deploy и PostgreSQL runtime smoke не подтверждены.
4. Основной UI RU/EN закончен; остаются отдельные server-generated notification/error strings и динамические бизнес-данные.
5. `platform.tsx` остаётся монолитным и усложняет дальнейшие безопасные изменения.
6. Новые роли/тона хранятся как стабильные enum-like keys; compatibility mapper продолжает читать старые русские значения до отдельной data migration существующих БД.
7. Production provider flows требуют настоящих secrets из `.env`; без них development использует mock provider.

## Рекомендуемый следующий шаг

Не начинать новый широкий аудит до восстановления runtime infrastructure.

1. Запустить PostgreSQL/pgvector и применить initial migration.
2. Выполнить один полный smoke flow на живой БД.
3. Подключить test credentials OpenAI/Resend/Stripe и хотя бы одного внешнего канала, затем проверить фактическую delivery и webhook flows.
4. После зелёного smoke выполнить отложенный requirement-by-requirement audit и Playwright E2E.

## Основные точки входа

- `prisma/schema.prisma`
- `prisma/migrations/20260811000000_initial/migration.sql`
- `src/app/app/page.tsx`
- `src/components/platform.tsx`
- `src/components/onboarding-form.tsx`
- `src/lib/i18n.ts`
- `src/lib/ai/orchestrator.ts`
- `src/lib/ai/providers/openai.ts`
- `src/lib/knowledge/index.ts`
- `src/lib/knowledge/retrieve.ts`
- `src/lib/actions/registry.ts`
- `src/lib/jobs/worker.ts`
- `src/app/api/widget/[employeeId]/messages/route.ts`
- `README.md`

## Команды продолжения

```powershell
npm run typecheck
npm test
npm audit --omit=dev --audit-level=moderate
npm run build
npm run db:deploy
```

## Cloudflare Workers adaptation — 2026-08-12

- Добавлены зафиксированные `@opennextjs/cloudflare@1.20.2` и `wrangler@4.122.0`, а также команды `build:cloudflare`, `deploy:cloudflare`, `preview:cloudflare`.
- Добавлены `open-next.config.ts` и `wrangler.jsonc` с `nodejs_compat`, Worker entrypoint и static assets binding.
- Node.js `src/proxy.ts` заменён на поддерживаемый OpenNext Edge Middleware `src/middleware.ts`; защита same-origin мутаций и request-id сохранена.
- Prisma переведён на JavaScript engine (`engineType = "client"`) и официальный PostgreSQL adapter `@prisma/adapter-pg`, чтобы исключить несовместимый Rust query engine в Workers.
- `.open-next`, `.wrangler` и `.dev.vars` исключены из Git.
- Проверки: Prisma generate PASS, TypeScript PASS, тесты PASS 44/44. Обычный Next production bundle компилируется; локальный Windows sandbox блокирует только дочерний worker с `spawn EPERM`. OpenNext на Windows доходит до запуска adapter build и также блокируется sandbox-запретом `esbuild spawn EPERM`; финальная полная сборка должна выполняться в Linux CI Cloudflare.
- Настройки Cloudflare после push: Build command `npm run build:cloudflare`, Deploy command `npm run deploy:cloudflare`, Version command `npx wrangler versions upload`, Root `/`.
- До production запуска создать Cloudflare secrets/variables как минимум: `DATABASE_URL`, `PUBLIC_APP_URL`, `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET`; далее подключить Resend/Stripe/WhatsApp по необходимости.
- Миграции Prisma не выполняются Worker-деплоем. Их нужно один раз применить к production PostgreSQL отдельно командой `DATABASE_URL=... npm run db:deploy` из защищённой CI/локальной среды.
