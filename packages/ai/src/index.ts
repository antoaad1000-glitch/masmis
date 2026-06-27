export * from "./prompt";
export * from "./schema";
export * from "./providers/types";
export * from "./providers/ollama";
export * from "./providers/openai";

import { createOllamaProvider } from "./providers/ollama";
import { createOpenAiProvider } from "./providers/openai";

export function createAiProvider() {
  const provider = process.env.AI_PROVIDER ?? "ollama";
  if (provider === "openai") return createOpenAiProvider();
  return createOllamaProvider();
}
