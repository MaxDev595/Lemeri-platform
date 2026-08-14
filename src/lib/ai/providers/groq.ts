import { z } from "zod";
import type { AIProvider, GenerateInput, GenerateResult } from "../types";

const outputSchema = z.object({
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  usedSourceIds: z.array(z.string()),
  handoffReason: z.string().min(1).nullable(),
  actionRequest: z.object({ key: z.string(), input: z.record(z.unknown()) }).nullable().optional(),
});

type GroqResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export class GroqProvider implements AIProvider {
  readonly name = "groq-chat-completions";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, model = "openai/gpt-oss-120b", fetcher: typeof fetch = fetch) {
    if (!apiKey || !model) throw new Error("Groq provider requires GROQ_API_KEY and GROQ_CHAT_MODEL");
    this.apiKey = apiKey;
    this.model = model;
    this.fetcher = fetcher;
  }

  async generateResponse(input: GenerateInput): Promise<GenerateResult> {
    const allowedSourceIds = new Set(input.knowledge.map(item => item.id));
    const knowledge = input.knowledge.map(item => `[${item.id}] ${item.sourceLabel}\n${item.content}`).join("\n\n");
    const allowedActions = input.allowedActionKeys ?? [];
    const actionProperties = { interest:{anyOf:[{type:"string"},{type:"null"}]}, stage:{anyOf:[{type:"string"},{type:"null"}]}, service:{anyOf:[{type:"string"},{type:"null"}]}, startsAt:{anyOf:[{type:"string"},{type:"null"}]}, title:{anyOf:[{type:"string"},{type:"null"}]}, body:{anyOf:[{type:"string"},{type:"null"}]}, reason:{anyOf:[{type:"string"},{type:"null"}]}, summary:{anyOf:[{type:"string"},{type:"null"}]} };
    const actionRequestSchema = allowedActions.length ? { anyOf:[{type:"object",additionalProperties:false,properties:{key:{type:"string",enum:allowedActions},input:{type:"object",additionalProperties:false,properties:actionProperties,required:Object.keys(actionProperties)}},required:["key","input"]},{type:"null"}] } : { type:"null" };
    const system = `You are ${input.employeeName}, a ${input.role}. Goal: ${input.goal}. Tone: ${input.tone}. Business instructions: ${input.instructions || "No additional instructions."}. Handoff rules: ${JSON.stringify(input.handoffRules ?? {})}. Follow business instructions unless they conflict with these safety rules. Answer factual questions only from supplied knowledge. If the answer is not supported, or an enabled handoff rule applies, request human handoff. Never invent prices, dates, policies, or source ids. You may request at most one explicitly allowed action after the customer has supplied and confirmed every required value. Allowed actions: ${allowedActions.join(", ") || "none"}. Never claim that an action succeeded; say that you are processing it. Use null for unused action input fields.`;
    const response = await this.fetcher("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          ...input.messages,
          { role: "user", content: `VERIFIED KNOWLEDGE:\n${knowledge || "No verified knowledge available."}` },
        ],
        temperature: 1,
        max_completion_tokens: 2048,
        top_p: 1,
        reasoning_effort: "medium",
        stream: false,
        response_format: { type: "json_schema", json_schema: { name: "lemiri_answer", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: {
            text: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 },
            usedSourceIds: { type: "array", items: { type: "string" } },
            handoffReason: { anyOf: [{ type: "string" }, { type: "null" }] },
            actionRequest: actionRequestSchema,
          }, required: ["text", "confidence", "usedSourceIds", "handoffReason", "actionRequest"],
        } } },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json() as GroqResponse;
    if (!response.ok) throw new Error(`Groq Chat Completions API failed (${response.status}): ${body.error?.message ?? "unknown error"}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned an empty response");
    const parsed = outputSchema.parse(JSON.parse(content));
    const usedSourceIds = parsed.usedSourceIds.filter(id => allowedSourceIds.has(id));
    if (parsed.usedSourceIds.length !== usedSourceIds.length) throw new Error("Model returned an unknown knowledge source id");
    if (parsed.actionRequest && !allowedActions.includes(parsed.actionRequest.key)) throw new Error("Model requested a disallowed action");
    const actionRequest = parsed.actionRequest ? { key:parsed.actionRequest.key, input:Object.fromEntries(Object.entries(parsed.actionRequest.input).filter(([,value]) => value !== null)) } : undefined;
    return { text:parsed.text, confidence:parsed.confidence, usedSourceIds, handoffReason:parsed.handoffReason ?? undefined, actionRequest };
  }
}
