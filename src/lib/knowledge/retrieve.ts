import { db } from "@/lib/db";
import type { KnowledgeMatch } from "@/lib/ai/types";
import { configuredEmbeddingProvider } from "@/lib/ai/embeddings";
import { Prisma } from "@/generated/prisma/client";

const words = (value: string) => new Set(value.toLowerCase().match(/[a-zа-яё0-9]{3,}/gi) ?? []);
export async function retrieveKnowledge(workspaceId: string, query: string, limit = 5): Promise<KnowledgeMatch[]> {
  const provider = configuredEmbeddingProvider();
  if (provider) {
    try {
      const semantic = await semanticSearch(provider, workspaceId, query, limit);
      if (semantic.length) return semantic;
    } catch (error) {
      console.error("Semantic knowledge search failed, using lexical search", error instanceof Error ? error.message : error);
    }
  }
  return lexicalSearch(workspaceId, query, limit);
}

async function semanticSearch(provider: NonNullable<ReturnType<typeof configuredEmbeddingProvider>>, workspaceId: string, query: string, limit: number) {
    const [embedding] = await provider.embed([query]);
    const literal = `[${embedding.map(value => Number.isFinite(value) ? value : 0).join(",")}]`;
    const matches = await db.$queryRaw<KnowledgeMatch[]>(Prisma.sql`SELECT kc."id", kc."content", kc."sourceLabel", (1 - (kc."embedding" <=> ${literal}::vector))::float AS "score" FROM "KnowledgeChunk" kc JOIN "KnowledgeDocument" kd ON kd."id" = kc."documentId" JOIN "KnowledgeSource" ks ON ks."id" = kd."sourceId" WHERE ks."workspaceId" = ${workspaceId} AND ks."status" = 'READY' AND kc."embedding" IS NOT NULL ORDER BY kc."embedding" <=> ${literal}::vector LIMIT ${limit}`);
    return matches.filter(item => item.score >= 0.2);
}

// Also covers sources indexed before an embeddings key was configured (no vectors yet).
async function lexicalSearch(workspaceId: string, query: string, limit: number): Promise<KnowledgeMatch[]> {
  const queryWords = words(query);
  const chunks = await db.knowledgeChunk.findMany({ where: { document: { source: { workspaceId, status: "READY" } } }, take: 250 });
  return chunks.map(chunk => { const candidate = words(chunk.content); const overlap = [...queryWords].filter(word => candidate.has(word)).length; return { id: chunk.id, content: chunk.content, sourceLabel: chunk.sourceLabel, score: queryWords.size ? overlap / queryWords.size : 0 }; }).filter(item => item.score > 0).sort((a,b) => b.score-a.score).slice(0,limit);
}
