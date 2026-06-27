import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import { Server } from "socket.io";
import { prisma } from "@masmis/db";
import { calculateScore, type AnswerStatus, type PlayerState, type PublicQuestion } from "@masmis/shared";

type RoomPlayer = PlayerState & { socketId: string };

type LoadedQuestion = Awaited<ReturnType<typeof loadQuestions>>[number];

type LockedAnswer = {
  selectedAnswer: number;
  responseTimeMs: number;
};

type PlayerRevealResult = {
  playerId: string;
  selectedAnswer: number | null;
  isCorrect: boolean;
  points: number;
  responseTimeMs: number;
};

type Room = {
  roomCode: string;
  status: "lobby" | "playing" | "finished";
  hostPlayerId: string;
  players: Map<string, RoomPlayer>;
  questions: LoadedQuestion[];
  currentQuestionIndex: number;
  timerSeconds: number;
  startedAtMs: number;
  submittedAnswers: Map<string, Map<string, LockedAnswer>>;
};

const rooms = new Map<string, Room>();
const port = Number(process.env.PORT ?? process.env.REALTIME_PORT ?? 4000);
const corsOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getCurrentQuestion(room: Room) {
  return room.questions[room.currentQuestionIndex];
}

function getPlayerQuestionStatus(room: Room, playerId: string): { status?: AnswerStatus; points?: number } {
  if (room.status !== "playing") return {};

  const question = getCurrentQuestion(room);
  if (!question) return {};

  const player = room.players.get(playerId);
  if (!player) return {};

  if (player.currentAnswerStatus === "correct" || player.currentAnswerStatus === "wrong" || player.currentAnswerStatus === "missed") {
    return { status: player.currentAnswerStatus, points: player.currentAnswerPoints };
  }

  const submitted = room.submittedAnswers.get(question.id);
  if (submitted?.has(playerId)) return { status: "locked" };

  return { status: "choosing" };
}

function publicRoom(room: Room) {
  return {
    roomCode: room.roomCode,
    status: room.status,
    players: [...room.players.values()].map(({ socketId, ...player }) => {
      const { status, points } = getPlayerQuestionStatus(room, player.id);
      return {
        ...player,
        currentAnswerStatus: status,
        currentAnswerPoints: points
      };
    }),
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length
  };
}

async function loadQuestions(questionCount: number) {
  const approvedQuestions = await prisma.question.findMany({
    where: { approved: true }
  });

  return shuffle(approvedQuestions)
    .slice(0, questionCount)
    .map((q) => ({
      id: q.id,
      questionText: q.questionText,
      answers: [q.answer1, q.answer2, q.answer3, q.answer4],
      correctAnswer: q.correctAnswer,
      category: q.category,
      difficulty: q.difficulty.toLowerCase() as "easy" | "medium" | "hard",
      explanation: q.explanation
    }));
}

function emitRoom(room: Room) {
  io.to(room.roomCode).emit("room:update", publicRoom(room));
}

function revealCurrentQuestion(room: Room, question: LoadedQuestion) {
  const submitted = room.submittedAnswers.get(question.id) ?? new Map<string, LockedAnswer>();
  const playerResults: PlayerRevealResult[] = [];

  for (const player of room.players.values()) {
    const lockedAnswer = submitted.get(player.id);
    const responseTimeMs = lockedAnswer?.responseTimeMs ?? room.timerSeconds * 1000;
    const selectedAnswer = lockedAnswer?.selectedAnswer ?? null;
    const isCorrect = selectedAnswer === question.correctAnswer;
    const points = calculateScore({ isCorrect, responseTimeMs, timerSeconds: room.timerSeconds });

    player.totalAnswers += 1;
    player.correctAnswers += isCorrect ? 1 : 0;
    player.score += points;
    player.averageResponseTimeMs = Math.round(
      (player.averageResponseTimeMs * (player.totalAnswers - 1) + responseTimeMs) / player.totalAnswers
    );
    player.currentAnswerStatus = selectedAnswer === null ? "missed" : isCorrect ? "correct" : "wrong";
    player.currentAnswerPoints = points;

    playerResults.push({
      playerId: player.id,
      selectedAnswer,
      isCorrect,
      points,
      responseTimeMs
    });
  }

  io.to(room.roomCode).emit("question:reveal", {
    questionId: question.id,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    playerResults
  });

  emitRoom(room);
}

function emitCurrentQuestion(room: Room) {
  const q = room.questions[room.currentQuestionIndex];
  if (!q) {
    room.status = "finished";
    io.to(room.roomCode).emit("game:finished", publicRoom(room));
    emitRoom(room);
    return;
  }

  room.startedAtMs = Date.now();
  room.submittedAnswers.set(q.id, new Map());

  for (const player of room.players.values()) {
    player.currentAnswerStatus = "choosing";
    player.currentAnswerPoints = undefined;
  }

  const publicQuestion: PublicQuestion = {
    id: q.id,
    questionText: q.questionText,
    answers: q.answers,
    category: q.category,
    difficulty: q.difficulty,
    timerSeconds: room.timerSeconds
  };

  io.to(room.roomCode).emit("question:show", {
    question: publicQuestion,
    index: room.currentQuestionIndex + 1,
    total: room.questions.length,
    startedAt: room.startedAtMs
  });

  emitRoom(room);

  setTimeout(() => {
    const current = room.questions[room.currentQuestionIndex];
    if (!current || current.id !== q.id || room.status !== "playing") return;

    revealCurrentQuestion(room, q);

    setTimeout(() => {
      if (room.status !== "playing") return;
      room.currentQuestionIndex += 1;
      emitCurrentQuestion(room);
    }, 3500);
  }, room.timerSeconds * 1000);
}

io.on("connection", (socket) => {
  socket.on("room:create", async ({ username, avatarUrl }: { username: string; avatarUrl?: string }, callback) => {
    const roomCode = makeRoomCode();
    const playerId = crypto.randomUUID();
    const player: RoomPlayer = {
      id: playerId,
      username: username?.trim() || "Player",
      avatarUrl: avatarUrl ?? null,
      socketId: socket.id,
      isHost: true,
      isReady: true,
      score: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      averageResponseTimeMs: 0
    };

    const room: Room = {
      roomCode,
      status: "lobby",
      hostPlayerId: playerId,
      players: new Map([[playerId, player]]),
      questions: [],
      currentQuestionIndex: 0,
      timerSeconds: 10,
      startedAtMs: 0,
      submittedAnswers: new Map()
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    callback?.({ ok: true, playerId, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("room:join", ({ roomCode, username, avatarUrl }: { roomCode: string; username: string; avatarUrl?: string }, callback) => {
    const normalizedRoomCode = roomCode?.trim().toUpperCase();
    const room = rooms.get(normalizedRoomCode);
    if (!room) return callback?.({ ok: false, error: "Room not found." });
    if (room.status !== "lobby") return callback?.({ ok: false, error: "Game already started." });
    if (room.players.size >= 8) return callback?.({ ok: false, error: "Room is full." });

    const playerId = crypto.randomUUID();
    const player: RoomPlayer = {
      id: playerId,
      username: username?.trim() || "Player",
      avatarUrl: avatarUrl ?? null,
      socketId: socket.id,
      isHost: false,
      isReady: false,
      score: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      averageResponseTimeMs: 0
    };

    room.players.set(playerId, player);
    socket.join(room.roomCode);
    callback?.({ ok: true, playerId, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on("player:ready", ({ roomCode, playerId, isReady }: { roomCode: string; playerId: string; isReady: boolean }) => {
    const room = rooms.get(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player || player.isHost) return;
    player.isReady = Boolean(isReady);
    emitRoom(room);
  });

  socket.on("game:start", async ({ roomCode, playerId, timerSeconds, questionCount }: { roomCode: string; playerId: string; timerSeconds?: number; questionCount?: number }, callback) => {
    const room = rooms.get(roomCode);
    if (!room) return callback?.({ ok: false, error: "Room not found." });
    if (room.hostPlayerId !== playerId) return callback?.({ ok: false, error: "Only host can start." });
    if ([...room.players.values()].some((p) => !p.isHost && !p.isReady)) {
      return callback?.({ ok: false, error: "All players must be ready." });
    }

    room.timerSeconds = Math.max(5, Math.min(60, timerSeconds ?? 10));
    room.questions = await loadQuestions(Math.max(1, Math.min(50, questionCount ?? 10)));
    if (room.questions.length === 0) return callback?.({ ok: false, error: "No approved questions available." });

    room.status = "playing";
    room.currentQuestionIndex = 0;
    room.submittedAnswers = new Map();

    for (const player of room.players.values()) {
      player.score = 0;
      player.correctAnswers = 0;
      player.totalAnswers = 0;
      player.averageResponseTimeMs = 0;
      player.currentAnswerStatus = "choosing";
      player.currentAnswerPoints = undefined;
    }

    callback?.({ ok: true });
    emitRoom(room);
    emitCurrentQuestion(room);
  });

  socket.on("answer:submit", ({ roomCode, playerId, questionId, selectedAnswer }: { roomCode: string; playerId: string; questionId: string; selectedAnswer: number }, callback) => {
    const room = rooms.get(roomCode);
    const player = room?.players.get(playerId);
    const question = room?.questions[room.currentQuestionIndex];
    if (!room || !player || !question || question.id !== questionId || room.status !== "playing") {
      return callback?.({ ok: false, error: "Invalid answer submission." });
    }

    const submitted = room.submittedAnswers.get(questionId) ?? new Map<string, LockedAnswer>();
    if (submitted.has(playerId)) return callback?.({ ok: false, error: "Already answered." });

    submitted.set(playerId, {
      selectedAnswer,
      responseTimeMs: Math.max(0, Date.now() - room.startedAtMs)
    });
    room.submittedAnswers.set(questionId, submitted);

    player.currentAnswerStatus = "locked";
    player.currentAnswerPoints = undefined;

    callback?.({ ok: true, locked: true });
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socket.id && room.status === "lobby") {
          room.players.delete(playerId);
          if (room.players.size === 0) rooms.delete(room.roomCode);
          else if (room.hostPlayerId === playerId) {
            const nextHost = room.players.values().next().value as RoomPlayer | undefined;
            if (nextHost) {
              nextHost.isHost = true;
              nextHost.isReady = true;
              room.hostPlayerId = nextHost.id;
            }
          }
          emitRoom(room);
        }
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Masmis realtime server running on http://localhost:${port}`);
});
