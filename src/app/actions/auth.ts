"use server";

import { Prisma } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { guardServerAction } from "@/lib/security/request";
import { createPasswordResetToken, passwordResetTokenHash } from "@/lib/auth/password-reset";
import { ResendEmailProvider } from "@/lib/email/provider";
import { z } from "zod";
import { createTranslator, type Locale } from "@/lib/i18n";
import { safeReturnTo } from "@/lib/locale-utils";
import { createRegisteredUser, getDirectUserByEmail } from "@/lib/neon-direct";
import { isUniqueConstraintError } from "@/lib/db-errors";

export type AuthState = { error?: string; message?: string };
const formLocale=(formData:FormData):Locale=>formData.get("locale")==="en"?"en":"ru";

function registrationFailure(locale: Locale, error: unknown, phase: "rate-limit" | "password" | "create" | "session") {
  if (!process.env.DATABASE_URL) {
    return locale === "ru"
      ? "База данных не подключена к Worker (код REG-CONFIG)."
      : "The database is not connected to the Worker (code REG-CONFIG).";
  }
  const prismaCode =
    error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  const record=error&&typeof error==="object"?error as Record<string,unknown>:undefined;
  const cause=record?.cause&&typeof record.cause==="object"?record.cause as Record<string,unknown>:undefined;
  const adapterKind=typeof cause?.kind==="string"?cause.kind:typeof record?.kind==="string"?record.kind:undefined;
  const message=error instanceof Error?error.message:"";
  const driverCategory=adapterKind?.replace(/[^A-Z]/gi,"").slice(0,28).toUpperCase()??(/auth|password|credential/i.test(message)?"AUTH":/tls|ssl|certificate/i.test(message)?"TLS":/socket|connect|network|enoent|timeout/i.test(message)?"SOCKET":/table|relation.*does not exist/i.test(message)?"TABLE":/transaction|begin/i.test(message)?"TRANSACTION":error instanceof Error?error.name.replace(/[^A-Z]/gi,"").slice(0,20).toUpperCase():"UNKNOWN");
  const detail=prismaCode??driverCategory;
  const code = `REG-${phase === "rate-limit" ? "RATE" : phase === "password" ? "PASSWORD" : phase === "create" ? "DB" : "SESSION"}-${detail}`;
  return locale === "ru"
    ? `Не удалось завершить регистрацию (код ${code}).`
    : `Registration could not be completed (code ${code}).`;
}

export async function register(_: AuthState, formData: FormData): Promise<AuthState> {
  const locale=formLocale(formData);const t=createTranslator(locale);
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t("auth.checkData") };
  const { name, email, password, company } = parsed.data;
  let phase: "rate-limit" | "password" | "create" | "session" = "rate-limit";
  try {
    if(!(await guardServerAction("auth:register",5,15*60)).allowed)return{error:t("auth.rateLimited")};
    phase = "password";
    const passwordHash = await hashPassword(password);
    phase = "create";
    // Nested writes are atomic. Avoid interactive transactions because edge
    // PostgreSQL connections may reject transaction pinning.
    const user = process.env.NODE_ENV==="production"?await createRegisteredUser({name,email,passwordHash,company,slug:`${company.toLowerCase().replace(/[^a-zР°-СЏ0-9]+/gi, "-")}-${crypto.randomUUID().slice(0, 6)}`,locale}):await db.user.create({
      data: {
        name, email, passwordHash,
        memberships: { create: { role: "OWNER", workspace: { create: { name: company, slug: `${company.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-")}-${crypto.randomUUID().slice(0, 6)}`,settings:{create:{locale}} } } } },
      },
    });
    phase = "session";
    await createSession(user.id);
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: t("auth.accountExists") };
    console.error("Registration failed",error);
    return { error: registrationFailure(locale, error, phase) };
  }
  redirect("/onboarding");
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const t=createTranslator(formLocale(formData));
  if(!(await guardServerAction("auth:login",10,15*60)).allowed)return{error:t("auth.rateLimited")};
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t("auth.checkCredentials") };
  const user = process.env.NODE_ENV==="production"
    ? await getDirectUserByEmail(parsed.data.email)
    : await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return { error: t("auth.accountNotFound") };
  let passwordValid=false;
  try{passwordValid=await verifyPassword(parsed.data.password,user.passwordHash)}catch(error){console.error("Login password verification failed",error);return{error:t("auth.loginTemporarilyUnavailable")}}
  if (!passwordValid) return { error: t("auth.invalidCredentials") };
  await createSession(user.id);
  redirect(safeReturnTo(formData.get("returnTo"))??"/app");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const emailSchema=z.string().trim().toLowerCase().email();
const resetSchema=z.object({token:z.string().min(32).max(256),password:z.string().min(10).max(128),confirmPassword:z.string()}).refine(value=>value.password===value.confirmPassword,{message:"Пароли не совпадают",path:["confirmPassword"]});

export async function requestPasswordReset(_:AuthState,formData:FormData):Promise<AuthState>{
  const locale=formLocale(formData);const t=createTranslator(locale);
  if(!(await guardServerAction("auth:forgot-password",5,15*60)).allowed)return{error:t("auth.rateLimited")};
  const email=emailSchema.safeParse(formData.get("email"));if(!email.success)return{error:t("auth.invalidEmail")};
  const user=await db.user.findUnique({where:{email:email.data}});
  if(user){const token=createPasswordResetToken();const tokenHash=passwordResetTokenHash(token);const expiresAt=new Date(Date.now()+60*60_000);await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lemiri:password-reset:${user.id}`}, 0))`;await tx.passwordResetToken.deleteMany({where:{userId:user.id}});await tx.passwordResetToken.create({data:{userId:user.id,tokenHash,expiresAt}})});const url=`${process.env.PUBLIC_APP_URL??"http://localhost:3000"}/reset-password/${token}?lang=${locale}`;try{await new ResendEmailProvider().send({to:user.email,subject:t("auth.resetSubject"),html:`<p>${t("auth.resetRequested")}</p><p><a href="${url}">${t("auth.resetCta")}</a></p><p>${t("auth.resetExpiry")}</p>`,idempotencyKey:`password-reset-${tokenHash.slice(0,24)}`})}catch{await db.passwordResetToken.deleteMany({where:{tokenHash}})}}
  return{message:t("auth.resetSent")};
}

export async function resetPassword(_:AuthState,formData:FormData):Promise<AuthState>{
  const t=createTranslator(formLocale(formData));
  if(!(await guardServerAction("auth:reset-password",8,15*60)).allowed)return{error:t("auth.rateLimited")};
  const parsed=resetSchema.safeParse(Object.fromEntries(formData));if(!parsed.success)return{error:formData.get("password")!==formData.get("confirmPassword")?t("auth.passwordMismatch"):t("auth.checkData")};
  const tokenHash=passwordResetTokenHash(parsed.data.token);const passwordHash=await hashPassword(parsed.data.password);const userId=await db.$transaction(async tx=>{const consumed=await tx.$queryRaw<Array<{userId:string}>>`DELETE FROM "PasswordResetToken" WHERE "tokenHash"=${tokenHash} AND "expiresAt">CURRENT_TIMESTAMP RETURNING "userId"`;const id=consumed[0]?.userId;if(!id)return null;await tx.user.update({where:{id},data:{passwordHash}});await tx.session.deleteMany({where:{userId:id}});await tx.passwordResetToken.deleteMany({where:{userId:id}});return id});if(!userId)return{error:t("auth.invalidResetLink")};
  await createSession(userId);redirect("/app");
}
