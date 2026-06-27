import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { buildQuestionPrompt, createAiProvider, validateGeneratedQuestion } from "@masmis/ai";
import { prisma, Difficulty, QuestionCategory } from "@masmis/db";
import { requireAdmin } from "@/lib/adminAuth";

type OfficialSourcePrompt = {
  question_text: string;
  source_category: string;
  source_page?: number;
};

function normalize(input: string) {
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalHash(questionText: string) {
  return crypto.createHash("sha256").update(normalize(questionText)).digest("hex");
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

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const sourcePath = path.resolve(process.cwd(), process.env.SOURCE_QUESTIONS_PATH ?? "../../data/official_questions_raw.json");
  const raw = JSON.parse(await fs.readFile(sourcePath, "utf8")) as OfficialSourcePrompt[];
  const source = raw[Math.floor(Math.random() * raw.length)];
  const provider = createAiProvider();

  const prompt = buildQuestionPrompt({
    sourcePrompt: source.question_text,
    sourceCategory: source.source_category,
    sourcePage: source.source_page
  });

  const generatedRaw = await provider.generateJson(prompt);
  const generated = validateGeneratedQuestion(generatedRaw);
  const hash = canonicalHash(generated.question);

  const existing = await prisma.question.findUnique({ where: { canonicalHash: hash } });
  if (existing) return NextResponse.json({ ok: false, reason: "duplicate", question: existing });

  const question = await prisma.question.create({
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

  return NextResponse.json({ ok: true, question });
}
