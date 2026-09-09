/**
 * Markdown Card Components and Styling Tokens
 * Used to transform dense AI instructor markdown output into clean,
 * outline-bordered cards with generous vertical whitespace.
 */

export const markdownCardStyles = {
  list: 'space-y-2.5 my-3 list-none pl-0',
  cardItem:
    'rounded-xl border border-slate-200 bg-slate-50/50 p-3 my-1.5 shadow-xs text-slate-800 text-xs sm:text-sm block',
  heading3:
    'font-display font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100 text-sm sm:text-base',
  blockquote:
    'bg-slate-50 border-l-4 border-slate-900 rounded-r-xl p-3 my-2 text-slate-700 text-xs sm:text-sm',
  paragraph: 'my-2 leading-relaxed text-slate-800',
};

/**
 * Strips common markdown formatting (bold, italics, code ticks, leading bullets)
 * to provide a clean plain-text query when the user clicks a recommendation card.
 */
export function cleanMarkdownText(markdown: string): string {
  if (!markdown) return '';
  return markdown
    // Remove leading list markers like "- ", "* ", "1. "
    .replace(/^(\s*[-*+]|\s*\d+\.)\s+/, '')
    // Remove bold/italic markers like **text**, *text*, __text__, _text_
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove inline code backticks `code`
    .replace(/`([^`]+)`/g, '$1')
    // Trim extra spaces
    .trim();
}

export const interruptButtonStyles = {
  container:
    'w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full border-[1.5px] border-slate-300 bg-white hover:bg-rose-50/50 hover:border-rose-500 transition-all shadow-xs active:scale-95 cursor-pointer group',
  square:
    'w-3.5 h-3.5 bg-rose-600 rounded-[4px] group-hover:scale-110 transition-transform',
};

export interface ChipSuggestion {
  label: string;
  prompt: string;
}

export const CHIP_SUGGESTIONS: ChipSuggestion[] = [
  {
    label: 'Ask a doubt',
    prompt: 'I have a doubt regarding: ',
  },
  {
    label: 'Request a quiz topic',
    prompt: 'Generate a quiz to test my understanding on topic : ',
  },
  {
    label: 'Review missed questions',
    prompt:
      'Review the questions I missed or skipped in my recent quiz attempts and explain how to solve them step-by-step',
  },
];

/**
 * Constructs the prompt for generating a quiz from the search query in Quizzes Arena.
 */
export function buildQuizGeneratePrompt(searchQuery?: string): string {
  const base = 'generate a quiz to test my understanding on topic : ';
  const trimmed = searchQuery?.trim();
  return trimmed ? `${base}${trimmed}` : base;
}

/**
 * Formats a date into a human-readable relative time string.
 * Examples: "Just now", "1 min ago", "14 min ago", "1 hour ago", "15 hours ago", "1 day ago", "9 days ago", "1 month ago", "6 months ago", "1 year ago", "3 years ago"
 */
export function formatRelativeTime(dateInput: string | Date | number, nowInput?: number): string {
  const timestamp = typeof dateInput === 'number' ? dateInput : new Date(dateInput).getTime();
  if (isNaN(timestamp)) return 'Just now';

  const now = nowInput ?? Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return 'Just now';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} min ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  }

  const diffYears = Math.floor(diffDays / 365);
  return diffYears <= 1 ? '1 year ago' : `${diffYears} years ago`;
}

export interface MissedQuestionInput {
  topic: string;
  prompt: string;
  options?: Array<{ id: string; text: string } | string>;
  selected_answer?: string | null;
  correct_answer?: string;
  is_skipped?: boolean;
}

/**
 * Builds the structured Socratic prompt for tutoring on a missed or skipped question.
 */
export function buildTutorMissedPrompt(q: MissedQuestionInput): string {
  let text = `I struggled with this question on ${q.topic}:\n\n"${q.prompt}"`;

  if (Array.isArray(q.options) && q.options.length > 0) {
    const formattedOptions = q.options
      .map((opt) => (typeof opt === 'string' ? opt : `${opt.id}) ${opt.text}`))
      .join('\n');
    text += `\n\nOptions:\n${formattedOptions}`;
  }

  const myChoice = q.is_skipped || !q.selected_answer
    ? 'Skipped'
    : `Choice ${q.selected_answer}`;

  text += `\n\nMy answer: ${myChoice}\nCorrect answer: ${q.correct_answer || 'N/A'}`;
  text += `\n\nCan you guide me Socratically through the underlying concepts step-by-step so I can master this problem?`;

  return text;
}

