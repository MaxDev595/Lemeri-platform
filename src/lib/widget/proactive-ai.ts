// «Отредактировать с ИИ» for the AI's first message (widget studio): the model
// polishes the owner's text, or writes 1–2 short openers from the business context.
// Nothing is saved here — the owner reviews the result and saves the card.

import { jsonCompletion } from "@/lib/ai/endpoint";
import { normalizeProactive } from "./design";

export async function polishProactive(input: { messages: string[]; locale: "ru" | "en"; company: string; employee: string; goal: string; overview: string }) {
  const ru = input.locale === "ru";
  const system = [
    "You write the first chat message a website AI seller sends to a visitor who has not written yet.",
    "Rules: friendly, short (max 140 characters each), no pressure, no promises of discounts or prices that are not in the context, no emoji spam (at most one emoji), plain text, no links.",
    "If the owner gave messages, keep their meaning and offers, fix grammar and make them warmer and clearer. Keep the same number of messages.",
    "If no messages were given, write 1 or 2 messages: a greeting with an offer of help that fits the business.",
    `Language: ${ru ? "Russian" : "English"}; if the owner wrote in another language, translate. Reply with JSON {"messages": string[]}.`,
  ].join(" ");
  const user = JSON.stringify({ company: input.company, assistantName: input.employee, goal: input.goal, business: input.overview.slice(0, 1500), ownerMessages: input.messages.slice(0, 3) });
  const result = await jsonCompletion<{ messages?: unknown }>(system, user, 400);
  const clean = normalizeProactive({ enabled: true, messages: Array.isArray(result.messages) ? result.messages.map(item => String(item).slice(0, 300)) : [] });
  if (!clean.messages.length) throw new Error("EMPTY");
  return clean.messages;
}
