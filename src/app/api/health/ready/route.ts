import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
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
  return NextResponse.json({
    status: "ready",
    database: "ok",
    databaseTransport: "neon-direct-http",
    prisma: "bypassed",
    prismaRuntime: "workerd",
    configuration: configurationErrors.length ? "partial" : "ok",
    issueCount: configurationErrors.length,
    timestamp: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
