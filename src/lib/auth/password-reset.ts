import { createHash, randomBytes } from "node:crypto";

export function createPasswordResetToken(){return randomBytes(32).toString("base64url")}
export function passwordResetTokenHash(token:string){return createHash("sha256").update(`lemiri-password-reset-v1:${token}`).digest("hex")}
