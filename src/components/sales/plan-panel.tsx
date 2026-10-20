"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, CreditCard, ExternalLink, Sparkles, Gift, RotateCcw } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/billing/p2p";
import { TRIAL_DAYS, type Access } from "@/lib/billing/plans";
import { COMING_SOON, PLAN_OFFER, planPriceText, TRIAL_PROMO, YEARLY_SAVE_PERCENT } from "@/lib/billing/offer";
import { FEATURE_MATRIX } from "@/lib/billing/features";
import { Minus } from "lucide-react";

// Subscription: current plan and trial, AI reply allowance, Trial / Starter / Custom,
// billed monthly or yearly (−20%; the switch above the plans).
// Payments are P2P transfers: «Выбрать» / «Продлить» opens /app/checkout with the
// amount, recipient and payment code; the plan switches on when a platform admin
// confirms the transfer. Prepaid periods don't renew by themselves — the panel and
// the dashboard banner remind the owner before the end. The comparison table comes
// from FEATURE_MATRIX — the same list the server enforces.

type Interval = "month" | "year";
type Billing = { access: Access; used: number; subscription: { plan: string; status: string; provider?: string; interval?: Interval; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; portal: boolean } | null; configured: { stripe?: boolean; p2p?: boolean; starter: boolean; custom: boolean; yearly?: boolean }; provider?: "p2p" | "stripe"; p2p?: { pending: { plan: string; interval: Interval; amount: number; currency: string; createdAt: string } | null; refund?: Refund | null } | null };
type Refund = { id: string; status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELED"; comment: string; createdAt: string; decidedAt: string | null };
const P2P_REMIND_DAYS = 5;

export function PlanPanel({ locale, notify, isOwner }: { locale: string; notify: (text: string) => void; isOwner: boolean }) {
  const ru = locale !== "en";
  const offer = PLAN_OFFER[ru ? "ru" : "en"];
  const [data, setData] = useState<Billing | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [interval, setBillingInterval] = useState<Interval | null>(null);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const response = await fetch("/api/billing", { cache: "no-store" }); if (!response.ok) throw new Error();
      const body = await response.json() as Billing; setData(body);
      // Start on the period the customer already pays for.
      setBillingInterval(current => current ?? (body.access.interval ?? "month"));
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const query = new URLSearchParams(window.location.search).get("billing"); if (query === "success") notify(ru ? "Оплата прошла — тариф обновится через минуту" : "Payment complete — the plan updates within a minute"); else if (query === "changed") notify(ru ? "Тариф изменён — разница пересчитается в следующем счёте" : "Plan changed — the difference is prorated"); else if (query === "cancelled") notify(ru ? "Оплата отменена" : "Payment cancelled"); }, [notify, ru]);
  if (failed) return <div className="sxState"><p>{ru ? "Не удалось загрузить подписку" : "Couldn't load the subscription"}</p><button className="btn" onClick={() => void load()}>{ru ? "Повторить" : "Retry"}</button></div>;
  if (!data) return <div className="sxState"><span className="sxSpinner"/>{ru ? "Загружаем подписку…" : "Loading subscription…"}</div>;

  const { access } = data;
  const date = (iso: string) => new Date(iso).toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long" });
  const daysLeft = Math.max(0, Math.ceil((new Date(access.trialEndsAt).getTime() - Date.now()) / 86400_000));
  const share = Math.min(100, Math.round((data.used / Math.max(1, access.messageLimit)) * 100));
  const stateText = access.openAccess ? (ru ? "Идёт тестирование: все тарифы и функции открыты бесплатно. Об окончании предупредим заранее." : "Testing period: every plan and feature is free. We'll tell you before it ends.")
    : access.state === "trial" ? (ru ? `Пробный период: осталось ${daysLeft} дн. (до ${date(access.trialEndsAt)})` : `Trial: ${daysLeft} days left (until ${date(access.trialEndsAt)})`)
    : access.state === "active" && data.subscription?.provider === "P2P" ? (ru ? `Оплачено до ${date(data.subscription.currentPeriodEnd)}. Продление — новым переводом, напомним заранее.` : `Paid until ${date(data.subscription.currentPeriodEnd)}. Renew with a new transfer — we'll remind you.`)
    : access.state === "active" ? (data.subscription?.cancelAtPeriodEnd ? (ru ? `Активна до ${date(data.subscription.currentPeriodEnd)}, затем отменится` : `Active until ${date(data.subscription.currentPeriodEnd)}, then cancels`) : (ru ? `Подписка активна${data.subscription ? ` · продление ${date(data.subscription.currentPeriodEnd)}` : ""}` : `Subscription active${data.subscription ? ` · renews ${date(data.subscription.currentPeriodEnd)}` : ""}`))
    : access.state === "past_due" ? (ru ? "Оплата не продлена — оплатите следующий период, иначе ИИ остановится" : "Payment overdue — pay for the next period or the AI will stop")
    : (ru ? "Нет активного тарифа: ИИ не отвечает посетителям, они могут оставить заявку" : "No active plan: the AI is paused, visitors can still leave requests");
  const period: Interval = interval ?? "month";
  const currentInterval: Interval = access.interval ?? "month";
  const choose = async (plan: "STARTER" | "CUSTOM") => {
    // P2P: new plan, renewal and switching all go through the transfer page.
    if (data.provider !== "stripe") { window.location.assign(`/app/checkout?plan=${plan}${period === "year" ? "&interval=year" : ""}`); return; }
    setBusy(plan);
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checkout", plan, interval: period }) });
      const body = await response.json().catch(() => ({})) as { url?: string; changed?: boolean; error?: string };
      if (body.url) { window.location.assign(body.url); return; }
      if (body.changed) { notify(ru ? "Тариф изменён — разница пересчитается в следующем счёте" : "Plan changed — the difference is prorated"); await load(); return; }
      notify(body.error === "BILLING_PROVIDER_NOT_CONFIGURED" ? (ru ? "Оплата ещё не подключена" : "Payments are not set up yet") : body.error === "PAST_DUE" ? (ru ? "Сначала оплатите текущий период" : "Pay for the current period first") : (ru ? "Не удалось открыть оплату" : "Couldn't open checkout"));
    } finally { setBusy(""); }
  };
  const portal = async () => {
    setBusy("portal");
    try { const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "portal" }) }); const body = await response.json().catch(() => ({})) as { url?: string }; if (body.url) window.location.assign(body.url); else notify(ru ? "Не удалось открыть управление оплатой" : "Couldn't open billing portal"); }
    finally { setBusy(""); }
  };
  const paidActive = (access.state === "active" || access.state === "past_due") && access.plan !== "TRIAL";

  return <div className="sxPlans">
    <section className={`sxPlanNow ${access.state}`}>
      <div><span className="pageKicker"><CreditCard size={13}/>{ru ? "Текущий тариф" : "Current plan"}</span><h2>{access.openAccess ? (ru ? "Всё открыто" : "Everything unlocked") : offer[access.plan].name}{!access.openAccess && access.plan !== "TRIAL" && access.interval === "year" && <small className="sxYearTag">{ru ? "оплата за год" : "billed yearly"}</small>}</h2><p>{stateText}</p></div>
      <div className="sxUsage"><span>{ru ? "Ответы ИИ в этом периоде" : "AI replies this period"}</span><strong>{data.used.toLocaleString(ru ? "ru-RU" : "en-US")} <small>/ {access.messageLimit.toLocaleString(ru ? "ru-RU" : "en-US")}</small></strong><i><b style={{ width: `${share}%` }} className={share >= 90 ? "warn" : ""}/></i><small>{ru ? `Период: ${date(access.periodStart)} — ${date(access.periodEnd)}` : `Period: ${date(access.periodStart)} — ${date(access.periodEnd)}`}</small></div>
      {data.subscription?.portal && isOwner && <button className="btn" disabled={busy === "portal"} onClick={portal}><ExternalLink size={14}/>{ru ? "Оплата и счета" : "Billing & invoices"}</button>}
    </section>
    {access.openAccess && <p className="sxNote sxOpen"><Sparkles size={14}/>{ru ? "На время тестов вам доступно всё из Custom: полный редактор карточки, ИИ-подбор дизайна под сайт и повышенный лимит ответов. Оплата отключена." : "During testing you get everything in Custom: the full card editor, AI design matching and the higher reply limit. Payments are off."}</p>}
    {!access.openAccess && !(data.configured.p2p ?? data.configured.stripe) && <p className="sxNote">{ru ? "Оплата пока не подключена." : "Payments aren't set up yet."}</p>}
    {!access.openAccess && data.p2p?.pending && <p className="sxNote"><Clock3 size={14}/>{ru ? `Проверяем ваш перевод (${offer[data.p2p.pending.plan === "CUSTOM" ? "CUSTOM" : "STARTER"].name}, ${data.p2p.pending.interval === "year" ? "за год" : "за месяц"}). Тариф включится после подтверждения — обычно в течение 24 часов.` : `We're checking your transfer (${offer[data.p2p.pending.plan === "CUSTOM" ? "CUSTOM" : "STARTER"].name}, ${data.p2p.pending.interval === "year" ? "yearly" : "monthly"}). The plan switches on once confirmed — usually within 24 hours.`} <a href={`/app/checkout?plan=${data.p2p.pending.plan}`}>{ru ? "Подробнее" : "Details"}</a></p>}
    {!access.openAccess && data.provider !== "stripe" && <PaymentCancel ru={ru} notify={notify} reload={load} refund={data.p2p?.refund ?? null} canRequest={isOwner && access.state === "active" && data.subscription?.provider === "P2P"}/>}
    <div className="sxInterval" role="group" aria-label={ru ? "Период оплаты" : "Billing period"}>
      <div className="sxSegmented">
        <button type="button" className={period === "month" ? "on" : ""} aria-pressed={period === "month"} onClick={() => setBillingInterval("month")}>{ru ? "Помесячно" : "Monthly"}</button>
        <button type="button" className={period === "year" ? "on" : ""} aria-pressed={period === "year"} onClick={() => setBillingInterval("year")}>{ru ? "За год" : "Yearly"} <span className="sxSave">−{YEARLY_SAVE_PERCENT}%</span></button>
      </div>
      <small>{ru ? `При оплате за год — скидка ${YEARLY_SAVE_PERCENT}%. Лимит ответов ИИ обновляется каждый месяц.` : `Pay yearly and save ${YEARLY_SAVE_PERCENT}%. The AI reply allowance resets every month.`}</small>
    </div>
    <div className="sxPlanGrid">
      {(["TRIAL", "STARTER", "CUSTOM"] as const).map(key => {
        const plan = offer[key];
        const samePlan = !access.openAccess && access.plan === key && (key === "TRIAL" ? access.state === "trial" : paidActive);
        // A paid plan is "yours" only in the period you pay for; the other period is a switch.
        const current = samePlan && (key === "TRIAL" || currentInterval === period);
        const configured = (key === "STARTER" ? data.configured.starter : key === "CUSTOM" ? data.configured.custom : false) && (period === "month" || Boolean(data.configured.yearly));
        const price = key === "TRIAL" ? { price: plan.price, period: plan.period, note: "" } : planPriceText(key, period, ru ? "ru" : "en");
        const promo = key === "TRIAL" && !access.openAccess ? TRIAL_PROMO[ru ? "ru" : "en"] : null;
        return <article key={key} className={`sxPlan${key === "CUSTOM" ? " featured" : ""}${promo ? " promo" : ""}${current ? " current" : ""}`}>
          {key === "CUSTOM" && <span className="sxBadge"><Sparkles size={12}/>{ru ? "Свой дизайн" : "Own design"}</span>}
          {promo && <span className="sxBadge promo"><Gift size={12}/>{promo.badge}</span>}
          <h3>{plan.name}</h3>
          <div className="sxPrice"><strong>{price.price}</strong><small>{price.period}</small></div>
          {price.note && <small className="sxPriceNote">{price.note}</small>}
          {promo && <small className="sxPromo">{promo.text}</small>}
          <p>{plan.copy}</p>
          <ul>{plan.features.map(feature => <li key={feature}><Check size={14}/>{feature}</li>)}</ul>
          {access.openAccess ? <button className="btn" disabled><Check size={14}/>{ru ? "Открыто на время тестов" : "Unlocked for testing"}</button>
            : key === "TRIAL" ? <button className="btn" disabled>{access.state === "trial" ? (ru ? "Сейчас активен" : "Active now") : (ru ? "Один раз на аккаунт" : "Once per account")}</button>
            : current && data.provider !== "stripe" ? <button className="btn" disabled={!isOwner || !configured} onClick={() => void choose(key)}><Check size={14}/>{ru ? "Ваш тариф · продлить" : "Your plan · renew"}</button>
            : current ? <button className="btn" disabled><Check size={14}/>{ru ? "Ваш тариф" : "Your plan"}</button>
            : <button className={key === "CUSTOM" ? "primary" : "btn"} disabled={!isOwner || !configured || Boolean(busy)} onClick={() => void choose(key)}>{busy === key ? "…" : !configured ? (ru ? "Оплата скоро" : "Coming soon") : samePlan ? (period === "year" ? (ru ? "Перейти на оплату за год" : "Switch to yearly") : (ru ? "Перейти на помесячную оплату" : "Switch to monthly")) : paidActive ? (ru ? `Перейти на ${plan.name}` : `Switch to ${plan.name}`) : (ru ? `Выбрать ${plan.name}` : `Choose ${plan.name}`)}</button>}
        </article>;
      })}
    </div>
    <PlanCompare ru={ru} current={access.openAccess ? "CUSTOM" : access.plan}/>
    {!isOwner && <p className="sxMuted">{ru ? "Менять тариф может только владелец." : "Only the owner can change the plan."}</p>}
    <section className="sxSoon"><h3><Clock3 size={15}/>{ru ? "Скоро появится" : "Coming soon"}</h3><p>{ru ? "Не входит в тарифы сейчас — расскажем, когда будет готово." : "Not part of any plan yet."}</p><ul>{COMING_SOON[ru ? "ru" : "en"].map(item => <li key={item}>{item}</li>)}</ul></section>
  </div>;
}

/**
 * «Отменить оплату»: the owner sends a cancellation request with a comment; a
 * platform admin approves it in «Админка» (plan ends, money returned) or declines.
 */
function PaymentCancel({ ru, notify, reload, refund, canRequest }: { ru: boolean; notify: (text: string) => void; reload: () => Promise<void>; refund: Refund | null; canRequest: boolean }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const day = (iso: string) => new Date(iso).toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long" });
  const support = <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
  const hint = <small className="sxCancelHint">{ru ? "Если отмена не прошла, обратитесь на " : "If the cancellation didn't go through, write to "}{support}</small>;
  const recent = refund?.decidedAt && Date.now() - new Date(refund.decidedAt).getTime() < 30 * 86_400_000;
  if (refund?.status === "PENDING") return <div className="sxNote sxCancel"><Clock3 size={14}/><span>{ru ? `Запрос на отмену оплаты отправлен ${day(refund.createdAt)} и ждёт подтверждения администратора — обычно в течение рабочего дня. Тариф работает до решения.` : `Your cancellation request was sent on ${day(refund.createdAt)} and is waiting for an admin — usually within a business day. The plan keeps working until then.`}{hint}</span></div>;
  const decided = recent && refund?.status === "REJECTED" ? <div className="sxNote sxCancel warn"><RotateCcw size={14}/><span>{ru ? "Отмена не прошла: администратор отклонил запрос. " : "The cancellation didn't go through: the request was declined. "}{refund.comment.includes("\n— ") ? refund.comment.split("\n— ").slice(1).join(" ") + " " : ""}{ru ? "Обратитесь на " : "Write to "}{support}</span></div>
    : recent && refund?.status === "CONFIRMED" ? <div className="sxNote sxCancel"><Check size={14}/><span>{ru ? `Оплата отменена ${day(refund.decidedAt!)}. Деньги вернём тем же способом, которым вы платили.` : `Payment cancelled on ${day(refund.decidedAt!)}. We'll return the money the way you paid.`}{hint}</span></div> : null;
  if (!canRequest) return decided;
  const send = async () => {
    setSending(true);
    try {
      const response = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refund_request", comment }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { notify(body.error === "ALREADY_REQUESTED" ? (ru ? "Запрос уже отправлен" : "Request already sent") : body.error === "NO_PAID_PLAN" ? (ru ? "Нет оплаченного тарифа для отмены" : "No paid plan to cancel") : (ru ? `Не удалось отправить запрос. Напишите на ${SUPPORT_EMAIL}` : `Couldn't send the request. Write to ${SUPPORT_EMAIL}`)); return; }
      notify(ru ? "Запрос на отмену отправлен" : "Cancellation request sent"); setOpen(false); setComment(""); await reload();
    } catch { notify(ru ? `Не удалось отправить запрос. Напишите на ${SUPPORT_EMAIL}` : `Couldn't send the request. Write to ${SUPPORT_EMAIL}`); }
    finally { setSending(false); }
  };
  return <>
    {decided}
    {open ? <form className="sxCancelForm" onSubmit={event => { event.preventDefault(); void send(); }}>
      <h3><RotateCcw size={15}/>{ru ? "Отменить оплату" : "Cancel payment"}</h3>
      <p>{ru ? "Напишите, почему отменяете. Запрос подтвердит администратор: после этого тариф выключится, а деньги вернём тем же способом, которым вы платили, — по условиям возврата." : "Tell us why you're cancelling. An admin confirms the request: then the plan switches off and we return the money the way you paid, under the refund terms."} <a href="/legal/refund" target="_blank" rel="noreferrer">{ru ? "Условия возврата" : "Refund terms"}</a></p>
      <label className="sxField wide"><span>{ru ? "Комментарий к отмене" : "Comment"}</span><textarea required minLength={3} maxLength={500} rows={3} value={comment} onChange={event => setComment(event.target.value)} placeholder={ru ? "Например: не подошло для нашего сайта" : "E.g. not a fit for our site"} autoFocus/></label>
      <div className="sxCancelActions"><button type="submit" className="primary" disabled={sending || comment.trim().length < 3}>{sending ? "…" : (ru ? "Отправить запрос на отмену" : "Send cancellation request")}</button><button type="button" className="btn" onClick={() => setOpen(false)}>{ru ? "Не отменять" : "Keep my plan"}</button></div>
      {hint}
    </form> : <div className="sxCancelRow"><button type="button" className="btn" onClick={() => setOpen(true)}><RotateCcw size={14}/>{ru ? "Отменить оплату" : "Cancel payment"}</button>{hint}</div>}
  </>;
}

/** Feature-by-feature comparison, drawn from the same matrix the API enforces. */
function PlanCompare({ ru, current }: { ru: boolean; current: "TRIAL" | "STARTER" | "CUSTOM" }) {
  const groups = { ai: ru ? "ИИ-продавец" : "AI seller", knowledge: ru ? "Знания" : "Knowledge", sales: ru ? "Заявки и диалоги" : "Requests & conversations", card: ru ? "Карточка на сайте" : "Website card" } as const;
  const cell = (value: boolean | number | string) => value === true ? <Check size={15} className="yes"/> : value === false ? <Minus size={15} className="no"/> : typeof value === "number" ? value.toLocaleString(ru ? "ru-RU" : "en-US") : (ru ? "базовая" : "basic");
  const plans = ["TRIAL", "STARTER", "CUSTOM"] as const;
  return <section className="sxCompare" aria-label={ru ? "Сравнение тарифов" : "Plan comparison"}>
    <table><thead><tr><th>{ru ? "Что входит" : "What's included"}</th>{plans.map(plan => <th key={plan} className={plan === current ? "current" : ""}>{PLAN_OFFER[ru ? "ru" : "en"][plan].name}</th>)}</tr></thead>
      <tbody>{(Object.keys(groups) as Array<keyof typeof groups>).flatMap(group => [<tr key={group} className="group"><td colSpan={4}>{groups[group]}</td></tr>, ...FEATURE_MATRIX.filter(row => row.group === group).map(row => <tr key={row.key}><td>{row.label[ru ? "ru" : "en"]}</td>{plans.map(plan => <td key={plan} className={plan === current ? "current" : ""}>{cell(row.values[plan])}</td>)}</tr>)])}</tbody>
    </table>
  </section>;
}

/** Dashboard notice about the trial, an ended plan or a nearly used allowance. Silent when all is fine. */
export function PlanBanner({ locale, onOpen }: { locale: string; onOpen: () => void }) {
  const ru = locale !== "en";
  const [data, setData] = useState<Billing | null>(null);
  // Re-render every minute so the trial countdown stays current while the cabinet is open.
  const [, tick] = useState(0);
  useEffect(() => { fetch("/api/billing", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(setData).catch(() => undefined); const timer = window.setInterval(() => tick(n => n + 1), 60_000); return () => window.clearInterval(timer); }, []);
  if (!data) return null;
  const { access } = data;
  const share = data.used / Math.max(1, access.messageLimit);
  const left = Math.max(0, new Date(access.trialEndsAt).getTime() - Date.now());
  const days = Math.floor(left / 86400_000), hours = Math.floor((left % 86400_000) / 3600_000);
  const endDate = new Date(access.trialEndsAt).toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "long" });
  const trialLeft = ru ? (days > 0 ? `${days} дн. ${hours} ч.` : `${hours} ч.`) : (days > 0 ? `${days}d ${hours}h` : `${hours}h`);
  // Paid subscriptions that ended fall back to "expired" too; the wording follows what ended.
  const hadPaid = Boolean(data.subscription && data.subscription.plan !== "TRIAL");
  const prepaidEndsSoon = access.state === "active" && data.subscription?.provider === "P2P" && !data.p2p?.pending && new Date(data.subscription.currentPeriodEnd).getTime() - Date.now() < P2P_REMIND_DAYS * 86400_000;
  const text = access.openAccess ? (share >= 0.8 ? (ru ? `Использовано ${Math.round(Math.min(1, share) * 100)}% ответов ИИ в этом периоде.` : `${Math.round(Math.min(1, share) * 100)}% of AI replies used.`) : (ru ? "Тестовый период: все тарифы и функции открыты бесплатно." : "Testing period: every plan and feature is free."))
    : access.state === "expired" ? (hadPaid ? (ru ? "Подписка закончилась — ИИ не отвечает посетителям. Выберите тариф, чтобы продолжить." : "Your subscription ended — the AI is paused. Choose a plan to continue.") : (ru ? "Пробный период закончился — ИИ не отвечает посетителям. Выберите тариф, чтобы продолжить." : "Your trial ended — the AI is paused. Choose a plan to continue."))
    : access.state === "past_due" ? (ru ? "Оплата не продлена. Оплатите следующий период, чтобы ИИ не остановился." : "Payment overdue. Pay for the next period to keep the AI running.")
    : share >= 1 ? (ru ? "Лимит ответов ИИ в этом периоде исчерпан — посетители видят просьбу оставить контакты." : "AI reply limit reached — visitors are asked to leave contacts.")
    : share >= 0.8 ? (ru ? `Использовано ${Math.round(share * 100)}% ответов ИИ в этом периоде.` : `${Math.round(share * 100)}% of AI replies used this period.`)
    : access.state === "trial" ? (ru ? `Пробный период: осталось ${trialLeft} · до ${endDate}` : `Trial: ${trialLeft} left · until ${endDate}`)
    : prepaidEndsSoon ? (ru ? `Оплаченный период заканчивается ${new Date(data.subscription!.currentPeriodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} — продлите переводом, чтобы ИИ не остановился.` : `Your paid period ends on ${new Date(data.subscription!.currentPeriodEnd).toLocaleDateString("en-US", { day: "numeric", month: "long" })} — renew with a transfer to keep the AI running.`) : "";
  if (!text) return null;
  const tone = access.openAccess ? (share >= 1 ? "bad" : "info") : access.state === "expired" || access.state === "past_due" || share >= 1 ? "bad" : "info";
  const trialShare = access.state === "trial" && !access.openAccess ? Math.min(1, Math.max(0, 1 - left / (TRIAL_DAYS * 86400_000))) : null;
  return <>
    <div className={`sxBanner ${tone}${trialShare !== null ? " trial" : ""}`} role="status"><span>{text}{trialShare !== null && <i className="sxTrialBar" aria-hidden="true"><b style={{ width: `${Math.round(trialShare * 100)}%` }}/></i>}</span><button className={tone === "bad" || (trialShare !== null && days < 3) ? "primary" : "btn"} onClick={onOpen}>{ru ? "Тарифы" : "Plans"}</button></div>
  </>;
}

/** Mounted once in the cabinet: after the trial or a subscription ends, every visit asks to choose a plan. */
export function PlanGate({ locale, isOwner, onPlans }: { locale: string; isOwner: boolean; onPlans: () => void }) {
  const [state, setState] = useState<{ expired: boolean; hadPaid: boolean } | null>(null);
  useEffect(() => { fetch("/api/billing", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then((body: Billing | null) => { if (body) setState({ expired: body.access.state === "expired" && !body.access.openAccess, hadPaid: Boolean(body.subscription && body.subscription.plan !== "TRIAL") }); }).catch(() => undefined); }, []);
  return state?.expired ? <PlanEnded ru={locale !== "en"} hadPaid={state.hadPaid} isOwner={isOwner} onPlans={onPlans}/> : null;
}

/**
 * Shown on every visit after the trial or a subscription has ended: the AI is
 * paused until the owner buys Starter or Custom. Closing it only hides it until
 * the next page load; knowledge, settings and conversations are kept.
 */
function PlanEnded({ ru, hadPaid, isOwner, onPlans }: { ru: boolean; hadPaid: boolean; isOwner: boolean; onPlans: () => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey); }, []);
  if (!open) return null;
  const offer = PLAN_OFFER[ru ? "ru" : "en"];
  const card = (key: "STARTER" | "CUSTOM") => <article className={key === "CUSTOM" ? "sxEndPlan featured" : "sxEndPlan"}>
    <h3>{offer[key].name}</h3>
    <div className="sxPrice"><strong>{planPriceText(key, "month", ru ? "ru" : "en").price}</strong><small>{ru ? "в месяц" : "per month"}</small></div>
    <p>{offer[key].copy}</p>
    <ul>{offer[key].features.slice(0, 3).map(feature => <li key={feature}><Check size={13}/>{feature}</li>)}</ul>
    {isOwner ? <button className={key === "CUSTOM" ? "primary" : "btn"} onClick={() => window.location.assign(`/app/checkout?plan=${key}`)}>{ru ? `Оформить ${offer[key].name}` : `Get ${offer[key].name}`}</button> : null}
  </article>;
  return <div className="sxEndOverlay" role="dialog" aria-modal="true" aria-labelledby="sx-end-title" onMouseDown={() => setOpen(false)}>
    <section className="sxEnd" onMouseDown={event => event.stopPropagation()}>
      <span className="pageKicker"><CreditCard size={13}/>{ru ? "Тариф" : "Plan"}</span>
      <h2 id="sx-end-title">{hadPaid ? (ru ? "Подписка закончилась" : "Your subscription has ended") : (ru ? "Пробный период закончился" : "Your free trial has ended")}</h2>
      <p>{ru ? "ИИ-продавец на вашем сайте остановлен: посетители видят форму заявки, ответы ИИ отключены. Выберите тариф, чтобы продолжить — знания, настройки карточки и диалоги сохранены." : "The AI seller on your site is paused: visitors see the request form, AI replies are off. Choose a plan to continue — your knowledge, card settings and conversations are kept."}</p>
      <div className="sxEndPlans">{card("STARTER")}{card("CUSTOM")}</div>
      {!isOwner && <p className="sxMuted">{ru ? "Оформить тариф может владелец пространства." : "Only the workspace owner can choose a plan."}</p>}
      <div className="sxEndFoot"><button className="linkButton" onClick={() => { setOpen(false); onPlans(); }}>{ru ? "Сравнить тарифы и оплату за год" : "Compare plans and yearly billing"}</button><button className="btn" onClick={() => setOpen(false)}>{ru ? "Позже" : "Later"}</button></div>
    </section>
  </div>;
}
