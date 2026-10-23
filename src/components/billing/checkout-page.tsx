"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRightLeft, Check, CircleCheck, Clock3, Coins, Copy, CreditCard, ShieldCheck, User, XCircle } from "lucide-react";
import { PLAN_OFFER, planPriceText, YEARLY_SAVE_PERCENT } from "@/lib/billing/offer";
import { formatAmount } from "@/lib/billing/p2p";
import { LemiriGlyph } from "../logo";

// Checkout by P2P transfer: the customer sees the amount, the recipient and the
// details from LEMIRI_P2P_*, transfers the money with the payment code in the
// comment and presses «Я оплатил». An admin confirms the transfer in the admin
// panel and the plan switches on. Or pays in USDT (TON): the invoice has a
// unique amount, the server finds it on-chain and the plan switches on by itself
// (the page polls /api/billing every 15 s). No card data is ever entered on Lemeri.

type Plan = "STARTER" | "CUSTOM";
type Interval = "month" | "year";
type Request = { id: string; plan: Plan; interval: Interval; amount: number; currency: string; payerName: string; status: "PENDING" | "CONFIRMED" | "REJECTED"; createdAt: string; decidedAt: string | null; method: "transfer" | "crypto" };
type P2P = { configured: boolean; transfer: boolean; crypto: { address: string; asset: string; network: string } | null; recipient: string; details: string[]; currency: string; note: string; code: string; amounts: Record<Plan, Record<Interval, number>>; pending: Request | null; last: Request | null };

const T = {
  ru: {
    back: "К тарифам", title: "Оплата переводом", secure: "Без ввода карты на сайте", cardPay: "Для оплаты картой напишите на почту",
    billing: "Период оплаты", monthly: "Помесячно", yearly: "За год",
    step1: "Переведите сумму", step2: "Сообщите об оплате",
    amount: "Сумма", recipient: "Получатель", details: "Реквизиты", code: "Комментарий к переводу", codeHint: "Обязательно укажите этот код в комментарии — по нему мы найдём ваш перевод.",
    copy: "Скопировать", copied: "Скопировано",
    payer: "Имя отправителя (как в банке)", payerHint: "Чтобы мы нашли перевод, если комментарий не дойдёт", note: "Комментарий", optional: "необязательно",
    paid: "Я оплатил", sending: "Отправляем…",
    pendingTitle: "Проверяем ваш перевод", pendingCopy: (amount: string, date: string) => `Заявка на ${amount} от ${date}. Обычно проверка занимает до 24 часов — тариф включится сам, мы пришлём уведомление в кабинет.`,
    cancel: "Отменить заявку", rejected: "Прошлый перевод не нашли. Проверьте сумму и код в комментарии и отправьте заявку ещё раз.",
    summary: "Ваш заказ", perMonth: "в месяц", total: "К переводу", once: "Разовый платёж: продление — новым переводом. Напомним заранее.",
    yearlyRenews: "Тариф на 12 месяцев. Лимит ответов ИИ обновляется каждый месяц.",
    notConfigured: "Оплата переводом пока не настроена — напишите в поддержку.",
    accept: "Оплачивая, вы принимаете", terms: "условия использования", refund: "правила возврата", and: "и", privacy: "политику конфиденциальности",
    errors: { BILLING_PROVIDER_NOT_CONFIGURED: "Оплата переводом пока не настроена", OPEN_ACCESS: "Сейчас идёт тестовый период — оплата не нужна", CARD_DATA_NOT_ACCEPTED: "Не вводите номер карты — он не нужен", FORBIDDEN: "Оплачивать может только владелец", INVALID_REQUEST: "Проверьте поля формы", default: "Не удалось отправить заявку. Попробуйте ещё раз." } as Record<string, string>,
    loading: "Загружаем…", failed: "Не удалось загрузить данные оплаты", retry: "Повторить",
    byCrypto: "Криптой (USDT)", byTransfer: "Переводом", cryptoTitle: "Оплата в USDT", getInvoice: "Получить адрес и сумму",
    cryptoIntro: "Сумма будет уникальной — по ней платёж найдётся автоматически, и тариф включится сам, без ожидания.",
    send: "Отправьте ровно", network: "Сеть", wallet: "Адрес кошелька",
    cryptoWarn: "Только USDT в сети TON. Лучше всего — ровно эту сумму. Кошелёк Telegram и биржи вычитают комиссию из суммы — добавьте её сверху: до вас должно дойти не меньше цены тарифа. Другая сеть не найдётся — тогда напишите в поддержку.",
    waiting: "Ждём платёж — проверяем блокчейн каждые 15 секунд. Обычно это 1–3 минуты после отправки. Страницу можно закрыть: тариф включится сам.",
    cryptoExpired: "Прошло больше 3 часов. Если вы уже отправили USDT, напишите в поддержку — проверим вручную. Иначе создайте новый счёт.",
    newInvoice: "Новый счёт", paidTitle: "Оплата получена", paidCopy: "Тариф активен. Спасибо!", toCabinet: "В кабинет",
  },
  en: {
    back: "Back to plans", title: "Pay by transfer", secure: "No card entry on this site", cardPay: "To pay by card, email",
    billing: "Billing period", monthly: "Monthly", yearly: "Yearly",
    step1: "Transfer the amount", step2: "Tell us you've paid",
    amount: "Amount", recipient: "Recipient", details: "Payment details", code: "Transfer comment", codeHint: "Put this code in the transfer comment — that's how we find your payment.",
    copy: "Copy", copied: "Copied",
    payer: "Sender name (as in your bank)", payerHint: "Helps us find the transfer if the comment is lost", note: "Comment", optional: "optional",
    paid: "I've paid", sending: "Sending…",
    pendingTitle: "We're checking your transfer", pendingCopy: (amount: string, date: string) => `Request for ${amount} from ${date}. It usually takes up to 24 hours — the plan switches on by itself and you'll get a notification in the cabinet.`,
    cancel: "Cancel request", rejected: "We couldn't find your last transfer. Check the amount and the code in the comment and send the request again.",
    summary: "Your order", perMonth: "per month", total: "To transfer", once: "One-off payment: renew with a new transfer. We'll remind you in advance.",
    yearlyRenews: "12-month plan. The AI reply allowance resets every month.",
    notConfigured: "Payment by transfer isn't set up yet — please contact support.",
    accept: "By paying you accept the", terms: "terms of service", refund: "refund policy", and: "and the", privacy: "privacy policy",
    errors: { BILLING_PROVIDER_NOT_CONFIGURED: "Payment by transfer isn't set up yet", OPEN_ACCESS: "Testing period — no payment needed", CARD_DATA_NOT_ACCEPTED: "Don't enter a card number — it isn't needed", FORBIDDEN: "Only the owner can pay", INVALID_REQUEST: "Check the form fields", default: "Couldn't send the request. Please try again." } as Record<string, string>,
    loading: "Loading…", failed: "Couldn't load payment details", retry: "Retry",
    byCrypto: "Crypto (USDT)", byTransfer: "Bank transfer", cryptoTitle: "Pay in USDT", getInvoice: "Get address and amount",
    cryptoIntro: "The amount is unique — that's how the payment is found automatically and the plan switches on by itself.",
    send: "Send exactly", network: "Network", wallet: "Wallet address",
    cryptoWarn: "Only USDT on TON. Best of all — exactly this amount. Telegram Wallet and exchanges take their fee out of the amount — add it on top: at least the plan price must arrive. Another network won't be found — contact support then.",
    waiting: "Waiting for the payment — we check the blockchain every 15 seconds. Usually 1–3 minutes after sending. You can close this page: the plan switches on by itself.",
    cryptoExpired: "More than 3 hours have passed. If you've already sent USDT, contact support and we'll check by hand. Otherwise create a new invoice.",
    newInvoice: "New invoice", paidTitle: "Payment received", paidCopy: "Your plan is active. Thank you!", toCabinet: "Go to cabinet",
  },
};

export function CheckoutPage({ locale, plan, interval: initialInterval = "month" }: { locale: "ru" | "en"; plan: Plan; interval?: Interval }) {
  const c = T[locale];
  const offer = PLAN_OFFER[locale][plan];
  const [interval, setBillingInterval] = useState<Interval>(initialInterval);
  const [p2p, setP2p] = useState<P2P | null>(null);
  const [failed, setFailed] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [method, setMethod] = useState<"crypto" | "transfer" | null>(null);
  const load = useCallback(async () => {
    setFailed(false);
    try { const response = await fetch("/api/billing", { cache: "no-store" }); if (!response.ok) throw new Error(); const body = await response.json() as { p2p: P2P | null }; if (!body.p2p) throw new Error(); setP2p(body.p2p); }
    catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const cryptoPending = p2p?.pending?.method === "crypto";
  // An open USDT invoice is checked on-chain by the server on every load.
  useEffect(() => { if (!cryptoPending) return; const timer = window.setInterval(() => void load(), 15_000); return () => window.clearInterval(timer); }, [cryptoPending, load]);
  const way = method ?? (p2p?.crypto ? "crypto" : "transfer");
  const justPaid = p2p?.last?.status === "CONFIRMED" && p2p.last.decidedAt && Date.now() - new Date(p2p.last.decidedAt).getTime() < 30 * 60_000;

  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text).then(() => { setCopied(key); window.setTimeout(() => setCopied(value => (value === key ? "" : value)), 1500); }).catch(() => undefined); };
  const post = async (body: Record<string, unknown>) => {
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setError(c.errors[result.error ?? ""] ?? c.errors.default); return; }
      await load();
    } catch { setError(c.errors.default); } finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void post({ action: "p2p_claim", plan, interval, payerName, note }); };

  const price = planPriceText(plan, interval, locale);
  const amount = p2p ? formatAmount(p2p.amounts[plan][interval], p2p.currency, locale) : price.total;
  const date = (iso: string) => new Date(iso).toLocaleString(locale === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const row = (key: string, label: string, value: string, mono = false) => <div className="ckRow"><span>{label}</span><b className={mono ? "mono" : ""}>{value}</b><button type="button" className="ckCopy" onClick={() => copy(key, value)} aria-label={`${c.copy}: ${label}`}>{copied === key ? <Check size={14}/> : <Copy size={14}/>}{copied === key ? c.copied : c.copy}</button></div>;

  return <main className="ckPage">
    <header className="ckTop"><a href="/app?section=billing" className="ckBack"><ArrowLeft size={16}/>{c.back}</a><span className="ckBrand"><LemiriGlyph size={22}/>Lemeri AI</span><span className="ckSecure"><ShieldCheck size={13}/>{c.secure}</span></header>
    <div className="ckGrid">
      <section className="ckMain">
        <h1>{c.title}</h1>
        <p className="ckNote ckCardPay"><CreditCard size={15}/><span>{c.cardPay} <a href="mailto:work@lemeriai.com">work@lemeriai.com</a></span></p>
        {failed ? <div className="sxState"><p>{c.failed}</p><button className="btn" onClick={() => void load()}>{c.retry}</button></div>
          : !p2p ? <div className="sxState"><span className="sxSpinner"/>{c.loading}</div>
          : !p2p.configured ? <p className="ckError">{c.notConfigured}</p>
          : cryptoPending && p2p.crypto && p2p.pending ? <section className="ckCard on">
              <h2><Coins size={17}/>{c.cryptoTitle}</h2>
              <div className="ckDetails">
                {row("amount", c.send, `${p2p.pending.amount.toFixed(4)}`, true)}
                <div className="ckRow"><span>{c.network}</span><b>{p2p.crypto.asset} · {p2p.crypto.network}</b></div>
                {row("wallet", c.wallet, p2p.crypto.address, true)}
              </div>
              <p className="ckNote"><ShieldCheck size={15}/>{c.cryptoWarn}</p>
              {Date.now() - new Date(p2p.pending.createdAt).getTime() > 3 * 3_600_000 ? <p className="ckError">{c.cryptoExpired}</p> : <p className="ckNote"><span className="sxSpinner"/>{c.waiting}</p>}
              {error && <p className="ckError" role="alert">{error}</p>}
              <button type="button" className="linkButton" disabled={busy} onClick={() => void post({ action: "p2p_cancel" })}><XCircle size={14}/>{c.cancel}</button>
            </section>
          : justPaid && !p2p.pending ? <section className="ckCard on">
              <h2><CircleCheck size={17}/>{c.paidTitle}</h2>
              <p className="ckNote">{c.paidCopy}</p>
              <a className="primary ckSubmit" href="/app?section=billing">{c.toCabinet}</a>
            </section>
          : p2p.pending ? <section className="ckCard on">
              <h2><Clock3 size={17}/>{c.pendingTitle}</h2>
              <p className="ckNote">{c.pendingCopy(formatAmount(p2p.pending.amount, p2p.pending.currency, locale), date(p2p.pending.createdAt))}</p>
              <div className="ckDetails">{row("code", c.code, p2p.code, true)}</div>
              {error && <p className="ckError" role="alert">{error}</p>}
              <button type="button" className="linkButton" disabled={busy} onClick={() => void post({ action: "p2p_cancel" })}><XCircle size={14}/>{c.cancel}</button>
            </section>
          : <>
            {p2p.last?.status === "REJECTED" && <p className="ckError" role="alert">{c.rejected}</p>}
            {p2p.crypto && p2p.transfer && <div className="sxSegmented ckMethod" role="group">
              <button type="button" className={way === "crypto" ? "on" : ""} aria-pressed={way === "crypto"} onClick={() => setMethod("crypto")}><Coins size={14}/>{c.byCrypto}</button>
              <button type="button" className={way === "transfer" ? "on" : ""} aria-pressed={way === "transfer"} onClick={() => setMethod("transfer")}><ArrowRightLeft size={14}/>{c.byTransfer}</button>
            </div>}
            {way === "crypto" && p2p.crypto ? <section className="ckCard on">
              <h2><Coins size={17}/>{c.cryptoTitle}</h2>
              <p className="ckNote">{c.cryptoIntro}</p>
              <div className="ckDetails"><div className="ckRow"><span>{c.network}</span><b>{p2p.crypto.asset} · {p2p.crypto.network}</b></div></div>
              {error && <p className="ckError" role="alert">{error}</p>}
              <button type="button" className="primary ckSubmit" disabled={busy} onClick={() => void post({ action: "crypto_invoice", plan, interval })}>{busy ? c.sending : c.getInvoice}</button>
            </section> : <>
            <ol className="ckSteps"><li className="on"><span>1</span>{c.step1}</li><li className="on"><span>2</span>{c.step2}</li></ol>
            <section className="ckCard on">
              <h2><ArrowRightLeft size={17}/>{c.step1}</h2>
              <div className="ckDetails">
                {row("amount", c.amount, amount)}
                {row("recipient", c.recipient, p2p.recipient)}
                {p2p.details.map((line, index) => row(`d${index}`, index === 0 ? c.details : "", line, true))}
                {row("code", c.code, p2p.code, true)}
              </div>
              <p className="ckNote"><ShieldCheck size={15}/>{c.codeHint}</p>
              {p2p.note && <p className="ckNote">{p2p.note}</p>}
            </section>
            <form className="ckForm" onSubmit={submit} style={{ marginTop: 18 }}>
              <fieldset disabled={busy}>
                <legend><User size={15}/>{c.step2}</legend>
                <label className="wide">{c.payer}<input name="name" autoComplete="name" required minLength={2} maxLength={120} value={payerName} onChange={event => setPayerName(event.target.value)}/><small>{c.payerHint}</small></label>
                <label className="wide"><span>{c.note} <em>{c.optional}</em></span><input name="note" maxLength={300} value={note} onChange={event => setNote(event.target.value)}/></label>
              </fieldset>
              {error && <p className="ckError" role="alert">{error}</p>}
              <button className="primary ckSubmit" disabled={busy}>{busy ? c.sending : c.paid}</button>
            </form>
          </>}
          </>}
      </section>
      <aside className="ckSummary">
        <h2>{c.summary}</h2>
        <div className="ckInterval" role="group" aria-label={c.billing}>
          <div className="sxSegmented">
            <button type="button" className={interval === "month" ? "on" : ""} aria-pressed={interval === "month"} disabled={Boolean(p2p?.pending)} onClick={() => setBillingInterval("month")}>{c.monthly}</button>
            <button type="button" className={interval === "year" ? "on" : ""} aria-pressed={interval === "year"} disabled={Boolean(p2p?.pending)} onClick={() => setBillingInterval("year")}>{c.yearly} <span className="ckSave">−{YEARLY_SAVE_PERCENT}%</span></button>
          </div>
        </div>
        <div className="ckPlan"><span className="ckPlanIcon"><LemiriGlyph size={20}/></span><div><b>Lemeri AI · {offer.name}</b><small>{offer.copy}</small></div><strong>{price.total}<small> / {price.per}</small></strong></div>
        {interval === "year" && <small className="ckYearNote">{price.price} {price.period} · {price.note}</small>}
        <ul>{offer.features.slice(0, 6).map(feature => <li key={feature}><Check size={13}/>{feature}</li>)}</ul>
        <div className="ckTotal"><span>{c.total}</span><strong>{amount}</strong></div>
        <small>{c.once}</small>
        {interval === "year" && <small>{c.yearlyRenews}</small>}
        <p className="ckLegal">{c.accept} <a href="/legal/terms" target="_blank">{c.terms}</a>, <a href="/legal/refund" target="_blank">{c.refund}</a> {c.and} <a href="/legal/privacy" target="_blank">{c.privacy}</a>.</p>
      </aside>
    </div>
  </main>;
}
