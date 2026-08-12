import { z } from "zod";
import type { AIProvider, GenerateInput, GenerateResult } from "../types";

const outputSchema = z.object({
  text: z.string().min(1),
  confidence: z.number().min(0).max(1),
  usedSourceIds: z.array(z.string()),
  handoffReason: z.string().min(1).nullable(),
  actionRequest: z.object({ key: z.string(), input: z.record(z.unknown()) }).nullable().optional(),
});

type OpenAIResponse = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

export function responseOutputText(value: OpenAIResponse): string {
  return value.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text ?? "";
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai-responses";
  private readonly apiKey: string; private readonly model: string; private readonly fetcher: typeof fetch;
  constructor(apiKey: string, model: string, fetcher: typeof fetch = fetch) {
    if (!apiKey || !model) throw new Error("OpenAI provider requires OPENAI_API_KEY and OPENAI_RESPONSE_MODEL");
    this.apiKey=apiKey;this.model=model;this.fetcher=fetcher;
  }

  async generateResponse(input: GenerateInput): Promise<GenerateResult> {
    const allowedSourceIds = new Set(input.knowledge.map(item => item.id));
    const knowledge = input.knowledge.map(item => `[${item.id}] ${item.sourceLabel}\n${item.content}`).join("\n\n");
    const allowedActions=input.allowedActionKeys??[];const actionProperties={interest:{anyOf:[{type:"string"},{type:"null"}]},stage:{anyOf:[{type:"string"},{type:"null"}]},service:{anyOf:[{type:"string"},{type:"null"}]},startsAt:{anyOf:[{type:"string"},{type:"null"}]},title:{anyOf:[{type:"string"},{type:"null"}]},body:{anyOf:[{type:"string"},{type:"null"}]},reason:{anyOf:[{type:"string"},{type:"null"}]},summary:{anyOf:[{type:"string"},{type:"null"}]}};
    const actionRequestSchema=allowedActions.length?{anyOf:[{type:"object",additionalProperties:false,properties:{key:{type:"string",enum:allowedActions},input:{type:"object",additionalProperties:false,properties:actionProperties,required:Object.keys(actionProperties)}},required:["key","input"]},{type:"null"}]}:{type:"null"};
    const response = await this.fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        instructions: `You are ${input.employeeName}, a ${input.role}. Goal: ${input.goal}. Tone: ${input.tone}. Business instructions: ${input.instructions||"No additional instructions."}. Handoff rules: ${JSON.stringify(input.handoffRules??{})}. Follow business instructions unless they conflict with these safety rules. Answer factual questions only from supplied knowledge. If the answer is not supported, or an enabled handoff rule applies, request human handoff. Never invent prices, dates, policies, or source ids. You may request at most one explicitly allowed action after the customer has supplied and confirmed every required value. Allowed actions: ${allowedActions.join(", ")||"none"}. Never claim that an action succeeded; say that you are processing it. Use null for unused action input fields.`,
        input: [
          ...input.messages.map(message => ({ role: message.role, content: message.content })),
          { role: "user", content: `VERIFIED KNOWLEDGE:\n${knowledge || "No verified knowledge available."}` },
        ],
        text: { format: { type: "json_schema", name: "lemiri_answer", strict: true, schema: {
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
    const body = await response.json() as OpenAIResponse;
    if (!response.ok) throw new Error(`OpenAI Responses API failed (${response.status}): ${body.error?.message ?? "unknown error"}`);
    const parsed = outputSchema.parse(JSON.parse(responseOutputText(body)));
    const usedSourceIds = parsed.usedSourceIds.filter(id => allowedSourceIds.has(id));
    if (parsed.usedSourceIds.length !== usedSourceIds.length) throw new Error("Model returned an unknown knowledge source id");
    if(parsed.actionRequest&&!allowedActions.includes(parsed.actionRequest.key))throw new Error("Model requested a disallowed action");
    const actionRequest=parsed.actionRequest?{key:parsed.actionRequest.key,input:Object.fromEntries(Object.entries(parsed.actionRequest.input).filter(([,value])=>value!==null))}:undefined;
    return { text: parsed.text, confidence: parsed.confidence, usedSourceIds, handoffReason: parsed.handoffReason ?? undefined, actionRequest };
  }
}
