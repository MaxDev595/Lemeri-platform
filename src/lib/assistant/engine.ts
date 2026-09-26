import { SECTION_IDS, SECTION_TITLES, type SectionId } from "./guide";
import { TOOLS, runTool, type ActionProposal, type AssistantContext } from "./tools";
import { planWithoutModel } from "./planner";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type AssistantReply = { reply: string; sections: SectionId[]; navigate?: SectionId; proposals: ActionProposal[]; mode: "model" | "rules" };

type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type WireToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Completion = { choices?: Array<{ message?: { content?: string | null; tool_calls?: WireToolCall[] } }>; error?: { message?: string } };

const MAX_ROUNDS = 6;
const MAX_TOOL_OUTPUT = 7000;

function modelEndpoint() {
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "groq" && process.env.GROQ_API_KEY) return { url: `${process.env.GROQ_API_BASE ?? "https://api.groq.com"}/openai/v1/chat/completions`, key: process.env.GROQ_API_KEY, model: process.env.GROQ_ASSISTANT_MODEL || process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b", extra: { reasoning_effort: "low" } };
  if (provider === "openai" && process.env.OPENAI_API_KEY) return { url: `${process.env.OPENAI_API_BASE ?? "https://api.openai.com"}/v1/chat/completions`, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_RESPONSE_MODEL || "gpt-4.1-mini", extra: {} };
  return null;
}

function systemPrompt(ctx: AssistantContext, page: SectionId | undefined) {
  const sections = SECTION_IDS.map(id => `${id} = ${SECTION_TITLES[id][ctx.locale]}`).join(", ");
  const now = new Date().toLocaleString(ctx.locale === "ru" ? "ru-RU" : "en-GB", { timeZone: ctx.timezone, dateStyle: "full", timeStyle: "short" });
  return [
    `You are Lemiri Assistant, the built-in AI helper inside the Lemiri AI-employee platform dashboard. You help the business owner and their team (user: ${ctx.userName}, role: ${ctx.role}).`,
    `Always answer in ${ctx.locale === "ru" ? "Russian" : "English"}. Current time: ${now} (${ctx.timezone}). The user is currently on the "${page ?? "overview"}" section.`,
    "What you do: explain platform features and how to set things up; find and summarize the workspace's own data — customers, conversations from the website chat, Telegram, WhatsApp and Email, leads, appointments, CRM sync, knowledge base; open dashboard sections; prepare changes.",
    "Rules:",
    "- Never invent data. For anything about the workspace, call a tool first. If a tool returns an error, say so briefly.",
    "- For platform how-to questions call platform_help and base the answer on it.",
    "- Any change (stage, status, settings, knowledge, messages to customers, invitations) must go through a propose_* tool. The change is NOT done until the user presses Confirm on the card — say that it is ready for confirmation, never that it is done.",
    "- Only propose changes the user asked for. Ask a short clarifying question if an id or value is ambiguous; use search/list tools to resolve names to ids.",
    "- Call open_section only when the user asks to go somewhere or it clearly helps.",
    "- Be concise: short paragraphs, '- ' bullet lists, **bold** for key values. No tables, no headings, no code blocks unless asked. Show dates in the business time zone. Never reveal ids unless asked.",
    `Dashboard sections: ${sections}.`,
  ].join("\n");
}

async function complete(endpoint: NonNullable<ReturnType<typeof modelEndpoint>>, messages: WireMessage[]) {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: { authorization: `Bearer ${endpoint.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: endpoint.model, messages, tools: TOOLS.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: "auto", temperature: 0.3, max_completion_tokens: 1400, ...endpoint.extra }),
    signal: AbortSignal.timeout(40_000),
  });
  const body = await response.json().catch(() => ({})) as Completion;
  if (!response.ok) throw new Error(`Assistant model failed (${response.status}): ${body.error?.message ?? "unknown"}`);
  const message = body.choices?.[0]?.message;
  if (!message) throw new Error("Assistant model returned no message");
  return message;
}

function collect(state: { sections: SectionId[]; proposals: ActionProposal[]; navigate?: SectionId }, outcome: Awaited<ReturnType<typeof runTool>>, explicitNavigation: boolean) {
  if (outcome.proposal && state.proposals.length < 3) state.proposals.push(outcome.proposal);
  if (outcome.navigate) {
    if (explicitNavigation) state.navigate = outcome.navigate;
    else if (!state.sections.includes(outcome.navigate)) state.sections.push(outcome.navigate);
  }
}

export async function runAssistant(ctx: AssistantContext, history: ChatTurn[], page?: SectionId): Promise<AssistantReply> {
  const endpoint = modelEndpoint();
  if (endpoint) {
    try {
      const state: { sections: SectionId[]; proposals: ActionProposal[]; navigate?: SectionId } = { sections: [], proposals: [] };
      const messages: WireMessage[] = [{ role: "system", content: systemPrompt(ctx, page) }, ...history.map(turn => ({ role: turn.role, content: turn.content }) as WireMessage)];
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const message = await complete(endpoint, messages);
        const calls = message.tool_calls ?? [];
        if (!calls.length) {
          const reply = (message.content ?? "").trim();
          if (!reply) throw new Error("Assistant model returned an empty answer");
          return { reply, sections: state.sections.filter(s => s !== state.navigate).slice(0, 3), navigate: state.navigate, proposals: state.proposals, mode: "model" };
        }
        messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
        for (const call of calls.slice(0, 6)) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
          const outcome = await runTool(ctx, call.function.name, args);
          collect(state, outcome, call.function.name === "open_section");
          const text = JSON.stringify(outcome.data);
          messages.push({ role: "tool", tool_call_id: call.id, content: text.length > MAX_TOOL_OUTPUT ? `${text.slice(0, MAX_TOOL_OUTPUT)}…(truncated)` : text });
        }
      }
      throw new Error("Assistant exceeded tool rounds");
    } catch (error) {
      console.error("Assistant model path failed, using rules", error instanceof Error ? error.message : error);
    }
  }
  return { ...(await planWithoutModel(ctx, history, page)), mode: "rules" };
}
