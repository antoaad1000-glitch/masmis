"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  accuracyPercent,
  type AnswerStatus,
  type PlayerQuestionResult,
  type PublicQuestion,
  type ReviewQuestion,
  type RoomState
} from "@masmis/shared";
import { getSocket } from "@/lib/socket";

type RevealPayload = {
  questionId: string;
  correctAnswer: number;
  explanation?: string | null;
  playerResults: PlayerQuestionResult[];
  reviewItem?: ReviewQuestion;
};

type QuestionShowPayload = {
  question: PublicQuestion;
  index: number;
  total: number;
  startedAt: number;
};

type SocketResponse = {
  ok: boolean;
  error?: string;
  playerId?: string;
  room?: RoomState;
  selectedAnswer?: number;
};

type FeedbackStatus = "idle" | "selected" | "revealed";
type SoundKind = "select" | "correct" | "wrong";

const avatars = ["🇫🇷", "🗼", "🐓", "📚", "⚖️", "🎨", "🏛️", "🥐", "🧠", "⭐", "🚀", "🦊"];

function isImageAvatar(avatar?: string | null) {
  return Boolean(
    avatar &&
      (avatar.startsWith("data:image/") ||
        avatar.startsWith("http://") ||
        avatar.startsWith("https://"))
  );
}

function AvatarBubble({
  avatar,
  size = "md"
}: {
  avatar?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "h-16 w-16 text-4xl"
      : size === "sm"
        ? "h-10 w-10 text-xl"
        : "h-12 w-12 text-2xl";

  if (isImageAvatar(avatar)) {
    return (
      <img
        src={avatar ?? ""}
        alt="Avatar"
        className={`${sizeClass} shrink-0 rounded-2xl object-cover ring-2 ring-white/70`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200`}
    >
      {avatar || "🙂"}
    </span>
  );
}

function statusLabel(status?: AnswerStatus, points?: number) {
  switch (status) {
    case "choosing":
      return { text: "Réfléchit", icon: "🤔", className: "bg-slate-100 text-slate-600" };
    case "locked":
      return { text: "Répondu", icon: "✍️", className: "bg-blue-100 text-blue-800" };
    case "correct":
      return {
        text: `Correct +${points ?? 0}`,
        icon: "✅",
        className: "bg-green-100 text-green-800"
      };
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

function answerLetter(index: number) {
  return ["A", "B", "C", "D"][index - 1] ?? String(index);
}

function normalizeRoomCode(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function getRoomCodeFromCurrentUrl() {
  if (typeof window === "undefined") return "";

  const currentUrl = new URL(window.location.href);

  const fromQuery = normalizeRoomCode(
    currentUrl.searchParams.get("room") ??
      currentUrl.searchParams.get("code") ??
      currentUrl.searchParams.get("r") ??
      ""
  );

  if (fromQuery) return fromQuery;

  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
  const fromHash = normalizeRoomCode(hashParams.get("room") ?? hashParams.get("code") ?? "");

  if (fromHash) return fromHash;

  const pathMatch = currentUrl.pathname.match(/\/(?:room|join)\/([A-Za-z0-9]{4,8})/i);
  return normalizeRoomCode(pathMatch?.[1] ?? "");
}

export function GameClient() {
  const socket = useMemo(() => getSocket(), []);

  const [username, setUsername] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [answerResult, setAnswerResult] = useState<PlayerQuestionResult | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(avatars[0]);
  const [timerSeconds, setTimerSeconds] = useState(10);
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLeft, setTimeLeft] = useState(10);
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [invitedRoomCode, setInvitedRoomCode] = useState<string | null>(null);
  const [canAutoJoinInvitation, setCanAutoJoinInvitation] = useState(false);

  const me = room?.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);

  const playSound = useCallback(
    (kind: SoundKind) => {
      if (!soundEnabled || typeof window === "undefined") return;

      const AudioContextClass =
        window.AudioContext ??
        (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const masterGain = audioContext.createGain();
      masterGain.gain.value = 0.055;
      masterGain.connect(audioContext.destination);

      const now = audioContext.currentTime;

      const pattern =
        kind === "correct"
          ? [
              { frequency: 660, start: 0, duration: 0.09 },
              { frequency: 880, start: 0.1, duration: 0.13 }
            ]
          : kind === "wrong"
            ? [
                { frequency: 260, start: 0, duration: 0.12 },
                { frequency: 210, start: 0.13, duration: 0.14 }
              ]
            : [{ frequency: 520, start: 0, duration: 0.06 }];

      for (const tone of pattern) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = tone.frequency;
        oscillator.connect(gain);
        gain.connect(masterGain);

        gain.gain.setValueAtTime(0.001, now + tone.start);
        gain.gain.exponentialRampToValueAtTime(1, now + tone.start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + tone.start + tone.duration);

        oscillator.start(now + tone.start);
        oscillator.stop(now + tone.start + tone.duration + 0.03);
      }

      window.setTimeout(() => {
        void audioContext.close();
      }, 600);
    },
    [soundEnabled]
  );

  useEffect(() => {
    const savedSound = localStorage.getItem("masmis_sound_enabled");
    if (savedSound === "false") setSoundEnabled(false);

    const savedUsername = localStorage.getItem("masmis_username") ?? "";
    const savedAvatar = localStorage.getItem("masmis_avatar") ?? "";

    if (savedUsername.trim()) setUsername(savedUsername);
    if (savedAvatar) setAvatar(savedAvatar);

    const roomFromLink = getRoomCodeFromCurrentUrl();

    if (roomFromLink) {
      setInvitedRoomCode(roomFromLink);
      setRoomCodeInput(roomFromLink);
      setError(`Invitation détectée : salle ${roomFromLink}`);

      if (savedUsername.trim()) {
        setCanAutoJoinInvitation(true);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("masmis_sound_enabled", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    socket.on("room:update", setRoom);

    socket.on("question:show", ({ question, index, startedAt }: QuestionShowPayload) => {
      setQuestion(question);
      setQuestionNumber(index);
      setAnswerResult(null);
      setFeedbackStatus("idle");
      setCorrectAnswer(null);
      setSelectedAnswer(null);
      setExplanation(null);
      setTimeLeft(question.timerSeconds);
      setQuestionStartedAt(startedAt);
      setShowReview(false);
    });

    socket.on("question:reveal", ({ correctAnswer, explanation, playerResults }: RevealPayload) => {
      setCorrectAnswer(correctAnswer);
      setExplanation(explanation ?? null);

      const mine = playerResults.find((result) => result.playerId === playerId) ?? null;

      setAnswerResult(mine);
      setSelectedAnswer(mine?.selectedAnswer ?? null);
      setFeedbackStatus("revealed");
      setTimeLeft(0);

      if (mine) {
        playSound(mine.isCorrect ? "correct" : "wrong");
      }
    });

    socket.on("game:finished", (room: RoomState) => {
      setRoom(room);
      setQuestion(null);
      setFeedbackStatus("idle");
      setShowReview(false);
    });

    return () => {
      socket.off("room:update");
      socket.off("question:show");
      socket.off("question:reveal");
      socket.off("game:finished");
    };
  }, [socket, playerId, playSound]);

  useEffect(() => {
    if (!canAutoJoinInvitation || !invitedRoomCode || room || playerId || !username.trim()) return;

    setCanAutoJoinInvitation(false);
    setError(`Connexion à la salle ${invitedRoomCode}...`);

    socket.emit(
      "room:join",
      { roomCode: invitedRoomCode, username: username.trim(), avatarUrl: avatar },
      (res: SocketResponse) => {
        if (!res.ok) {
          setError(res.error ?? `Impossible de rejoindre la salle ${invitedRoomCode}.`);
          return;
        }

        saveProfile();
        clearInvitationFromUrl();
        setPlayerId(res.playerId ?? null);
        setRoom(res.room ?? null);
        setShowReview(false);
        setError(null);
      }
    );
  }, [avatar, canAutoJoinInvitation, invitedRoomCode, playerId, room, socket, username]);

  useEffect(() => {
    if (!question || !questionStartedAt || feedbackStatus === "revealed") return;

    const interval = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - questionStartedAt) / 1000);
      setTimeLeft(Math.max(0, question.timerSeconds - elapsedSeconds));
    }, 200);

    return () => window.clearInterval(interval);
  }, [question?.id, questionStartedAt, feedbackStatus]);

  function ensureUsername() {
    if (!username.trim()) {
      setError("Choisis un nom d'utilisateur.");
      return false;
    }

    setError(null);
    return true;
  }

  function saveProfile() {
    localStorage.setItem("masmis_username", username.trim());
    localStorage.setItem("masmis_avatar", avatar);
  }

  function clearInvitationFromUrl() {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("code");
    url.searchParams.delete("r");
    url.hash = "";

    const nextUrl = `${url.pathname}${url.search}${url.hash}` || "/";
    window.history.replaceState({}, "", nextUrl);
  }

  function createRoom() {
    if (!ensureUsername()) return;

    socket.emit("room:create", { username: username.trim(), avatarUrl: avatar }, (res: SocketResponse) => {
      if (!res.ok) return setError(res.error ?? "Impossible de créer la salle.");

      saveProfile();
      clearInvitationFromUrl();
      setInvitedRoomCode(null);
      setPlayerId(res.playerId ?? null);
      setRoom(res.room ?? null);
      setShowReview(false);
      setError(null);
    });
  }

  function joinRoom() {
    if (!ensureUsername()) return;

    const roomCode = normalizeRoomCode(roomCodeInput || invitedRoomCode);

    if (!roomCode) {
      setError("Entre un code de salle.");
      return;
    }

    socket.emit("room:join", { roomCode, username: username.trim(), avatarUrl: avatar }, (res: SocketResponse) => {
      if (!res.ok) return setError(res.error ?? "Impossible de rejoindre la salle.");

      saveProfile();
      clearInvitationFromUrl();
      setPlayerId(res.playerId ?? null);
      setRoom(res.room ?? null);
      setShowReview(false);
      setError(null);
    });
  }

  function setReady(isReady: boolean) {
    socket.emit("player:ready", { roomCode: room?.roomCode, playerId, isReady });
  }

  function startGame() {
    socket.emit(
      "game:start",
      { roomCode: room?.roomCode, playerId, timerSeconds, questionCount },
      (res: SocketResponse) => {
        if (!res.ok) setError(res.error ?? "Impossible de lancer la partie.");
      }
    );
  }

  function submitAnswer(answerIndex: number) {
    if (!room || !playerId || !question || feedbackStatus === "revealed") return;

    const previousAnswer = selectedAnswer;

    setSelectedAnswer(answerIndex);
    setFeedbackStatus("selected");
    setError(null);
    playSound("select");

    socket.emit(
      "answer:submit",
      { roomCode: room.roomCode, playerId, questionId: question.id, selectedAnswer: answerIndex },
      (res: SocketResponse) => {
        if (!res.ok) {
          setSelectedAnswer(previousAnswer);
          setFeedbackStatus(previousAnswer ? "selected" : "idle");
          return setError(res.error ?? "La réponse n'a pas pu être envoyée.");
        }
      }
    );
  }

  function goHome() {
    setRoom(null);
    setQuestion(null);
    setPlayerId(null);
    setRoomCodeInput("");
    setInvitedRoomCode(null);
    clearInvitationFromUrl();
    setAnswerResult(null);
    setFeedbackStatus("idle");
    setCorrectAnswer(null);
    setSelectedAnswer(null);
    setExplanation(null);
    setError(null);
    setShowReview(false);
  }

  function toggleSound() {
    setSoundEnabled((value) => !value);
  }

  function invitationUrl() {
    const code = room?.roomCode ?? "";
    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin.replace(/\/$/, "")
        : "https://www.masmis.xyz";

    return `${baseUrl}/?room=${encodeURIComponent(code)}`;
  }

  function invitationText() {
    const code = room?.roomCode ?? "";

    return `Rejoins ma partie Masmis :
${invitationUrl()}

Code : ${code}`;
  }

  async function copyRoomCode() {
    if (!room?.roomCode) return;

    try {
      await navigator.clipboard.writeText(room.roomCode);
      setShareStatus("Code copié");
    } catch {
      setShareStatus("Code : " + room.roomCode);
    }

    window.setTimeout(() => setShareStatus(null), 1800);
  }

  async function copyInvitation() {
    if (!room?.roomCode) return;

    try {
      await navigator.clipboard.writeText(invitationText());
      setShareStatus("Invitation copiée");
    } catch {
      setShareStatus("Lien : " + invitationUrl());
    }

    window.setTimeout(() => setShareStatus(null), 1800);
  }

  async function shareRoom() {
    if (!room?.roomCode) return;

    const text = invitationText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Masmis",
          text
        });

        return;
      } catch {
        // User cancelled or native share failed. Fall back to copy.
      }
    }

    await copyInvitation();
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Image illisible."));
      };

      reader.onerror = () => reject(new Error("Image illisible."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible."));
      image.src = src;
    });
  }

  async function compressAvatar(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const maxSide = 360;
    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Compression impossible.");

    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const compressed = canvas.toDataURL("image/jpeg", quality);
      if (compressed.length < 600_000) return compressed;
    }

    return canvas.toDataURL("image/jpeg", 0.45);
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choisis une image valide.");
      return;
    }

    if (file.size > 12_000_000) {
      setError("Photo trop lourde. Choisis une photo de moins de 12 Mo.");
      return;
    }

    try {
      const compressed = await compressAvatar(file);
      setAvatar(compressed);
      setError(null);
    } catch {
      setError("Impossible d'utiliser cette photo. Essaie une autre image.");
    } finally {
      event.target.value = "";
    }
  }

  const sortedPlayers = room?.players.slice().sort((a, b) => b.score - a.score) ?? [];
  const answeredCount =
    room?.players.filter((p) => p.currentAnswerStatus && p.currentAnswerStatus !== "choosing")
      .length ?? 0;
  const totalQuestions = room?.totalQuestions || questionCount;
  const progressPercent = question
    ? Math.max(0, Math.min(100, (timeLeft / question.timerSeconds) * 100))
    : 0;

  if (!room) {
    return (
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-red-50 px-3 py-4 sm:px-6 sm:py-10">
        <section className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md min-w-0 items-center sm:max-w-6xl">
          <div className="w-full max-w-full min-w-0 overflow-hidden rounded-[1.5rem] bg-white shadow-xl ring-1 ring-slate-200 sm:rounded-[2rem]">
            <div className="grid min-w-0 gap-0 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="min-w-0 p-4 sm:p-8 md:p-12">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">
                    Masmis
                  </p>

                  <button
                    type="button"
                    onClick={toggleSound}
                    className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-700"
                    aria-label="Activer ou désactiver le son"
                  >
                    {soundEnabled ? "🔊" : "🔇"}
                  </button>
                </div>

                <h1 className="mt-4 max-w-full text-3xl font-black leading-tight text-slate-950 min-[380px]:text-4xl sm:text-5xl md:text-6xl">
                  Quiz naturalisation française.
                </h1>

                <p className="mt-4 max-w-full text-[15px] leading-7 text-slate-600 sm:text-lg sm:leading-8">
                  {invitedRoomCode
                    ? `Choisis ton nom pour rejoindre automatiquement la salle ${invitedRoomCode}.`
                    : "Crée une salle, invite tes amis et révise avec les explications après chaque question."}
                </p>

                {invitedRoomCode && (
                  <div className="mt-5 rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-100">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-700">
                      Invitation reçue
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-700">
                      Salle <span className="font-black text-blue-700">{invitedRoomCode}</span>{" "}
                      prête à rejoindre.
                    </p>
                  </div>
                )}

                <div className="mt-7 grid gap-4">
                  <label className="grid gap-2 text-sm font-black text-slate-700">
                    Ton nom
                    <input
                      className="h-14 rounded-2xl border border-slate-300 px-4 text-lg outline-none transition focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                      placeholder="Ex : Elias"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>

                  <div className="w-full max-w-full min-w-0 rounded-3xl bg-slate-50 p-3 sm:p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <AvatarBubble avatar={avatar} size="lg" />

                      <div>
                        <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                          Avatar
                        </p>
                        <p className="text-sm text-slate-600">
                          Emoji ou selfie compressé automatiquement.
                        </p>
                      </div>
                    </div>

                    <div className="grid w-full min-w-0 grid-cols-3 gap-2 min-[390px]:grid-cols-4 sm:grid-cols-6">
                      {avatars.map((item) => (
                        <button
                          type="button"
                          key={item}
                          onClick={() => setAvatar(item)}
                          className={`min-h-12 min-w-0 rounded-2xl border text-xl transition active:scale-95 sm:text-2xl ${
                            avatar === item
                              ? "border-blue-700 bg-blue-50 shadow-md"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>

                    <label className="mt-3 block cursor-pointer rounded-2xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-700">
                      Importer une photo / selfie
                      <input
                        className="hidden"
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="min-w-0 overflow-hidden bg-slate-950 p-4 text-white sm:p-8 md:p-10">
                <div className="min-w-0 overflow-hidden rounded-[1.75rem] bg-white/10 p-4 ring-1 ring-white/10 sm:p-5">
                  <h2 className="text-2xl font-black">Jouer maintenant</h2>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Sur téléphone, les boutons sont grands et tu peux changer ta réponse jusqu'à la
                    fin du timer.
                  </p>

                  <div className="mt-5 grid gap-3">
                    <button
                      type="button"
                      onClick={createRoom}
                      className="h-14 rounded-2xl bg-blue-600 px-5 text-lg font-black text-white shadow-lg shadow-blue-950/20 transition active:scale-[0.98]"
                    >
                      Créer une salle
                    </button>

                    <div className="grid w-full min-w-0 max-w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        className="block h-14 w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-white px-3 text-center text-lg font-black uppercase tracking-[0.18em] text-slate-950 outline-none sm:px-4 sm:text-xl sm:tracking-[0.25em]"
                        placeholder="CODE"
                        value={roomCodeInput}
                        maxLength={6}
                        onChange={(e) => setRoomCodeInput(normalizeRoomCode(e.target.value))}
                      />

                      <button
                        type="button"
                        onClick={joinRoom}
                        className="h-14 w-full min-w-0 max-w-full rounded-2xl bg-white px-5 text-lg font-black text-slate-950 transition active:scale-[0.98] sm:w-auto"
                      >
                        {invitedRoomCode ? `Rejoindre ${invitedRoomCode}` : "Rejoindre"}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                      {error}
                    </p>
                  )}
                </div>

                <div className="mt-5 grid min-w-0 grid-cols-3 gap-2 text-center sm:gap-3">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-2xl font-black">8</p>
                    <p className="text-xs text-slate-300">max joueurs</p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-2xl font-black">↔</p>
                    <p className="text-xs text-slate-300">réponse modifiable</p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-2xl font-black">💡</p>
                    <p className="text-xs text-slate-300">explications</p>
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
    return (
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-slate-100 px-3 py-4 sm:px-6 sm:py-10">
        <section className="mx-auto w-full max-w-5xl min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">
                Résultats
              </p>
              <h1 className="mt-2 text-4xl font-black text-slate-950 sm:text-5xl">
                Partie terminée
              </h1>
            </div>

            <button
              onClick={goHome}
              className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white"
            >
              Accueil
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            {sortedPlayers.map((p, index) => (
              <article key={p.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">
                    #{index + 1}
                  </div>

                  <AvatarBubble avatar={p.avatarUrl} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-black">{p.username}</p>
                    <p className="text-sm font-semibold text-slate-500">
                      {p.correctAnswers}/{p.totalAnswers} corrects ·{" "}
                      {accuracyPercent(p.correctAnswers, p.totalAnswers)}% · moyenne{" "}
                      {formatSeconds(p.averageResponseTimeMs)}
                    </p>
                  </div>

                  <p className="text-2xl font-black text-blue-700">{p.score}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowReview((value) => !value)}
              className="min-h-14 flex-1 rounded-2xl bg-blue-700 px-5 py-3 text-lg font-black text-white shadow-lg shadow-blue-100"
            >
              {showReview ? "Masquer la correction" : "Revoir toutes les questions"}
            </button>

            <button
              type="button"
              onClick={goHome}
              className="min-h-14 rounded-2xl bg-white px-5 py-3 text-lg font-black text-slate-950 ring-1 ring-slate-200"
            >
              Nouvelle salle
            </button>
          </div>

          {showReview && (
            <div className="mt-6 space-y-4">
              {(room.review ?? []).map((item, index) => {
                const mine = item.playerResults.find((result) => result.playerId === playerId);

                return (
                  <article key={item.questionId} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-black uppercase tracking-widest text-blue-700">
                        Question {index + 1}
                      </p>

                      <span
                        className={`rounded-full px-3 py-1 text-sm font-black ${
                          mine?.isCorrect
                            ? "bg-green-100 text-green-800"
                            : mine?.selectedAnswer
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {mine?.isCorrect ? "Correct" : mine?.selectedAnswer ? "Faux" : "Manqué"}
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl font-black leading-snug text-slate-950">
                      {item.questionText}
                    </h2>

                    <div className="mt-4 grid gap-2">
                      {item.answers.map((answer, answerIndex) => {
                        const answerNumber = answerIndex + 1;
                        const isCorrect = answerNumber === item.correctAnswer;
                        const isMine = answerNumber === mine?.selectedAnswer;

                        return (
                          <div
                            key={`${item.questionId}-${answerIndex}`}
                            className={`rounded-2xl border px-4 py-3 font-semibold ${
                              isCorrect
                                ? "border-green-500 bg-green-50 text-green-900"
                                : isMine
                                  ? "border-red-500 bg-red-50 text-red-900"
                                  : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <span className="font-black">{answerLetter(answerNumber)}.</span>{" "}
                            {answer}
                            {isCorrect && <span className="ml-2">✅</span>}
                            {isMine && !isCorrect && <span className="ml-2">❌</span>}
                          </div>
                        );
                      })}
                    </div>

                    {item.explanation && (
                      <div className="mt-4 rounded-2xl bg-blue-50 p-4">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-700">
                          Explication
                        </p>
                        <p className="mt-2 leading-7 text-slate-700">{item.explanation}</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  if (question) {
    return (
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-slate-100 px-3 py-4 sm:px-6 sm:py-8">
        <section className="mx-auto w-full max-w-6xl min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200 sm:p-4">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-blue-700">
                Salle {room.roomCode}
              </p>
              <p className="truncate text-sm font-bold text-slate-500">
                Question {questionNumber}/{totalQuestions}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-700"
              >
                {soundEnabled ? "🔊" : "🔇"}
              </button>

              <div className="rounded-2xl bg-slate-950 px-4 py-2 text-center text-white">
                <p className="text-2xl font-black leading-none">{timeLeft}</p>
                <p className="text-[10px] font-bold uppercase text-slate-300">sec</p>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 rounded-[1.5rem] bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:rounded-[2rem] sm:p-6 md:p-8">
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">{question.category}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {question.difficulty}
                </span>
              </div>

              <h1 className="mt-4 break-words text-2xl font-black leading-tight text-slate-950 sm:text-3xl md:text-4xl">
                {question.questionText}
              </h1>

              {feedbackStatus !== "revealed" && (
                <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                  {selectedAnswer
                    ? "Réponse choisie. Tu peux encore changer avant la fin du timer."
                    : "Choisis une réponse. Tu peux la modifier jusqu'à la fin du timer."}
                </div>
              )}

              <div className="mt-5 grid gap-3">
                {question.answers.map((answer, index) => {
                  const answerNumber = index + 1;
                  const isCorrectAnswer = correctAnswer === answerNumber;
                  const isSelected = selectedAnswer === answerNumber;
                  const selectedWasCorrect =
                    feedbackStatus === "revealed" && answerResult?.isCorrect && isSelected;
                  const selectedWasWrong =
                    feedbackStatus === "revealed" && answerResult && !answerResult.isCorrect && isSelected;

                  let className = "border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99]";

                  if (isSelected && feedbackStatus !== "revealed") {
                    className = "border-blue-600 bg-blue-50 text-blue-950 shadow-md";
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
                      type="button"
                      disabled={feedbackStatus === "revealed"}
                      key={`${question.id}-${index}`}
                      onClick={() => submitAnswer(answerNumber)}
                      className={`min-h-16 rounded-2xl border-2 p-4 text-left font-bold shadow-sm transition sm:min-h-20 sm:p-5 ${className}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
                          {answerLetter(answerNumber)}
                        </span>

                        <span className="min-w-0 flex-1 break-words text-base sm:text-lg">
                          {answer}
                        </span>

                        {isSelected && feedbackStatus !== "revealed" && (
                          <span className="text-2xl">✍️</span>
                        )}
                        {selectedWasCorrect && <span className="text-2xl">✅</span>}
                        {selectedWasWrong && <span className="text-2xl">❌</span>}
                        {feedbackStatus === "revealed" && isCorrectAnswer && !isSelected && (
                          <span className="text-2xl">✅</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {feedbackStatus === "revealed" && answerResult && (
                <div
                  className={`mt-6 rounded-3xl p-5 text-center shadow-lg sm:p-6 ${
                    answerResult.isCorrect ? "bg-green-600 text-white" : "bg-red-600 text-white"
                  }`}
                >
                  <div className="text-5xl sm:text-6xl">
                    {answerResult.isCorrect ? "✅" : answerResult.selectedAnswer === null ? "⏰" : "❌"}
                  </div>

                  <p className="mt-2 text-3xl font-black sm:text-4xl">
                    {answerResult.isCorrect
                      ? "CORRECT !"
                      : answerResult.selectedAnswer === null
                        ? "TEMPS ÉCOULÉ !"
                        : "FAUX !"}
                  </p>

                  <p className="mt-2 text-2xl font-black">+{answerResult.points} points</p>

                  <p className="mt-2 text-sm opacity-90">
                    {answerResult.isCorrect ? "Bien joué." : "La bonne réponse est affichée en vert."}
                  </p>
                </div>
              )}

              {explanation && feedbackStatus === "revealed" && (
                <div className="mt-5 rounded-3xl bg-slate-100 p-5">
                  <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                    Explication
                  </p>
                  <p className="mt-2 leading-7 text-slate-700">{explanation}</p>
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-700">
                  {error}
                </p>
              )}
            </section>

            <aside className="min-w-0 rounded-[1.5rem] bg-slate-950 p-4 text-white shadow-xl sm:rounded-[2rem] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-widest text-blue-300">
                    Joueurs
                  </p>
                  <h2 className="text-xl font-black sm:text-2xl">État des réponses</h2>
                </div>

                <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-black">
                  {answeredCount}/{room.players.length}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {sortedPlayers.map((p) => {
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

              <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-slate-300">
                Les réponses restent secrètes jusqu'à la fin. Tu peux changer ton choix tant que le
                timer tourne.
              </div>
            </aside>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-slate-100 px-3 py-4 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-5xl min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-blue-700">Lobby</p>
            <h1 className="mt-2 text-4xl font-black text-slate-950">Salle {room.roomCode}</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200"
            >
              {soundEnabled ? "🔊 Son" : "🔇 Muet"}
            </button>

            <span className="rounded-2xl bg-white px-4 py-3 text-sm font-black ring-1 ring-slate-200">
              {room.players.length}/8 joueurs
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                Code d'invitation
              </p>
              <p className="text-sm text-slate-500">
                Clique le code pour le copier, ou partage directement l'invitation.
              </p>
            </div>

            {shareStatus && (
              <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-black text-green-700">
                {shareStatus}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={copyRoomCode}
            className="mt-4 w-full rounded-3xl bg-blue-50 px-4 py-5 text-center text-5xl font-black tracking-[0.16em] text-blue-700 ring-1 ring-blue-100 transition active:scale-[0.99] sm:text-left"
            aria-label="Copier le code d'invitation"
          >
            {room.roomCode}
          </button>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={copyRoomCode}
              className="min-h-12 rounded-2xl bg-slate-950 px-4 py-3 font-black text-white transition active:scale-[0.98]"
            >
              Copier le code
            </button>

            <button
              type="button"
              onClick={copyInvitation}
              className="min-h-12 rounded-2xl bg-white px-4 py-3 font-black text-slate-950 ring-1 ring-slate-200 transition active:scale-[0.98]"
            >
              Copier l'invitation
            </button>

            <button
              type="button"
              onClick={shareRoom}
              className="min-h-12 rounded-2xl bg-blue-700 px-4 py-3 font-black text-white transition active:scale-[0.98]"
            >
              Partager
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {room.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex min-w-0 items-center gap-3 font-black">
                <AvatarBubble avatar={p.avatarUrl} />
                <span className="truncate">
                  {p.username} {p.isHost && <span className="text-blue-700">· Host</span>}
                </span>
              </div>

              <div
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                  p.isReady ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {p.isReady ? "Prêt" : "Pas prêt"}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
          {isHost ? (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-sm font-bold">
                Timer par question
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Number(e.target.value))}
                  className="h-12 rounded-xl border px-3 py-2"
                />
              </label>

              <label className="grid gap-1 text-sm font-bold">
                Nombre de questions
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="h-12 rounded-xl border px-3 py-2"
                />
              </label>

              <button
                onClick={startGame}
                className="min-h-14 self-end rounded-2xl bg-blue-700 px-6 py-3 font-black text-white shadow-lg shadow-blue-200 transition active:scale-[0.98] hover:bg-blue-800"
              >
                Lancer
              </button>
            </div>
          ) : (
            <button
              onClick={() => setReady(!me?.isReady)}
              className="min-h-14 w-full rounded-2xl bg-blue-700 px-6 py-3 font-black text-white shadow-lg shadow-blue-200 transition active:scale-[0.98] hover:bg-blue-800 sm:w-auto"
            >
              {me?.isReady ? "Annuler prêt" : "Je suis prêt"}
            </button>
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}