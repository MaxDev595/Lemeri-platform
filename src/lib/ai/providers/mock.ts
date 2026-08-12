import type { AIProvider, GenerateInput, GenerateResult } from "../types";

/** Development provider. It is never presented as a production LLM connection. */
export class MockAIProvider implements AIProvider {
  readonly name = "mock-development";
  async generateResponse(input: GenerateInput): Promise<GenerateResult> {
    const latest = input.messages.at(-1)?.content ?? "";
    const best = input.knowledge[0];
    if (!best || best.score < 0.18) return { text: "Мне нужно уточнить эту информацию у менеджера. Я передам ваш вопрос и попрошу коллегу связаться с вами.", confidence: 0.2, usedSourceIds: [], handoffReason: `Недостаточно знаний для ответа: ${latest.slice(0, 120)}` };
    return { text: `${best.content}\n\nЕсли хотите, я помогу уточнить детали или подобрать удобное время.`, confidence: Math.min(.92, best.score), usedSourceIds: [best.id] };
  }
}
