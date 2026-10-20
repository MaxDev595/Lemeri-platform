// Starter knowledge for Lemeri's own assistant (landing page and cabinet). The
// admin can edit it later in «База знаний» like any customer; the assistant also
// studies lemeriai.com itself. Prices come from the plan catalog so they never drift.

import { formatUsd, planPriceUsd, TRIAL_DAYS, yearlyMonthlyUsd } from "@/lib/billing/plans";
import { DEFAULT_MESSAGE_LIMITS } from "@/lib/billing/plans";

export const LEMERI_ASSISTANT_INSTRUCTIONS = [
  "You are the assistant of Lemeri AI itself, on lemeriai.com and inside the Lemeri cabinet.",
  "Visitors on the landing page are business owners deciding whether to try Lemeri; users in the cabinet are customers who need help with setup.",
  "Explain plainly how Lemeri works, help choose a plan and walk through setup step by step. Suggest the free trial when someone is interested.",
  "Never promise guaranteed growth of sales or conversion. Remind that AI can make mistakes when it matters.",
  "Payment, refunds and account problems you cannot solve: offer to pass the question to the Lemeri team.",
].join(" ");

export function lemeriKnowledge(locale: "ru" | "en") {
  const price = (plan: "STARTER" | "CUSTOM") => `${formatUsd(planPriceUsd(plan, "month"))}/${locale === "en" ? "month" : "мес"} ${locale === "en" ? "or" : "или"} ${formatUsd(planPriceUsd(plan, "year"))}/${locale === "en" ? "year" : "год"} (${formatUsd(yearlyMonthlyUsd(plan))}/${locale === "en" ? "month" : "мес"})`;
  if (locale === "en") return `Lemeri AI is an AI seller for websites. It is a chat card on top of the site that consults visitors 24/7, helps them choose products and services, answers questions and collects requests (leads).

How it works
1. Sign up at lemeriai.com and set up the AI employee: name, tone, goals, when to ask for contacts and when to hand over to a person.
2. Add knowledge: text, documents (PDF, DOCX, XLSX on paid plans) or press «Study the site» — the AI reads up to 20 pages (10 on Trial) and writes a site overview.
3. Install the card: paste one script tag before </body>, or use the hosted chat link and QR code. Changing the look later never requires changing the code.
4. Conversations and requests appear in the cabinet. A manager can take over a conversation and reply from the cabinet (Starter and Custom).
During a chat the AI also reads the page the visitor is currently on.
The AI can write first: a proactive message with an unread badge on the closed chat button (Starter and Custom).

Plans
- Trial: free for ${TRIAL_DAYS} days, ${DEFAULT_MESSAGE_LIMITS.TRIAL} AI replies, up to 5 knowledge sources, name, greeting, side and light or dark theme of the card.
- Starter: ${price("STARTER")}. ${DEFAULT_MESSAGE_LIMITS.STARTER} AI replies per month, 50 knowledge sources, documents, manager replies, subtitle, quick questions, auto-open and proactive first messages. The card design itself is fixed: only light or dark theme.
- Custom: ${price("CUSTOM")}. ${DEFAULT_MESSAGE_LIMITS.CUSTOM} AI replies per month and everything in Starter plus the full visual editor: colours, fonts, avatar, ready styles, premium effects, AI that matches the card to the site design, and no «Lemeri AI» label in the card.
Yearly payment saves 20%. Payment is prepaid, in USDT on the TON network — the plan switches on automatically within minutes of the exact amount arriving — or by bank transfer (no card form, no automatic charges): the customer transfers the amount shown on the checkout page, presses “I've paid”, and the plan switches on once the payment is confirmed, usually within a business day. Refunds within 14 days.

Important
- AI can make mistakes; Lemeri does not promise guaranteed sales growth.
- The AI answers from the business's own knowledge and hands the visitor to a person when unsure or when asked.`;
  return `Lemeri AI — ИИ-продавец для сайта. Это карточка чата поверх сайта: круглосуточно консультирует посетителей, помогает выбрать товары и услуги, отвечает на вопросы и собирает заявки.

Как это работает
1. Регистрация на lemeriai.com и настройка ИИ-сотрудника: имя, тон, цели, когда просить контакты и когда передавать человеку.
2. Знания: текст, документы (PDF, DOCX, XLSX — в платных тарифах) или кнопка «Изучить сайт» — ИИ сам прочитает до 20 страниц (в Trial до 10) и составит обзор сайта.
3. Установка карточки: одна строка кода перед </body>, или ссылка на чат и QR-код. Менять вид можно в кабинете — код на сайте менять не нужно.
4. Диалоги и заявки видны в кабинете. Менеджер может перехватить диалог и ответить из кабинета (Starter и Custom).
Во время диалога ИИ читает страницу, на которой сейчас посетитель.
ИИ может написать первым: проактивное сообщение и счётчик непрочитанных на закрытой кнопке чата (Starter и Custom).

Тарифы
- Trial: бесплатно ${TRIAL_DAYS} дней, ${DEFAULT_MESSAGE_LIMITS.TRIAL} ответов ИИ, до 5 источников знаний; в карточке — имя, приветствие, сторона экрана и светлая или тёмная тема.
- Starter: ${price("STARTER")}. ${DEFAULT_MESSAGE_LIMITS.STARTER} ответов ИИ в месяц, 50 источников знаний, документы, ответы менеджера из кабинета, подпись, быстрые вопросы, автооткрытие и первое сообщение от ИИ. Дизайн карточки фиксированный: только светлая или тёмная тема.
- Custom: ${price("CUSTOM")}. ${DEFAULT_MESSAGE_LIMITS.CUSTOM} ответов ИИ в месяц и всё из Starter плюс полный визуальный редактор: цвета, шрифты, аватар, готовые стили, премиум-эффекты, ИИ подбирает дизайн под сайт, карточка без подписи «Lemeri AI».
Оплата за год — скидка 20%. Оплата — предоплата в USDT в сети TON (тариф включается автоматически через несколько минут после поступления точной суммы) или переводом по реквизитам на странице оплаты (без автосписаний): клиент переводит сумму, нажимает «Я оплатил», и тариф включается после подтверждения, обычно в течение рабочего дня. Возврат в течение 14 дней.

Важно
- ИИ может ошибаться; Lemeri не обещает гарантированного роста продаж.
- ИИ отвечает по знаниям бизнеса и передаёт посетителя человеку, если не уверен или если его об этом попросили.`;
}
