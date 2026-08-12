import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("CREDENTIALS_ENCRYPTION_KEY is required");
  return createHash("sha256").update(secret ?? "lemiri-development-key-change-me").digest();
}

export function encryptCredentials(value: unknown) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCredentials<T>(packed: string): T {
  const [version, ivValue, tagValue, dataValue] = packed.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !dataValue) throw new Error("Invalid encrypted credential payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataValue, "base64url")), decipher.final()]).toString("utf8")) as T;
}
