import { z } from "zod";

const responseSchema = z.object({ data: z.array(z.object({ index: z.number().int(), embedding: z.array(z.number()) })) });

export interface EmbeddingProvider { readonly name: string; embed(texts: string[]): Promise<number[][]> }

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai-embeddings";
  private readonly apiKey: string; private readonly model: string; private readonly fetcher: typeof fetch;
  constructor(apiKey: string, model: string, fetcher: typeof fetch = fetch) {
    if (!apiKey || !model) throw new Error("OpenAI embeddings require an API key and model");
    this.apiKey=apiKey;this.model=model;this.fetcher=fetcher;
  }
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const response = await this.fetcher("https://api.openai.com/v1/embeddings", { method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: this.model, input: texts, encoding_format: "float" }), signal: AbortSignal.timeout(45_000) });
    const raw: unknown = await response.json();
    if (!response.ok) throw new Error(`OpenAI Embeddings API failed (${response.status})`);
    return responseSchema.parse(raw).data.sort((a,b) => a.index-b.index).map(item => item.embedding);
  }
}

export function configuredEmbeddingProvider(): EmbeddingProvider | null {
  if (process.env.AI_PROVIDER !== "openai") return null;
  return new OpenAIEmbeddingProvider(process.env.OPENAI_API_KEY ?? "", process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small");
}
