import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { configuredEmbeddingProvider } from "@/lib/ai/embeddings";

const vectorLiteral = (values: number[]) => `[${values.map(value => Number.isFinite(value) ? value : 0).join(",")}]`;

export async function indexKnowledgeSource(workspaceId: string, sourceId: string) {
  const source = await db.knowledgeSource.findFirst({ where: { id: sourceId, workspaceId }, include: { documents: { include: { chunks: true } } } });
  if (!source) throw new Error("Knowledge source not found");
  const provider = configuredEmbeddingProvider();
  if (!provider) {
    await db.knowledgeSource.update({ where: { id: sourceId }, data: { status: "READY" } });
    return { indexed: 0, mode: "lexical" as const };
  }
  const chunks = source.documents.flatMap(document => document.chunks);
  try {
    await db.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector`;
    let indexed = 0;
    for (let offset = 0; offset < chunks.length; offset += 64) {
      const batch = chunks.slice(offset, offset + 64);
      const vectors = await provider.embed(batch.map(chunk => chunk.content));
      if (vectors.length !== batch.length) throw new Error("Embedding count does not match chunk count");
      for (let index = 0; index < batch.length; index++) await db.$executeRaw(Prisma.sql`UPDATE "KnowledgeChunk" SET "embedding" = ${vectorLiteral(vectors[index])}::vector WHERE "id" = ${batch[index].id}`);
      indexed += batch.length;
    }
    await db.knowledgeSource.update({ where: { id: sourceId }, data: { status: "READY" } });
    return { indexed, mode: "semantic" as const };
  } catch (error) {
    await db.knowledgeSource.update({ where: { id: sourceId }, data: { status: "FAILED" } });
    throw error;
  }
}
