import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";
import { canWorkspace } from "@/lib/auth/permissions";
import { extractDocumentText, MAX_KNOWLEDGE_FILE_BYTES } from "@/lib/knowledge/documents";
import { chunkText } from "@/lib/knowledge/chunk";
import { enqueueJob } from "@/lib/jobs/queue";
import { createTranslator } from "@/lib/i18n";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!canWorkspace(auth.membership.role, "MANAGE_KNOWLEDGE")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return NextResponse.json({ error: "FILE_TOO_LARGE", maxBytes: MAX_KNOWLEDGE_FILE_BYTES }, { status: 413 });
  let content: string;
  try {
    content = await extractDocumentText(file.name, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DOCUMENT_PARSE_FAILED" }, { status: 422 });
  }
  const t=createTranslator(auth.locale);
  const item = await db.knowledgeSource.create({ data: { workspaceId: auth.workspaceId, title: file.name, type: "DOCUMENT", status: "PROCESSING", documents: { create: { title: file.name, content, chunks: { create: chunkText(content).map((part, index) => ({ content: part, sourceLabel: `${file.name} · ${t("server.fragment",{index:index+1})}` })) } } } }, include: { documents: true } });
  await enqueueJob(auth.workspaceId, "KNOWLEDGE_INDEX", { sourceId: item.id });
  return NextResponse.json(item, { status: 202 });
}
