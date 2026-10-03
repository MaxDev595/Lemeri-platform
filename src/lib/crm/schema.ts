import { CRM_SCHEMA_STATEMENTS } from "./schema-sql";
import { TEAM_SCHEMA_STATEMENTS } from "@/lib/team/schema-sql";
import { schemaStatus, type SchemaFailure } from "./schema-status";
export { schemaStatus };

// Bumped from crm-1: databases that already had tables named like the CRM's
// (from an earlier experiment) kept their old shape, because CREATE TABLE IF NOT
// EXISTS skipped them. The reconcile pass below brings such tables in line.
export const CRM_SCHEMA_VERSION = "crm-3";

/**
 * For every CRM table: add any missing column (nullable when it has no default,
 * so it works on tables that already hold rows) and relax NOT NULL on leftover
 * columns the CRM doesn't know about, so inserts don't fail on them.
 */
function reconcileStatements() {
  const out: string[] = [];
  for (const statement of CRM_SCHEMA_STATEMENTS) {
    const match = statement.match(/^CREATE TABLE IF NOT EXISTS "(\w+)" \((.*)\)$/s);
    if (!match) continue;
    const [, table, body] = match;
    const columns = body.split(/, (?="|CONSTRAINT )/).filter(part => !part.startsWith("CONSTRAINT"));
    const known: string[] = [];
    for (const def of columns) {
      const name = def.match(/^"(\w+)"/)?.[1];
      if (!name) continue;
      known.push(name);
      if (name === "id") continue;
      const hasDefault = /\bDEFAULT\b/.test(def);
      const column = hasDefault ? def : def.replace(/\s+NOT NULL\b/, "");
      out.push(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS ${column}`);
    }
    const list = known.map(name => `'${name}'`).join(",");
    out.push(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = '${table}' AND is_nullable = 'NO' AND column_default IS NULL AND column_name NOT IN (${list}) LOOP EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', '${table}', r.column_name); END LOOP; END $$`);
  }
  return out;
}

/** Tables first, then reconcile, then indexes and foreign keys. */
function allStatements() {
  const creates = CRM_SCHEMA_STATEMENTS.filter(s => /^(ALTER TABLE "\w+" ADD COLUMN|CREATE TABLE)/.test(s));
  const rest = CRM_SCHEMA_STATEMENTS.filter(s => !creates.includes(s));
  return [...creates, ...reconcileStatements(), ...rest, ...TEAM_SCHEMA_STATEMENTS];
}

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
 *
 * A statement that fails for another reason (for example a foreign key whose
 * column types differ in an older database) no longer aborts the rest: the
 * tables and columns the CRM needs are still created, the failure is recorded,
 * and the marker is written only once everything succeeded.
 */
const APPLY_FUNCTION = `CREATE OR REPLACE FUNCTION "_lemiri_apply_schema"(statements text)
RETURNS TABLE ("idx" integer, "code" text, "message" text) LANGUAGE plpgsql AS $fn$
DECLARE s text; i integer := 0;
BEGIN
  FOR s IN SELECT value FROM jsonb_array_elements_text(statements::jsonb) LOOP
    BEGIN
      EXECUTE s;
    EXCEPTION WHEN others THEN
      idx := i; code := SQLSTATE; message := SQLERRM; RETURN NEXT;
    END;
    i := i + 1;
  END LOOP;
END
$fn$`;

export async function applyCrmSchema(db: RawExecutor) {
  schemaStatus.checkedAt = Date.now();
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_lemiri_schema" ("version" TEXT NOT NULL PRIMARY KEY, "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(error => { if (!ALREADY_EXISTS.has(errorCode(error))) throw error; });
  const done = await db.$queryRawUnsafe<Array<{ version: string }>>(`SELECT "version" FROM "_lemiri_schema" WHERE "version" = $1`, CRM_SCHEMA_VERSION);
  if (done.length) { schemaStatus.applied = true; schemaStatus.failures = []; return false; }
  // One round trip for the whole schema. Cloudflare Workers allow only 50
  // subrequests per invocation on the free plan and every Neon HTTP query is one,
  // so running ~160 statements one by one failed with "Too many subrequests".
  // A server-side function runs each statement in its own sub-transaction and
  // returns only the failures.
  const statements = allStatements();
  // Two isolates may race on CREATE OR REPLACE; the call below still works then.
  await db.$executeRawUnsafe(APPLY_FUNCTION).catch(error => console.warn("schema function", errorCode(error)));
  const rows = await db.$queryRawUnsafe<Array<{ idx: number; code: string; message: string }>>(`SELECT "idx", "code", "message" FROM "_lemiri_apply_schema"($1::text)`, JSON.stringify(statements));
  const failures: SchemaFailure[] = [];
  for (const row of rows) {
    const statement = statements[Number(row.idx)] ?? "";
    const code = row.code ?? "", message = row.message ?? "";
    if (ALREADY_EXISTS.has(code) || /already exists/i.test(message)) continue;
    failures.push({ statement: statement.replace(/\s+/g, " ").slice(0, 160), code, message: message.slice(0, 400) });
    console.error("CRM schema statement failed", code, message.slice(0, 300));
  }
  schemaStatus.failures = failures;
  // Foreign keys and indexes are nice-to-have (old rows may violate them); tables and
  // columns are what queries need. Only a failure there keeps the schema "unapplied".
  const optional = (f: SchemaFailure) => /^(DO \$\$ BEGIN IF NOT EXISTS \(SELECT 1 FROM pg_constraint|CREATE (UNIQUE )?INDEX)/.test(f.statement);
  if (failures.some(f => !optional(f))) return false;
  await db.$executeRawUnsafe(`INSERT INTO "_lemiri_schema" ("version") VALUES ($1) ON CONFLICT ("version") DO NOTHING`, CRM_SCHEMA_VERSION);
  schemaStatus.applied = true;
  return true;
}