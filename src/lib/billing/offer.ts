// What each plan includes, worded for customers. One source for the landing page
// and the cabinet so the promise is identical everywhere. Starter and Custom have
// the same AI; Custom only adds the advanced card editor.

export const PLAN_OFFER = {
  ru: {
    TRIAL: { name: "Trial", price: "$0", period: "14 дней", copy: "Попробуйте ИИ-продавца на своём сайте.", features: ["Один ИИ-сотрудник", "Карточка на сайте", "Базовая настройка", "База знаний", "Консультации и сбор заявок", "Ограниченное число сообщений", "Стандартное оформление"] },
    STARTER: { name: "Starter", price: "$19", period: "в месяц", copy: "Полноценный ИИ-продавец для сайта.", features: ["Консультации и продажи", "Подбор товаров и услуг", "Сбор заявок и история диалогов", "База знаний и настройка поведения", "Передача обращения менеджеру", "Базовая аналитика", "Стандартная кастомизация карточки: цвет, имя, аватар, приветствие, положение, 12 готовых стилей (включая «Стекло», «Аврору» и «Люкс»)", "Повышенные лимиты сообщений"] },
    CUSTOM: { name: "Custom", price: "$29", period: "в месяц", copy: "Всё из Starter + собственный дизайн карточки.", features: ["Весь функционал Starter", "ИИ подбирает дизайн карточки под ваш сайт", "Визуальный редактор карточки без кода", "Премиум-эффекты: матовое стекло, свечение, градиенты, текстуры фона", "Проактивное сообщение и пульсация кнопки", "Своя палитра для светлой и тёмной темы", "19 шрифтов и отдельный шрифт заголовков, размеры, скругления, тени, рамки, фон", "Стиль и анимация сообщений, поле ввода, кнопки и заголовок", "Иконка и подсказка кнопки открытия", "Приветственный экран и анимации", "Отдельные настройки для телефонов", "Свои сохранённые стили"] },
  },
  en: {
    TRIAL: { name: "Trial", price: "$0", period: "14 days", copy: "Try the AI seller on your website.", features: ["One AI employee", "Website card", "Basic setup", "Knowledge base", "Consultations and requests", "Limited messages", "Standard look"] },
    STARTER: { name: "Starter", price: "$19", period: "per month", copy: "A complete AI seller for your website.", features: ["Consultations and selling", "Product and service recommendations", "Requests and conversation history", "Knowledge base and behaviour settings", "Handoff to a manager", "Basic analytics", "Standard card customisation: colour, name, avatar, greeting, position, 12 ready-made styles (incl. Glass, Aurora and Luxe)", "Higher message limits"] },
    CUSTOM: { name: "Custom", price: "$29", period: "per month", copy: "Everything in Starter + your own card design.", features: ["Everything in Starter", "AI matches the card design to your website", "Visual card editor, no code", "Premium effects: frosted glass, glow, gradients, background textures", "Proactive message and pulsing button", "Own palette for light and dark themes", "19 fonts plus a heading font, sizes, radii, shadows, borders, background", "Message style and animation, input field, buttons and header", "Launcher icon and hint", "Welcome screen and animations", "Separate phone settings", "Saved custom styles"] },
  },
} as const;

/** Not part of any plan yet — shown separately, never as available. */
export const COMING_SOON = {
  ru: ["Онлайн-запись и бронирование", "Интеграция с календарём", "Расширенная аналитика продаж", "Синхронизация товаров и остатков", "Уведомления о важных заявках на почту и в мессенджеры", "Расширенная мультиязычность"],
  en: ["Online booking", "Calendar integration", "Advanced sales analytics", "Product and stock sync", "Email and messenger alerts about important requests", "Extended multilingual support"],
} as const;
