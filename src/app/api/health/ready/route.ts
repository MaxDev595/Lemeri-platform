import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runtimeConfigurationErrors } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const configurationErrors = runtimeConfigurationErrors();
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ status: "unavailable", database: "unknown", configuration: "error", diagnostic: { code: "DATABASE_URL_MISSING" } }, { status: 503, headers: { "cache-control": "no-store" } });
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "ok", configuration: configurationErrors.length ? "partial" : "ok", issueCount: configurationErrors.length, timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const record=error&&typeof error==="object"?error as Record<string,unknown>:undefined;
    const cause=record?.cause&&typeof record.cause==="object"?record.cause as Record<string,unknown>:undefined;
    const diagnostic={
      name:error instanceof Error?error.name:"UnknownError",
      code:typeof record?.code==="string"?record.code:undefined,
      kind:typeof cause?.kind==="string"?cause.kind:typeof record?.kind==="string"?record.kind:undefined,
    };
    console.error("Database readiness failed",error);
    return NextResponse.json({ status: "unavailable", database: "error", diagnostic }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
