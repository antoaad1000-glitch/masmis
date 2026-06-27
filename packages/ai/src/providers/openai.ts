import type { AiProvider } from "./types";

export function createOpenAiProvider(params?: {
  apiKey?: string;
  model?: string;
}): AiProvider {
  const apiKey = params?.apiKey ?? process.env.OPENAI_API_KEY;
  const model = params?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
  }

  return {
    name: "openai",
    model,
    async generateJson(prompt: string) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: prompt,
          text: { format: { type: "json_object" } }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
      }

      const data = await response.json();
      const outputText = data.output_text ?? data.output?.[0]?.content?.[0]?.text;
      if (!outputText) throw new Error("OpenAI returned an empty response.");

      return JSON.parse(outputText);
    }
  };
}
