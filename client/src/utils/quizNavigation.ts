/**
 * Quiz Navigation & State Utilities
 * Pure helper functions for question jumping, navigation boundaries,
 * answer toggling, and visual indicator state calculation.
 */

export function toggleAnswer(
  currentSelected: string | undefined,
  clickedOptionId: string
): string | undefined {
  if (currentSelected === clickedOptionId) {
    return undefined;
  }
  return clickedOptionId;
}

export function canNavigatePrevious(currentIndex: number): boolean {
  return currentIndex > 0;
}

export function canNavigateNext(currentIndex: number, totalQuestions: number): boolean {
  return currentIndex < totalQuestions - 1;
}

export function isQuestionAnswered(
  questionId: string,
  answers: Record<string, { selected_answer?: string }>
): boolean {
  const answer = answers[questionId]?.selected_answer;
  return typeof answer === 'string' && answer.trim().length > 0;
}

export function getAnswerCounts(
  questions: Array<{ id: string }>,
  answers: Record<string, { selected_answer?: string }>
): { total: number; answered: number; unanswered: number } {
  const total = questions.length;
  let answered = 0;

  for (const q of questions) {
    if (isQuestionAnswered(q.id, answers)) {
      answered++;
    }
  }

  return {
    total,
    answered,
    unanswered: total - answered,
  };
}

export type PillStatus = 'current' | 'answered' | 'unanswered';

export function getQuestionPillStatus(
  index: number,
  currentIndex: number,
  questionId: string,
  answers: Record<string, { selected_answer?: string }>
): PillStatus {
  if (index === currentIndex) {
    return 'current';
  }
  if (isQuestionAnswered(questionId, answers)) {
    return 'answered';
  }
  return 'unanswered';
}

export function getQuestionPillClasses(status: PillStatus): string {
  switch (status) {
    case 'current':
      return 'bg-slate-900 text-white shadow-xs ring-2 ring-slate-900 ring-offset-1 font-bold border-transparent';
    case 'answered':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold hover:bg-emerald-100/70';
    case 'unanswered':
    default:
      return 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700 font-medium';
  }
}

export type QuestionSquareStatus = 'attempted' | 'unattempted' | 'unvisited';

export function getQuestionSquareStatus(
  questionId: string,
  answers: Record<string, { selected_answer?: string }>,
  visitedQuestionIds: Set<string>
): QuestionSquareStatus {
  if (isQuestionAnswered(questionId, answers)) {
    return 'attempted';
  }
  if (visitedQuestionIds.has(questionId)) {
    return 'unattempted';
  }
  return 'unvisited';
}

export function getQuestionSquareClasses(
  status: QuestionSquareStatus,
  isActive: boolean
): string {
  const base = 'transition-all cursor-pointer font-mono font-bold text-xs flex items-center justify-center rounded-xl aspect-square select-none';

  if (isActive) {
    return `${base} bg-white text-slate-900 border-2 border-slate-900 shadow-sm z-10`;
  }

  switch (status) {
    case 'attempted':
      return `${base} bg-white text-emerald-600 border-2 border-emerald-500 hover:bg-emerald-50/50 shadow-xs`;
    case 'unattempted':
      return `${base} bg-white text-amber-600 border-2 border-amber-500 hover:bg-amber-50/50 shadow-xs`;
    case 'unvisited':
    default:
      return `${base} bg-slate-100/80 text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-700 shadow-xs`;
  }
}
