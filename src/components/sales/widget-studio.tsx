"use client";

import { ChangeEvent, CSSProperties, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Copy, Monitor, Moon, Palette, Plus, RotateCcw, Save, Smartphone, Sun, Trash2, Upload } from "lucide-react";
import type { DesignTier } from "@/lib/billing/plans";
import { DEFAULT_DESIGN, FONTS, READY_STYLES, resolveLook, shellConfig, type Colors, type Design, type DesignPreset, type StoredLook } from "@/lib/widget/design";
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
    header: "Заголовок", headerStyles: { gradient: "Градиент", solid: "Сплошной", accent: "Цветной", minimal: "Минимальный" }, showAvatar: "Показывать аватар", showStatus: "Показывать подпись", avatarShape: "Форма аватара", shapes: { circle: "Круг", rounded: "Скругление", square: "Квадрат" },
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
    header: "Header", headerStyles: { gradient: "Gradient", solid: "Solid", accent: "Coloured", minimal: "Minimal" }, showAvatar: "Show avatar", showStatus: "Show subtitle", avatarShape: "Avatar shape", shapes: { circle: "Circle", rounded: "Rounded", square: "Square" },
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
  const [previewScreen, setPreviewScreen] = useState<"dialog" | "welcome">("dialog");
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
  const design: Design = look.design ?? READY_STYLES[look.style ?? "classic"]?.design ?? DEFAULT_DESIGN;
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
            </div>
          </Group>
          <Group title={c.sizeShape}>
            <div className="sxGrid">
              {range(c.width, design.width, 320, 480, v => setDesign({ width: v }))}
              {range(c.height, design.height, 440, 760, v => setDesign({ height: v }))}
              {range(c.radius, design.radius, 0, 28, v => setDesign({ radius: v }))}
              {range(c.bubbleRadius, design.bubbleRadius, 2, 24, v => setDesign({ bubbleRadius: v }))}
              {range(c.buttonRadius, design.buttonRadius, 0, 24, v => setDesign({ buttonRadius: v }))}
              {range(c.border, design.borderWidth, 0, 3, v => setDesign({ borderWidth: v }))}
              {range(c.opacity, design.opacity, 85, 100, v => setDesign({ opacity: v }), "%")}
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
          <Group title={c.bubbles}><Segmented label={c.bubbles} value={design.bubbleStyle} onChange={bubbleStyle => setDesign({ bubbleStyle })} options={(["tail", "rounded", "square"] as const).map(key => ({ value: key, label: c.bubbleStyles[key] }))}/></Group>
          <Group title={c.header}>
            <Segmented label={c.header} value={design.header.style} onChange={style => setDesign({ header: { ...design.header, style } })} options={(["gradient", "solid", "accent", "minimal"] as const).map(key => ({ value: key, label: c.headerStyles[key] }))}/>
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
        <div className="sxPreviewTools"><Segmented label={c.preview} value={device} onChange={setDevice} options={[{ value: "desktop", label: c.desktop }, { value: "phone", label: c.phone }]}/><Segmented label="screen" value={previewScreen} onChange={setPreviewScreen} options={[{ value: "dialog", label: locale === "en" ? "Dialog" : "Диалог" }, { value: "welcome", label: locale === "en" ? "Welcome" : "Приветствие" }]}/><button type="button" className="iconButton" aria-label="theme" onClick={() => setPreviewDark(value => !value)}>{previewDark ? <Sun size={15}/> : <Moon size={15}/>}</button></div>
      </header>
      <CardPreview locale={locale} employeeId={employeeId} employeeName={employeeName} company={company} look={resolved} device={device} dark={previewDark} sample={previewScreen === "dialog"}/>
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

function Group({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <details className="sxGroup" open><summary>{icon}{title}</summary><div>{children}</div></details>;
}

function StyleSwatch({ design }: { design: Design }) {
  return <span className="sxSwatch" style={{ borderRadius: Math.min(design.radius, 12), background: design.background.type === "gradient" ? `linear-gradient(${design.background.angle}deg,${design.background.from},${design.background.to})` : design.colors.background, borderColor: design.colors.border }}>
    <i style={{ background: design.colors.botBubble, borderRadius: design.bubbleRadius / 2 }}/><i style={{ background: design.colors.userBubble, borderRadius: design.bubbleRadius / 2 }}/>
  </span>;
}

/** Mock website with the floating card: the shell header and launcher follow shellConfig, the chat is the real widget component. */
function CardPreview({ locale, employeeId, employeeName, company, look, device, dark, sample }: { locale: string; employeeId: string; employeeName: string; company: string; look: ReturnType<typeof resolveLook>; device: "desktop" | "phone"; dark: boolean; sample: boolean }) {
  const shell = shellConfig(look.design);
  const pal = dark ? shell.dark : shell.light;
  const phone = device === "phone";
  const radius = (shape: string, size: number) => shape === "circle" ? "50%" : shape === "square" ? Math.round(size * 0.12) : Math.round(size * 0.32);
  const side = (phone ? shell.mobilePosition : look.position) === "left" ? "left" : "right";
  const launcherSize = phone ? shell.mobileLauncherSize : shell.launcherSize;
  const headBg = shell.headerStyle === "accent" ? pal.accent : shell.headerStyle === "gradient" ? `radial-gradient(120% 140% at 0 0, color-mix(in srgb, ${pal.accent} 14%, transparent), transparent 60%), ${pal.head}` : shell.headerStyle === "minimal" ? pal.bg : pal.head;
  const headText = shell.headerStyle === "accent" ? "#fff" : pal.headText;
  const hidden = phone && !shell.showOnMobile;
  const scale = phone ? 1 : Math.min(1, 520 / shell.height);
  const cardStyle: CSSProperties = phone
    ? { inset: 0, borderRadius: 0, border: 0 }
    : { [side]: 16, bottom: 16 + launcherSize + 12 + (shell.launcherLabel ? 40 : 0), width: shell.width * scale, height: shell.height * scale, borderRadius: shell.radius, border: `${shell.border}px solid ${pal.line}`, boxShadow: shell.shadow };
  return <div className={phone ? "sxStage phone" : "sxStage"} data-dark={dark ? "true" : "false"}>
    <div className="sxFakeSite" aria-hidden="true"><i/><i/><i/><b/><b/><b/></div>
    {hidden ? <p className="sxHiddenNote">{locale === "en" ? "The card is hidden on phones" : "На телефонах карточка скрыта"}</p> : <>
      <div className="sxCard" style={{ ...cardStyle, fontFamily: shell.font, background: pal.bg }}>
        <div className="sxCardHead" style={{ background: headBg, color: headText, borderBottom: shell.headerStyle === "minimal" ? 0 : `1px solid ${pal.line}` }}>
          {shell.showAvatar && <span className="sxCardAvatar" style={{ borderRadius: radius(shell.avatarShape, 34), background: shell.headerStyle === "accent" ? "rgba(255,255,255,.22)" : pal.accent }}>{look.avatarUrl ? <img src={look.avatarUrl} alt=""/> : (look.title || employeeName).trim()[0]?.toUpperCase()}</span>}
          <span className="sxCardTitle"><b>{look.title || employeeName}</b>{shell.showStatus && <small style={{ color: shell.headerStyle === "accent" ? "rgba(255,255,255,.8)" : pal.text3 }}>{look.status || (locale === "en" ? "AI consultant · usually replies instantly" : "ИИ-консультант · обычно отвечает сразу")}</small>}</span>
          <span className="sxCardTools" style={{ color: headText }}><Monitor size={13}/><Smartphone size={13}/><Copy size={13}/></span>
        </div>
        <div className="sxCardBody"><WebsiteWidget key={`${sample ? "s" : "w"}${dark ? "d" : "l"}`} previewSample={sample} locale={locale === "en" ? "en" : "ru"} employeeId={employeeId} employeeName={employeeName} company={company} embedded preview previewDark={dark} theme={dark ? "dark" : "light"} look={look}/></div>
      </div>
      {!phone && <span className="sxLauncher" style={{ [side]: 16, width: launcherSize, height: launcherSize, borderRadius: radius(shell.launcherShape, launcherSize), background: pal.launcher, color: pal.launcherIcon, boxShadow: shell.shadow }}>
        {shell.launcherIcon === "avatar" && look.avatarUrl ? <img src={look.avatarUrl} alt=""/> : <LemiriGlyph size={Math.round(launcherSize * 0.42)}/>}
        {shell.launcherLabel && <em className={side} style={{ background: pal.bg, color: pal.text, borderColor: pal.line }}>{shell.launcherLabel}</em>}
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
