-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('FRENCH_REPUBLIC_VALUES', 'INSTITUTIONS_AND_POLITICS', 'RIGHTS_AND_DUTIES', 'HISTORY', 'GEOGRAPHY', 'CULTURE', 'DAILY_LIFE_IN_FRANCE', 'EUROPEAN_UNION');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'PLAYING', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answer1" TEXT NOT NULL,
    "answer2" TEXT NOT NULL,
    "answer3" TEXT NOT NULL,
    "answer4" TEXT NOT NULL,
    "correctAnswer" INTEGER NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
    "explanation" TEXT,
    "source" TEXT,
    "sourcePage" INTEGER,
    "sourcePrompt" TEXT,
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "canonicalHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "hostPlayerId" TEXT,
    "timerSeconds" INTEGER NOT NULL DEFAULT 10,
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "totalAnswers" INTEGER NOT NULL DEFAULT 0,
    "averageResponseTimeMs" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerRecord" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAnswer" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGenerationJob" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inputSummary" TEXT,
    "outputJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_canonicalHash_key" ON "Question"("canonicalHash");

-- CreateIndex
CREATE INDEX "Question_approved_category_difficulty_idx" ON "Question"("approved", "category", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_roomCode_key" ON "GameSession"("roomCode");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameSessionId_playerId_key" ON "GamePlayer"("gameSessionId", "playerId");

-- CreateIndex
CREATE INDEX "AnswerRecord_gameSessionId_playerId_idx" ON "AnswerRecord"("gameSessionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerRecord_gameSessionId_playerId_questionId_key" ON "AnswerRecord"("gameSessionId", "playerId", "questionId");

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerRecord" ADD CONSTRAINT "AnswerRecord_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerRecord" ADD CONSTRAINT "AnswerRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerRecord" ADD CONSTRAINT "AnswerRecord_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
