import type { AIProvider } from "./types";
import { MockAIProvider } from "./providers/mock";
import { OpenAIProvider } from "./providers/openai";
export function configuredAIProvider():AIProvider{if((process.env.AI_PROVIDER??"mock")==="mock")return new MockAIProvider();if(process.env.AI_PROVIDER!=="openai")throw new Error(`Unsupported AI_PROVIDER: ${process.env.AI_PROVIDER}`);return new OpenAIProvider(process.env.OPENAI_API_KEY??"",process.env.OPENAI_RESPONSE_MODEL??"")}
