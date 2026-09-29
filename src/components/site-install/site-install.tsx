"use client";

// Website chat: look builder, no-code install (plugins / services / guides),
// install check and a hosted chat link with QR. Loaded client-only.

import { useCallback, useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Check, Copy, Download, ExternalLink, Mail, RefreshCw, Sparkles } from "lucide-react";

type Look = { accent?: string; title?: string; status?: string; greeting?: string; help?: string; suggestions?: string[]; position?: "right" | "left"; theme?: "auto" | "light" | "dark"; autoOpenSeconds?: number; hostedLink?: boolean };
type State = { widget: Look; allowedOrigins: string[]; seen: { origin: string; lastSeenAt: string }[] };
type Props = { locale: string; channelId: string; employeeId: string; employeeName: string; origin: string; notify: (message: string) => void };

const ACCENTS = ["#6254e8", "#2563eb", "#0ea5e9", "#10b981", "#16a34a", "#f59e0b", "#ef4444", "#ec4899", "#111827"];

const dict = {
  ru: {
    tabs: { look: "Внешний вид", install: "Установка на сайт", link: "Ссылка и QR" },
    color: "Цвет", title: "Название в чате", titlePh: "Например, Анна — консультант", status: "Подпись", greeting: "Приветствие", help: "Текст под приветствием",
    suggestions: "Быстрые вопросы", suggestionsHint: "По одному в строке, до 4", position: "Кнопка на сайте", right: "Справа", left: "Слева",
    theme: "Тема", auto: "Как у посетителя", light: "Светлая", dark: "Тёмная", autoOpen: "Открыть чат автоматически", never: "Не открывать", after: (n: number) => `Через ${n} с`,
    save: "Сохранить", saved: "Сохранено — изменения уже на сайте, код менять не нужно", saveFailed: "Не удалось сохранить", preview: "Так чат увидят посетители", defaults: { hello: "Здравствуйте!", help: "Чем я могу помочь?", status: "AI-сотрудник · обычно отвечает сразу", suggestions: ["Сколько стоят услуги?", "Хочу записаться", "Связаться с менеджером"], input: "Напишите сообщение…" },
    whereTitle: "Где сделан ваш сайт?", whereCopy: "Выберите конструктор — покажем, как подключить чат. Там, где написано «Без кода», вставлять ничего не нужно.",
    noCode: "Без кода", minute: "1 минута", code: "Ваш код", copy: "Копировать", copied: "Скопировано",
    dev: "Отправить инструкцию разработчику", devSubject: "Установка чата Lemiri AI на сайт",
    check: "Проверка установки", checkCopy: "Откройте свой сайт в браузере — через минуту здесь появится отметка.", found: "Виджет работает на", notFound: "Пока не видим виджет на сайтах", recheck: "Проверить",
    sites: "Разрешённые сайты", sitesCopy: "Если список пуст, чат работает на любом сайте. Добавьте адреса, чтобы код нельзя было использовать на чужих сайтах.", addSite: "Добавить", saveSites: "Сохранить список",
    linkTitle: "Чат без сайта", linkCopy: "Отправляйте ссылку в соцсетях, мессенджерах, в шапке профиля или печатайте QR на визитках и в зале.", open: "Открыть", downloadQr: "Скачать QR", linkOn: "Ссылка включена", linkOff: "Ссылка выключена — страница не откроется",
    api: "Для разработчиков", apiCopy: "Атрибуты тега перекрывают настройки кабинета: data-theme, data-accent, data-position, data-open. Управление из JS: LemiriWidget.open(), .close(), .toggle().",
    ago: (m: number) => m < 1 ? "только что" : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`,
  },
  en: {
    tabs: { look: "Appearance", install: "Install on website", link: "Link & QR" },
    color: "Color", title: "Chat title", titlePh: "e.g. Anna — consultant", status: "Subtitle", greeting: "Greeting", help: "Text under greeting",
    suggestions: "Quick questions", suggestionsHint: "One per line, up to 4", position: "Button position", right: "Right", left: "Left",
    theme: "Theme", auto: "Visitor's system", light: "Light", dark: "Dark", autoOpen: "Open chat automatically", never: "Never", after: (n: number) => `After ${n}s`,
    save: "Save", saved: "Saved — changes are live, no need to touch the code", saveFailed: "Could not save", preview: "What visitors will see", defaults: { hello: "Hello!", help: "How can I help?", status: "AI employee · usually replies immediately", suggestions: ["What are your prices?", "I want to book", "Talk to a manager"], input: "Type a message…" },
    whereTitle: "Where is your website built?", whereCopy: "Pick your builder and we'll show how to add the chat. “No code” options need nothing pasted.",
    noCode: "No code", minute: "1 minute", code: "Your code", copy: "Copy", copied: "Copied",
    dev: "Send instructions to a developer", devSubject: "Installing the Lemiri AI chat",
    check: "Install check", checkCopy: "Open your website in a browser — a checkmark appears here within a minute.", found: "Widget is live on", notFound: "We haven't seen the widget on any site yet", recheck: "Check",
    sites: "Allowed websites", sitesCopy: "Empty list means the chat works on any site. Add addresses so nobody can reuse your code elsewhere.", addSite: "Add", saveSites: "Save list",
    linkTitle: "Chat without a website", linkCopy: "Share the link in social profiles and messengers, or print the QR code on cards and in your store.", open: "Open", downloadQr: "Download QR", linkOn: "Link enabled", linkOff: "Link disabled — the page won't open",
    api: "For developers", apiCopy: "Tag attributes override cabinet settings: data-theme, data-accent, data-position, data-open. JS control: LemiriWidget.open(), .close(), .toggle().",
    ago: (m: number) => m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`,
  },
};

type Platform = { id: string; name: string; noCode?: boolean; steps: { ru: string[]; en: string[] }; action?: "wordpress" | "gtm" };
const PLATFORMS: Platform[] = [
  { id: "wordpress", name: "WordPress", noCode: true, action: "wordpress", steps: {
    ru: ["Скачайте плагин Lemiri AI (кнопка ниже).", "В админке WordPress: Плагины → Добавить новый → Загрузить плагин → выберите файл → Установить → Активировать.", "Откройте Настройки → Lemiri AI и нажмите «Подключить к Lemiri».", "Войдите в Lemiri и выберите сотрудника — чат появится на всех страницах сам."],
    en: ["Download the Lemiri AI plugin (button below).", "In WordPress admin: Plugins → Add New → Upload Plugin → choose the file → Install → Activate.", "Open Settings → Lemiri AI and press “Connect to Lemiri”.", "Sign in to Lemiri and pick the employee — the chat appears on every page automatically."] } },
  { id: "gtm", name: "Google Tag Manager", noCode: true, action: "gtm", steps: {
    ru: ["Скачайте готовый контейнер (кнопка ниже).", "В Google Tag Manager: Администрирование → Импорт контейнера → выберите файл.", "Рабочая область — текущая, вариант — «Объединить» → Подтвердить.", "Нажмите «Отправить» → «Опубликовать». Чат появится на всех страницах, где стоит GTM."],
    en: ["Download the ready-made container (button below).", "In Google Tag Manager: Admin → Import Container → choose the file.", "Workspace: existing, option: Merge → Confirm.", "Press Submit → Publish. The chat appears on every page that has GTM."] } },
  { id: "tilda", name: "Tilda", steps: {
    ru: ["Скопируйте код выше.", "Tilda: Настройки сайта → Ещё → «HTML-код для вставки внутрь HEAD» → Редактировать.", "Вставьте код и сохраните.", "Нажмите «Опубликовать все страницы»."],
    en: ["Copy the code above.", "Tilda: Site Settings → More → “HTML code for the HEAD section” → Edit.", "Paste the code and save.", "Press “Publish all pages”."] } },
  { id: "wix", name: "Wix", steps: {
    ru: ["Скопируйте код выше.", "Wix: Настройки сайта → Расширенные → Пользовательский код → «+ Добавить код».", "Вставьте код, выберите «Все страницы» и место «Body — конец».", "Нажмите «Применить» (нужен премиум-тариф и подключённый домен)."],
    en: ["Copy the code above.", "Wix: Settings → Advanced → Custom Code → “+ Add Custom Code”.", "Paste the code, choose “All pages” and place it in “Body — end”.", "Press Apply (requires a Premium plan and a connected domain)."] } },
  { id: "shopify", name: "Shopify", steps: {
    ru: ["Скопируйте код выше.", "Shopify: Интернет-магазин → Темы → «…» → Изменить код.", "Откройте layout/theme.liquid и вставьте код прямо перед </body>.", "Сохраните."],
    en: ["Copy the code above.", "Shopify: Online Store → Themes → “…” → Edit code.", "Open layout/theme.liquid and paste the code right before </body>.", "Save."] } },
  { id: "webflow", name: "Webflow", steps: {
    ru: ["Скопируйте код выше.", "Webflow: Site settings → Custom code → Footer code.", "Вставьте код и сохраните.", "Опубликуйте сайт (Publish)."],
    en: ["Copy the code above.", "Webflow: Site settings → Custom code → Footer code.", "Paste the code and save.", "Publish the site."] } },
  { id: "bitrix", name: "1С-Битрикс / Битрикс24", steps: {
    ru: ["Скопируйте код выше.", "Битрикс24.Сайты: Настройки сайта → «Добавить HTML-код» (в HEAD или перед </body>) → вставьте → Сохранить → Опубликовать.", "1С-Битрикс: Рабочий стол → Сайты → Шаблоны сайтов → ваш шаблон → вставьте код перед </body> → Сохранить.", "Сбросьте кеш, если чат не появился сразу."],
    en: ["Copy the code above.", "Bitrix24 Sites: Site settings → “Add HTML code” (HEAD or before </body>) → paste → Save → Publish.", "1C-Bitrix: Desktop → Sites → Site templates → your template → paste before </body> → Save.", "Clear the cache if the chat doesn't show up right away."] } },
  { id: "insales", name: "InSales", steps: {
    ru: ["Скопируйте код выше.", "InSales: Сайт → Счётчики и коды → Добавить код (или Шаблоны → Редактор кода → layout перед </body>).", "Вставьте код и сохраните.", "Откройте магазин и проверьте кнопку чата."],
    en: ["Copy the code above.", "InSales: Site → Counters & codes → Add code (or Templates → Code editor → layout before </body>).", "Paste the code and save.", "Open the store and check the chat button."] } },
  { id: "html", name: "HTML / другой", steps: {
    ru: ["Скопируйте код выше.", "Вставьте его на все страницы сайта перед закрывающим тегом </body> (обычно это общий шаблон или «футер»).", "Сохраните и обновите сайт.", "Не уверены? Отправьте инструкцию разработчику — кнопка ниже."],
    en: ["Copy the code above.", "Paste it on every page before the closing </body> tag (usually a shared template or footer).", "Save and redeploy the site.", "Not sure? Send the instructions to your developer — button below."] } },
];

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function gtmContainer(code: string) {
  const ids = { accountId: "0", containerId: "0" };
  return JSON.stringify({ exportFormatVersion: 2, exportTime: new Date().toISOString().replace("T", " ").slice(0, 19), containerVersion: { path: "accounts/0/containers/0/versions/0", ...ids, containerVersionId: "0", container: { path: "accounts/0/containers/0", ...ids, name: "Lemiri AI", publicId: "GTM-LEMIRI", usageContext: ["WEB"] }, tag: [{ ...ids, tagId: "1", name: "Lemiri AI — чат", type: "html", parameter: [{ type: "TEMPLATE", key: "html", value: code }, { type: "BOOLEAN", key: "supportDocumentWrite", value: "false" }], firingTriggerId: ["2147479553"], tagFiringOption: "ONCE_PER_EVENT" }] } }, null, 2);
}

export default function SiteInstall({ locale, channelId, employeeId, employeeName, origin, notify }: Props) {
  const l = locale === "en" ? dict.en : dict.ru;
  const lang = locale === "en" ? "en" : "ru";
  const [tab, setTab] = useState<"look" | "install" | "link">("install");
  const [state, setState] = useState<State>();
  const [look, setLook] = useState<Look>({});
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState("wordpress");
  const [sites, setSites] = useState<string[]>([]);
  const [siteDraft, setSiteDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setChecking(true);
    try { const response = await fetch(`/api/channels/${channelId}`, { cache: "no-store" }); if (response.ok) { const body = await response.json() as State; setState(body); setLook(body.widget ?? {}); setSites(body.allowedOrigins ?? []); } } finally { setChecking(false); }
  }, [channelId]);
  useEffect(() => { void load(); }, [load]);

  const code = `<script src="${origin}/api/widget/${employeeId}/embed.js" async></script>`;
  const hostedUrl = `${origin}/widget/${employeeId}`;
  const copy = async (value: string, key: string) => { try { await navigator.clipboard.writeText(value); setCopied(key); notify(l.copied); window.setTimeout(() => setCopied(""), 1600); } catch { notify(value); } };

  const patch = async (body: Partial<{ widget: Look; allowedOrigins: string[] }>, ok: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      const next = await response.json() as State; setState(next); setLook(next.widget ?? {}); setSites(next.allowedOrigins ?? []); notify(ok);
    } catch { notify(l.saveFailed); } finally { setSaving(false); }
  };

  const qrSvg = useMemo(() => { const qr = qrcode(0, "M"); qr.addData(hostedUrl); qr.make(); return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }, [hostedUrl]);
  const downloadQr = () => {
    const qr = qrcode(0, "M"); qr.addData(hostedUrl); qr.make();
    const count = qr.getModuleCount(), cell = 16, margin = 4, size = (count + margin * 2) * cell;
    const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size; const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size); ctx.fillStyle = "#000";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    canvas.toBlob(blob => { if (blob) download("lemiri-chat-qr.png", blob, "image/png"); });
  };

  const accent = look.accent || "#6254e8";
  const suggestions = look.suggestions?.length ? look.suggestions : l.defaults.suggestions;
  const previewDark = look.theme === "dark";
  const selected = PLATFORMS.find(p => p.id === platform) ?? PLATFORMS[0]!;
  const mail = `mailto:?subject=${encodeURIComponent(l.devSubject)}&body=${encodeURIComponent(`${lang === "ru" ? "Привет! Нужно добавить чат Lemiri AI на все страницы сайта перед </body>:" : "Hi! Please add the Lemiri AI chat to every page before </body>:"}\n\n${code}\n\n${lang === "ru" ? "Больше ничего делать не нужно — внешний вид настраивается в кабинете Lemiri." : "Nothing else is needed — the look is managed in the Lemiri cabinet."}`)}`;
  const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

  return <section className="siteInstall">
    <div className="siTabs" role="tablist">
      {(["install", "look", "link"] as const).map(key => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{l.tabs[key]}</button>)}
    </div>

    {tab === "look" && <div className="siLook">
      <form className="siForm" onSubmit={event => { event.preventDefault(); void patch({ widget: look }, l.saved); }}>
        <fieldset><legend>{l.color}</legend><div className="siSwatches">{ACCENTS.map(color => <button key={color} type="button" aria-label={color} className={accent === color ? "on" : ""} style={{ background: color }} onClick={() => setLook({ ...look, accent: color })} />)}<label className="siCustomColor"><input type="color" value={accent} onChange={event => setLook({ ...look, accent: event.target.value })} aria-label={l.color} /></label></div></fieldset>
        <label>{l.title}<input value={look.title ?? ""} maxLength={60} placeholder={employeeName || l.titlePh} onChange={event => setLook({ ...look, title: event.target.value })} /></label>
        <label>{l.status}<input value={look.status ?? ""} maxLength={80} placeholder={l.defaults.status} onChange={event => setLook({ ...look, status: event.target.value })} /></label>
        <div className="siRow">
          <label>{l.greeting}<input value={look.greeting ?? ""} maxLength={80} placeholder={l.defaults.hello} onChange={event => setLook({ ...look, greeting: event.target.value })} /></label>
          <label>{l.help}<input value={look.help ?? ""} maxLength={200} placeholder={l.defaults.help} onChange={event => setLook({ ...look, help: event.target.value })} /></label>
        </div>
        <label>{l.suggestions} <small>{l.suggestionsHint}</small><textarea rows={3} value={(look.suggestions ?? []).join("\n")} placeholder={l.defaults.suggestions.join("\n")} onChange={event => setLook({ ...look, suggestions: event.target.value.split("\n").slice(0, 4) })} /></label>
        <div className="siRow">
          <fieldset><legend>{l.position}</legend><div className="siSeg">{(["right", "left"] as const).map(value => <button key={value} type="button" className={(look.position ?? "right") === value ? "on" : ""} onClick={() => setLook({ ...look, position: value })}>{l[value]}</button>)}</div></fieldset>
          <fieldset><legend>{l.theme}</legend><div className="siSeg">{(["auto", "light", "dark"] as const).map(value => <button key={value} type="button" className={(look.theme ?? "auto") === value ? "on" : ""} onClick={() => setLook({ ...look, theme: value })}>{l[value]}</button>)}</div></fieldset>
        </div>
        <fieldset><legend>{l.autoOpen}</legend><div className="siSeg">{[0, 5, 15, 30].map(value => <button key={value} type="button" className={(look.autoOpenSeconds ?? 0) === value ? "on" : ""} onClick={() => setLook({ ...look, autoOpenSeconds: value })}>{value ? l.after(value) : l.never}</button>)}</div></fieldset>
        <button className="primary" disabled={saving}>{l.save}</button>
      </form>
      <div className={`siPreview ${previewDark ? "dark" : ""}`} aria-label={l.preview}>
        <small>{l.preview}</small>
        <div className="siStage" style={{ ["--si-accent" as string]: accent }} data-position={look.position ?? "right"}>
          <div className="siCard">
            <header><span className="siAvatar">{(look.title || employeeName || "A").trim()[0]?.toUpperCase()}</span><div><b>{look.title || employeeName}</b><small>{look.status || l.defaults.status}</small></div></header>
            <div className="siBody"><span className="siGlyph"><Sparkles size={18} /></span><h4>{look.greeting || l.defaults.hello}</h4><p>{look.help || l.defaults.help}</p><div className="siChips">{suggestions.filter(Boolean).map(item => <span key={item}>{item}</span>)}</div></div>
            <footer><span>{l.defaults.input}</span><i /></footer>
          </div>
          <span className="siLauncher" />
        </div>
      </div>
    </div>}

    {tab === "install" && <div className="siInstall">
      <div className="siCode"><div><b>{l.code}</b><code>{code}</code></div><button type="button" onClick={() => copy(code, "code")}>{copied === "code" ? <Check size={15} /> : <Copy size={15} />}{l.copy}</button></div>
      <h3>{l.whereTitle}</h3><p className="siMuted">{l.whereCopy}</p>
      <div className="siPlatforms">{PLATFORMS.map(item => <button key={item.id} type="button" className={platform === item.id ? "on" : ""} onClick={() => setPlatform(item.id)}><b>{item.name}</b>{item.noCode && <em>{l.noCode}</em>}</button>)}</div>
      <div className="siGuide">
        <ol>{selected.steps[lang].map((step, index) => <li key={index}>{step}</li>)}</ol>
        <div className="siGuideActions">
          {selected.action === "wordpress" && <a className="primary siBtn" href="/downloads/lemiri-ai-wordpress.zip" download><Download size={15} />{lang === "ru" ? "Скачать плагин для WordPress" : "Download the WordPress plugin"}</a>}
          {selected.action === "gtm" && <button type="button" className="primary siBtn" onClick={() => download("lemiri-ai-gtm-container.json", gtmContainer(code), "application/json")}><Download size={15} />{lang === "ru" ? "Скачать контейнер GTM" : "Download GTM container"}</button>}
          {!selected.action && <button type="button" className="primary siBtn" onClick={() => copy(code, "code")}><Copy size={15} />{l.copy}</button>}
          <a className="siBtn" href={mail}><Mail size={15} />{l.dev}</a>
        </div>
      </div>

      <div className="siCheck">
        <div className="siCheckHead"><div><b>{l.check}</b><small>{l.checkCopy}</small></div><button type="button" onClick={() => void load()} disabled={checking}><RefreshCw size={14} className={checking ? "spin" : ""} />{l.recheck}</button></div>
        {state?.seen.length ? <ul>{state.seen.map(item => <li key={item.origin}><span className="siOk"><Check size={13} /></span>{l.found} <a href={item.origin} target="_blank" rel="noreferrer">{item.origin.replace(/^https?:\/\//, "")}</a><time>{l.ago(minutesAgo(item.lastSeenAt))}</time></li>)}</ul> : <p className="siMuted">{l.notFound}</p>}
      </div>

      <div className="siSites">
        <b>{l.sites}</b><small>{l.sitesCopy}</small>
        <div className="siTags">{sites.map(site => <span key={site}>{site.replace(/^https?:\/\//, "")}<button type="button" aria-label="×" onClick={() => setSites(sites.filter(item => item !== site))}>×</button></span>)}</div>
        <form className="siAdd" onSubmit={event => { event.preventDefault(); const raw = siteDraft.trim(); if (!raw) return; try { const url = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`); if (!sites.includes(url.origin)) setSites([...sites, url.origin]); setSiteDraft(""); } catch { notify(l.saveFailed); } }}>
          <input value={siteDraft} onChange={event => setSiteDraft(event.target.value)} placeholder="example.com" aria-label={l.sites} /><button type="submit">{l.addSite}</button>
          <button type="button" className="primary" disabled={saving || JSON.stringify(sites) === JSON.stringify(state?.allowedOrigins ?? [])} onClick={() => void patch({ allowedOrigins: sites }, l.saved)}>{l.saveSites}</button>
        </form>
      </div>
      <details className="siApi"><summary>{l.api}</summary><p>{l.apiCopy}</p><code>{`<script src="${origin}/api/widget/${employeeId}/embed.js" data-theme="dark" data-accent="#10b981" data-position="left" async></script>`}</code></details>
    </div>}

    {tab === "link" && <div className="siLink">
      <div className="siQr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div>
        <h3>{l.linkTitle}</h3><p className="siMuted">{l.linkCopy}</p>
        <div className="siCode"><div><code>{hostedUrl}</code></div><button type="button" onClick={() => copy(hostedUrl, "link")}>{copied === "link" ? <Check size={15} /> : <Copy size={15} />}{l.copy}</button></div>
        <div className="siGuideActions">
          <a className="siBtn" href={hostedUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />{l.open}</a>
          <button type="button" className="siBtn" onClick={downloadQr}><Download size={15} />{l.downloadQr}</button>
        </div>
        <label className="siToggle"><input type="checkbox" checked={look.hostedLink !== false} disabled={saving} onChange={event => { const next = { ...look, hostedLink: event.target.checked }; setLook(next); void patch({ widget: next }, l.saved); }} /><span>{look.hostedLink !== false ? l.linkOn : l.linkOff}</span></label>
      </div>
    </div>}
  </section>;
}
