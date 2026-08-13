import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { selectActiveMembership } from "./workspace";
import { createDirectSession, getDirectSessionUser } from "@/lib/neon-direct";

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-lemiri_session" : "lemiri_session";
export const WORKSPACE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-lemiri_workspace" : "lemiri_workspace";
const SESSION_DAYS = 30;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
type SessionUser=Prisma.UserGetPayload<{include:{memberships:{include:{workspace:{include:{settings:true}}}}}}>;

export async function createSession(userId: string) {
  const source=await headers();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const ip=source.get("x-forwarded-for")?.split(",")[0]??source.get("x-real-ip")??"";
  const data={userId,tokenHash:tokenHash(token),expiresAt,ipHash:ip?createHash("sha256").update(ip).digest("hex"):null,userAgent:source.get("user-agent")?.slice(0,500)??null};
  if(process.env.NODE_ENV==="production")await createDirectSession(data);else{await db.session.deleteMany({where:{userId,expiresAt:{lt:new Date()}}});await db.session.create({data});}
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires: expiresAt, path: "/" });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  store.delete(COOKIE);
  store.delete(WORKSPACE_COOKIE);
}

export async function getSessionUser():Promise<SessionUser|null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  if(process.env.NODE_ENV==="production")return await getDirectSessionUser(tokenHash(token)) as SessionUser|null;
  const session = await db.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { include: { memberships: { include: { workspace: {include:{settings:true}} } } } } } });
  if (!session || session.expiresAt <= new Date()) return null;
  if(Date.now()-session.lastSeenAt.getTime()>5*60_000)void db.session.update({where:{id:session.id},data:{lastSeenAt:new Date()}}).catch(()=>undefined);
  return session.user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireWorkspace() {
  const user = await requireUser();
  const activeWorkspaceId=(await cookies()).get(WORKSPACE_COOKIE)?.value;
  const membership = selectActiveMembership(user.memberships,activeWorkspaceId);
  if (!membership) redirect("/onboarding");
  return { user, membership, workspace: membership.workspace };
}
