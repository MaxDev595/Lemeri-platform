import { featureEnabled, FEATURE_DISABLED } from "@/lib/features";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiWorkspace } from "@/lib/auth/api";

export async function GET() {if(!featureEnabled("appointments"))return NextResponse.json(FEATURE_DISABLED,{status:404});
  const auth = await getApiWorkspace();
  if (!auth) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(await db.appointment.findMany({ where: { workspaceId: auth.workspaceId }, include: { customer: true }, orderBy: { startsAt: "asc" } }));
}

export async function POST(request: Request) {if(!featureEnabled("appointments"))return NextResponse.json(FEATURE_DISABLED,{status:404});
  void request;
  return NextResponse.json({ error: "AI_MANAGED_RESOURCE" }, { status: 405, headers: { Allow: "GET" } });
}
