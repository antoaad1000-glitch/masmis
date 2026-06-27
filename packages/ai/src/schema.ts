import { z } from "zod";

export const generatedQuestionSchema = z.object({
  question: z.string().min(8),
  answers: z.array(z.string().min(1)).length(4),
  correct_answer: z.number().int().min(1).max(4),
  category: z.enum([
    "French Republic values",
    "Institutions and politics",
    "Rights and duties",
    "History",
    "Geography",
    "Culture",
    "Daily life in France",
    "European Union"
  ]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  explanation: z.string().min(8),
  source: z.string().min(1)
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export function validateGeneratedQuestion(input: unknown) {
  const parsed = generatedQuestionSchema.parse(input);
  const normalizedAnswers = parsed.answers.map((a) => a.trim().toLowerCase());
  if (new Set(normalizedAnswers).size !== 4) {
    throw new Error("Generated question must contain four distinct answers.");
  }
  return parsed;
}
