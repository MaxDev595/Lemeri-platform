export type AIMessage = { role: "user" | "assistant"; content: string };
export type KnowledgeMatch = { id: string; content: string; sourceLabel: string; score: number };
export type AIActionRequest = { key: string; input: Record<string, unknown> };
export type GenerateInput = { employeeName: string; role: string; goal: string; tone: string; instructions?: string; handoffRules?: Record<string,unknown>; messages: AIMessage[]; knowledge: KnowledgeMatch[]; allowedActionKeys?: string[] };
export type GenerateResult = { text: string; confidence: number; usedSourceIds: string[]; handoffReason?: string; actionRequest?: AIActionRequest };

export interface AIProvider {
  readonly name: string;
  generateResponse(input: GenerateInput): Promise<GenerateResult>;
  streamResponse?(input: GenerateInput): AsyncIterable<string>;
  structuredOutput?<T>(input: GenerateInput, schemaName: string): Promise<T>;
}
