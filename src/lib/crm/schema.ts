import { CRM_SCHEMA_STATEMENTS, CRM_SCHEMA_VERSION } from "./schema-sql";

type RawExecutor = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

// Error codes that mean "somebody (another isolate) already created it".
const ALREADY_EXISTS = new Set(["42P07", "42701", "42710", "23505", "42P16"]);
function errorCode(error: unknown) {
  const value = error as { code?: string; meta?: { code?: string }; cause?: { code?: string } };
  return value?.code ?? value?.meta?.code ?? value?.cause?.code ?? "";
}

/**
 * Applies the additive CRM schema once per database. Every statement is
 * idempotent (IF NOT EXISTS), nothing is ever dropped, and a marker row makes
 * later isolates skip the work after a single cheap lookup.
 */
export async function applyCrmSchema(db: RawExecutor) {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_lemiri_schema" ("version" TEXT NOT NULL PRIMARY KEY, "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(error => { if (!ALREADY_EXISTS.has(errorCode(error))) throw error; });
  const done = await db.$queryRawUnsafe<Array<{ version: string }>>(`SELECT "version" FROM "_lemiri_schema" WHERE "version" = $1`, CRM_SCHEMA_VERSION);
  if (done.length) return false;
  for (const statement of CRM_SCHEMA_STATEMENTS) {
    try { await db.$executeRawUnsafe(statement); }
    catch (error) {
      const code = errorCode(error), message = error instanceof Error ? error.message : String(error);
      if (!ALREADY_EXISTS.has(code) && !/already exists/i.test(message)) throw error;
    }
  }
  await db.$executeRawUnsafe(`INSERT INTO "_lemiri_schema" ("version") VALUES ($1) ON CONFLICT ("version") DO NOTHING`, CRM_SCHEMA_VERSION);
  return true;
}
