"use client";

import { useCallback, useEffect, useState } from "react";
import { AppWindow, BookOpen, Bot, Check, MessageCircle, RefreshCw, X } from "lucide-react";
import { formatAmount } from "@/lib/billing/p2p";
import { Section, Toggle } from "../sales/ui";

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
  payments: Array<{ id: string; workspace: string; ownerEmail: string | null; plan: "STARTER" | "CUSTOM"; interval: "month" | "year"; amount: number; currency: string; code: string; payerName: string; note: string; status: "PENDING" | "CONFIRMED" | "REJECTED"; createdAt: string; decidedAt: string | null; method: "transfer" | "crypto"; txId: string | null }>;
  p2pConfigured: boolean;
};

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
    confirmAsk: (amount: string, code: string) => `Подтвердить перевод ${amount} (${code})? Тариф включится сразу.`,
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
    confirmAsk: (amount: string, code: string) => `Confirm the ${amount} transfer (${code})? The plan switches on immediately.`,
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
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { const response = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(); setStatus(await response.json() as Status); notify(c.saved); }
    catch { notify(c.saveFailed); } finally { setBusy(false); }
  };
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
    <Section title={c.payments} copy={status.p2pConfigured ? c.paymentsCopy : c.notConfigured}>
      {status.payments.length ? <div className="adminPayments">{status.payments.map(item => {
        const amount = item.currency === "USDT" ? `${item.amount.toFixed(4)} USDT` : formatAmount(item.amount, item.currency, locale === "en" ? "en" : "ru");
        return <div key={item.id} className={`adminPayment ${item.status.toLowerCase()}`}>
          <div><b>{amount}</b> · {item.plan === "CUSTOM" ? "Custom" : "Starter"} · {item.interval === "year" ? c.perYear : c.perMonth}<small>{item.workspace}{item.ownerEmail ? ` · ${item.ownerEmail}` : ""}</small><small>{item.method === "crypto" ? <>USDT TON{item.txId ? <> · <a href={`https://tonviewer.com/transaction/${item.txId}`} target="_blank" rel="noreferrer">{item.txId.slice(0, 10)}…</a></> : ""}</> : <>{c.from} {item.payerName}</>} · {item.code} · {new Date(item.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{item.note ? ` · «${item.note}»` : ""}</small></div>
          {item.status === "PENDING" ? <div className="adminActions"><button type="button" className="primary" disabled={busy} onClick={() => { if (window.confirm(c.confirmAsk(amount, item.code))) void post({ action: "payment", id: item.id, decision: "confirm" }); }}><Check size={15}/>{c.confirm}</button><button type="button" className="btn" disabled={busy} onClick={() => void post({ action: "payment", id: item.id, decision: "reject" })}><X size={15}/>{c.reject}</button></div>
            : <span className="adminTag">{item.status === "CONFIRMED" ? c.confirmed : c.rejected}</span>}
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
