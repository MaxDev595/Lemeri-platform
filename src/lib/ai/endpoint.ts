// Chat-completions endpoint for assistant-style calls (Groq or OpenAI), or null when no model is configured.
export function modelEndpoint() {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "groq" && process.env.GROQ_API_KEY) return { url: `${process.env.GROQ_API_BASE ?? "https://api.groq.com"}/openai/v1/chat/completions`, key: process.env.GROQ_API_KEY, model: process.env.GROQ_ASSISTANT_MODEL || process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b", extra: { reasoning_effort: "low" } };
  if (provider === "openai" && process.env.OPENAI_API_KEY) return { url: `${process.env.OPENAI_API_BASE ?? "https://api.openai.com"}/v1/chat/completions`, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_RESPONSE_MODEL || "gpt-4.1-mini", extra: {} };
  return null;
}

/** One JSON-mode completion. Throws when the model is unavailable or returns invalid JSON. */
export async function jsonCompletion<T>(system: string, user: string, maxTokens = 1200): Promise<T> {
  const endpoint = modelEndpoint();
  if (!endpoint) throw new Error("NO_MODEL");
  const response = await fetch(endpoint.url, { method: "POST", headers: { authorization: `Bearer ${endpoint.key}`, "content-type": "application/json" }, body: JSON.stringify({ model: endpoint.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_completion_tokens: maxTokens, response_format: { type: "json_object" }, ...endpoint.extra }), signal: AbortSignal.timeout(40_000) });
  const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`Model failed (${response.status}): ${body.error?.message ?? "unknown"}`);
  const text = body.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
}
