import { formatUsd, planPriceUsd, yearlyMonthlyUsd, YEARLY_DISCOUNT, type BillingInterval } from "./plans.ts";

// What each plan includes, worded for customers. One source for the landing page
// and the cabinet so the promise is identical everywhere. Starter and Custom have
// the same AI; Custom only adds the advanced card editor.

export const PLAN_OFFER = {
  ru: {
    TRIAL: { name: "Trial", price: "$0", period: "14 дней", copy: "Попробуйте ИИ-продавца на своём сайте.", features: ["Один ИИ-сотрудник", "До 150 ответов ИИ в месяц", "ИИ сам изучает ваш сайт (до 10 страниц)", "База знаний: до 5 источников (текст, FAQ, сайт)", "Консультации и сбор заявок", "Карточка на сайте: цвет, имя, приветствие, тема"] },
    STARTER: { name: "Starter", price: "$19", period: "в месяц", copy: "Полноценный ИИ-продавец для сайта.", features: ["До 2000 ответов ИИ в месяц", "Консультации, продажи, подбор товаров и услуг", "ИИ изучает сайт до 20 страниц и читает страницу посетителя", "База знаний до 50 источников + загрузка PDF, DOCX, XLSX", "Сбор заявок и история диалогов", "Менеджер отвечает клиенту прямо из кабинета", "Базовая аналитика", "Стандартная кастомизация карточки: цвет, имя, аватар, приветствие, положение, 12 готовых стилей (включая «Стекло», «Аврору» и «Люкс»)"] },
    CUSTOM: { name: "Custom", price: "$29", period: "в месяц", copy: "Всё из Starter + собственный дизайн карточки.", features: ["Весь функционал Starter", "Без подписи «Lemiri AI» в карточке", "ИИ подбирает дизайн карточки под ваш сайт", "Визуальный редактор карточки без кода", "Премиум-эффекты: матовое стекло, свечение, градиенты, текстуры фона", "Проактивное сообщение и пульсация кнопки", "Своя палитра для светлой и тёмной темы", "19 шрифтов и отдельный шрифт заголовков, размеры, скругления, тени, рамки, фон", "Стиль и анимация сообщений, поле ввода, кнопки и заголовок", "Иконка и подсказка кнопки открытия", "Приветственный экран и анимации", "Отдельные настройки для телефонов", "Свои сохранённые стили"] },
  },
  en: {
    TRIAL: { name: "Trial", price: "$0", period: "14 days", copy: "Try the AI seller on your website.", features: ["One AI employee", "Up to 150 AI replies a month", "The AI studies your site (up to 10 pages)", "Knowledge base: up to 5 sources (text, FAQ, website)", "Consultations and requests", "Website card: colour, name, greeting, theme"] },
    STARTER: { name: "Starter", price: "$19", period: "per month", copy: "A complete AI seller for your website.", features: ["Up to 2,000 AI replies a month", "Consultations, selling, product and service recommendations", "The AI studies up to 20 pages and reads the visitor's page", "Up to 50 knowledge sources + PDF, DOCX, XLSX upload", "Requests and conversation history", "Managers reply to customers from the cabinet", "Basic analytics", "Standard card customisation: colour, name, avatar, greeting, position, 12 ready-made styles (incl. Glass, Aurora and Luxe)"] },
    CUSTOM: { name: "Custom", price: "$29", period: "per month", copy: "Everything in Starter + your own card design.", features: ["Everything in Starter", "No “Lemiri AI” label in the card", "AI matches the card design to your website", "Visual card editor, no code", "Premium effects: frosted glass, glow, gradients, background textures", "Proactive message and pulsing button", "Own palette for light and dark themes", "19 fonts plus a heading font, sizes, radii, shadows, borders, background", "Message style and animation, input field, buttons and header", "Launcher icon and hint", "Welcome screen and animations", "Separate phone settings", "Saved custom styles"] },
  },
} as const;

/**
 * Price lines for a paid plan in the chosen billing period, computed from plans.ts
 * so the landing page, the cabinet and checkout always show the same numbers.
 * Yearly: Starter $15.20/month ($182.40 a year), Custom $23.20/month ($278.40 a year).
 */
export function planPriceText(plan: "STARTER" | "CUSTOM", interval: BillingInterval, locale: "ru" | "en") {
  const ru = locale === "ru";
  const monthly = planPriceUsd(plan), yearly = planPriceUsd(plan, "year");
  const save = formatUsd(Math.round((monthly * 12 - yearly) * 100) / 100);
  if (interval === "year") return {
    price: formatUsd(yearlyMonthlyUsd(plan)), period: ru ? "в месяц при оплате за год" : "per month, billed yearly",
    total: formatUsd(yearly), per: ru ? "в год" : "per year",
    note: ru ? `${formatUsd(yearly)} раз в год · экономия ${save}` : `${formatUsd(yearly)} once a year · save ${save}`,
  };
  return {
    price: formatUsd(monthly), period: ru ? "в месяц" : "per month", total: formatUsd(monthly), per: ru ? "в месяц" : "per month",
    note: ru ? `или ${formatUsd(yearlyMonthlyUsd(plan))}/мес при оплате за год (−${YEARLY_SAVE_PERCENT}%)` : `or ${formatUsd(yearlyMonthlyUsd(plan))}/mo billed yearly (−${YEARLY_SAVE_PERCENT}%)`,
  };
}
export const YEARLY_SAVE_PERCENT = Math.round(YEARLY_DISCOUNT * 100);

/** Not part of any plan yet — shown separately, never as available. */
export const COMING_SOON = {
  ru: ["Онлайн-запись и бронирование", "Интеграция с календарём", "Расширенная аналитика продаж", "Синхронизация товаров и остатков", "Уведомления о важных заявках на почту и в мессенджеры", "Расширенная мультиязычность"],
  en: ["Online booking", "Calendar integration", "Advanced sales analytics", "Product and stock sync", "Email and messenger alerts about important requests", "Extended multilingual support"],
} as const;
