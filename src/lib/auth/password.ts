import { pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const PBKDF2_ITERATIONS = 210_000;
const KEY_BYTES = 32;
const pbkdf2Async = promisify(pbkdf2);

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], byte => Number.parseInt(byte, 16));
};

const constantTimeEqual = (actual: Uint8Array, expected: Uint8Array) => {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
};

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const derived = await pbkdf2Async(password, salt, iterations, KEY_BYTES, "sha256");
  return new Uint8Array(derived);
}

export async function hashPassword(password: string) {
  const salt = new Uint8Array(randomBytes(16));
  const derived = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256:${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(derived)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, first, second, third] = stored.split(":");

  if (algorithm === "pbkdf2-sha256") {
    const iterations = Number(first);
    const salt = fromHex(second ?? "");
    const expected = fromHex(third ?? "");
    if (!Number.isSafeInteger(iterations) || iterations < 100_000 || !salt || !expected) return false;
    const actual = await derivePbkdf2(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  }

  // Preserve access for accounts created before the Cloudflare migration.
  if (algorithm === "scrypt" && first && second) {
    const [{ scrypt }, { promisify }] = await Promise.all([
      import("node:crypto"),
      import("node:util"),
    ]);
    const expected = fromHex(second);
    if (!expected) return false;
    const actual = new Uint8Array(
      (await promisify(scrypt)(password, first, expected.length)) as ArrayBuffer,
    );
    return constantTimeEqual(actual, expected);
  }

  return false;
}
