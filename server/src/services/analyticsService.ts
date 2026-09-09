export interface QuestionTelemetryInput {
  selected_answer?: string;
  is_correct: boolean;
  is_skipped: boolean;
  dwell_time_sec: number;
  hints_used: number;
}

export interface AttemptSummary {
  score: number;
  total_questions: number;
  accuracy_pct: number;
  total_time_sec: number;
  avg_dwell_time_sec: number;
  skipped_count: number;
  hints_count: number;
  cognitive_hesitation_score: number;
}

export function calculateAttemptSummary(answers: QuestionTelemetryInput[]): AttemptSummary {
  const total_questions = answers.length;
  if (total_questions === 0) {
    return {
      score: 0,
      total_questions: 0,
      accuracy_pct: 0,
      total_time_sec: 0,
      avg_dwell_time_sec: 0,
      skipped_count: 0,
      hints_count: 0,
      cognitive_hesitation_score: 0,
    };
  }

  let score = 0;
  let total_time_sec = 0;
  let skipped_count = 0;
  let hints_count = 0;

  for (const a of answers) {
    if (a.is_correct) score++;
    if (a.is_skipped) skipped_count++;
    total_time_sec += a.dwell_time_sec || 0;
    hints_count += a.hints_used || 0;
  }

  const accuracy_pct = Number(((score / total_questions) * 100).toFixed(2));
  const avg_dwell_time_sec = Number((total_time_sec / total_questions).toFixed(2));
  
  // Cognitive hesitation combines excessive dwell time, hint reliance, and skipping
  const cognitive_hesitation_score = Number(
    ((avg_dwell_time_sec * 0.5) + (hints_count * 2) + (skipped_count * 3)).toFixed(2)
  );

  return {
    score,
    total_questions,
    accuracy_pct,
    total_time_sec,
    avg_dwell_time_sec,
    skipped_count,
    hints_count,
    cognitive_hesitation_score,
  };
}

export function getRatingDelta(
  accuracyPct: number,
  difficulty: string = 'intermediate'
): number {
  const diffMultiplier = difficulty === 'advanced' ? 1.5 : difficulty === 'beginner' ? 0.75 : 1.0;
  
  if (accuracyPct >= 80) {
    return Math.round(25 * diffMultiplier);
  } else if (accuracyPct >= 60) {
    return Math.round(10 * diffMultiplier);
  } else if (accuracyPct <= 30) {
    return Math.round(-20 * diffMultiplier);
  } else if (accuracyPct <= 50) {
    return Math.round(-10 * diffMultiplier);
  }
  return 0;
}

export function calculateUpdatedRating(
  currentRating: number,
  accuracyPct: number,
  difficulty: string = 'intermediate'
): number {
  const change = getRatingDelta(accuracyPct, difficulty);
  return Math.max(800, currentRating + change);
}

export function calculateCumulativeAccuracyDelta(
  attempts: Array<{ score: number; total_questions: number }>
): number | null {
  if (!attempts || attempts.length < 2) {
    return null;
  }

  let prevScore = 0;
  let prevQuestions = 0;
  for (let i = 0; i < attempts.length - 1; i++) {
    prevScore += attempts[i].score;
    prevQuestions += attempts[i].total_questions;
  }

  if (prevQuestions === 0) return null;
  const prevAccuracy = Number(((prevScore / prevQuestions) * 100).toFixed(1));

  const totalScore = prevScore + attempts[attempts.length - 1].score;
  const totalQuestions = prevQuestions + attempts[attempts.length - 1].total_questions;
  if (totalQuestions === 0) return null;
  const currentAccuracy = Number(((totalScore / totalQuestions) * 100).toFixed(1));

  return Number((currentAccuracy - prevAccuracy).toFixed(1));
}

