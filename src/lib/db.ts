import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";

// PrismaNeon uses Pool.query(). In Workers it must travel over Neon's HTTP
// transport; otherwise the driver attempts to open a socket and workerd throws
// ENOENT before the first query.
neonConfig.poolQueryViaFetch = true;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// Next/OpenNext import route modules while collecting build metadata. Do not
// require a live production secret during that import-only phase; the adapter
// opens no connection until a query is executed. Runtime configuration and the
// readiness endpoint still fail closed when DATABASE_URL is absent.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:5432/build";
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
