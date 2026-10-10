import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit, requestIp } from "@/lib/security/request";
import { verifyWidgetToken } from "@/lib/security/widget-token";
import { getWorkspaceTranslator } from "@/lib/workspace-locale";
import { saveLeadDetails } from "@/lib/actions/registry";
import { enqueueCrmEvent } from "@/lib/integrations/queue";
import { featureEnabled } from "@/lib/features";

// «Leave a request» form inside the website card. Works whatever the AI state is
// (including a paused plan), so a visitor can always reach the business.
// The visitor must tick the consent box; its text and time are stored on the request.
const schema = z.object({
  visitorId: z.string().min(8).max(128),
  conversationId: z.string().max(64).nullish(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).regex(/^[+\d\s()-]*$/).optional().default(""),
  email: z.string().trim().toLowerCase().max(200).optional().default(""),
  interest: z.string().trim().max(200).optional().default(""),
  budget: z.string().trim().max(120).optional().default(""),
  comment: z.string().trim().max(1000).optional().default(""),
  page: z.string().trim().max(500).optional().default(""),
  consent: z.literal(true),
  consentText: z.string().trim().min(10).max(600),
}).refine(v => v.phone.replace(/\D/g, "").length >= 5 || z.string().email().safeParse(v.email).success, { message: "CONTACT_REQUIRED", path: ["phone"] });

export async function POST(request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const contact = parsed.error.issues.some(issue => issue.message === "CONTACT_REQUIRED");
    const consent = parsed.error.issues.some(issue => issue.path[0] === "consent");
    return NextResponse.json({ error: consent ? "CONSENT_REQUIRED" : contact ? "CONTACT_REQUIRED" : "INVALID_REQUEST" }, { status: 400 });
  }
  const input = parsed.data;
  const limited = await checkRateLimit("widget:lead", `${requestIp(request.headers)}:${input.visitorId}`, 5, 600);
  if (!limited.allowed) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(limited.retryAfter) } });
  const { employeeId } = await params;
  const employee = await db.aIEmployee.findFirst({ where: { id: employeeId, status: "ACTIVE" }, select: { id: true, workspaceId: true } });
  if (!employee) return NextResponse.json({ error: "EMPLOYEE_UNAVAILABLE" }, { status: 404 });
  let origin = "";
  try { origin = new URL(request.headers.get("x-lemiri-parent-origin") ?? "").origin; } catch { /* invalid origins never authenticate */ }
  const signed = Boolean(origin && verifyWidgetToken(request.headers.get("x-lemiri-widget-token") ?? "", employeeId, origin));
  const member = signed ? false : Boolean((await getSessionUser())?.memberships.some(item => item.workspaceId === employee.workspaceId));
  if (!signed && !member) return NextResponse.json({ error: "WIDGET_AUTH_REQUIRED" }, { status: 403 });

  const workspaceId = employee.workspaceId;
  const externalId = `widget:${employeeId}:${input.visitorId}`;
  const contact = { name: input.name, ...(input.phone ? { phone: input.phone } : {}), ...(input.email ? { email: input.email } : {}) };
  const customer = await db.customer.upsert({ where: { workspaceId_externalId: { workspaceId, externalId } }, create: { workspaceId, externalId, source: "WEBSITE", lastActivityAt: new Date(), ...contact }, update: { lastActivityAt: new Date(), ...contact } });
  const interest = [input.interest || (input.comment ? input.comment.slice(0, 120) : ""), input.budget ? `бюджет: ${input.budget}` : ""].filter(Boolean).join(" · ").slice(0, 200) || null;
  const lead = await db.lead.create({ data: { workspaceId, customerId: customer.id, interest, stage: "NEW" } });
  await saveLeadDetails(customer.id, { budget: input.budget || undefined, details: input.comment || undefined, source: "widget_form", consentAt: new Date().toISOString(), consentText: input.consentText, page: input.page || undefined }, lead.id);
  const { t } = await getWorkspaceTranslator(workspaceId);
  // The request also appears in the visitor's conversation, so the dialog shows the full story.
  const conversation = input.conversationId ? await db.conversation.findFirst({ where: { id: input.conversationId, workspaceId, externalId }, select: { id: true } }) : null;
  const summary = [`📝 ${input.name}`, input.phone, input.email, input.interest, input.budget && `💰 ${input.budget}`, input.comment].filter(Boolean).join(" · ");
  await Promise.all([
    conversation ? db.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", content: summary.slice(0, 4000), sources: { kind: "LEAD_FORM", leadId: lead.id } } }) : Promise.resolve(null),
    db.notification.create({ data: { workspaceId, type: "LEAD", title: t("server.newLeadTitle", { name: input.name }).slice(0, 120), body: summary.slice(0, 1000) } }),
    db.analyticsEvent.create({ data: { workspaceId, type: "LEAD_CREATED", payload: { leadId: lead.id, source: "WIDGET_FORM", channelType: "WEBSITE" } } }),
  ]);
  if (featureEnabled("integrations")) await enqueueCrmEvent(workspaceId, "lead.created", { ...lead, customer }).catch(() => undefined);
  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
}
