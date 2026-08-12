import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runtimeConfigurationErrors } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const configurationErrors = runtimeConfigurationErrors();
  if (configurationErrors.length) return NextResponse.json({ status: "unavailable", database: "unknown", configuration: "error", issueCount: configurationErrors.length }, { status: 503, headers: { "cache-control": "no-store" } });
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "ok", timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", database: "error" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
