"use client";

import { useCallback, useEffect, useState } from "react";
import { AppWindow, ArrowDownLeft, ArrowUpRight, BookOpen, Bot, Check, Copy, Globe, Link2, MessageCircle, RefreshCw, Search, X } from "lucide-react";
import type { AssistantUsage } from "@/lib/platform/usage";
import { formatAmount } from "@/lib/billing/p2p";
import { Field, Section, Toggle } from "../sales/ui";

// «Админка» — visible to Lemeri platform admins only (env LEMIRI_ADMIN_EMAILS).
// Controls Lemeri's own assistant on the landing page and in every customer's
// cabinet. The assistant itself (prompt, knowledge, card, first message) is the
// AI seller of the «Lemeri AI» workspace and is edited in the usual sections.

type Status = {
  settings: { workspaceId: string | null; employeeId: string | null; landing: boolean; app: boolean; updatedAt: string | null };
  employee: { id: string; name: string; status: string; workspace: string } | null;
  cardConnected: boolean; inThisWorkspace: boolean;
  stats: { dialogs: number; leads: number };
  model: { provider: string; configured: boolean; name: string };
  payments: Array<{ id: string; workspace: string; ownerEmail: string | null; plan: "STARTER" | "CUSTOM"; interval: "month" | "year"; amount: number; currency: string; code: string; payerName: string; note: string; status: "PENDING" | "CONFIRMED" | "REJECTED" | "REFUNDED"; createdAt: string; decidedAt: string | null; method: "transfer" | "crypto"; txId: string | null }>;
  p2pConfigured: boolean;
  usage?: AssistantUsage | null;
  sales: { total: number; month: number; count: number; monthCount: number; active: { STARTER: number; CUSTOM: number }; accounts: number; refunded?: number; refunds?: number } | null;
  refunds?: RefundItem[];
  transfers: Array<{ txId: string; direction?: "in" | "out"; counterparty?: string | null; counterpartyName?: string | null; comment?: string | null; amount: number; time: string; fromName: string | null; from: string | null; requestId: string | null; workspace: string | null; ownerEmail: string | null; plan: string | null; status: string | null }> | null;
};
type RefundItem = { id: string; workspace: string; ownerEmail: string | null; plan: string; interval: string; amount: number; currency: string; comment: string; status: string; createdAt: string; decidedAt: string | null; paidMethod: string | null; paidTx: string | null; paidFrom: string | null; periodEnd: string | null };
type Grant = { email: string; plan: "STARTER" | "CUSTOM"; interval: "month" | "year"; txId?: string };

const T = {
  ru: {
    title: "Ассистент Lemeri", copy: "ИИ-ассистент самого Lemeri: консультирует посетителей лендинга и помогает клиентам в кабинете. Это ИИ-продавец пространства «Lemeri AI» — его промпт, знания, карточка и первое сообщение настраиваются в обычных разделах.",
    loading: "Загружаем…", failed: "Не удалось загрузить админку", retry: "Повторить",
    where: "Где показывать", landing: "На лендинге lemeriai.com", landingHint: "Карточка чата для посетителей сайта",
    app: "В кабинете клиентов", appHint: "Кнопка помощи внизу экрана у всех пользователей платформы",
    state: "Состояние", assistant: "Ассистент", workspace: "Пространство", card: "Карточка", connected: "подключена", notConnected: "не подключена",
    model: "Модель", keyMissing: "ключ OPENAI_API_KEY не задан", active: "работает", draft: "выключен", none: "не создан",
    month: "За 30 дней", dialogs: "диалогов", leads: "заявок",
    configure: "Настроить", employee: "ИИ-сотрудник", knowledge: "База знаний", widget: "Карточка и первое сообщение", conversations: "Диалоги",
    otherWorkspace: "Сейчас открыто другое пространство. Переключитесь на «Lemeri AI», чтобы настроить ассистента.",
    repair: "Настроить заново", repairHint: "Создаст недостающее: пространство «Lemeri AI», тариф Custom без лимита ответов, ИИ-сотрудника и карточку. Существующие настройки не меняются.",
    saved: "Сохранено", saveFailed: "Не удалось сохранить",
    payments: "Оплаты переводом", paymentsCopy: "Оплаты в USDT подтверждаются сами. Переводы — клиенты сообщили о переводе: найдите поступление в банке по сумме, коду и имени отправителя и подтвердите — тариф включится сразу. «Не найден» — клиент увидит, что перевод не нашли.",
    noPayments: "Заявок пока нет.", notConfigured: "Реквизиты не заданы: добавьте в Cloudflare LEMIRI_CRYPTO_USDT_TON (кошелёк USDT) или LEMIRI_P2P_RECIPIENT и LEMIRI_P2P_DETAILS — без них клиенты не видят, куда переводить.",
    confirm: "Подтвердить", reject: "Не найден", pending: "ждёт", confirmed: "подтверждено", rejected: "не найден", perYear: "год", perMonth: "месяц", from: "от",
    refundsTitle: "Отмены оплаты", refundsCopy: "Клиент нажал «Отменить оплату» и оставил комментарий. «Подтвердить отмену» сразу выключит тариф и пометит платёж как возвращённый — деньги верните вручную тем же способом. «Отклонить» — клиент увидит, что отмена не прошла, и адрес поддержки.",
    noRefunds: "Запросов на отмену нет.", approveRefund: "Подтвердить отмену", rejectRefund: "Отклонить", reasonPh: "Ответ клиенту (необязательно)", paidWith: "оплата", refundedTag: "отменено", declinedTag: "отклонено", until: "до",
    refundAsk: (amount: string, who: string) => `Отменить оплату ${amount} (${who})? Тариф выключится сразу, деньги нужно вернуть вручную.`, refundedStat: "возвратов",
    sales: "Продажи", revenue: "Выручка всего", revenueMonth: "За 30 дней", purchases: "покупок", activeSubs: "Активные подписки", accounts: "Аккаунтов на платформе",
    wallet: "Транзакции кошелька", walletCopy: "Последние USDT-переводы (TON) вашего кошелька: с какого адреса пришли деньги и куда ушли. Входящий платёж без счёта или с другой суммой привяжите к аккаунту — тариф включится сразу. Переводы из Кошелька Telegram приходят с его общего адреса «Wallet in Telegram» — по нему не узнать конкретного человека, аккаунт клиента видно по привязке к оплате.", walletEmpty: "Транзакций пока нет.",
    all: "Все", incoming: "Входящие", outgoing: "Исходящие", received: "Получено", sent: "Отправлено", fromAddr: "с адреса", toAddr: "на адрес", copied: "Адрес скопирован", copyAddr: "Скопировать адрес", commentLabel: "комментарий", walletFailed: "TonAPI не ответил — обновите страницу позже.",
    paid: "оплатил", unlinked: "не привязан", link: "Привязать к аккаунту",
    grant: "Выдать тариф", grantCopy: "Включить тариф аккаунту по email — например, если оплата пришла другим способом.", email: "Email аккаунта", plan: "Тариф", period: "Срок",
    grantDo: "Включить тариф", cancel: "Отмена", errors: { USER_NOT_FOUND: "Аккаунт с таким email не найден", TX_NOT_FOUND: "Транзакция не найдена среди поступлений", TX_USED: "Эта транзакция уже засчитана", INVALID_REQUEST: "Проверьте email" } as Record<string, string>,
    confirmAsk: (amount: string, code: string) => `Подтвердить перевод ${amount} (${code})? Тариф включится сразу.`,
    usageTitle: "Кто использует ИИ-продавца", usageCopy: "Аккаунты с карточкой чата и сайты, где она загружалась. Зелёная точка — карточка открывалась на сайте за последние 7 дней, жёлтая — раньше, серая — сайт добавлен в разрешённые, но карточку там ещё не видели.",
    usageFailed: "Не удалось загрузить список — обновите страницу.", usageEmpty: "Пока никто не подключил карточку.", usageNone: "Ничего не найдено.",
    usageAccounts: "Аккаунтов с карточкой", usageLive: "Работают на сайтах", usageLiveHint: "за 7 дней", usageDomains: "доменов", usageDialogs: "Диалогов на сайтах", usageDialogsHint: "за 30 дней",
    usageAll: "Все", usageOnLive: "Работают", usageNoSite: "Не на сайте", usageSearch: "Название, email или домен", usageMore: "Показать все",
    usageNoDomains: "Карточку ещё не видели ни на одном сайте", usageAi: "ИИ", usageOff: "выключен", usageNoAi: "не создан", usageSince: "с", usageLast: "последний", usageOwn: "Lemeri",
    usageSeen: "открывалась", usageAllowedOnly: "разрешён, не видели", usageNever: "диалогов не было", usageOwnSites: "Лендинг lemeriai.com и кабинет клиентов",
    dialogsN: (n: number) => n % 10 === 1 && n % 100 !== 11 ? "диалог" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "диалога" : "диалогов",
    ago: (ms: number) => ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} мин назад` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)} ч назад` : `${Math.round(ms / 86_400_000)} дн. назад`,
  },
  en: {
    title: "Lemeri assistant", copy: "Lemeri's own AI assistant: consults landing page visitors and helps customers inside the cabinet. It is the AI seller of the «Lemeri AI» workspace — its prompt, knowledge, card and first message are edited in the usual sections.",
    loading: "Loading…", failed: "Couldn't load the admin panel", retry: "Retry",
    where: "Where to show", landing: "On the lemeriai.com landing page", landingHint: "Chat card for site visitors",
    app: "In customers' cabinets", appHint: "Help button at the bottom of the screen for every platform user",
    state: "Status", assistant: "Assistant", workspace: "Workspace", card: "Card", connected: "connected", notConnected: "not connected",
    model: "Model", keyMissing: "OPENAI_API_KEY is not set", active: "running", draft: "paused", none: "not created",
    month: "Last 30 days", dialogs: "conversations", leads: "requests",
    configure: "Configure", employee: "AI employee", knowledge: "Knowledge base", widget: "Card & first message", conversations: "Conversations",
    otherWorkspace: "Another workspace is open. Switch to «Lemeri AI» to configure the assistant.",
    repair: "Set up again", repairHint: "Creates whatever is missing: the «Lemeri AI» workspace, Custom plan without a reply limit, the AI employee and the card. Existing settings stay as they are.",
    saved: "Saved", saveFailed: "Couldn't save",
    payments: "Payments by transfer", paymentsCopy: "USDT payments confirm themselves. Transfers: customers reported a transfer — find it in your bank by amount, code and sender name and confirm — the plan switches on immediately. «Not found» tells the customer the transfer wasn't found.",
    noPayments: "No requests yet.", notConfigured: "Payment details are missing: add LEMIRI_CRYPTO_USDT_TON (USDT wallet) or LEMIRI_P2P_RECIPIENT and LEMIRI_P2P_DETAILS in Cloudflare — without them customers don't see where to pay.",
    confirm: "Confirm", reject: "Not found", pending: "waiting", confirmed: "confirmed", rejected: "not found", perYear: "year", perMonth: "month", from: "from",
    refundsTitle: "Payment cancellations", refundsCopy: "The customer pressed «Cancel payment» and left a comment. «Approve cancellation» switches the plan off right away and marks the payment refunded — return the money by hand the same way. «Decline» shows the customer that it didn't go through, with the support address.",
    noRefunds: "No cancellation requests.", approveRefund: "Approve cancellation", rejectRefund: "Decline", reasonPh: "Reply to the customer (optional)", paidWith: "paid", refundedTag: "cancelled", declinedTag: "declined", until: "until",
    refundAsk: (amount: string, who: string) => `Cancel the ${amount} payment (${who})? The plan switches off at once; return the money by hand.`, refundedStat: "refunds",
    sales: "Sales", revenue: "Revenue, all time", revenueMonth: "Last 30 days", purchases: "purchases", activeSubs: "Active subscriptions", accounts: "Accounts on the platform",
    wallet: "Wallet transactions", walletCopy: "Your wallet's latest USDT transfers (TON): which address the money came from and where it went. Link an incoming payment without an invoice or with another amount to an account — the plan switches on immediately. Transfers from Telegram Wallet come from its shared «Wallet in Telegram» address — it doesn't identify a person; the customer's account shows once the payment is linked.", walletEmpty: "No transactions yet.",
    all: "All", incoming: "Incoming", outgoing: "Outgoing", received: "Received", sent: "Sent", fromAddr: "from", toAddr: "to", copied: "Address copied", copyAddr: "Copy address", commentLabel: "comment", walletFailed: "TonAPI didn't respond — refresh later.",
    paid: "paid", unlinked: "not linked", link: "Link to an account",
    grant: "Grant a plan", grantCopy: "Switch a plan on for an account by email — e.g. when payment came another way.", email: "Account email", plan: "Plan", period: "Period",
    grantDo: "Switch the plan on", cancel: "Cancel", errors: { USER_NOT_FOUND: "No account with this email", TX_NOT_FOUND: "Transaction not found among deposits", TX_USED: "This transaction is already used", INVALID_REQUEST: "Check the email" } as Record<string, string>,
    confirmAsk: (amount: string, code: string) => `Confirm the ${amount} transfer (${code})? The plan switches on immediately.`,
    usageTitle: "Who uses the AI seller", usageCopy: "Accounts with a chat card and the sites where it loaded. Green dot — the card opened on the site in the last 7 days, yellow — earlier, grey — the site is allowed but the card hasn't been seen there yet.",
    usageFailed: "Couldn't load the list — refresh the page.", usageEmpty: "Nobody has connected the card yet.", usageNone: "Nothing found.",
    usageAccounts: "Accounts with a card", usageLive: "Live on websites", usageLiveHint: "last 7 days", usageDomains: "domains", usageDialogs: "Website conversations", usageDialogsHint: "last 30 days",
    usageAll: "All", usageOnLive: "Live", usageNoSite: "Not on a site", usageSearch: "Name, email or domain", usageMore: "Show all",
    usageNoDomains: "The card hasn't been seen on any site yet", usageAi: "AI", usageOff: "paused", usageNoAi: "not created", usageSince: "since", usageLast: "last", usageOwn: "Lemeri",
    usageSeen: "opened", usageAllowedOnly: "allowed, not seen", usageNever: "no conversations yet", usageOwnSites: "lemeriai.com landing page and customers' cabinets",
    dialogsN: (n: number) => n === 1 ? "conversation" : "conversations",
    ago: (ms: number) => ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))} min ago` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)} h ago` : `${Math.round(ms / 86_400_000)} days ago`,
  },
} as const;

export function AdminPanel({ locale, notify, onNavigate }: { locale: string; notify: (text: string) => void; onNavigate: (page: string) => void }) {
  const c = T[locale === "en" ? "en" : "ru"];
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try { const response = await fetch("/api/settings?scope=platform", { cache: "no-store" }); if (!response.ok) throw new Error(); setStatus(await response.json() as Status); }
    catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "live" | "none">("all");
  const [usageQuery, setUsageQuery] = useState("");
  const [usageAll, setUsageAll] = useState(false);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null) as (Status & { error?: string }) | null;
      if (!response.ok || !data) { notify((data?.error && c.errors[data.error]) || c.saveFailed); return false; }
      setStatus(data); notify(c.saved); return true;
    } catch { notify(c.saveFailed); return false; } finally { setBusy(false); }
  };
  const when = (iso: string) => new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const usd = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(2)} USDT`;
  const grantForm = (g: Grant) => <form className="adminGrant" onSubmit={event => { event.preventDefault(); void post({ action: "grant", ...g }).then(ok => { if (ok) setGrant(null); }); }}>
    <Field label={c.email}><input type="email" required value={g.email} onChange={event => setGrant({ ...g, email: event.target.value })} placeholder="name@example.com" autoFocus/></Field>
    <Field label={c.plan}><select value={g.plan} onChange={event => setGrant({ ...g, plan: event.target.value === "CUSTOM" ? "CUSTOM" : "STARTER" })}><option value="STARTER">Starter</option><option value="CUSTOM">Custom</option></select></Field>
    <Field label={c.period}><select value={g.interval} onChange={event => setGrant({ ...g, interval: event.target.value === "year" ? "year" : "month" })}><option value="month">{c.perMonth}</option><option value="year">{c.perYear}</option></select></Field>
    <div className="adminActions"><button type="submit" className="primary" disabled={busy}><Check size={15}/>{c.grantDo}</button><button type="button" className="btn" onClick={() => setGrant(null)}>{c.cancel}</button></div>
  </form>;
  if (failed) return <div className="sxState"><p>{c.failed}</p><button className="btn" onClick={() => void load()}>{c.retry}</button></div>;
  if (!status) return <div className="sxState"><span className="sxSpinner"/>{c.loading}</div>;
  const e = status.employee;
  const row = (label: string, value: string, ok = true) => <div className="adminRow"><span>{label}</span><b className={ok ? "" : "warn"}>{value}</b></div>;
  const go = (page: string) => <button type="button" className="btn" disabled={!status.inThisWorkspace} onClick={() => onNavigate(page)}>{page === "employees" ? <Bot size={15}/> : page === "knowledge" ? <BookOpen size={15}/> : page === "widget" ? <AppWindow size={15}/> : <MessageCircle size={15}/>}{page === "employees" ? c.employee : page === "knowledge" ? c.knowledge : page === "widget" ? c.widget : c.conversations}</button>;

  return <div className="sxDesignForm adminPanel">
    <Section title={c.title} copy={c.copy}>
      <div className="adminGrid">
        <div className="adminCard">
          <small>{c.state}</small>
          {row(c.assistant, e ? `${e.name} · ${e.status === "ACTIVE" ? c.active : c.draft}` : c.none, Boolean(e && e.status === "ACTIVE"))}
          {row(c.workspace, e?.workspace ?? "—")}
          {row(c.card, status.cardConnected ? c.connected : c.notConnected, status.cardConnected)}
          {row(c.model, status.model.configured ? `${status.model.provider} · ${status.model.name}` : c.keyMissing, status.model.configured && status.model.provider === "openai")}
        </div>
        <div className="adminCard">
          <small>{c.month}</small>
          <p className="adminStat"><b>{status.stats.dialogs}</b> {c.dialogs}</p>
          <p className="adminStat"><b>{status.stats.leads}</b> {c.leads}</p>
        </div>
      </div>
    </Section>
    {status.sales && <Section title={c.sales}>
      <div className="adminGrid three">
        <div className="adminCard"><small>{c.revenue}</small><p className="adminStat"><b>{usd(status.sales.total)}</b></p><p className="adminStat">{status.sales.count} {c.purchases}{status.sales.refunds ? ` · ${status.sales.refunds} ${c.refundedStat} (${usd(status.sales.refunded ?? 0)})` : ""}</p></div>
        <div className="adminCard"><small>{c.revenueMonth}</small><p className="adminStat"><b>{usd(status.sales.month)}</b></p><p className="adminStat">{status.sales.monthCount} {c.purchases}</p></div>
        <div className="adminCard"><small>{c.activeSubs}</small>{row("Starter", String(status.sales.active.STARTER))}{row("Custom", String(status.sales.active.CUSTOM))}{row(c.accounts, String(status.sales.accounts))}</div>
      </div>
    </Section>}
    <Section title={c.usageTitle} copy={c.usageCopy}>
      {status.usage === null ? <p className="sxMuted">{c.usageFailed}</p> : status.usage ? (() => {
        const usage = status.usage!;
        const now = Date.now();
        const live = (iso: string | null) => Boolean(iso && now - Date.parse(iso) <= 7 * 86_400_000);
        const q = usageQuery.trim().toLowerCase();
        const shown = usage.rows.filter(row => usageFilter === "all" || (usageFilter === "live" ? live(row.lastSeenAt) : !row.lastSeenAt))
          .filter(row => !q || [row.workspace, row.ownerEmail ?? "", row.employee ?? "", ...row.domains.map(d => d.host)].some(text => text.toLowerCase().includes(q)));
        const list = usageAll || q ? shown : shown.slice(0, 50);
        const plan = (row: typeof usage.rows[number]) => `${row.plan === "CUSTOM" ? "Custom" : row.plan === "STARTER" ? "Starter" : "Trial"}${row.planStatus && row.planStatus !== "ACTIVE" && row.planStatus !== "TRIALING" ? ` · ${row.planStatus.toLowerCase()}` : ""}`;
        return <>
          <div className="adminGrid three">
            <div className="adminCard"><small>{c.usageAccounts}</small><p className="adminStat"><b>{usage.summary.workspaces}</b></p></div>
            <div className="adminCard"><small>{c.usageLive}</small><p className="adminStat"><b>{usage.summary.live}</b> {c.usageLiveHint} · {usage.summary.domains} {c.usageDomains}</p></div>
            <div className="adminCard"><small>{c.usageDialogs}</small><p className="adminStat"><b>{usage.summary.dialogs30}</b> {c.usageDialogsHint}</p></div>
          </div>
          {usage.rows.length ? <>
            <div className="adminTxHead adminUsageHead">
              <div className="sxSegmented" role="group">{(["all", "live", "none"] as const).map(key => <button key={key} type="button" className={usageFilter === key ? "on" : ""} aria-pressed={usageFilter === key} onClick={() => setUsageFilter(key)}>{key === "all" ? c.usageAll : key === "live" ? c.usageOnLive : c.usageNoSite}</button>)}</div>
              <label className="adminSearch"><Search size={14}/><input type="search" value={usageQuery} onChange={event => setUsageQuery(event.target.value)} placeholder={c.usageSearch} aria-label={c.usageSearch}/></label>
            </div>
            {list.length ? <div className="adminPayments">{list.map(row => <div key={row.workspaceId} className={`adminPayment adminUsage${live(row.lastSeenAt) ? " live" : ""}`}>
              <div>
                <b>{row.workspace}{row.own ? <span className="adminTag">{c.usageOwn}</span> : null} · {plan(row)}</b>
                <small>{row.ownerEmail ?? "—"} · {c.usageAi}: {row.employee ? `${row.employee}${row.employeeActive ? "" : ` (${c.usageOff})`}` : c.usageNoAi} · {c.usageSince} {new Date(row.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU")}</small>
                {row.domains.length ? <div className="adminDomains">{row.domains.map(d => {
                  const tone = d.lastSeenAt ? (live(d.lastSeenAt) ? "live" : "old") : "allowed";
                  return <a key={d.host} className={`adminDomain ${tone}`} href={d.origin} target="_blank" rel="noreferrer" title={d.lastSeenAt ? `${c.usageSeen} ${when(d.lastSeenAt)}` : c.usageAllowedOnly}><i/><Globe size={12}/>{d.host}{d.lastSeenAt ? <em>{c.ago(now - Date.parse(d.lastSeenAt))}</em> : null}</a>;
                })}</div> : <small className="adminNote">{row.own ? c.usageOwnSites : c.usageNoDomains}</small>}
              </div>
              <div className="adminUsageStats"><p className="adminStat"><b>{row.dialogs30}</b> {c.dialogsN(row.dialogs30)}</p><small>{row.lastDialogAt ? `${c.usageLast}: ${when(row.lastDialogAt)}` : c.usageNever}</small></div>
            </div>)}</div> : <p className="sxMuted">{c.usageNone}</p>}
            {!usageAll && !q && shown.length > list.length ? <div className="adminActions"><button type="button" className="btn" onClick={() => setUsageAll(true)}>{c.usageMore} ({shown.length})</button></div> : null}
          </> : <p className="sxMuted">{c.usageEmpty}</p>}
        </>;
      })() : <p className="sxMuted">{c.loading}</p>}
    </Section>
    <Section title={c.refundsTitle} copy={c.refundsCopy}>
      {status.refunds?.length ? <div className="adminPayments">{status.refunds.map(item => {
        const amount = item.currency === "USDT" ? usd(item.amount) : formatAmount(item.amount, item.currency, locale === "en" ? "en" : "ru");
        return <div key={item.id} className={`adminPayment ${item.status === "PENDING" ? "pending" : "confirmed"}`}>
          <div><b>{amount}</b> · {item.plan === "CUSTOM" ? "Custom" : "Starter"} · {item.interval === "year" ? c.perYear : c.perMonth}
            <small>{item.workspace}{item.ownerEmail ? ` · ${item.ownerEmail}` : ""} · {when(item.createdAt)}{item.periodEnd && item.status === "PENDING" ? ` · ${c.until} ${new Date(item.periodEnd).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU")}` : ""}</small>
            <small>{c.paidWith}: {item.paidMethod === "crypto" ? <>USDT TON{item.paidTx ? <> · <a href={`https://tonviewer.com/transaction/${item.paidTx}`} target="_blank" rel="noreferrer">{item.paidTx.slice(0, 10)}…</a></> : ""}</> : item.paidFrom ? `${c.from} ${item.paidFrom}` : "—"}</small>
            <small className="adminNote">«{item.comment}»</small></div>
          {item.status === "PENDING" ? <div className="adminActions">
            <input className="adminRefundReason" maxLength={300} value={reasons[item.id] ?? ""} onChange={event => setReasons({ ...reasons, [item.id]: event.target.value })} placeholder={c.reasonPh}/>
            <button type="button" className="primary" disabled={busy} onClick={() => { if (window.confirm(c.refundAsk(amount, item.ownerEmail ?? item.workspace))) void post({ action: "refund", id: item.id, decision: "approve", reason: reasons[item.id] ?? "" }); }}><Check size={15}/>{c.approveRefund}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => void post({ action: "refund", id: item.id, decision: "reject", reason: reasons[item.id] ?? "" })}><X size={15}/>{c.rejectRefund}</button>
          </div> : <span className="adminTag">{item.status === "CONFIRMED" ? c.refundedTag : c.declinedTag}</span>}
        </div>;
      })}</div> : <p className="sxMuted">{c.noRefunds}</p>}
    </Section>
    <Section title={c.wallet} copy={c.walletCopy}>
      {status.transfers === null ? <p className="sxMuted">{c.walletFailed}</p> : status.transfers.length ? (() => {
        const list = status.transfers!;
        const dir = (item: typeof list[number]) => item.direction ?? "in";
        const sum = (d: "in" | "out") => list.filter(item => dir(item) === d).reduce((total, item) => total + item.amount, 0);
        const shown = list.filter(item => txFilter === "all" || dir(item) === txFilter);
        const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-6)}`;
        const copy = (address: string) => { void navigator.clipboard?.writeText(address).then(() => notify(c.copied), () => undefined); };
        return <>
          <div className="adminTxHead">
            <div className="sxSegmented" role="group">{(["all", "in", "out"] as const).map(key => <button key={key} type="button" className={txFilter === key ? "on" : ""} aria-pressed={txFilter === key} onClick={() => setTxFilter(key)}>{key === "all" ? c.all : key === "in" ? c.incoming : c.outgoing}</button>)}</div>
            <small>{c.received}: <b>{usd(Math.round(sum("in") * 10_000) / 10_000)}</b> · {c.sent}: <b>{usd(Math.round(sum("out") * 10_000) / 10_000)}</b></small>
          </div>
          <div className="adminPayments">{shown.map(item => {
            const incoming = dir(item) === "in";
            const address = item.counterparty ?? item.from;
            const name = item.counterpartyName ?? (incoming ? item.fromName : null);
            return <div key={`${item.txId}-${dir(item)}`} className={`adminPayment adminTx ${incoming ? (item.requestId ? "confirmed" : "pending") : "out"}`}>
              <div>
                <b className={incoming ? "txIn" : "txOut"}>{incoming ? <ArrowDownLeft size={15}/> : <ArrowUpRight size={15}/>}{incoming ? "+" : "−"}{item.amount.toFixed(item.amount % 1 ? 4 : 0)} USDT</b>
                <small>{incoming ? c.fromAddr : c.toAddr}: {address ? <><a href={`https://tonviewer.com/${address}`} target="_blank" rel="noreferrer" title={address}><code>{short(address)}</code></a> <button type="button" className="adminCopy" title={c.copyAddr} aria-label={c.copyAddr} onClick={() => copy(address)}><Copy size={12}/></button></> : "—"}{name ? ` · ${name}` : ""}</small>
                <small>{when(item.time)} · <a href={`https://tonviewer.com/transaction/${item.txId}`} target="_blank" rel="noreferrer">{item.txId.slice(0, 10)}…</a>{item.comment ? ` · ${c.commentLabel}: «${item.comment}»` : ""}</small>
                {item.requestId ? <small>{c.paid}: {item.workspace}{item.ownerEmail ? ` · ${item.ownerEmail}` : ""}{item.plan ? ` · ${item.plan === "CUSTOM" ? "Custom" : "Starter"}` : ""}</small> : null}
              </div>
              {!incoming ? null : item.requestId ? <span className="adminTag">{item.status === "CONFIRMED" ? c.confirmed : item.status === "PENDING" ? c.pending : item.status === "REFUNDED" ? c.refundedTag : c.rejected}</span>
                : grant?.txId === item.txId ? grantForm(grant) : <div className="adminActions"><span className="adminTag">{c.unlinked}</span><button type="button" className="primary" disabled={busy} onClick={() => setGrant({ email: "", plan: item.amount >= 29 ? "CUSTOM" : "STARTER", interval: item.amount >= 150 ? "year" : "month", txId: item.txId })}><Link2 size={15}/>{c.link}</button></div>}
            </div>;
          })}</div>
        </>;
      })() : <p className="sxMuted">{c.walletEmpty}</p>}
    </Section>
    <Section title={c.grant} copy={c.grantCopy}>
      {grant && !grant.txId ? grantForm(grant) : <div className="adminActions"><button type="button" className="btn" disabled={busy} onClick={() => setGrant({ email: "", plan: "STARTER", interval: "month" })}><Check size={15}/>{c.grant}</button></div>}
    </Section>
    <Section title={c.payments} copy={status.p2pConfigured ? c.paymentsCopy : c.notConfigured}>
      {status.payments.length ? <div className="adminPayments">{status.payments.map(item => {
        const amount = item.currency === "USDT" ? `${item.amount.toFixed(4)} USDT` : formatAmount(item.amount, item.currency, locale === "en" ? "en" : "ru");
        return <div key={item.id} className={`adminPayment ${item.status.toLowerCase()}`}>
          <div><b>{amount}</b> · {item.plan === "CUSTOM" ? "Custom" : "Starter"} · {item.interval === "year" ? c.perYear : c.perMonth}<small>{item.workspace}{item.ownerEmail ? ` · ${item.ownerEmail}` : ""}</small><small>{item.method === "crypto" ? <>USDT TON{item.txId ? <> · <a href={`https://tonviewer.com/transaction/${item.txId}`} target="_blank" rel="noreferrer">{item.txId.slice(0, 10)}…</a></> : ""}</> : <>{c.from} {item.payerName}</>} · {item.code} · {new Date(item.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{item.note ? ` · «${item.note}»` : ""}</small></div>
          {item.status === "PENDING" ? <div className="adminActions"><button type="button" className="primary" disabled={busy} onClick={() => { if (window.confirm(c.confirmAsk(amount, item.code))) void post({ action: "payment", id: item.id, decision: "confirm" }); }}><Check size={15}/>{c.confirm}</button><button type="button" className="btn" disabled={busy} onClick={() => void post({ action: "payment", id: item.id, decision: "reject" })}><X size={15}/>{c.reject}</button></div>
            : <span className="adminTag">{item.status === "CONFIRMED" ? c.confirmed : item.status === "REFUNDED" ? c.refundedTag : c.rejected}</span>}
        </div>;
      })}</div> : <p className="sxMuted">{c.noPayments}</p>}
    </Section>
    <Section title={c.where}>
      <Toggle label={c.landing} hint={c.landingHint} checked={status.settings.landing} disabled={busy || !e} onChange={value => void post({ action: "assistant", landing: value })}/>
      <Toggle label={c.app} hint={c.appHint} checked={status.settings.app} disabled={busy || !e} onChange={value => void post({ action: "assistant", app: value })}/>
    </Section>
    <Section title={c.configure} copy={status.inThisWorkspace ? undefined : c.otherWorkspace}>
      <div className="adminActions">{go("employees")}{go("knowledge")}{go("widget")}{go("conversations")}</div>
    </Section>
    <Section title={c.repair} copy={c.repairHint}>
      <div className="adminActions"><button type="button" className="btn" disabled={busy} onClick={() => void post({ action: "provision" })}><RefreshCw size={15}/>{c.repair}</button></div>
    </Section>
  </div>;
}
