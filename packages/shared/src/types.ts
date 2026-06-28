export type Difficulty = "easy" | "medium" | "hard";

export type AnswerStatus = "choosing" | "locked" | "correct" | "wrong" | "missed";

export type PublicQuestion = {
  id: string;
  questionText: string;
  answers: string[];
  category: string;
  difficulty: Difficulty;
  timerSeconds: number;
};

export type PlayerState = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  isHost: boolean;
  isReady: boolean;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  averageResponseTimeMs: number;
  currentAnswerStatus?: AnswerStatus;
  currentAnswerPoints?: number;
};

export type PlayerQuestionResult = {
  playerId: string;
  selectedAnswer: number | null;
  isCorrect: boolean;
  points: number;
  responseTimeMs: number;
};

export type ReviewQuestion = {
  questionId: string;
  questionText: string;
  answers: string[];
  correctAnswer: number;
  category: string;
  difficulty: Difficulty;
  explanation?: string | null;
  playerResults: PlayerQuestionResult[];
};

export type RoomState = {
  roomCode: string;
  status: "lobby" | "playing" | "finished";
  players: PlayerState[];
  currentQuestionIndex: number;
  totalQuestions: number;
  review?: ReviewQuestion[];
};
