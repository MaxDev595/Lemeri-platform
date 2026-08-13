import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { db } from "@/lib/db";
import { runtimeConfigurationErrors } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const configurationErrors = runtimeConfigurationErrors();
  const connectionString=process.env.DATABASE_URL?.trim();
  if (!connectionString) return NextResponse.json({ status: "unavailable", database: "unknown", configuration: "error", diagnostic: { code: "DATABASE_URL_MISSING" } }, { status: 503, headers: { "cache-control": "no-store" } });
  try {
    const sql=neon(connectionString);
    await sql.query("SELECT 1",[]);
  } catch(error) {
    const record=error&&typeof error==="object"?error as Record<string,unknown>:undefined;
    const diagnostic={name:error instanceof Error?error.name:"UnknownError",code:typeof record?.code==="string"?record.code:undefined,message:error instanceof Error?error.message.slice(0,500):undefined};
    console.error("Direct Neon readiness failed",error);
    return NextResponse.json({status:"unavailable",database:"error",databaseTransport:"neon-direct-http",stage:"direct-neon",diagnostic},{status:503,headers:{"cache-control":"no-store"}});
  }
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "ok", prisma:"ok", prismaRuntime:"workerd", databaseTransport: "neon-http", configuration: configurationErrors.length ? "partial" : "ok", issueCount: configurationErrors.length, timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const record=error&&typeof error==="object"?error as Record<string,unknown>:undefined;
    const cause=record?.cause&&typeof record.cause==="object"?record.cause as Record<string,unknown>:undefined;
    const sanitize=(value:string)=>value
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,"postgresql://[redacted]")
      .replace(/[A-Za-z0-9_-]{32,}/g,"[redacted]")
      .slice(0,800);
    const diagnostic={
      name:error instanceof Error?error.name:"UnknownError",
      code:typeof record?.code==="string"?record.code:undefined,
      kind:typeof cause?.kind==="string"?cause.kind:typeof record?.kind==="string"?record.kind:undefined,
      message:error instanceof Error?sanitize(error.message):undefined,
      stack:error instanceof Error&&error.stack?sanitize(error.stack.split("\n").slice(0,5).join("\n")):undefined,
    };
    console.error("Database readiness failed",error);
    return NextResponse.json({ status: "unavailable", database: "ok", prisma:"error", prismaRuntime:"workerd", databaseTransport: "neon-direct-http", stage:"prisma", diagnostic }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
