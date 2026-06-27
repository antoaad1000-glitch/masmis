import type { AiProvider } from "./types";

export function createOllamaProvider(params?: {
  baseUrl?: string;
  model?: string;
}): AiProvider {
  const baseUrl = params?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = params?.model ?? process.env.OLLAMA_MODEL ?? "mistral";

  return {
    name: "ollama",
    model,
    async generateJson(prompt: string) {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, stream: false, format: "json" })
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as { response?: string };
      if (!data.response) throw new Error("Ollama returned an empty response.");

      return JSON.parse(data.response);
    }
  };
}
