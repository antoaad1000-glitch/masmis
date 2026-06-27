export type AiProvider = {
  name: string;
  model: string;
  generateJson(prompt: string): Promise<unknown>;
};
