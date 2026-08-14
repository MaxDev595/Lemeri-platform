import type { AIProvider } from "./types";
import { MockAIProvider } from "./providers/mock";
import { OpenAIProvider } from "./providers/openai";
import { GroqProvider } from "./providers/groq";
export function configuredAIProvider():AIProvider{const provider=process.env.AI_PROVIDER??"mock";if(provider==="mock")return new MockAIProvider();if(provider==="openai")return new OpenAIProvider(process.env.OPENAI_API_KEY??"",process.env.OPENAI_RESPONSE_MODEL??"");if(provider==="groq")return new GroqProvider(process.env.GROQ_API_KEY??"",process.env.GROQ_CHAT_MODEL??"openai/gpt-oss-120b");throw new Error(`Unsupported AI_PROVIDER: ${provider}`)}
