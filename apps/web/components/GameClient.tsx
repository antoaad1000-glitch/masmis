"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { accuracyPercent, type AnswerStatus, type PublicQuestion, type RoomState } from "@masmis/shared";
import { getSocket } from "@/lib/socket";

type RevealResult = {
  playerId: string;
  selectedAnswer: number | null;
  isCorrect: boolean;
  points: number;
  responseTimeMs: number;
};

type MyAnswerResult = RevealResult | null;
type FeedbackStatus = "idle" | "locked" | "revealed";

const avatars = ["🇫🇷", "🗼", "🐓", "📚", "⚖️", "🎨", "🏛️", "🥐", "🧠", "⭐", "🚀", "🦊"];

function isImageAvatar(avatar?: string | null) {
  return Boolean(avatar && (avatar.startsWith("data:image/") || avatar.startsWith("http://") || avatar.startsWith("https://")));
}

function AvatarBubble({ avatar, size = "md" }: { avatar?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-4xl" : size === "sm" ? "h-9 w-9 text-xl" : "h-12 w-12 text-2xl";

  if (isImageAvatar(avatar)) {
    return <img src={avatar ?? ""} alt="Avatar" className={`${sizeClass} rounded-2xl object-cover ring-2 ring-white/70`} />;
  }

  return (
    <span className={`${sizeClass} flex items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200`}>
      {avatar || "🙂"}
    </span>
  );
}

function statusLabel(status?: AnswerStatus, points?: number) {
  switch (status) {
    case "choosing":
      return { text: "Choisit...", icon: "🤔", className: "bg-slate-100 text-slate-600" };
    case "locked":
      return { text: "Verrouillé", icon: "🔒", className: "bg-amber-100 text-amber-800" };
    case "correct":
      return { text: `Correct +${points ?? 0}`, icon: "✅", className: "bg-green-100 text-green-800" };
    case "wrong":
      return { text: "Faux", icon: "❌", className: "bg-red-100 text-red-800" };
    case "missed":
      return { text: "Trop tard", icon: "⏰", className: "bg-slate-200 text-slate-700" };
    default:
      return { text: "En attente", icon: "•", className: "bg-slate-100 text-slate-600" };
  }
}

function formatSeconds(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function GameClient() {
  const socket = useMemo(() => getSocket(), []);

  const [username, setUsername] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answerResult, setAnswerResult] = useState<MyAnswerResult>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(avatars[0]);
  const [timerSeconds, setTimerSeconds] = useState(10);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    socket.on("room:update", setRoom);

    socket.on("question:show", ({ question, index }: { question: PublicQuestion; index: number }) => {
      setQuestion(question);
      setQuestionNumber(index);
      setAnswerResult(null);
      setFeedbackStatus("idle");
      setCorrectAnswer(null);
      setSelectedAnswer(null);
      setExplanation(null);
      setTimeLeft(question.timerSeconds);
    });

    socket.on(
      "question:reveal",
      ({ correctAnswer, explanation, playerResults }: { correctAnswer: number; explanation?: string; playerResults: RevealResult[] }) => {
        setCorrectAnswer(correctAnswer);
        setExplanation(explanation ?? null);
        const mine = playerResults.find((result) => result.playerId === playerId) ?? null;
        setAnswerResult(mine);
        setFeedbackStatus("revealed");
      }
    );

    socket.on("game:finished", (room: RoomState) => {
      setRoom(room);
      setQuestion(null);
      setFeedbackStatus("idle");
    });

    return () => {
      socket.off("room:update");
      socket.off("question:show");
      socket.off("question:reveal");
      socket.off("game:finished");
    };
  }, [socket, playerId]);

  useEffect(() => {
    if (!question) return;

    const startedAt = Date.now();

    const interval = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setTimeLeft(Math.max(0, question.timerSeconds - elapsedSeconds));
    }, 250);

    return () => window.clearInterval(interval);
  }, [question?.id]);

  const me = room?.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);

  function ensureUsername() {
    if (!username.trim()) {
      setError("Choisis un nom d'utilisateur.");
      return false;
    }

    setError(null);
    return true;
  }

  function createRoom() {
    if (!ensureUsername()) return;

    socket.emit("room:create", { username, avatarUrl: avatar }, (res: any) => {
      if (!res.ok) return setError(res.error);
      setPlayerId(res.playerId);
      setRoom(res.room);
    });
  }

  function joinRoom() {
    if (!ensureUsername()) return;

    socket.emit("room:join", { roomCode: roomCodeInput, username, avatarUrl: avatar }, (res: any) => {
      if (!res.ok) return setError(res.error);
      setPlayerId(res.playerId);
      setRoom(res.room);
    });
  }

  function setReady(isReady: boolean) {
    socket.emit("player:ready", { roomCode: room?.roomCode, playerId, isReady });
  }

  function startGame() {
    socket.emit("game:start", { roomCode: room?.roomCode, playerId, timerSeconds, questionCount }, (res: any) => {
      if (!res.ok) setError(res.error);
    });
  }

  function submitAnswer(answerIndex: number) {
    if (!room || !playerId || !question || selectedAnswer !== null || feedbackStatus !== "idle") return;

    setSelectedAnswer(answerIndex);
    setFeedbackStatus("locked");

    socket.emit(
      "answer:submit",
      { roomCode: room.roomCode, playerId, questionId: question.id, selectedAnswer: answerIndex },
      (res: any) => {
        if (!res.ok) {
          setSelectedAnswer(null);
          setFeedbackStatus("idle");
          return setError(res.error);
        }
      }
    );
  }

  function goHome() {
    setRoom(null);
    setQuestion(null);
    setPlayerId(null);
    setRoomCodeInput("");
    setAnswerResult(null);
    setFeedbackStatus("idle");
    setCorrectAnswer(null);
    setSelectedAnswer(null);
    setExplanation(null);
    setError(null);
  }

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choisis une image valide.");
      return;
    }

    if (file.size > 600_000) {
      setError("Image trop lourde. Utilise une image de moins de 600 Ko pour le mode local.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatar(reader.result);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-red-50 px-6 py-12">
        <section className="mx-auto flex min-h-[80vh] max-w-6xl items-center">
          <div className="w-full overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-8 md:p-12">
                <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">Masmis</p>
                <h1 className="mt-4 text-4xl font-black leading-tight text-slate-950 md:text-6xl">
                  Révise la naturalisation française en mode quiz.
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                  Crée une salle, invite jusqu'à 8 joueurs, réponds vite et grimpe au classement.
                </p>

                <div className="mt-8 grid gap-4">
                  <input
                    className="rounded-2xl border border-slate-300 px-4 py-4 text-lg outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    placeholder="Nom d'utilisateur"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />

                  <div className="rounded-3xl bg-slate-50 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <AvatarBubble avatar={avatar} size="lg" />
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest text-slate-500">Avatar</p>
                        <p className="text-sm text-slate-600">Choisis un avatar ou importe ta photo.</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {avatars.map((item) => (
                        <button
                          key={item}
                          onClick={() => setAvatar(item)}
                          className={`rounded-2xl border px-4 py-3 text-2xl transition hover:scale-105 ${
                            avatar === item ? "border-blue-700 bg-blue-50 shadow-md" : "border-slate-200 bg-white"
                          }`}
                        >
                          {item}
                        </button>
                      ))}

                      <label className="cursor-pointer rounded-2xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100">
                        📷 Photo
                        <input type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarUpload} />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid gap-3 md:grid-cols-2">
                  <button
                    onClick={createRoom}
                    className="rounded-2xl bg-blue-700 px-5 py-4 text-lg font-black text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-800"
                  >
                    Créer une salle
                  </button>

                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-2xl border border-slate-300 px-4 py-3 uppercase outline-none focus:border-slate-950"
                      placeholder="Code salle"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    />
                    <button
                      onClick={joinRoom}
                      className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800"
                    >
                      Rejoindre
                    </button>
                  </div>
                </div>

                {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">{error}</p>}
              </div>

              <div className="flex items-center justify-center bg-slate-950 p-8 text-white">
                <div className="w-full max-w-sm rounded-3xl bg-white/10 p-6 ring-1 ring-white/10">
                  <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-200">Mode multijoueur</p>
                  <div className="mt-6 space-y-4">
                    {[
                      ["⚡", "Réponds vite", "Plus tu réponds vite, plus tu gagnes de points."],
                      ["🏆", "Classement final", "Compare score, précision et temps moyen."],
                      ["📚", "Sources officielles", "Questions inspirées des documents de naturalisation."]
                    ].map(([icon, title, text]) => (
                      <div key={title} className="rounded-2xl bg-white/10 p-4">
                        <div className="text-3xl">{icon}</div>
                        <p className="mt-2 font-black">{title}</p>
                        <p className="mt-1 text-sm text-slate-300">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (room.status === "finished") {
    const ranked = [...room.players].sort((a, b) => b.score - a.score);
    const winner = ranked[0];

    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-6 py-10 text-white">
        <section className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-300">Partie terminée</p>
              <h1 className="mt-2 text-4xl font-black md:text-6xl">Classement final</h1>
            </div>

            <button
              onClick={goHome}
              className="rounded-2xl bg-white px-5 py-3 font-black text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
            >
              Retour à l’accueil
            </button>
          </div>

          {winner && (
            <div className="mt-8 overflow-hidden rounded-[2rem] bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-100 p-1 text-slate-950 shadow-2xl">
              <div className="rounded-[1.8rem] bg-white/80 p-8 text-center backdrop-blur">
                <div className="flex justify-center"><AvatarBubble avatar={winner.avatarUrl} size="lg" /></div>
                <div className="mt-3 text-6xl">🏆</div>
                <p className="mt-3 text-sm font-black uppercase tracking-[0.3em] text-amber-700">Grand gagnant</p>
                <h2 className="mt-2 text-4xl font-black">{winner.username}</h2>
                <p className="mt-2 text-2xl font-black text-blue-700">{winner.score} points</p>
              </div>
            </div>
          )}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {ranked.slice(0, 3).map((p, i) => (
              <div key={p.id} className="rounded-3xl bg-white/10 p-6 text-center ring-1 ring-white/10 backdrop-blur">
                <div className="flex justify-center"><AvatarBubble avatar={p.avatarUrl} size="lg" /></div>
                <div className="mt-3 text-5xl">{["🥇", "🥈", "🥉"][i]}</div>
                <p className="mt-3 text-xl font-black">{p.username}</p>
                <p className="mt-1 text-3xl font-black text-blue-300">{p.score}</p>
                <p className="mt-1 text-sm text-slate-300">points</p>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-4">
            {ranked.map((p, i) => {
              const accuracy = accuracyPercent(p.correctAnswers, p.totalAnswers);
              const avgTime = formatSeconds(p.averageResponseTimeMs);

              return (
                <div key={p.id} className="rounded-3xl bg-white p-5 text-slate-950 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-black text-slate-400">#{i + 1}</div>
                      <AvatarBubble avatar={p.avatarUrl} />
                      <div>
                        <div className="text-lg font-black">{p.username}</div>
                        <p className="text-sm text-slate-500">{accuracy >= 80 ? "🔥 Excellent" : accuracy >= 50 ? "👍 Bon score" : "💪 À revoir"}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-blue-50 px-5 py-3 text-right">
                      <p className="text-3xl font-black text-blue-700">{p.score}</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-500">points</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Bonnes réponses</p>
                      <p className="mt-1 text-3xl font-black text-slate-950">{p.correctAnswers}/{p.totalAnswers}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Précision</p>
                      <p className="mt-1 text-3xl font-black text-slate-950">{accuracy}%</p>
                    </div>
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Temps moyen</p>
                      <p className="mt-1 text-3xl font-black text-slate-950">{avgTime}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
                      <span>Précision</span>
                      <span>{accuracy}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-700" style={{ width: `${accuracy}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={goHome}
              className="rounded-2xl bg-blue-600 px-8 py-4 text-lg font-black text-white shadow-lg shadow-blue-900/40 transition hover:-translate-y-0.5 hover:bg-blue-500"
            >
              Nouvelle partie
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (question) {
    const progress = Math.max(0, Math.min(100, (timeLeft / question.timerSeconds) * 100));
    const lockedCount = room.players.filter((p) => p.currentAnswerStatus === "locked" || p.currentAnswerStatus === "correct" || p.currentAnswerStatus === "wrong" || p.currentAnswerStatus === "missed").length;

    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 px-6 py-10">
        <section className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black text-blue-700">
                Question {questionNumber}/{room.totalQuestions}
              </p>
              <p className="text-sm text-slate-500">Salle {room.roomCode}</p>
            </div>

            <div className={`rounded-2xl px-5 py-3 text-2xl font-black ${timeLeft <= 3 ? "bg-red-100 text-red-700" : "bg-white text-slate-950"}`}>
              ⏱️ {timeLeft}s
            </div>
          </div>

          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-all ${timeLeft <= 3 ? "bg-red-600" : "bg-blue-700"}`} style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200">
              <div className="p-6 md:p-8">
                <div className="flex flex-wrap gap-2 text-sm font-bold">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{question.category}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{question.difficulty}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{question.timerSeconds}s</span>
                </div>

                <h1 className="mt-5 text-3xl font-black leading-tight text-slate-950 md:text-4xl">{question.questionText}</h1>

                <div className="mt-8 grid gap-3">
                  {question.answers.map((answer, index) => {
                    const answerNumber = index + 1;
                    const isCorrectAnswer = correctAnswer === answerNumber;
                    const isSelected = selectedAnswer === answerNumber;
                    const selectedWasCorrect = feedbackStatus === "revealed" && answerResult?.isCorrect && isSelected;
                    const selectedWasWrong = feedbackStatus === "revealed" && answerResult && !answerResult.isCorrect && isSelected;

                    let className = "border-slate-200 bg-white hover:bg-slate-50 hover:-translate-y-0.5";

                    if (isSelected && feedbackStatus === "locked") {
                      className = "border-amber-400 bg-amber-50";
                    }

                    if (selectedWasCorrect) {
                      className = "border-green-600 bg-green-50 text-green-900";
                    }

                    if (selectedWasWrong) {
                      className = "border-red-600 bg-red-50 text-red-900";
                    }

                    if (feedbackStatus === "revealed" && isCorrectAnswer) {
                      className = "border-green-600 bg-green-50 text-green-900";
                    }

                    return (
                      <button
                        disabled={selectedAnswer !== null || feedbackStatus !== "idle"}
                        key={`${answer}-${index}`}
                        onClick={() => submitAnswer(answerNumber)}
                        className={`rounded-2xl border-2 p-5 text-left font-bold shadow-sm transition ${className}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                            {answerNumber}
                          </span>

                          <span className="flex-1">{answer}</span>

                          {isSelected && feedbackStatus === "locked" && <span className="text-2xl">🔒</span>}
                          {selectedWasCorrect && <span className="text-2xl">✅</span>}
                          {selectedWasWrong && <span className="text-2xl">❌</span>}
                          {feedbackStatus === "revealed" && isCorrectAnswer && !isSelected && <span className="text-2xl">✅</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {feedbackStatus === "locked" && (
                  <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <div className="text-4xl">🔒</div>
                    <p className="mt-2 text-2xl font-black text-amber-800">Réponse verrouillée</p>
                    <p className="mt-1 text-sm font-semibold text-amber-700">
                      Attends la fin du timer pour voir la bonne réponse.
                    </p>
                  </div>
                )}

                {feedbackStatus === "revealed" && answerResult && (
                  <div
                    className={`mt-6 rounded-3xl p-6 text-center shadow-lg ${
                      answerResult.isCorrect ? "bg-green-600 text-white" : "bg-red-600 text-white"
                    }`}
                  >
                    <div className="text-6xl">{answerResult.isCorrect ? "✅" : answerResult.selectedAnswer === null ? "⏰" : "❌"}</div>
                    <p className="mt-2 text-4xl font-black">
                      {answerResult.isCorrect ? "CORRECT !" : answerResult.selectedAnswer === null ? "TEMPS ÉCOULÉ !" : "FAUX !"}
                    </p>
                    <p className="mt-2 text-2xl font-black">+{answerResult.points} points</p>
                    <p className="mt-2 text-sm opacity-90">
                      {answerResult.isCorrect ? "Bien joué, tu as marqué des points." : "La bonne réponse est maintenant affichée en vert."}
                    </p>
                  </div>
                )}

                {explanation && (
                  <div className="mt-5 rounded-2xl bg-slate-100 p-5">
                    <p className="text-sm font-black uppercase tracking-widest text-slate-500">Explication</p>
                    <p className="mt-2 text-slate-700">{explanation}</p>
                  </div>
                )}
              </div>
            </section>

            <aside className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-blue-300">Joueurs</p>
                  <h2 className="text-2xl font-black">État des réponses</h2>
                </div>
                <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-black">
                  {lockedCount}/{room.players.length}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {room.players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((p) => {
                    const status = statusLabel(p.currentAnswerStatus, p.currentAnswerPoints);
                    return (
                      <div key={p.id} className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                        <div className="flex items-center gap-3">
                          <AvatarBubble avatar={p.avatarUrl} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-black">{p.username}</p>
                            <p className="text-xs text-slate-300">{p.score} points</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status.className}`}>
                            {status.icon} {status.text}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm text-slate-300">
                Les réponses restent secrètes jusqu'à la fin du timer. Le score est calculé au reveal.
              </div>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 px-6 py-10">
      <section className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">Lobby</p>
            <h1 className="mt-2 text-4xl font-black text-slate-950">Salle {room.roomCode}</h1>
          </div>

          <span className="rounded-full bg-white px-5 py-3 text-sm font-black ring-1 ring-slate-200">
            {room.players.length}/8 joueurs
          </span>
        </div>

        <div className="mt-6 grid gap-3">
          {room.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 font-black">
                <AvatarBubble avatar={p.avatarUrl} />
                <span>{p.username} {p.isHost && <span className="text-blue-700">· Host</span>}</span>
              </div>
              <div className={`rounded-full px-3 py-1 text-sm font-bold ${p.isReady ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {p.isReady ? "Prêt" : "Pas prêt"}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {isHost ? (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-sm font-bold">
                Timer
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Number(e.target.value))}
                  className="rounded-xl border px-3 py-2"
                />
              </label>

              <label className="grid gap-1 text-sm font-bold">
                Questions
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="rounded-xl border px-3 py-2"
                />
              </label>

              <button onClick={startGame} className="self-end rounded-2xl bg-blue-700 px-6 py-3 font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-800">
                Lancer
              </button>
            </div>
          ) : (
            <button
              onClick={() => setReady(!me?.isReady)}
              className="rounded-2xl bg-blue-700 px-6 py-3 font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-800"
            >
              {me?.isReady ? "Annuler prêt" : "Je suis prêt"}
            </button>
          )}

          {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">{error}</p>}
        </div>
      </section>
    </main>
  );
}
