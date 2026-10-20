import type { LegalSection } from "@/components/legal-page";
import type { LegalCompany } from "./company";

// Texts of /terms, /privacy and /refund. Payments are P2P bank transfers that
// an admin confirms by hand (lib/billing/p2p*.ts); no card data reaches Lemeri.
// These are templates prepared for review by a lawyer before the paid launch.

type Doc = { title: string; intro: string; sections: LegalSection[] };

export function termsText(locale: "ru" | "en", c: LegalCompany): Doc {
  return locale === "ru" ? {
    title: "Условия использования",
    intro: `Настоящие условия регулируют использование сервиса Lemeri AI (${c.site}) — ИИ-продавца в виде карточки чата на сайте. Сервис предоставляет ${c.entity}. Регистрируясь или оплачивая подписку, вы принимаете эти условия.`,
    sections: [
      { title: "Что такое сервис", body: ["Lemeri AI позволяет создать ИИ-сотрудника, наполнить его знаниями (в том числе автоматически изучив ваш сайт), разместить карточку чата на сайте и получать заявки посетителей в личном кабинете."] },
      { title: "Аккаунт", body: ["Вы отвечаете за достоверность данных при регистрации, сохранность пароля и действия, совершённые в вашем аккаунте. Пользоваться сервисом могут лица старше 18 лет и организации."] },
      { title: "Тарифы и оплата", body: [
        "Доступны тарифы Trial (бесплатно, 14 дней, один раз на аккаунт), Starter ($19 в месяц или $182.40 в год) и Custom ($29 в месяц или $278.40 в год). При оплате за год действует скидка 20%. Состав тарифов указан на странице тарифов и в кабинете.",
        "Оплата — в USDT (сеть TON) или переводом по реквизитам, указанным на странице оплаты в кабинете. Оплата в USDT подтверждается автоматически, как только платёж точной суммы появится в блокчейне. После обычного перевода нажмите «Я оплатил»; тариф включается, когда мы найдём платёж (обычно в течение рабочего дня). Данные банковской карты сервис не запрашивает и не хранит.",
        "Оплата — предоплата за месяц или за год, автоматических списаний нет. Чтобы продлить тариф, оплатите следующий период; оплата до окончания текущего периода продлевает его. Не продлили — по окончании периода ИИ перестаёт отвечать, данные сохраняются.",
        "Новый тариф начинается в день подтверждения оплаты. Лимит ответов ИИ при оплате за год обновляется каждый месяц. Цены могут меняться — новая цена применяется к следующей оплате.",
      ] },
      { title: "Лимиты", body: ["Каждый тариф включает лимит ответов ИИ в месяц. Когда лимит исчерпан или подписка закончилась, ИИ перестаёт отвечать посетителям, а форма заявки продолжает работать."] },
      { title: "Ответы ИИ", body: ["ИИ может ошибаться. Ответы формируются на основе ваших знаний и страниц вашего сайта; сервис не гарантирует их полноту и точность, а также рост продаж или конверсии. Вы отвечаете за информацию, которую предоставляете ИИ, и за проверку важных сведений перед сделкой."] },
      { title: "Ваши данные и данные посетителей", body: ["Вы остаётесь владельцем загруженных материалов и заявок. По отношению к персональным данным ваших посетителей вы — оператор (контролёр), а Lemeri AI обрабатывает их по вашему поручению. Вы обязаны иметь законное основание для обработки и политику конфиденциальности на своём сайте. Подробнее — в Политике конфиденциальности."] },
      { title: "Допустимое использование", body: ["Запрещено использовать сервис для спама, мошенничества, распространения незаконного контента, введения посетителей в заблуждение, а также пытаться обойти ограничения сервиса или нарушить его работу. При нарушении мы можем приостановить аккаунт."] },
      { title: "Доступность и изменения", body: ["Мы стремимся к бесперебойной работе, но не гарантируем её. Сервис может обновляться; о существенных изменениях условий сообщаем заранее по email или в кабинете."] },
      { title: "Ответственность", body: ["В пределах, допустимых законом, ответственность сервиса ограничена суммой, оплаченной вами за последние 3 месяца. Сервис не отвечает за упущенную выгоду и косвенные убытки."] },
      { title: "Прекращение", body: ["Вы можете удалить рабочее пространство и его данные в настройках или попросить удалить аккаунт. Мы можем прекратить предоставление сервиса при нарушении условий, вернув неиспользованную часть оплаты, если нарушение не было умышленным."] },
    ],
  } : {
    title: "Terms of Service",
    intro: `These terms govern the use of Lemeri AI (${c.site}) — an AI sales assistant shown as a chat card on your website. The service is provided by ${c.entity}. By signing up or paying for a subscription you accept these terms.`,
    sections: [
      { title: "The service", body: ["Lemeri AI lets you create an AI employee, give it knowledge (including automatically studying your website), place a chat card on your site and receive visitor requests in your cabinet."] },
      { title: "Account", body: ["You are responsible for accurate sign-up details, keeping your password safe and all activity in your account. The service is for people over 18 and organisations."] },
      { title: "Plans and payment", body: [
        "Plans: Trial (free, 14 days, once per account), Starter ($19 per month or $182.40 per year) and Custom ($29 per month or $278.40 per year). Paying yearly saves 20%. What each plan includes is listed on the pricing page and in the cabinet.",
        "Payment is in USDT (TON network) or by bank transfer to the details shown on the checkout page in the cabinet. A USDT payment is confirmed automatically once a transfer of the exact amount appears on the blockchain. After a bank transfer, press “I've paid”; the plan switches on once we find the payment (usually within a business day). We never ask for or store card details.",
        "Payment is prepaid for a month or a year; there are no automatic charges. To continue, pay for the next period; paying before the current one ends extends it. If not renewed, the AI stops answering when the period ends and your data is kept.",
        "A new plan starts on the day the payment is confirmed. On yearly billing the AI reply allowance resets every month. Prices may change — a new price applies to the next payment.",
      ] },
      { title: "Limits", body: ["Each plan includes a monthly AI reply allowance. When it is used up or the subscription ends, the AI stops answering visitors while the request form keeps working."] },
      { title: "AI answers", body: ["AI can make mistakes. Answers are based on your knowledge and your website pages; we do not guarantee their completeness or accuracy, nor any growth in sales or conversion. You are responsible for the information you give the AI and for checking important facts before a deal."] },
      { title: "Your data and your visitors' data", body: ["You keep ownership of your materials and requests. For your visitors' personal data you are the controller and Lemeri AI processes it on your behalf. You must have a lawful basis and a privacy policy on your website. See the Privacy Policy."] },
      { title: "Acceptable use", body: ["You may not use the service for spam, fraud, illegal content or misleading visitors, nor try to bypass limits or disrupt the service. We may suspend accounts that do."] },
      { title: "Availability and changes", body: ["We aim for uninterrupted operation but do not guarantee it. The service evolves; we announce material changes to these terms in advance by email or in the cabinet."] },
      { title: "Liability", body: ["To the extent permitted by law, our liability is limited to the amount you paid in the last 3 months. We are not liable for lost profits or indirect damages."] },
      { title: "Termination", body: ["You can delete your workspace and its data in Settings or ask us to delete the account. We may end the service for breach of these terms, refunding the unused part unless the breach was intentional."] },
    ],
  };
}

export function privacyText(locale: "ru" | "en", c: LegalCompany): Doc {
  return locale === "ru" ? {
    title: "Политика конфиденциальности",
    intro: `Политика описывает, какие данные обрабатывает Lemeri AI (${c.site}), зачем и как вы можете ими управлять. Оператор данных владельцев аккаунтов — ${c.entity}.`,
    sections: [
      { title: "Какие данные мы обрабатываем", body: [[
        "Данные аккаунта: имя, email, название компании, хэш пароля, язык и часовой пояс.",
        "Платёжные данные: имя отправителя перевода, сумма, дата и комментарий — чтобы найти платёж. Данные банковской карты мы не получаем и не храним.",
        "Содержимое: база знаний, тексты страниц вашего сайта, прочитанные ИИ, настройки ИИ-сотрудника и карточки.",
        "Данные посетителей вашего сайта: сообщения в чате, адрес страницы, на которой открыт чат, и контакты, которые посетитель оставил в заявке с согласием.",
        "Технические данные: IP-адрес и браузер — для защиты от злоупотреблений (ограничения частоты запросов) и журналов безопасности.",
      ]] },
      { title: "Зачем", body: [["Предоставлять сервис: ответы ИИ, заявки, кабинет.", "Принимать и подтверждать оплату.", "Защищать сервис от злоупотреблений и сбоев.", "Связываться с вами по поводу аккаунта и важных изменений."]] },
      { title: "Кому передаются данные", body: [[
        "Поставщик ИИ-моделей (OpenAI) — тексты сообщений и фрагменты знаний — только для генерации ответа.",
        "Cloudflare (хостинг), Neon (база данных), Resend (письма).",
      ], "Мы не продаём персональные данные и не используем их для рекламы."] },
      { title: "Данные посетителей ваших сайтов", body: ["Для данных посетителей вы — оператор (контролёр), Lemeri AI — обработчик по вашему поручению. Форма заявки в карточке запрашивает согласие посетителя и сохраняет время и текст согласия. Укажите ссылку на свою политику в настройках ИИ-сотрудника."] },
      { title: "Хранение", body: ["Данные хранятся, пока существует рабочее пространство. Срок хранения диалогов настраивается (по умолчанию 365 дней). Удалённое рабочее пространство удаляется вместе с данными; по запросу удалим и аккаунт. Сведения, которые закон обязывает хранить дольше (например, бухгалтерские), хранятся положенный срок."] },
      { title: "Ваши права", body: ["Вы можете получить, исправить или удалить свои данные и отозвать согласие — в настройках кабинета или написав нам. Посетители сайтов обращаются к владельцу сайта, а мы помогаем ему выполнить запрос."] },
      { title: "Безопасность", body: ["Соединения шифруются (HTTPS), ключи подключений хранятся в зашифрованном виде, доступ к данным разделён по рабочим пространствам."] },
      { title: "Cookies", body: ["Мы используем только необходимые cookies: сессию входа и выбранное рабочее пространство. Карточка на сайтах клиентов хранит в браузере посетителя идентификатор, чтобы продолжить диалог."] },
    ],
  } : {
    title: "Privacy Policy",
    intro: `This policy explains what data Lemeri AI (${c.site}) processes, why, and how you control it. The controller for account holders' data is ${c.entity}.`,
    sections: [
      { title: "Data we process", body: [[
        "Account data: name, email, company name, password hash, language and time zone.",
        "Billing data: the sender's name, amount, date and comment of a transfer — to find the payment. We never receive or store card details.",
        "Content: knowledge base, text of your website pages read by the AI, AI employee and card settings.",
        "Your website visitors' data: chat messages, the address of the page where the chat is open, and contacts a visitor left in a request with consent.",
        "Technical data: IP address and browser — for abuse protection (rate limits) and security logs.",
      ]] },
      { title: "Why", body: [["To provide the service: AI answers, requests, cabinet.", "To take and confirm payments.", "To protect the service from abuse and failures.", "To contact you about your account and important changes."]] },
      { title: "Who receives data", body: [[
        "AI model provider (OpenAI) — message text and knowledge snippets, only to generate answers.",
        "Cloudflare (hosting), Neon (database), Resend (email).",
      ], "We do not sell personal data or use it for advertising."] },
      { title: "Your website visitors' data", body: ["For visitors' data you are the controller and Lemeri AI is your processor. The request form asks for the visitor's consent and stores its time and text. Add a link to your own policy in the AI employee settings."] },
      { title: "Retention", body: ["Data is kept while the workspace exists. Conversation retention is configurable (365 days by default). A deleted workspace is removed with its data; on request we also delete the account. Records the law requires us to keep (e.g. accounting) are kept for the required period."] },
      { title: "Your rights", body: ["You can access, correct or delete your data or withdraw consent — in the cabinet settings or by writing to us. Website visitors contact the website owner, and we help the owner fulfil the request."] },
      { title: "Security", body: ["Connections are encrypted (HTTPS), integration keys are stored encrypted, and data is separated by workspace."] },
      { title: "Cookies", body: ["We only use necessary cookies: the sign-in session and the selected workspace. The card on customers' sites keeps a visitor id in the browser to continue the conversation."] },
    ],
  };
}

export function refundText(locale: "ru" | "en", c: LegalCompany): Doc {
  return locale === "ru" ? {
    title: "Правила возврата",
    intro: `Мы хотим, чтобы Lemeri AI приносил пользу. Если сервис вам не подошёл, деньги можно вернуть.`,
    sections: [
      { title: "Бесплатный период", body: ["Перед оплатой доступен Trial на 14 дней — попробуйте ИИ-продавца на своём сайте без оплаты."] },
      { title: "14 дней на возврат", body: ["Вы можете запросить полный возврат в течение 14 дней с даты любого платежа (первого или продления). Причину указывать не обязательно."] },
      { title: "После 14 дней", body: ["Платежи старше 14 дней не возвращаются. Автоматических списаний нет: если не оплачивать следующий период, тариф просто закончится в конце оплаченного."] },
      { title: "Как запросить возврат", body: [c.email ? `Напишите нам на ${c.email}, указав email аккаунта, дату и сумму перевода и код платежа.` : "Напишите нам через поддержку в кабинете, указав email аккаунта, дату и сумму перевода и код платежа.", "Деньги возвращаются тем же способом: переводом на те же реквизиты или в USDT на указанный вами адрес TRC-20, обычно за 5 рабочих дней."] },
      { title: "Смена тарифа", body: ["Если вы оплатили другой тариф, а текущий ещё действует, напишите нам — пересчитаем неиспользованную часть."] },
    ],
  } : {
    title: "Refund Policy",
    intro: `We want Lemeri AI to be useful. If it is not right for you, you can get your money back.`,
    sections: [
      { title: "Free trial", body: ["A 14-day Trial is available before paying — try the AI seller on your website for free."] },
      { title: "14 days to request a refund", body: ["You can request a full refund within 14 days of any payment (first or renewal). No reason is required."] },
      { title: "After 14 days", body: ["Payments older than 14 days are not refunded. There are no automatic charges: if you don't pay for the next period, the plan simply ends with the paid one."] },
      { title: "How to request", body: [c.email ? `Email us at ${c.email} with your account email, the transfer date and amount, and the payment code.` : "Write to us via support in the cabinet with your account email, the transfer date and amount, and the payment code.", "Money is returned the same way: by transfer to the account it came from, or in USDT to a TRC-20 address you give us, usually within 5 business days."] },
      { title: "Plan changes", body: ["If you paid for a different plan while the current one is still active, write to us and we will credit the unused part."] },
    ],
  };
}
