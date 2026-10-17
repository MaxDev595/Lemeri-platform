// Platform settings shared by the landing page, the cabinet and the embed script:
// who is a Lemeri admin and where Lemeri's own assistant is shown. Kept tiny —
// it is imported by the embed route; provisioning lives in ./admin.ts.

import { db } from "@/lib/db";

import { normalizePlatformAssistant, DEFAULT_PLATFORM_ASSISTANT, type AssistantPlace, type PlatformAssistant } from "./access";
export * from "./access";

let ready: Promise<unknown> | undefined;
function ensureTable() {
  ready ??= db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PlatformSetting" ("key" TEXT PRIMARY KEY, "value" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(error => { ready = undefined; throw error; });
  return ready;
}

export async function readPlatformAssistant(): Promise<PlatformAssistant> {
  await ensureTable();
  const rows = await db.$queryRawUnsafe<Array<{ value: unknown; updatedAt: Date }>>(`SELECT "value", "updatedAt" FROM "PlatformSetting" WHERE "key" = 'assistant'`);
  const row = rows[0];
  if (!row) return DEFAULT_PLATFORM_ASSISTANT;
  return normalizePlatformAssistant(typeof row.value === "string" ? JSON.parse(row.value) : row.value, new Date(row.updatedAt).toISOString());
}

export async function savePlatformAssistant(patch: Partial<Omit<PlatformAssistant, "updatedAt">>) {
  const next = normalizePlatformAssistant({ ...(await readPlatformAssistant()), ...patch });
  const { updatedAt: _ignored, ...value } = next; void _ignored;
  await db.$executeRawUnsafe(`INSERT INTO "PlatformSetting" ("key", "value", "updatedAt") VALUES ('assistant', $1::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP`, JSON.stringify(value));
  return readPlatformAssistant();
}

/** The employee whose card is shown at a place, or null when switched off. */
export async function platformAssistantFor(place: AssistantPlace) {
  try {
    const settings = await readPlatformAssistant();
    return settings[place] && settings.employeeId ? settings.employeeId : null;
  } catch (error) {
    console.error("Platform assistant settings unavailable", error instanceof Error ? error.message : error);
    return null;
  }
}
