"use client";

import { ChangeEvent, CSSProperties, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, Gem, Megaphone, MessageSquareText, Monitor, Moon, Palette, Plus, RotateCcw, Save, Smartphone, Sun, Trash2, Type, Upload, Wand2 } from "lucide-react";
import type { DesignTier } from "@/lib/billing/plans";
import { DEFAULT_DESIGN, FONTS, normalizeDesign, READY_STYLES, resolveLook, shellConfig, type Colors, type Design, type DesignPreset, type StoredLook } from "@/lib/widget/design";
import { WebsiteWidget } from "../website-widget";
import { LemiriGlyph } from "../logo";
import { Field, PlanLock, Section, Segmented, Toggle } from "./ui";

const SiteInstall = dynamic(() => import("../site-install/site-install"), { ssr: false, loading: () => <p className="sxMuted">…</p> });

// «Карточка и подключение»: look of the website card (by plan), install code and
// install check, hosted link. Saves into the WEBSITE channel config; the embed code
// on the customer's site never changes.

type Channel = { id: string; employeeId?: string | null; status: string };
type State = { widget: StoredLook; allowedOrigins: string[]; seen: Array<{ origin: string; lastSeenAt: string }>; tier: DesignTier; plan: string; planState: string };

const T = {
  ru: {
    tabs: { design: "Дизайн карточки", install: "Установка и проверка", link: "Ссылка и QR" },
    create: "Создать карточку для сайта", createCopy: "Карточка — это окно чата с вашим ИИ-продавцом поверх сайта. Создайте её, настройте вид и вставьте код на сайт.", creating: "Создаём…", createFailed: "Не удалось создать карточку",
    loading: "Загружаем карточку…", loadFailed: "Не удалось загрузить настройки карточки", retry: "Повторить",
    save: "Сохранить", saving: "Сохраняем…", saved: "Сохранено — изменения уже на сайте, код менять не нужно", saveFailed: "Не удалось сохранить", planRequired: "Расширенный редактор доступен в тарифе Custom",
    basics: "Основное", basicsCopy: "Доступно во всех тарифах.",
    title: "Имя в карточке", greeting: "Приветствие", help: "Текст под приветствием", accent: "Основной цвет", position: "Сторона экрана", right: "Справа", left: "Слева",
    theme: "Тема", themes: { auto: "Как у посетителя", light: "Светлая", dark: "Тёмная" }, leadForm: "Кнопка «Оставить заявку»", leadFormHint: "Форма с согласием на передачу контактов",
    standard: "Стандартная кастомизация", standardCopy: "Аватар, подпись, быстрые вопросы и готовые варианты оформления.",
    avatar: "Аватар", upload: "Загрузить", avatarUrl: "или ссылка https://", removeAvatar: "Убрать", avatarTooBig: "Не удалось обработать картинку",
    status: "Подпись под именем", suggestions: "Быстрые вопросы", suggestionsHint: "По одному в строке, до 4", autoOpen: "Открыть автоматически", never: "Не открывать", after: (n: number) => `Через ${n} с`,
    styles: "Готовые варианты", custom: "Расширенный редактор", customCopy: "Полная настройка карточки без программирования.",
    colors: "Цвета", lightPalette: "Светлая тема", darkPalette: "Тёмная тема",
    colorNames: { accent: "Акцент", accentText: "Текст на акценте", background: "Фон", surface: "Поверхность", text: "Текст", muted: "Второстепенный текст", border: "Рамки", userBubble: "Пузырь клиента", userText: "Текст клиента", botBubble: "Пузырь ИИ", botText: "Текст ИИ", headerBg: "Фон заголовка", headerText: "Текст заголовка", button: "Кнопки", buttonText: "Текст кнопок", launcherBg: "Кнопка открытия", launcherIcon: "Иконка кнопки" },
    typography: "Шрифт", font: "Шрифт", fontSize: "Размер текста", sizeShape: "Размер и форма", width: "Ширина", height: "Высота", radius: "Скругление карточки", bubbleRadius: "Скругление сообщений", buttonRadius: "Скругление кнопок", border: "Рамка", shadow: "Тень", shadows: { none: "Без тени", soft: "Мягкая", medium: "Средняя", strong: "Сильная" }, opacity: "Непрозрачность фона",
    background: "Фон", bgTypes: { solid: "Сплошной", gradient: "Градиент" }, from: "Цвет 1", to: "Цвет 2", angle: "Угол",
    bubbles: "Сообщения", bubbleStyles: { tail: "С хвостиком", rounded: "Скруглённые", square: "Строгие" },
    header: "Заголовок", headerStyles: { gradient: "Градиент", solid: "Сплошной", accent: "Цветной", minimal: "Минимальный", glass: "Стекло" },
    premium: "Премиум-эффекты", glass: "Матовое стекло", glassHint: "Карточка полупрозрачная, сайт за ней мягко размыт", blur: "Размытие", glow: "Свечение", glowHint: "Мягкий ореол цвета акцента вокруг карточки",
    pattern: "Текстура фона", patterns: { none: "Без текстуры", dots: "Точки", grid: "Сетка", diagonal: "Штрих", aurora: "Аврора", noise: "Зерно" }, patternOpacity: "Интенсивность",
    gradient: "Градиент акцента", gradientHint: "Кнопки, сообщения клиента и кнопка чата — переливом", gradientTo: "Второй цвет",
    headingFont: "Шрифт заголовков", sameFont: "Как основной",
    messageStyle: "Анимация сообщений", messageAnims: { rise: "Всплытие", pop: "Пружина", fade: "Проявление", none: "Без анимации" }, typing: "Индикатор «печатает»", typings: { dots: "Точки", wave: "Волна", pulse: "Пульс" }, msgAvatar: "Аватар рядом с ответами", msgShadow: "Тени у сообщений",
    composer: "Поле ввода", composerStyles: { outlined: "Контур", filled: "Заливка", pill: "Капсула" }, sendIcon: "Иконка отправки", sendIcons: { arrow: "Стрелка", send: "Самолётик", sparkle: "Искра" }, placeholder: "Подсказка в поле", placeholderHint: "Например: «Спросите о товаре…»",
    attention: "Привлечение внимания", pulse: "Пульсация кнопки", pulseHint: "Мягкая волна вокруг кнопки чата, пока чат закрыт", teaser: "Проактивное сообщение", teaserHint: "Всплывает рядом с кнопкой, один раз за визит. Например: «Подсказать с выбором?»", teaserDelay: "Показать через", showAvatar: "Показывать аватар", showStatus: "Показывать подпись", avatarShape: "Форма аватара", shapes: { circle: "Круг", rounded: "Скругление", square: "Квадрат" },
    launcher: "Кнопка открытия чата", icon: "Иконка", icons: { chat: "Чат", sparkles: "Искры", message: "Сообщение", help: "Вопрос", avatar: "Аватар" }, launcherSize: "Размер", launcherShape: "Форма кнопки", label: "Подсказка рядом", labelHint: "Например: «Помочь с выбором?»",
    welcome: "Приветственный экран", layouts: { bubble: "Сообщение", hero: "Крупно по центру" }, welcomeTitle: "Заголовок", welcomeText: "Текст", showSuggestions: "Показывать быстрые вопросы",
    animation: "Анимация", animations: { scale: "Увеличение", slide: "Выезд", fade: "Появление", none: "Без анимации" }, duration: "Длительность",
    mobile: "Мобильные устройства", showOnMobile: "Показывать на телефонах", mobileLauncherSize: "Размер кнопки на телефоне", mobilePosition: "Сторона на телефоне",
    presets: "Мои стили", presetName: "Название стиля", savePreset: "Сохранить как стиль", apply: "Применить", noPresets: "Сохраните текущий дизайн, чтобы вернуться к нему позже.", reset: "Сбросить дизайн",
    preview: "Предпросмотр", previewCopy: "Так карточку увидят посетители при вашем тарифе", desktop: "Компьютер", phone: "Телефон",
    planNote: (plan: string) => `Текущий тариф: ${plan}`,
  },
  en: {
    tabs: { design: "Card design", install: "Install & check", link: "Link & QR" },
    create: "Create the website card", createCopy: "The card is the chat window with your AI seller on top of your site. Create it, style it and paste the code.", creating: "Creating…", createFailed: "Couldn't create the card",
    loading: "Loading the card…", loadFailed: "Couldn't load card settings", retry: "Retry",
    save: "Save", saving: "Saving…", saved: "Saved — changes are live, the code stays the same", saveFailed: "Couldn't save", planRequired: "The advanced editor is on the Custom plan",
    basics: "Basics", basicsCopy: "Available on every plan.",
    title: "Name on the card", greeting: "Greeting", help: "Text under greeting", accent: "Main colour", position: "Screen side", right: "Right", left: "Left",
    theme: "Theme", themes: { auto: "Visitor's system", light: "Light", dark: "Dark" }, leadForm: "“Leave a request” button", leadFormHint: "Form with consent to share contacts",
    standard: "Standard customisation", standardCopy: "Avatar, subtitle, quick questions and ready-made styles.",
    avatar: "Avatar", upload: "Upload", avatarUrl: "or an https:// link", removeAvatar: "Remove", avatarTooBig: "Couldn't process the image",
    status: "Subtitle", suggestions: "Quick questions", suggestionsHint: "One per line, up to 4", autoOpen: "Open automatically", never: "Never", after: (n: number) => `After ${n}s`,
    styles: "Ready-made styles", custom: "Advanced editor", customCopy: "Full card design without code.",
    colors: "Colours", lightPalette: "Light theme", darkPalette: "Dark theme",
    colorNames: { accent: "Accent", accentText: "Text on accent", background: "Background", surface: "Surface", text: "Text", muted: "Secondary text", border: "Borders", userBubble: "Visitor bubble", userText: "Visitor text", botBubble: "AI bubble", botText: "AI text", headerBg: "Header background", headerText: "Header text", button: "Buttons", buttonText: "Button text", launcherBg: "Launcher", launcherIcon: "Launcher icon" },
    typography: "Font", font: "Font", fontSize: "Text size", sizeShape: "Size and shape", width: "Width", height: "Height", radius: "Card radius", bubbleRadius: "Message radius", buttonRadius: "Button radius", border: "Border", shadow: "Shadow", shadows: { none: "None", soft: "Soft", medium: "Medium", strong: "Strong" }, opacity: "Background opacity",
    background: "Background", bgTypes: { solid: "Solid", gradient: "Gradient" }, from: "Colour 1", to: "Colour 2", angle: "Angle",
    bubbles: "Messages", bubbleStyles: { tail: "With tail", rounded: "Rounded", square: "Strict" },
    header: "Header", headerStyles: { gradient: "Gradient", solid: "Solid", accent: "Coloured", minimal: "Minimal", glass: "Glass" },
    premium: "Premium effects", glass: "Frosted glass", glassHint: "Translucent card with the site softly blurred behind it", blur: "Blur", glow: "Glow", glowHint: "Soft accent-coloured halo around the card",
    pattern: "Background texture", patterns: { none: "None", dots: "Dots", grid: "Grid", diagonal: "Lines", aurora: "Aurora", noise: "Grain" }, patternOpacity: "Intensity",
    gradient: "Accent gradient", gradientHint: "Buttons, visitor messages and the chat button as a gradient", gradientTo: "Second colour",
    headingFont: "Heading font", sameFont: "Same as body",
    messageStyle: "Message animation", messageAnims: { rise: "Rise", pop: "Spring", fade: "Fade", none: "None" }, typing: "Typing indicator", typings: { dots: "Dots", wave: "Wave", pulse: "Pulse" }, msgAvatar: "Avatar next to replies", msgShadow: "Message shadows",
    composer: "Message field", composerStyles: { outlined: "Outlined", filled: "Filled", pill: "Pill" }, sendIcon: "Send icon", sendIcons: { arrow: "Arrow", send: "Plane", sparkle: "Sparkle" }, placeholder: "Field hint", placeholderHint: "e.g. “Ask about a product…”",
    attention: "Attention", pulse: "Pulsing button", pulseHint: "A soft wave around the chat button while the chat is closed", teaser: "Proactive message", teaserHint: "Pops up next to the button once per visit, e.g. “Need help choosing?”", teaserDelay: "Show after", showAvatar: "Show avatar", showStatus: "Show subtitle", avatarShape: "Avatar shape", shapes: { circle: "Circle", rounded: "Rounded", square: "Square" },
    launcher: "Chat button", icon: "Icon", icons: { chat: "Chat", sparkles: "Sparkles", message: "Message", help: "Question", avatar: "Avatar" }, launcherSize: "Size", launcherShape: "Button shape", label: "Hint next to it", labelHint: "e.g. “Need help choosing?”",
    welcome: "Welcome screen", layouts: { bubble: "As a message", hero: "Large, centred" }, welcomeTitle: "Title", welcomeText: "Text", showSuggestions: "Show quick questions",
    animation: "Animation", animations: { scale: "Scale", slide: "Slide", fade: "Fade", none: "None" }, duration: "Duration",
    mobile: "Mobile devices", showOnMobile: "Show on phones", mobileLauncherSize: "Button size on phones", mobilePosition: "Side on phones",
    presets: "My styles", presetName: "Style name", savePreset: "Save as style", apply: "Apply", noPresets: "Save the current design to come back to it later.", reset: "Reset design",
    preview: "Preview", previewCopy: "What visitors see on your plan", desktop: "Desktop", phone: "Phone",
    planNote: (plan: string) => `Current plan: ${plan}`,
  },
} as const;

export function WidgetStudio({ locale, channels, employees, notify, refresh, onUpgrade, company, knowledgeReady, onNavigate }: { locale: string; channels: Array<Channel & { type: string }>; employees: Array<{ id: string; name: string; status?: string }>; knowledgeReady: boolean; onNavigate: (page: string) => void; notify: (text: string) => void; refresh: () => void; onUpgrade: () => void; company: string }) {
  const c = T[locale === "en" ? "en" : "ru"];
  const site = channels.find(item => item.type === "WEBSITE" && item.status === "CONNECTED");
  const employee = employees.find(item => item.id === site?.employeeId) ?? employees[0];
  const [tab, setTab] = useState<"design" | "install" | "link">("design");
  const [creating, setCreating] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const create = async () => {
    if (!employee) return; setCreating(true);
    const response = await fetch("/api/channels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "WEBSITE", employeeId: employee.id, config: { allowedOrigins: [] } }) });
    setCreating(false);
    if (response.ok) refresh(); else notify(c.createFailed);
  };
  if (!site || !employee) return <section className="sxEmpty"><span className="sxEmptyIcon"><LemiriGlyph size={30}/></span><h2>{c.create}</h2><p>{c.createCopy}</p><button className="primary" disabled={creating || !employee} onClick={create}><Plus size={15}/>{creating ? c.creating : c.create}</button></section>;
  return <div className="sxWidget">
    <div className="sxTabs" role="tablist">{(["design", "install", "link"] as const).map(key => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{c.tabs[key]}</button>)}</div>
    {tab === "design" ? <DesignEditor locale={locale} channelId={site.id} employeeId={site.employeeId ?? employee.id} employeeName={employee.name} company={company} notify={notify} onUpgrade={onUpgrade}/>
      : <>{tab === "install" && <ConnectionCheck locale={locale} channelId={site.id} employeeActive={employee.status === "ACTIVE"} knowledgeReady={knowledgeReady} onNavigate={onNavigate}/>}<SiteInstall key={`${site.id}-${tab}`} locale={locale} channelId={site.id} employeeId={site.employeeId ?? employee.id} employeeName={employee.name} origin={origin} notify={notify} only={tab === "install" ? "install" : "link"}/></>}
  </div>;
}

function DesignEditor({ locale, channelId, employeeId, employeeName, company, notify, onUpgrade }: { locale: string; channelId: string; employeeId: string; employeeName: string; company: string; notify: (text: string) => void; onUpgrade: () => void }) {
  const c = T[locale === "en" ? "en" : "ru"];
  const [state, setState] = useState<State | null>(null);
  const [look, setLook] = useState<StoredLook>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [palette, setPalette] = useState<"colors" | "dark">("colors");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [previewDark, setPreviewDark] = useState(false);
  const [previewScreen, setPreviewScreen] = useState<"dialog" | "welcome" | "closed">("dialog");
  const [presetName, setPresetName] = useState("");
  const load = useCallback(async () => {
    setFailed(false);
    try { const response = await fetch(`/api/channels/${channelId}`, { cache: "no-store" }); if (!response.ok) throw new Error(); const body = await response.json() as State; setState(body); setLook(body.widget ?? {}); }
    catch { setFailed(true); }
  }, [channelId]);
  useEffect(() => { void load(); }, [load]);
  const tier = state?.tier ?? "basic";
  const resolved = useMemo(() => resolveLook(look, tier), [look, tier]);
  if (failed) return <div className="sxState"><p>{c.loadFailed}</p><button className="btn" onClick={() => void load()}>{c.retry}</button></div>;
  if (!state) return <div className="sxState"><span className="sxSpinner"/>{c.loading}</div>;

  const standardOk = tier !== "basic", customOk = tier === "custom";
  const update = (patch: Partial<StoredLook>) => { setLook(value => ({ ...value, ...patch })); setDirty(true); };
  // The editor always edits a full design: the stored one, or the ready style it started from.
  // normalizeDesign fills settings added later, so older saved designs open with defaults.
  const design: Design = normalizeDesign(look.design ?? READY_STYLES[look.style ?? "classic"]?.design ?? DEFAULT_DESIGN);
  const setDesign = (patch: Partial<Design>) => update({ design: { ...design, ...patch } });
  const setColor = (key: keyof Colors, value: string) => setDesign({ [palette]: { ...design[palette], [key]: value } } as Partial<Design>);
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ widget: look }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 402) { notify(c.planRequired); return; }
      if (!response.ok) throw new Error();
      setLook(body.widget ?? look); setDirty(false); notify(c.saved);
    } catch { notify(c.saveFailed); } finally { setSaving(false); }
  };
  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try { update({ avatarUrl: await resizeImage(file, 160) }); } catch { notify(c.avatarTooBig); }
  };
  const savePreset = () => {
    const name = presetName.trim() || `${c.presets} ${(look.presets?.length ?? 0) + 1}`;
    const preset: DesignPreset = { id: crypto.randomUUID().slice(0, 12), name: name.slice(0, 40), design, savedAt: new Date().toISOString() };
    update({ presets: [preset, ...(look.presets ?? [])].slice(0, 12), design }); setPresetName("");
  };
  const color = (key: keyof Colors) => <label key={key} className="sxColor"><input type="color" value={design[palette][key]} onChange={e => setColor(key, e.target.value)}/><span>{c.colorNames[key]}</span></label>;
  const range = (label: string, value: number, min: number, max: number, onChange: (v: number) => void, unit = "px") => <Field label={`${label}: ${value}${unit}`}><input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}/></Field>;

  return <div className="sxDesign">
    <div className="sxDesignForm">
      <p className="sxPlanNote">{c.planNote(state.plan === "CUSTOM" ? "Custom" : state.plan === "STARTER" ? "Starter" : "Trial")}</p>
      <SiteMatch locale={locale} channelId={channelId} defaultUrl={state.allowedOrigins[0] ?? state.seen[0]?.origin ?? ""} locked={!customOk} onUpgrade={onUpgrade} notify={notify}
        onApply={result => { const before = look; update({ design: result.design, theme: result.theme, accent: result.design.colors.accent }); return () => { setLook(before); }; }}/>

      <Section title={c.basics} copy={c.basicsCopy}>
        <div className="sxGrid">
          <Field label={c.title}><input value={look.title ?? ""} placeholder={employeeName} maxLength={60} onChange={e => update({ title: e.target.value })}/></Field>
          <Field label={c.accent}><span className="sxColorInput"><input type="color" value={look.accent ?? design.colors.accent} onChange={e => update({ accent: e.target.value, ...(look.design ? { design: { ...design, colors: { ...design.colors, accent: e.target.value, userBubble: e.target.value, button: e.target.value, launcherBg: e.target.value } } } : {}) })}/><code>{look.accent ?? design.colors.accent}</code></span></Field>
          <Field label={c.greeting}><input value={look.greeting ?? ""} maxLength={80} onChange={e => update({ greeting: e.target.value })}/></Field>
          <Field label={c.help}><input value={look.help ?? ""} maxLength={200} onChange={e => update({ help: e.target.value })}/></Field>
          <Field label={c.position}><Segmented label={c.position} value={look.position ?? "right"} onChange={value => update({ position: value })} options={[{ value: "right", label: c.right }, { value: "left", label: c.left }]}/></Field>
          <Field label={c.theme}><select value={look.theme ?? "auto"} onChange={e => update({ theme: e.target.value as StoredLook["theme"] })}>{(["auto", "light", "dark"] as const).map(key => <option key={key} value={key}>{c.themes[key]}</option>)}</select></Field>
        </div>
        <Toggle label={c.leadForm} hint={c.leadFormHint} checked={look.leadForm !== false} onChange={value => update({ leadForm: value })}/>
      </Section>

      <Section title={c.standard} copy={c.standardCopy} aside={!standardOk && <PlanLock plan="Starter" locale={locale} onUpgrade={onUpgrade}/>}>
        <fieldset disabled={!standardOk} className="sxFieldset">
          <div className="sxAvatarRow">
            <span className="sxAvatarPreview" style={{ borderRadius: design.avatarShape === "circle" ? "50%" : design.avatarShape === "square" ? 6 : 14 }}>{look.avatarUrl ? <img src={look.avatarUrl} alt=""/> : <LemiriGlyph size={24}/>}</span>
            <label className="btn sxUpload"><Upload size={14}/>{c.upload}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} hidden/></label>
            <input className="sxAvatarUrl" placeholder={c.avatarUrl} value={look.avatarUrl?.startsWith("https://") ? look.avatarUrl : ""} onChange={e => update({ avatarUrl: e.target.value })}/>
            {look.avatarUrl && <button type="button" className="linkButton" onClick={() => update({ avatarUrl: "" })}>{c.removeAvatar}</button>}
          </div>
          <div className="sxGrid">
            <Field label={c.status}><input value={look.status ?? ""} maxLength={80} onChange={e => update({ status: e.target.value })}/></Field>
            <Field label={c.autoOpen}><select value={look.autoOpenSeconds ?? 0} onChange={e => update({ autoOpenSeconds: Number(e.target.value) })}>{[0, 5, 10, 20, 30, 60].map(n => <option key={n} value={n}>{n ? c.after(n) : c.never}</option>)}</select></Field>
            <Field wide label={c.suggestions} hint={c.suggestionsHint}><textarea rows={3} value={(look.suggestions ?? []).join("\n")} onChange={e => update({ suggestions: e.target.value.split("\n").slice(0, 4) })}/></Field>
          </div>
          <Field wide label={c.styles}><div className="sxStyles">{Object.entries(READY_STYLES).map(([key, style]) => <button type="button" key={key} className={(look.style ?? "classic") === key && !look.design ? "on" : ""} onClick={() => update({ style: key, ...(customOk ? { design: undefined } : {}) })}><StyleSwatch design={style.design}/><span>{style.label}</span></button>)}</div></Field>
        </fieldset>
      </Section>


      <Section title={c.custom} copy={c.customCopy} aside={!customOk ? <PlanLock plan="Custom" locale={locale} onUpgrade={onUpgrade}/> : <button type="button" className="linkButton" onClick={() => update({ design: undefined })}><RotateCcw size={13}/>{c.reset}</button>}>
        <fieldset disabled={!customOk} className={customOk ? "sxFieldset" : "sxFieldset locked"}>
          <Group title={c.colors} icon={<Palette size={14}/>}>
            <Segmented label={c.colors} value={palette} onChange={setPalette} options={[{ value: "colors", label: c.lightPalette }, { value: "dark", label: c.darkPalette }]}/>
            <div className="sxColors">{(Object.keys(design.colors) as Array<keyof Colors>).map(color)}</div>
          </Group>
          <Group title={c.typography}>
            <div className="sxGrid">
              <Field label={c.font}><select value={design.font} onChange={e => setDesign({ font: e.target.value as Design["font"] })}>{Object.entries(FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></Field>
              {range(c.fontSize, design.fontSize, 12, 18, v => setDesign({ fontSize: v }))}
              <Field label={c.headingFont}><select value={design.headingFont} onChange={e => setDesign({ headingFont: e.target.value as Design["headingFont"] })}><option value="same">{c.sameFont}</option>{Object.entries(FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></Field>
            </div>
          </Group>
          <Group title={c.premium} icon={<Gem size={14}/>}>
            <Toggle label={c.glass} hint={c.glassHint} checked={design.effects.glass} onChange={value => setDesign({ effects: { ...design.effects, glass: value }, ...(value && design.opacity > 80 ? { opacity: 74 } : {}), ...(!value && design.opacity < 85 ? { opacity: 100 } : {}) })}/>
            {design.effects.glass && <div className="sxGrid">{range(c.blur, design.effects.blur, 4, 32, v => setDesign({ effects: { ...design.effects, blur: v } }))}</div>}
            <Toggle label={c.glow} hint={c.glowHint} checked={design.effects.glow} onChange={value => setDesign({ effects: { ...design.effects, glow: value } })}/>
            <Toggle label={c.gradient} hint={c.gradientHint} checked={design.accentGradient.enabled} onChange={value => setDesign({ accentGradient: { ...design.accentGradient, enabled: value } })}/>
            {design.accentGradient.enabled && <div className="sxGrid">
              <label className="sxColor"><input type="color" value={design.accentGradient.to} onChange={e => setDesign({ accentGradient: { ...design.accentGradient, to: e.target.value } })}/><span>{c.gradientTo}</span></label>
              {range(c.angle, design.accentGradient.angle, 0, 360, v => setDesign({ accentGradient: { ...design.accentGradient, angle: v } }), "°")}
            </div>}
            <Field label={c.pattern}><div className="sxPatterns">{(["none", "dots", "grid", "diagonal", "aurora", "noise"] as const).map(key => <button type="button" key={key} className={design.effects.pattern === key ? "on" : ""} onClick={() => setDesign({ effects: { ...design.effects, pattern: key } })}><i className={`sxPat ${key}`}/><span>{c.patterns[key]}</span></button>)}</div></Field>
            {design.effects.pattern !== "none" && <div className="sxGrid">{range(c.patternOpacity, design.effects.patternOpacity, 2, 40, v => setDesign({ effects: { ...design.effects, patternOpacity: v } }), "%")}</div>}
          </Group>
          <Group title={c.sizeShape}>
            <div className="sxGrid">
              {range(c.width, design.width, 320, 480, v => setDesign({ width: v }))}
              {range(c.height, design.height, 440, 760, v => setDesign({ height: v }))}
              {range(c.radius, design.radius, 0, 28, v => setDesign({ radius: v }))}
              {range(c.bubbleRadius, design.bubbleRadius, 2, 24, v => setDesign({ bubbleRadius: v }))}
              {range(c.buttonRadius, design.buttonRadius, 0, 24, v => setDesign({ buttonRadius: v }))}
              {range(c.border, design.borderWidth, 0, 3, v => setDesign({ borderWidth: v }))}
              {range(c.opacity, design.opacity, design.effects.glass ? 55 : 85, 100, v => setDesign({ opacity: v }), "%")}
              <Field label={c.shadow}><select value={design.shadow} onChange={e => setDesign({ shadow: e.target.value as Design["shadow"] })}>{(["none", "soft", "medium", "strong"] as const).map(key => <option key={key} value={key}>{c.shadows[key]}</option>)}</select></Field>
            </div>
          </Group>
          <Group title={c.background}>
            <Segmented label={c.background} value={design.background.type} onChange={type => setDesign({ background: { ...design.background, type } })} options={[{ value: "solid", label: c.bgTypes.solid }, { value: "gradient", label: c.bgTypes.gradient }]}/>
            {design.background.type === "gradient" && <div className="sxGrid">
              <label className="sxColor"><input type="color" value={design.background.from} onChange={e => setDesign({ background: { ...design.background, from: e.target.value } })}/><span>{c.from}</span></label>
              <label className="sxColor"><input type="color" value={design.background.to} onChange={e => setDesign({ background: { ...design.background, to: e.target.value } })}/><span>{c.to}</span></label>
              {range(c.angle, design.background.angle, 0, 360, v => setDesign({ background: { ...design.background, angle: v } }), "°")}
            </div>}
          </Group>
          <Group title={c.bubbles} icon={<MessageSquareText size={14}/>}>
            <Segmented label={c.bubbles} value={design.bubbleStyle} onChange={bubbleStyle => setDesign({ bubbleStyle })} options={(["tail", "rounded", "square"] as const).map(key => ({ value: key, label: c.bubbleStyles[key] }))}/>
            <div className="sxGrid">
              <Field label={c.messageStyle}><select value={design.messages.animation} onChange={e => setDesign({ messages: { ...design.messages, animation: e.target.value as Design["messages"]["animation"] } })}>{(["rise", "pop", "fade", "none"] as const).map(key => <option key={key} value={key}>{c.messageAnims[key]}</option>)}</select></Field>
              <Field label={c.typing}><select value={design.messages.typing} onChange={e => setDesign({ messages: { ...design.messages, typing: e.target.value as Design["messages"]["typing"] } })}>{(["dots", "wave", "pulse"] as const).map(key => <option key={key} value={key}>{c.typings[key]}</option>)}</select></Field>
              <Toggle label={c.msgAvatar} checked={design.messages.avatar} onChange={value => setDesign({ messages: { ...design.messages, avatar: value } })}/>
              <Toggle label={c.msgShadow} checked={design.messages.shadow} onChange={value => setDesign({ messages: { ...design.messages, shadow: value } })}/>
            </div>
          </Group>
          <Group title={c.composer} icon={<Type size={14}/>}>
            <Segmented label={c.composer} value={design.composer.style} onChange={style => setDesign({ composer: { ...design.composer, style } })} options={(["outlined", "filled", "pill"] as const).map(key => ({ value: key, label: c.composerStyles[key] }))}/>
            <div className="sxGrid">
              <Field label={c.sendIcon}><select value={design.composer.sendIcon} onChange={e => setDesign({ composer: { ...design.composer, sendIcon: e.target.value as Design["composer"]["sendIcon"] } })}>{(["arrow", "send", "sparkle"] as const).map(key => <option key={key} value={key}>{c.sendIcons[key]}</option>)}</select></Field>
              <Field label={c.placeholder} hint={c.placeholderHint}><input value={design.composer.placeholder} maxLength={60} onChange={e => setDesign({ composer: { ...design.composer, placeholder: e.target.value } })}/></Field>
            </div>
          </Group>
          <Group title={c.header}>
            <Segmented label={c.header} value={design.header.style} onChange={style => setDesign({ header: { ...design.header, style } })} options={(["gradient", "solid", "accent", "minimal", "glass"] as const).map(key => ({ value: key, label: c.headerStyles[key] }))}/>
            <div className="sxGrid">
              <Toggle label={c.showAvatar} checked={design.header.showAvatar} onChange={value => setDesign({ header: { ...design.header, showAvatar: value } })}/>
              <Toggle label={c.showStatus} checked={design.header.showStatus} onChange={value => setDesign({ header: { ...design.header, showStatus: value } })}/>
              <Field label={c.avatarShape}><select value={design.avatarShape} onChange={e => setDesign({ avatarShape: e.target.value as Design["avatarShape"] })}>{(["circle", "rounded", "square"] as const).map(key => <option key={key} value={key}>{c.shapes[key]}</option>)}</select></Field>
            </div>
          </Group>
          <Group title={c.launcher}>
            <div className="sxGrid">
              <Field label={c.icon}><select value={design.launcher.icon} onChange={e => setDesign({ launcher: { ...design.launcher, icon: e.target.value as Design["launcher"]["icon"] } })}>{(["chat", "sparkles", "message", "help", "avatar"] as const).map(key => <option key={key} value={key}>{c.icons[key]}</option>)}</select></Field>
              <Field label={c.launcherShape}><select value={design.launcher.shape} onChange={e => setDesign({ launcher: { ...design.launcher, shape: e.target.value as Design["launcher"]["shape"] } })}>{(["circle", "rounded", "square"] as const).map(key => <option key={key} value={key}>{c.shapes[key]}</option>)}</select></Field>
              {range(c.launcherSize, design.launcher.size, 44, 64, v => setDesign({ launcher: { ...design.launcher, size: v } }))}
              <Field label={c.label} hint={c.labelHint}><input value={design.launcher.label} maxLength={30} onChange={e => setDesign({ launcher: { ...design.launcher, label: e.target.value } })}/></Field>
            </div>
          </Group>
          <Group title={c.attention} icon={<Megaphone size={14}/>}>
            <Toggle label={c.pulse} hint={c.pulseHint} checked={design.attention.pulse} onChange={value => setDesign({ attention: { ...design.attention, pulse: value } })}/>
            <div className="sxGrid">
              <Field label={c.teaser} hint={c.teaserHint}><input value={design.attention.teaser} maxLength={90} onChange={e => setDesign({ attention: { ...design.attention, teaser: e.target.value } })}/></Field>
              {design.attention.teaser && range(c.teaserDelay, design.attention.teaserDelay, 2, 60, v => setDesign({ attention: { ...design.attention, teaserDelay: v } }), locale === "en" ? "s" : " с")}
            </div>
          </Group>
          <Group title={c.welcome}>
            <Segmented label={c.welcome} value={design.welcome.layout} onChange={layout => setDesign({ welcome: { ...design.welcome, layout } })} options={(["bubble", "hero"] as const).map(key => ({ value: key, label: c.layouts[key] }))}/>
            <div className="sxGrid">
              <Field label={c.welcomeTitle}><input value={design.welcome.title} maxLength={80} placeholder={look.greeting} onChange={e => setDesign({ welcome: { ...design.welcome, title: e.target.value } })}/></Field>
              <Field label={c.welcomeText}><input value={design.welcome.text} maxLength={240} placeholder={look.help} onChange={e => setDesign({ welcome: { ...design.welcome, text: e.target.value } })}/></Field>
            </div>
            <Toggle label={c.showSuggestions} checked={design.welcome.showSuggestions} onChange={value => setDesign({ welcome: { ...design.welcome, showSuggestions: value } })}/>
          </Group>
          <Group title={c.animation}>
            <Segmented label={c.animation} value={design.animation.open} onChange={open => setDesign({ animation: { ...design.animation, open } })} options={(["scale", "slide", "fade", "none"] as const).map(key => ({ value: key, label: c.animations[key] }))}/>
            {range(c.duration, design.animation.durationMs, 0, 600, v => setDesign({ animation: { ...design.animation, durationMs: v } }), " мс")}
          </Group>
          <Group title={c.mobile}>
            <Toggle label={c.showOnMobile} checked={design.appearance.showOnMobile} onChange={value => setDesign({ appearance: { ...design.appearance, showOnMobile: value } })}/>
            <div className="sxGrid">
              {range(c.mobileLauncherSize, design.appearance.mobileLauncherSize, 40, 64, v => setDesign({ appearance: { ...design.appearance, mobileLauncherSize: v } }))}
              <Field label={c.mobilePosition}><Segmented label={c.mobilePosition} value={design.appearance.mobilePosition} onChange={value => setDesign({ appearance: { ...design.appearance, mobilePosition: value } })} options={[{ value: "right", label: c.right }, { value: "left", label: c.left }]}/></Field>
            </div>
          </Group>
          <Group title={c.presets}>
            <div className="sxPresetNew"><input value={presetName} maxLength={40} placeholder={c.presetName} onChange={e => setPresetName(e.target.value)}/><button type="button" className="btn" onClick={savePreset}><Save size={14}/>{c.savePreset}</button></div>
            {(look.presets ?? []).length ? <ul className="sxPresets">{(look.presets ?? []).map(preset => <li key={preset.id}><StyleSwatch design={preset.design}/><b>{preset.name}</b><button type="button" className="btn" onClick={() => update({ design: preset.design })}><Check size={13}/>{c.apply}</button><button type="button" className="iconButton" aria-label="×" onClick={() => update({ presets: (look.presets ?? []).filter(item => item.id !== preset.id) })}><Trash2 size={14}/></button></li>)}</ul> : <p className="sxMuted">{c.noPresets}</p>}
          </Group>
        </fieldset>
      </Section>
      {!customOk && look.presets?.length ? <p className="sxMuted">{locale === "en" ? "Your Custom styles are kept and will come back when you return to Custom." : "Ваши стили из тарифа Custom сохранены и вернутся при переходе на Custom."}</p> : null}
      <div className={dirty ? "sxSaveBar show" : "sxSaveBar"}><button className="primary" onClick={save} disabled={saving}><Save size={15}/>{saving ? c.saving : c.save}</button></div>
    </div>

    <aside className="sxPreview">
      <header><div><b>{c.preview}</b><small>{c.previewCopy}</small></div>
        <div className="sxPreviewTools"><Segmented label={c.preview} value={device} onChange={setDevice} options={[{ value: "desktop", label: c.desktop }, { value: "phone", label: c.phone }]}/><Segmented label="screen" value={previewScreen} onChange={setPreviewScreen} options={[{ value: "dialog", label: locale === "en" ? "Dialog" : "Диалог" }, { value: "welcome", label: locale === "en" ? "Welcome" : "Приветствие" }, { value: "closed", label: locale === "en" ? "Closed" : "Закрыта" }]}/><button type="button" className="iconButton" aria-label="theme" onClick={() => setPreviewDark(value => !value)}>{previewDark ? <Sun size={15}/> : <Moon size={15}/>}</button></div>
      </header>
      <CardPreview locale={locale} employeeId={employeeId} employeeName={employeeName} company={company} look={resolved} device={device} dark={previewDark} sample={previewScreen === "dialog"} closed={previewScreen === "closed"}/>
    </aside>
  </div>;
}

/** Step-by-step connection status with a concrete fix for each problem. */
function ConnectionCheck({ locale, channelId, employeeActive, knowledgeReady, onNavigate }: { locale: string; channelId: string; employeeActive: boolean; knowledgeReady: boolean; onNavigate: (page: string) => void }) {
  const ru = locale !== "en";
  const [state, setState] = useState<State | null>(null);
  const [checking, setChecking] = useState(false);
  const load = useCallback(async () => { setChecking(true); try { const response = await fetch(`/api/channels/${channelId}`, { cache: "no-store" }); if (response.ok) setState(await response.json()); } finally { setChecking(false); } }, [channelId]);
  useEffect(() => { void load(); }, [load]);
  const seen = state?.seen ?? [];
  const recent = seen.find(item => Date.now() - new Date(item.lastSeenAt).getTime() < 7 * 86400_000);
  const planOk = state ? state.planState !== "expired" : true;
  const rows: Array<{ ok: boolean; title: string; fix: string; action?: () => void; actionLabel?: string }> = [
    { ok: employeeActive, title: ru ? "ИИ-продавец запущен" : "AI seller is running", fix: ru ? "Сотрудник на паузе — карточка не загрузится на сайте. Запустите его." : "The employee is paused — the card won't load. Start it.", action: () => onNavigate("employees"), actionLabel: ru ? "Открыть" : "Open" },
    { ok: knowledgeReady, title: ru ? "База знаний заполнена" : "Knowledge base has content", fix: ru ? "Без знаний ИИ не сможет называть цены и товары — он будет передавать вопросы менеджеру." : "Without knowledge the AI can't name prices or products.", action: () => onNavigate("knowledge"), actionLabel: ru ? "Добавить" : "Add" },
    { ok: planOk, title: ru ? "Тариф активен" : "Plan is active", fix: ru ? "Пробный период или подписка закончились: посетители видят просьбу оставить контакты вместо ответов ИИ." : "Trial or subscription ended: visitors are asked for contacts instead of AI answers.", action: () => onNavigate("billing"), actionLabel: ru ? "Тарифы" : "Plans" },
    { ok: Boolean(recent), title: ru ? (recent ? `Карточка работает на ${recent.origin}` : "Карточка замечена на сайте") : (recent ? `Card is live on ${recent.origin}` : "Card seen on your website"), fix: ru
      ? `Пока не видим карточку. Проверьте: код вставлен перед </body> на всех страницах; ${state?.allowedOrigins.length ? `адрес сайта есть в списке разрешённых (${state.allowedOrigins.join(", ")})` : "сайт открыт по https"}; очищен кеш сайта/плагина. Откройте сайт и нажмите «Проверить снова».`
      : `We don't see the card yet. Check that the code is placed before </body>; ${state?.allowedOrigins.length ? `your site is in the allowed list (${state.allowedOrigins.join(", ")})` : "the site is served over https"}; site cache is cleared. Open the site and press “Check again”.` },
  ];
  return <section className="sxCheck">
    <header><b>{ru ? "Проверка подключения" : "Connection check"}</b><button type="button" className="btn" disabled={checking} onClick={() => void load()}><RotateCcw size={14}/>{ru ? "Проверить снова" : "Check again"}</button></header>
    <ol>{rows.map(row => <li key={row.title} className={row.ok ? "ok" : "bad"}><span className="sxCheckMark">{row.ok ? <Check size={13}/> : "!"}</span><div><b>{row.title}</b>{!row.ok && <small>{row.fix}</small>}</div>{!row.ok && row.action && <button type="button" className="linkButton" onClick={row.action}>{row.actionLabel}</button>}</li>)}</ol>
  </section>;
}

type MatchResult = { design: Design; theme: "auto" | "light" | "dark"; summary: string; notes: string[]; ai: boolean; found: { url: string; title: string; accent: string; palette: string[]; background: string; text: string; dark: boolean; bodyFont: string; headingFont: string; buttonRadius: number | null } };

/** «Подобрать под сайт»: the AI reads the website and dresses the card in its style. */
function SiteMatch({ locale, channelId, defaultUrl, locked, onUpgrade, notify, onApply }: { locale: string; channelId: string; defaultUrl: string; locked: boolean; onUpgrade: () => void; notify: (text: string) => void; onApply: (result: MatchResult) => () => void }) {
  const ru = locale !== "en";
  const [url, setUrl] = useState(defaultUrl);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const steps = ru ? ["Открываем сайт…", "Изучаем цвета и шрифты…", "ИИ собирает дизайн…"] : ["Opening the site…", "Reading colours and fonts…", "AI is composing the design…"];
  const errors: Record<string, string> = ru
    ? { URL_REQUIRED: "Укажите адрес сайта", INVALID_URL: "Похоже, адрес указан с ошибкой", PRIVATE_ADDRESS: "Нужен публичный адрес сайта (не localhost и не IP)", UNREACHABLE: "Не удалось открыть сайт. Проверьте адрес и что сайт доступен без пароля", NOT_HTML: "По этому адресу не веб-страница", RATE_LIMITED: "Слишком часто — попробуйте через пару минут", PLAN_REQUIRED: "Доступно в тарифе Custom" }
    : { URL_REQUIRED: "Enter your website address", INVALID_URL: "The address looks wrong", PRIVATE_ADDRESS: "Use a public website address", UNREACHABLE: "Couldn't open the site. Check the address and that it's public", NOT_HTML: "That address isn't a web page", RATE_LIMITED: "Too many tries — wait a couple of minutes", PLAN_REQUIRED: "Available on Custom" };
  const run = async () => {
    setBusy(true); setStep(0); setResult(null);
    const timer = window.setInterval(() => setStep(value => Math.min(2, value + 1)), 2200);
    try {
      const response = await fetch(`/api/channels/${channelId}/match-design`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, locale: ru ? "ru" : "en" }) });
      const body = await response.json().catch(() => ({})) as MatchResult & { error?: string };
      if (!response.ok) { notify(errors[body.error ?? ""] ?? (ru ? "Не удалось подобрать дизайн" : "Couldn't match the design")); return; }
      const restore = onApply(body); setResult(body); setUndo(() => restore);
    } catch { notify(ru ? "Не удалось подобрать дизайн" : "Couldn't match the design"); }
    finally { window.clearInterval(timer); setBusy(false); }
  };
  return <section className={locked ? "sxMatch locked" : "sxMatch"}>
    <div className="sxMatchHead">
      <span className="sxMatchIcon"><Wand2 size={18}/></span>
      <div><h3>{ru ? "ИИ подберёт дизайн под ваш сайт" : "AI matches the card to your site"}</h3><p>{ru ? "Укажите адрес — ИИ изучит цвета, шрифты, скругления и стиль сайта и оформит карточку так, будто она всегда там была. Вы увидите результат в предпросмотре и решите, сохранять ли." : "Enter the address — the AI studies colours, fonts, corners and style and dresses the card to look native. Review it in the preview before saving."}</p></div>
      {locked && <PlanLock plan="Custom" locale={locale} onUpgrade={onUpgrade}/>}
    </div>
    <form className="sxMatchForm" onSubmit={event => { event.preventDefault(); if (!locked && !busy) void run(); }}>
      <input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://your-site.com" inputMode="url" autoComplete="url" disabled={locked || busy} aria-label={ru ? "Адрес сайта" : "Website address"}/>
      <button className="primary" disabled={locked || busy || !url.trim()}><Wand2 size={15}/>{busy ? steps[step] : result ? (ru ? "Подобрать ещё раз" : "Try again") : (ru ? "Подобрать под сайт" : "Match my site")}</button>
    </form>
    {busy && <div className="sxMatchProgress" aria-live="polite"><i style={{ width: `${(step + 1) * 30}%` }}/></div>}
    {result && !busy && <div className="sxMatchResult">
      <div className="sxMatchFound">
        <div className="sxMatchSwatches">{[result.design.colors.accent, ...(result.design.accentGradient.enabled ? [result.design.accentGradient.to] : []), result.found.background, result.found.text, ...result.found.palette.filter(item => item !== result.design.colors.accent).slice(0, 2)].map((color, index) => <i key={`${color}${index}`} style={{ background: color }} title={color}/>)}</div>
        <small>{[result.found.bodyFont && `${ru ? "Шрифт сайта" : "Site font"}: ${result.found.bodyFont}`, result.found.buttonRadius !== null && `${ru ? "кнопки" : "buttons"} ${Math.min(result.found.buttonRadius, 99)}px`, result.found.dark ? (ru ? "тёмный сайт" : "dark site") : null].filter(Boolean).join(" · ")}</small>
      </div>
      <p><b>{result.summary}</b></p>
      {result.notes.length > 0 && <ul>{result.notes.map(note => <li key={note}>{note}</li>)}</ul>}
      <div className="sxMatchActions">
        <span className="sxMuted">{ru ? "Дизайн уже в предпросмотре. Нажмите «Сохранить», чтобы он появился на сайте." : "It's in the preview. Press Save to publish it."}</span>
        {undo && <button type="button" className="btn" onClick={() => { undo(); setUndo(null); setResult(null); }}><RotateCcw size={14}/>{ru ? "Вернуть как было" : "Undo"}</button>}
      </div>
    </div>}
  </section>;
}

function Group({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <details className="sxGroup" open><summary>{icon}{title}</summary><div>{children}</div></details>;
}

function StyleSwatch({ design }: { design: Design }) {
  return <span className="sxSwatch" style={{ borderRadius: Math.min(design.radius, 12), background: design.background.type === "gradient" ? `linear-gradient(${design.background.angle}deg,${design.background.from},${design.background.to})` : design.colors.background, borderColor: design.colors.border }}>
    <i style={{ background: design.colors.botBubble, borderRadius: design.bubbleRadius / 2 }}/><i style={{ background: design.colors.userBubble, borderRadius: design.bubbleRadius / 2 }}/>
  </span>;
}

/** Mock website with the floating card: the shell header and launcher follow shellConfig, the chat is the real widget component. */
function CardPreview({ locale, employeeId, employeeName, company, look, device, dark, sample, closed }: { locale: string; employeeId: string; employeeName: string; company: string; look: ReturnType<typeof resolveLook>; device: "desktop" | "phone"; dark: boolean; sample: boolean; closed: boolean }) {
  const shell = shellConfig(look.design);
  const pal = dark ? shell.dark : shell.light;
  const phone = device === "phone";
  const radius = (shape: string, size: number) => shape === "circle" ? "50%" : shape === "square" ? Math.round(size * 0.12) : Math.round(size * 0.32);
  const side = (phone ? shell.mobilePosition : look.position) === "left" ? "left" : "right";
  const launcherSize = phone ? shell.mobileLauncherSize : shell.launcherSize;
  const fill = (base: string) => shell.gradTo ? `linear-gradient(${shell.gradAngle}deg, ${base}, ${shell.gradTo})` : base;
  const glassBg = (base: string) => `color-mix(in srgb, ${base} ${Math.max(40, shell.opacity)}%, transparent)`;
  const headBg = shell.headerStyle === "accent" ? fill(pal.accent) : shell.headerStyle === "gradient" ? `radial-gradient(120% 140% at 0 0, color-mix(in srgb, ${pal.accent} 14%, transparent), transparent 60%), ${pal.head}` : shell.headerStyle === "minimal" ? "transparent" : shell.headerStyle === "glass" ? glassBg(pal.head) : pal.head;
  const headText = shell.headerStyle === "accent" ? "#fff" : pal.headText;
  const hidden = phone && !shell.showOnMobile;
  const scale = phone ? 1 : Math.min(1, 520 / shell.height);
  const glow = shell.glow ? `, 0 0 0 1px color-mix(in srgb, ${pal.accent} 22%, transparent), 0 24px 90px -24px ${pal.accent}` : "";
  const glass: CSSProperties = shell.glass ? { backdropFilter: `blur(${shell.blur}px) saturate(1.6)`, WebkitBackdropFilter: `blur(${shell.blur}px) saturate(1.6)` } : {};
  // "Closed" shows the site with the chat button only: pulse and the proactive message.
  const showCard = !closed || phone;
  const teaser = closed && !phone && Boolean(shell.teaser);
  const cardStyle: CSSProperties = phone
    ? { inset: 0, borderRadius: 0, border: 0 }
    : { [side]: 16, bottom: 16 + launcherSize + 12 + (shell.launcherLabel ? 40 : 0), width: shell.width * scale, height: shell.height * scale, borderRadius: shell.radius, border: `${shell.border}px solid ${pal.line}`, boxShadow: shell.shadow + glow };
  return <div className={phone ? "sxStage phone" : "sxStage"} data-dark={dark ? "true" : "false"}>
    {shell.fontHref && <link rel="stylesheet" href={shell.fontHref}/>}{shell.headFontHref && <link rel="stylesheet" href={shell.headFontHref}/>}
    <div className="sxFakeSite" aria-hidden="true"><i/><i/><i/><b/><b/><b/></div>
    {hidden ? <p className="sxHiddenNote">{locale === "en" ? "The card is hidden on phones" : "На телефонах карточка скрыта"}</p> : <>
      {showCard && <div className="sxCard" style={{ ...cardStyle, ...glass, fontFamily: shell.font, background: shell.glass ? glassBg(pal.bg) : pal.bg }}>
        <div className="sxCardHead" style={{ background: headBg, color: headText, borderBottom: shell.headerStyle === "minimal" ? 0 : `1px solid ${pal.line}` }}>
          {shell.showAvatar && <span className="sxCardAvatar" style={{ borderRadius: radius(shell.avatarShape, 34), background: shell.headerStyle === "accent" ? "rgba(255,255,255,.22)" : fill(pal.accent) }}>{look.avatarUrl ? <img src={look.avatarUrl} alt=""/> : (look.title || employeeName).trim()[0]?.toUpperCase()}</span>}
          <span className="sxCardTitle"><b style={{ fontFamily: shell.headFont }}>{look.title || employeeName}</b>{shell.showStatus && <small style={{ color: shell.headerStyle === "accent" ? "rgba(255,255,255,.8)" : pal.text3 }}>{look.status || (locale === "en" ? "AI consultant · usually replies instantly" : "ИИ-консультант · обычно отвечает сразу")}</small>}</span>
          <span className="sxCardTools" style={{ color: headText }}><Monitor size={13}/><Smartphone size={13}/><Copy size={13}/></span>
        </div>
        <div className="sxCardBody" style={shell.glass ? { background: "transparent" } : undefined}><WebsiteWidget key={`${sample ? "s" : "w"}${dark ? "d" : "l"}`} previewSample={sample} locale={locale === "en" ? "en" : "ru"} employeeId={employeeId} employeeName={employeeName} company={company} embedded preview previewDark={dark} theme={dark ? "dark" : "light"} look={look}/></div>
      </div>}
      {!phone && <span className={shell.pulse && closed ? "sxLauncher pulse" : "sxLauncher"} style={{ [side]: 16, width: launcherSize, height: launcherSize, borderRadius: radius(shell.launcherShape, launcherSize), background: fill(pal.launcher), color: pal.launcherIcon, boxShadow: shell.shadow, ["--pulse" as string]: pal.launcher }}>
        {shell.launcherIcon === "avatar" && look.avatarUrl ? <img src={look.avatarUrl} alt=""/> : <LemiriGlyph size={Math.round(launcherSize * 0.42)}/>}
        {teaser ? <em className={`${side} sxTeaser`} style={{ background: shell.glass ? glassBg(pal.bg) : pal.bg, color: pal.text, borderColor: pal.line, fontFamily: shell.font, ...glass }}>{shell.teaser}<i>×</i></em>
          : (closed || !showCard) && shell.launcherLabel ? <em className={side} style={{ background: pal.bg, color: pal.text, borderColor: pal.line }}>{shell.launcherLabel}</em> : !closed && shell.launcherLabel ? <em className={side} style={{ background: pal.bg, color: pal.text, borderColor: pal.line }}>{shell.launcherLabel}</em> : null}
      </span>}
    </>}
  </div>;
}

/** Resizes an uploaded image to a small square data URL (stored with the card settings). */
function resizeImage(file: File, size: number) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) { reject(new Error("too big")); return; }
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d"); if (!ctx) { reject(new Error("no canvas")); return; }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL("image/webp", 0.86);
      if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", 0.86);
      data.length <= 90_000 ? resolve(data) : reject(new Error("too big"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}
