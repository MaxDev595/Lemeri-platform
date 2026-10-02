// Kept apart from schema.ts so the big statement lists can load lazily (one copy in the Worker).
export type SchemaFailure = { statement: string; code: string; message: string };
/** Failures of the last attempt in this isolate — surfaced by /api/crm/health. */
export const schemaStatus: { applied: boolean; checkedAt: number; failures: SchemaFailure[] } = { applied: false, checkedAt: 0, failures: [] };
