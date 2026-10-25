// Lemeri contacts and the launch offer. One source for the landing page, the
// cabinet, the legal pages and Lemeri's own AI assistant, so every place shows
// the same addresses and the same promise (docs/CLAUDE_CONTEXT.md → «Контакты»).

export const SUPPORT_EMAIL = "support@lemeriai.com";
export const WORK_EMAIL = "work@lemeriai.com";

/** Lemeri social networks — landing footer and the assistant's facts. */
export const SOCIAL_LINKS = [
  { key: "telegram", label: "Telegram", url: "https://t.me/LemeriHub" },
  { key: "instagram", label: "Instagram", url: "https://www.instagram.com/lemeri.ai/" },
  { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@lemeriai" },
] as const;
const socialList = () => SOCIAL_LINKS.map(item => `${item.label} — ${item.url}`).join(", ");

/**
 * «В честь запуска» — special offer for the first week after launch. It is not a
 * plan in the catalog: the customer writes to WORK_EMAIL and the team builds the
 * landing page / website by hand. Hidden automatically after `until`.
 */
export const LAUNCH_OFFER = {
  until: "2026-10-30T23:59:59+05:00",
  ru: {
    headline: "В честь запуска — специальное предложение на первую неделю",
    items: [
      { name: "Free", text: "бесплатный лендинг + ИИ-сотрудник" },
      { name: "Starter ($19/мес)", text: "полноценный сайт, интернет-магазин или другое веб-решение + ИИ-сотрудник" },
    ],
    cta: "Написать нам",
    subject: "Предложение в честь запуска",
  },
  en: {
    headline: "To celebrate our launch — a special offer for the first week",
    items: [
      { name: "Free", text: "a free landing page + AI employee" },
      { name: "Starter ($19/mo)", text: "a full website, online store or other web solution + AI employee" },
    ],
    cta: "Contact us",
    subject: "Launch offer",
  },
} as const;

export function launchOfferActive(now = Date.now()) {
  return now <= Date.parse(LAUNCH_OFFER.until);
}

export const launchOfferMailto = (locale: "ru" | "en") => `mailto:${WORK_EMAIL}?subject=${encodeURIComponent(`${LAUNCH_OFFER[locale].subject} · Lemeri AI`)}`;

/** Labels for the two addresses. */
export const CONTACT_LABELS = {
  ru: { support: "Поддержка", work: "Сотрудничество" },
  en: { support: "Support", work: "Partnerships" },
} as const;

/**
 * Facts Lemeri's own assistant always knows, added to its context on every reply
 * (orchestrator), so they stay current even though its knowledge base was
 * written once at provisioning.
 */
export function lemeriLiveFacts(locale: "ru" | "en", now = Date.now()) {
  const offer = LAUNCH_OFFER[locale];
  const until = new Date(LAUNCH_OFFER.until).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
  const list = offer.items.map(item => `${item.name} — ${item.text}`).join("; ");
  const launch = launchOfferActive(now)
    ? locale === "en"
      ? ` ${offer.headline} (valid until ${until}): ${list}. To get it, write to ${WORK_EMAIL}.`
      : ` ${offer.headline} (действует до ${until}): ${list}. Чтобы получить предложение, напишите на ${WORK_EMAIL}.`
    : "";
  return locale === "en"
    ? `VERIFIED FACTS ABOUT LEMERI AI (always current, share them when asked): support (help with the cabinet, payment, refunds, account problems) — ${SUPPORT_EMAIL}; cooperation, partnerships, payment by card and custom projects — ${WORK_EMAIL}; social networks: ${socialList()}.${launch}`
    : `ПРОВЕРЕННЫЕ ФАКТЫ О LEMERI AI (всегда актуальны, сообщай их, когда спрашивают): поддержка (помощь с кабинетом, оплатой, возвратом, проблемы с аккаунтом) — ${SUPPORT_EMAIL}; сотрудничество, партнёрство, оплата картой и индивидуальные проекты — ${WORK_EMAIL}; соцсети: ${socialList()}.${launch}`;
}
