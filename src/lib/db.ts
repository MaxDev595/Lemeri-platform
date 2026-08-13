import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon, PrismaNeonHTTP } from "@prisma/adapter-neon";

// Turbopack's WASM loader uses compileStreaming, while workerd currently only
// exposes compile. Install the equivalent fallback before Prisma compiles its
// query compiler. Keeping this local avoids patching OpenNext's worker runtime.
if (typeof WebAssembly.compileStreaming !== "function") {
  Object.defineProperty(WebAssembly, "compileStreaming", {
    configurable: true,
    value: async (source: Response | PromiseLike<Response>) => {
      const response = await source;
      return WebAssembly.compile(await response.arrayBuffer());
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// Next/OpenNext import route modules while collecting build metadata. Do not
// require a live production secret during that import-only phase; the adapter
// opens no connection until a query is executed. Runtime configuration and the
// readiness endpoint still fail closed when DATABASE_URL is absent.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:5432/build";

const createTransactionClient = () =>
  new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

// Use Neon's stateless HTTP transport for every ordinary query in production.
// This bypasses Node sockets and WebSocket pools entirely on the registration
// and readiness paths. Explicit Prisma transactions are routed separately to
// PrismaNeon, because the HTTP adapter intentionally cannot hold a transaction.
const createHttpClient = () =>
  new PrismaClient({ adapter: new PrismaNeonHTTP(connectionString, {}) });

// A Cloudflare Worker must not reuse sockets/pools that were created for a
// different request. Keep the convenient singleton in local development, but
// resolve a fresh client for every top-level database operation in production.
// The returned delegate/method retains its client, so transactions and model
// queries execute on one adapter for the duration of that operation.
const developmentClient =
  process.env.NODE_ENV !== "production"
    ? (globalForPrisma.prisma ??= createTransactionClient())
    : undefined;

export const db: PrismaClient =
  developmentClient ??
  new Proxy({} as PrismaClient, {
    get(_target, property) {
      const client =
        property === "$transaction"
          ? createTransactionClient()
          : createHttpClient();
      const value = Reflect.get(client, property, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
