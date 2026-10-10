import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { extractDocumentText, MAX_KNOWLEDGE_FILE_BYTES } from "@/lib/knowledge/documents";
import { chunkText } from "@/lib/knowledge/chunk";
import { enqueueJob } from "@/lib/jobs/queue";
import { drainJobsAfterResponse } from "@/lib/jobs/kick";
import { createTranslator } from "@/lib/i18n";
import { workspaceAccess } from "@/lib/billing/access";
import { planAllows, planNumber, planRequired } from "@/lib/billing/features";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "MANAGE_KNOWLEDGE")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const access = await workspaceAccess(auth.workspaceId);
  if (!planAllows(access, "documents")) return NextResponse.json(planRequired("documents"), { status: 402 });
  if (await db.knowledgeSource.count({ where: { workspaceId: auth.workspaceId } }) >= planNumber(access, "knowledgeSources")) return NextResponse.json({ ...planRequired("knowledgeSources"), plan: "STARTER", limit: planNumber(access, "knowledgeSources") }, { status: 402 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return NextResponse.json({ error: "FILE_TOO_LARGE", maxBytes: MAX_KNOWLEDGE_FILE_BYTES }, { status: 413 });
  let content: string;
  try {
    const clientText = form.get("text");
    content = await extractDocumentText(file.name, Buffer.from(await file.arrayBuffer()), typeof clientText === "string" ? clientText : null);
  } catch (error) {
    console.error("Document parsing failed", file.name, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "DOCUMENT_PARSE_FAILED" }, { status: 422 });
  }
  const t=createTranslator(auth.locale);
  const item = await db.knowledgeSource.create({ data: { workspaceId: auth.workspaceId, title: file.name, type: "DOCUMENT", status: "PROCESSING", documents: { create: { title: file.name, content, chunks: { create: chunkText(content).map((part, index) => ({ content: part, sourceLabel: `${file.name} · ${t("server.fragment",{index:index+1})}` })) } } } }, include: { documents: true } });
  await enqueueJob(auth.workspaceId, "KNOWLEDGE_INDEX", { sourceId: item.id });
  drainJobsAfterResponse();
  return NextResponse.json(item, { status: 202 });
}
