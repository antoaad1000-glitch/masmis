import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildQuestionPrompt, createAiProvider, validateGeneratedQuestion } from "@masmis/ai";
import { prisma, Difficulty, QuestionCategory } from "@masmis/db";

type OfficialSourcePrompt = {
  question_text: string;
  source_category: string;
  source_page?: number;
  source: string;
};

function argValue(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalHash(questionText: string) {
  return crypto.createHash("sha256").update(normalize(questionText)).digest("hex");
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mapCategory(category: string): QuestionCategory {
  const map: Record<string, QuestionCategory> = {
    "French Republic values": QuestionCategory.FRENCH_REPUBLIC_VALUES,
    "Institutions and politics": QuestionCategory.INSTITUTIONS_AND_POLITICS,
    "Rights and duties": QuestionCategory.RIGHTS_AND_DUTIES,
    History: QuestionCategory.HISTORY,
    Geography: QuestionCategory.GEOGRAPHY,
    Culture: QuestionCategory.CULTURE,
    "Daily life in France": QuestionCategory.DAILY_LIFE_IN_FRANCE,
    "European Union": QuestionCategory.EUROPEAN_UNION
  };
  return map[category] ?? QuestionCategory.FRENCH_REPUBLIC_VALUES;
}

function mapDifficulty(difficulty: string): Difficulty {
  if (difficulty === "hard") return Difficulty.HARD;
  if (difficulty === "medium") return Difficulty.MEDIUM;
  return Difficulty.EASY;
}

async function main() {
  const limit = Number(argValue("limit", "10"));
  const sourcePath = path.resolve(process.cwd(), "data/official_questions_raw.json");
  const raw = JSON.parse(await fs.readFile(sourcePath, "utf8")) as OfficialSourcePrompt[];
  const provider = createAiProvider();

  const existing = await prisma.question.findMany({ select: { sourcePrompt: true } });
  const alreadyUsedSourcePrompts = new Set(existing.map((q) => q.sourcePrompt).filter(Boolean));
  const sources = shuffle(raw).filter((source) => !alreadyUsedSourcePrompts.has(source.question_text));

  let inserted = 0;

  for (const source of sources) {
    if (inserted >= limit) break;

    const prompt = buildQuestionPrompt({
      sourcePrompt: source.question_text,
      sourceCategory: source.source_category,
      sourcePage: source.source_page
    });

    const job = await prisma.aiGenerationJob.create({
      data: {
        provider: provider.name,
        model: provider.model,
        inputSummary: source.question_text,
        status: "RUNNING"
      }
    });

    try {
      const generatedRaw = await provider.generateJson(prompt);
      const generated = validateGeneratedQuestion(generatedRaw);
      const hash = canonicalHash(generated.question);
      const exists = await prisma.question.findUnique({ where: { canonicalHash: hash } });

      await prisma.aiGenerationJob.update({
        where: { id: job.id },
        data: { status: "DONE", outputJson: generated }
      });

      if (exists) {
        console.log(`Duplicate skipped: ${generated.question}`);
        continue;
      }

      await prisma.question.create({
        data: {
          questionText: generated.question,
          answer1: generated.answers[0],
          answer2: generated.answers[1],
          answer3: generated.answers[2],
          answer4: generated.answers[3],
          correctAnswer: generated.correct_answer,
          category: mapCategory(generated.category),
          difficulty: mapDifficulty(generated.difficulty),
          explanation: generated.explanation,
          source: generated.source,
          sourcePage: source.source_page,
          sourcePrompt: source.question_text,
          createdByAi: true,
          approved: false,
          canonicalHash: hash
        }
      });
      inserted += 1;
      console.log(`Inserted pending (${inserted}/${limit}): ${generated.question}`);
    } catch (error) {
      await prisma.aiGenerationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : String(error) }
      });
      console.error(`Failed source: ${source.question_text}`);
      console.error(error);
    }
  }

  console.log(`Inserted ${inserted} pending AI questions.`);
  console.log(`Remaining unused official prompts: ${Math.max(0, sources.length - inserted)}.`);
}

main().finally(async () => prisma.$disconnect());
