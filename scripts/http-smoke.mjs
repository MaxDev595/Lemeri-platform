const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";
const smokeDatabaseUrl = process.env.DATABASE_URL ?? "postgresql://lemiri:lemiri_dev_password@127.0.0.1:55432/lemiri?schema=public";
const smokeCronSecret = process.env.SMOKE_CRON_SECRET ?? "local-smoke-cron-secret-at-least-32-characters";
let cookie = "";

function absorbCookies(response) {
  const values = response.headers.getSetCookie?.() ?? [];
  if (values.length) cookie = values.map((value) => value.split(";", 1)[0]).join("; ");
}

function decodeHtml(value = "") {
  return value.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&#x27;", "'");
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  absorbCookies(response);
  return response;
}

const live = await request("/api/health/live");
if (!live.ok) throw new Error(`live failed: ${live.status}`);

const registerPage = await request("/register?lang=en");
const html = await registerPage.text();
const form = new FormData();
for (const match of html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) form.set(decodeHtml(match[1]), decodeHtml(match[2]));
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `http-smoke-${suffix}@lemiri.local`;
form.set("locale", "en");
form.set("name", "HTTP Smoke");
form.set("company", `HTTP Smoke ${suffix}`);
form.set("email", email);
form.set("password", "RuntimeSmokePassword123!");

const registered = await request("/register?lang=en", { method: "POST", headers: { origin: base, referer: `${base}/register?lang=en` }, body: form });
const registrationBody = await registered.text();
console.log(JSON.stringify({ step: "register", status: registered.status, location: registered.headers.get("location"), actionRedirect: registered.headers.get("x-action-redirect"), cookie: Boolean(cookie), bodyPrefix: registrationBody.slice(0, 80) }));

const onboarding = await request("/onboarding");
const onboardingBody = await onboarding.text();
console.log(JSON.stringify({ step: "onboarding", status: onboarding.status, location: onboarding.headers.get("location"), authenticated: onboardingBody.includes("onboarding") || onboardingBody.includes("Настрой") }));

const configuration = {
  locale: "en",
  name: "Lemiri Smoke",
  role: "SALES",
  goal: "Explain services, qualify customer interest and book consultations.",
  tone: "WARM_PROFESSIONAL",
  businessTemplate: "services",
  instructions: "Use only verified knowledge and hand off uncertain questions.",
  handoffUncertainty: "on",
  handoffComplaint: "on",
  handoffHumanRequested: "on",
  knowledgeTitle: "Consultation policy",
  knowledgeContent: "A consultation lasts 60 minutes and costs 5000 tenge. Appointments are available on weekdays.",
  websiteOrigin: base,
  crmWebhook: "",
};

const preview = await request("/api/onboarding/preview", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ configuration, question: "How long is a consultation?" }) });
const previewBody = await preview.json();
if (!preview.ok || !previewBody.testToken) throw new Error(`preview failed: ${preview.status} ${JSON.stringify(previewBody)}`);
console.log(JSON.stringify({ step: "preview", status: preview.status, provider: previewBody.provider, confidence: previewBody.confidence }));

const publishForm = new FormData();
for (const match of onboardingBody.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)) publishForm.set(decodeHtml(match[1]), decodeHtml(match[2]));
for (const [key, value] of Object.entries(configuration)) publishForm.set(key, value);
publishForm.set("testToken", previewBody.testToken);
publishForm.set("publish", "on");
const published = await request("/onboarding", { method: "POST", headers: { origin: base, referer: `${base}/onboarding` }, body: publishForm });
if (published.status !== 303 || published.headers.get("location") !== "/app") throw new Error(`publish failed: ${published.status} ${await published.text()}`);
console.log(JSON.stringify({ step: "publish", status: published.status, location: published.headers.get("location") }));

const employeesResponse = await request("/api/employees");
const employees = await employeesResponse.json();
const employee = employees[0];
if (!employeesResponse.ok || !employee || employee.status !== "ACTIVE") throw new Error(`employee failed: ${employeesResponse.status}`);

const jobs = await request("/api/internal/jobs/run", { method: "POST", headers: { authorization: `Bearer ${smokeCronSecret}` } });
if (!jobs.ok) throw new Error(`jobs failed: ${jobs.status} ${await jobs.text()}`);

const knowledge = await request("/api/knowledge/health");
const knowledgeBody = await knowledge.json();
console.log(JSON.stringify({ step: "knowledge", status: knowledge.status, health: knowledgeBody }));

const embed = await fetch(`${base}/api/widget/${employee.id}/embed.js`, { headers: { referer: `${base}/smoke-host` } });
const embedBody = await embed.text();
const token = embedBody.match(/token:"([^"]+)"/)?.[1];
if (!embed.ok || !token) throw new Error(`embed failed: ${embed.status}`);

const visitorId = `visitor-${suffix}`;
const widget = await fetch(`${base}/api/widget/${employee.id}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-lemiri-parent-origin": base, "x-lemiri-widget-token": token }, body: JSON.stringify({ visitorId, messageId: crypto.randomUUID(), name: "Widget Smoke", message: "How long is a consultation?" }) });
const widgetBody = await widget.json();
if (!widget.ok || !widgetBody.conversationId || !widgetBody.message) throw new Error(`widget failed: ${widget.status} ${JSON.stringify(widgetBody)}`);
console.log(JSON.stringify({ step: "widget", status: widget.status, handoff: widgetBody.handoff, confidence: widgetBody.confidence }));

const takeover = await request(`/api/conversations/${widgetBody.conversationId}/takeover`, { method: "POST", headers: { origin: base } });
if (!takeover.ok) throw new Error(`takeover failed: ${takeover.status} ${await takeover.text()}`);
const reply = await request(`/api/conversations/${widgetBody.conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ content: "A manager confirms your consultation request." }) });
if (reply.status !== 201) throw new Error(`reply failed: ${reply.status} ${await reply.text()}`);

const poll = await fetch(`${base}/api/widget/${employee.id}/messages?conversationId=${encodeURIComponent(widgetBody.conversationId)}&visitorId=${encodeURIComponent(visitorId)}`, { headers: { "x-lemiri-parent-origin": base, "x-lemiri-widget-token": token } });
const pollBody = await poll.json();
if (!poll.ok || !pollBody.messages.some((message) => message.content.includes("manager confirms"))) throw new Error(`poll failed: ${poll.status}`);

const leadResponse = await request("/api/leads", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name: "HTTP Lead", email: email, interest: "Consultation", stage: "QUALIFIED" }) });
const lead = await leadResponse.json();
if (leadResponse.status !== 201) throw new Error(`lead failed: ${leadResponse.status} ${JSON.stringify(lead)}`);
const appointmentResponse = await request("/api/appointments", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ customerId: lead.customerId, service: "Consultation", startsAt: new Date(Date.now() + 86400000).toISOString(), status: "CONFIRMED" }) });
if (appointmentResponse.status !== 201) throw new Error(`appointment failed: ${appointmentResponse.status} ${await appointmentResponse.text()}`);

const app = await request("/app");
if (!app.ok) throw new Error(`app failed: ${app.status}`);
console.log(JSON.stringify({ step: "manager", status: app.status, takeover: takeover.status, reply: reply.status, pollMessages: pollBody.messages.length, lead: leadResponse.status, appointment: appointmentResponse.status }));

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: smokeDatabaseUrl } } });
const smokeUser = await db.user.findUnique({ where: { email }, include: { memberships: true } });
for (const membership of smokeUser?.memberships ?? []) await db.workspace.delete({ where: { id: membership.workspaceId } });
if (smokeUser) await db.user.delete({ where: { id: smokeUser.id } });
await db.$disconnect();

console.log(JSON.stringify({ ok: true, cleanup: true, email }));
