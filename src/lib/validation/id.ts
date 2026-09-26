import { z } from "zod";

// Records created through Prisma use cuid() ids, while the production Worker's
// direct Neon SQL paths (registration, onboarding) create UUIDs. Every API that
// receives an entity id must accept both formats.
export const entityId = z.string().min(20).max(64).regex(/^[A-Za-z0-9_-]+$/);
