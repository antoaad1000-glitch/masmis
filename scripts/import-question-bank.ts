import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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

async function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "packages/db/.env")
  ];

  for (const envPath of envPaths) {
    try {
      const content = await fs.readFile(envPath, "utf8");

      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const index = trimmed.indexOf("=");
        if (index === -1) continue;

        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore missing .env files.
    }
  }
}

type RawQuestion = {
  question_text?: string;
  question?: string;
  answer_1?: string;
  answer_2?: string;
  answer_3?: string;
  answer_4?: string;
  answers?: string[];
  correct_answer?: number;
  category?: string;
  difficulty?: string;
  explanation?: string;
  source?: string;
  source_prompt?: string;
  approved?: boolean;
};

function getQuestionText(q: RawQuestion) {
  return q.question_text ?? q.question ?? "";
}

function getAnswers(q: RawQuestion) {
  if (Array.isArray(q.answers)) return q.answers;
  return [q.answer_1, q.answer_2, q.answer_3, q.answer_4];
}

function validateQuestion(q: RawQuestion, fileName: string, index: number) {
  const questionText = getQuestionText(q);
  const answers = getAnswers(q);

  if (!questionText || typeof questionText !== "string") {
    throw new Error(`${fileName} question ${index}: missing question_text`);
  }

  if (!Array.isArray(answers) || answers.length !== 4 || answers.some((a) => !a || typeof a !== "string")) {
    throw new Error(`${fileName} question ${index}: must have exactly 4 answers`);
  }

  if (![1, 2, 3, 4].includes(Number(q.correct_answer))) {
    throw new Error(`${fileName} question ${index}: correct_answer must be 1, 2, 3, or 4`);
  }

  return {
    questionText,
    answers: answers as string[],
    correctAnswer: Number(q.correct_answer),
    category: q.category ?? "French Republic values",
    difficulty: q.difficulty ?? "easy",
    explanation: q.explanation ?? "",
    source: q.source ?? "Official naturalisation/civic exam PDF + Livret du citoyen + Examen civique",
    sourcePrompt: q.source_prompt ?? "",
    approved: q.approved === true
  };
}

async function main() {
  await loadEnv();

  const { prisma, QuestionCategory, Difficulty } = await import("@masmis/db");

  const approveAll = process.argv.includes("--approve");
  const folderPath = path.resolve(process.cwd(), "data/question-bank");

  const files = (await fs.readdir(folderPath))
    .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No JSON files found in ${folderPath}`);
  }

  const categoryMap: Record<string, any> = {
    "French Republic values": QuestionCategory.FRENCH_REPUBLIC_VALUES,
    "Institutions and politics": QuestionCategory.INSTITUTIONS_AND_POLITICS,
    "Rights and duties": QuestionCategory.RIGHTS_AND_DUTIES,
    History: QuestionCategory.HISTORY,
    Geography: QuestionCategory.GEOGRAPHY,
    Culture: QuestionCategory.CULTURE,
    "Daily life in France": QuestionCategory.DAILY_LIFE_IN_FRANCE,
    "European Union": QuestionCategory.EUROPEAN_UNION
  };

  const difficultyMap: Record<string, any> = {
    easy: Difficulty.EASY,
    medium: Difficulty.MEDIUM,
    hard: Difficulty.HARD,
    EASY: Difficulty.EASY,
    MEDIUM: Difficulty.MEDIUM,
    HARD: Difficulty.HARD
  };

  let read = 0;
  let inserted = 0;
  let skipped = 0;

  const seenInThisImport = new Set<string>();

  for (const file of files) {
    const fullPath = path.join(folderPath, file);
    const rawContent = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(rawContent);

    if (!Array.isArray(parsed)) {
      throw new Error(`${file}: root must be a JSON array`);
    }

    console.log(`\nReading ${file}: ${parsed.length} questions`);

    for (let i = 0; i < parsed.length; i++) {
      read++;

      const q = validateQuestion(parsed[i], file, i + 1);
      const hash = canonicalHash(q.questionText);

      if (seenInThisImport.has(hash)) {
        skipped++;
        console.log(`Skipped duplicate inside import: ${q.questionText}`);
        continue;
      }

      seenInThisImport.add(hash);

      const existing = await prisma.question.findUnique({
        where: { canonicalHash: hash }
      });

      if (existing) {
        skipped++;
        console.log(`Skipped existing database question: ${q.questionText}`);
        continue;
      }

      await prisma.question.create({
        data: {
          questionText: q.questionText,
          answer1: q.answers[0],
          answer2: q.answers[1],
          answer3: q.answers[2],
          answer4: q.answers[3],
          correctAnswer: q.correctAnswer,
          category: categoryMap[q.category] ?? QuestionCategory.FRENCH_REPUBLIC_VALUES,
          difficulty: difficultyMap[q.difficulty] ?? Difficulty.EASY,
          explanation: q.explanation,
          source: q.source,
          sourcePrompt: q.sourcePrompt,
          createdByAi: true,
          approved: approveAll ? true : q.approved,
          canonicalHash: hash
        }
      });

      inserted++;
    }
  }

  const total = await prisma.question.count();
  const approved = await prisma.question.count({ where: { approved: true } });
  const pending = await prisma.question.count({ where: { approved: false } });

  console.log("\nImport finished.");
  console.log(`Read: ${read}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped duplicates: ${skipped}`);
  console.log(`Total in database: ${total}`);
  console.log(`Approved: ${approved}`);
  console.log(`Pending: ${pending}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
