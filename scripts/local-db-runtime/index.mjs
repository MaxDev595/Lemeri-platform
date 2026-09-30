// Local development database without installing PostgreSQL.
// Runs a real Postgres (PGlite, WebAssembly) on 127.0.0.1:5433 and keeps the
// data in .local-db/. The first start creates all tables from prisma/migrations.
//   node scripts/local-db.mjs (from the project root)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const dataDir = join(process.cwd(), ".local-db");
const fresh = !existsSync(dataDir);
const db = await PGlite.create(dataDir, { extensions: { vector, pgcrypto } });

await db.exec(`CREATE TABLE IF NOT EXISTS "_local_migrations" (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`);
const done = new Set((await db.query(`SELECT name FROM "_local_migrations"`)).rows.map(row => row.name));
const dir = join(process.cwd(), "prisma", "migrations");
for (const name of readdirSync(dir).filter(item => /^\d+_/.test(item)).sort()) {
  if (done.has(name)) continue;
  process.stdout.write(`Применяю миграцию ${name}… `);
  await db.exec(readFileSync(join(dir, name, "migration.sql"), "utf8"));
  await db.query(`INSERT INTO "_local_migrations"(name) VALUES ($1)`, [name]);
  console.log("ok");
}

const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`${fresh ? "Создана новая" : "Открыта"} локальная база: postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log("Не закрывайте это окно, пока работает сайт.");
const stop = async () => { await server.stop(); await db.close(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
