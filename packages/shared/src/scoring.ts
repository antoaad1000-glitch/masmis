export function calculateScore(params: {
  isCorrect: boolean;
  responseTimeMs: number;
  timerSeconds: number;
  maxPoints?: number;
  minCorrectPoints?: number;
}) {
  if (!params.isCorrect) return 0;

  const maxPoints = params.maxPoints ?? 1000;
  const minCorrectPoints = params.minCorrectPoints ?? 400;
  const timerMs = Math.max(1, params.timerSeconds * 1000);
  const normalizedTime = Math.min(1, Math.max(0, params.responseTimeMs / timerMs));
  const score = Math.round(minCorrectPoints + (maxPoints - minCorrectPoints) * (1 - normalizedTime));

  return Math.max(minCorrectPoints, Math.min(maxPoints, score));
}

export function accuracyPercent(correctAnswers: number, totalAnswers: number) {
  if (totalAnswers === 0) return 0;
  return Math.round((correctAnswers / totalAnswers) * 100);
}
