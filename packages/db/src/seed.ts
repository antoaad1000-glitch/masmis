import crypto from "node:crypto";
import seedQuestions from "./seed-data.json" assert { type: "json" };
import { prisma, Difficulty, QuestionCategory } from "./index";

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

async function main() {
  for (const q of seedQuestions) {
    await prisma.question.upsert({
      where: { canonicalHash: canonicalHash(q.questionText) },
      update: {},
      create: {
        questionText: q.questionText,
        answer1: q.answers[0],
        answer2: q.answers[1],
        answer3: q.answers[2],
        answer4: q.answers[3],
        correctAnswer: q.correctAnswer,
        category: q.category as QuestionCategory,
        difficulty: q.difficulty as Difficulty,
        explanation: q.explanation,
        source: q.source,
        sourcePage: q.sourcePage,
        sourcePrompt: q.sourcePrompt,
        createdByAi: false,
        approved: true,
        canonicalHash: canonicalHash(q.questionText)
      }
    });
  }

  console.log(`Seeded ${seedQuestions.length} approved questions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
