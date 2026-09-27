/**
 * Token-budget utilities for Groq's small per-minute token caps (the org's
 * free/developer tier is 8K TPM — a single fat chat turn can exceed the whole
 * budget and 429). Three levers, in order of impact:
 *
 *  1. Compact tool payloads: missed-question review, telemetry, and attempts
 *     dumps were the largest contributor (full prompts, 4 options, full
 *     explanations ×10 questions, re-sent on every agent-loop iteration).
 *  2. History clamp by characters (not just turn count): 20 turns of long
 *     Socratic replies blow the budget before tools even run.
 *  3. Retry with backoff on 429, honoring Groq's retry-after header, so a
 *     burst degrades to "wait a beat and succeed" instead of an error card.
 *
 * Mirrored in supabase/functions/api/_shared/tokenBudget.ts (repo convention).
 */

/** Rough token estimate (~4 chars/token) for budgeting without a tokenizer. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function truncate(text: unknown, max: number): string {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}

export interface CompactMissedQuestion {
  id: string;
  question_id: string;
  topic: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  selected_answer: string | null;
  correct_answer: string | null;
  explanation: string;
  is_skipped: boolean;
}

/** Per-item caps sized so 5 questions ≈ 1.2–1.5K tokens (was ~5–6K). */
const MISSED_PROMPT_MAX = 200;
const MISSED_OPTION_MAX = 80;
const MISSED_EXPLANATION_MAX = 240;
export const MISSED_QUESTIONS_DEFAULT_LIMIT = 5;

/**
 * Compact the questions-to-review dump: fewer questions, truncated text,
 * telemetry noise dropped — while keeping everything the Socratic reply
 * actually needs (prompt, options, chosen vs correct answer, explanation).
 */
export function compactMissedQuestions(
  rows: any[],
  limit: number = MISSED_QUESTIONS_DEFAULT_LIMIT
): CompactMissedQuestion[] {
  return (rows || [])
    .filter((m): m is Record<string, any> => Boolean(m))
    .slice(0, limit)
    .map((m) => ({
      id: String(m.id ?? ''),
      question_id: String(m.question_id ?? ''),
      topic: String(m.topic ?? 'General'),
      prompt: truncate(m.prompt, MISSED_PROMPT_MAX),
      options: (Array.isArray(m.options) ? m.options : [])
        .slice(0, 4)
        .map((o: any, i: number) => ({
          id: String(o?.id ?? String.fromCharCode(65 + i)),
          text: truncate(o?.text, MISSED_OPTION_MAX),
        })),
      selected_answer: m.selected_answer ?? null,
      correct_answer: m.correct_answer ?? null,
      explanation: truncate(m.explanation, MISSED_EXPLANATION_MAX),
      is_skipped: Boolean(m.is_skipped),
    }));
}

export interface CompactAttempt {
  id: string;
  topic: string;
  difficulty: string;
  score: number;
  total_questions: number;
  accuracy_pct: number;
  completed_at: string;
}

/** Attempts list: keep the scoring fields, drop the verbose rest. */
export function compactAttempts(attempts: any[], limit: number = 5): CompactAttempt[] {
  return (attempts || [])
    .filter(Boolean)
    .slice(0, limit)
    .map((a: any) => ({
      id: String(a.id ?? ''),
      topic: String(a.quizzes?.topic ?? a.topic ?? 'General'),
      difficulty: String(a.quizzes?.difficulty ?? a.difficulty ?? 'intermediate'),
      score: Number(a.score ?? 0),
      total_questions: Number(a.total_questions ?? 0),
      accuracy_pct: Number(a.accuracy_pct ?? 0),
      completed_at: String(a.completed_at ?? ''),
    }));
}

/** Default total character budget for injected chat history (~3.5K tokens). */
export const HISTORY_CHAR_BUDGET = 14_000;

/**
 * Clamps chat history to a total character budget, keeping the MOST RECENT
 * turns. Always keeps at least the latest turn even if it alone exceeds the
 * budget (the user's current message context must survive).
 */
export function clampHistoryForTokenBudget(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  charBudget: number = HISTORY_CHAR_BUDGET
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history) || history.length === 0) return [];

  // Walk from the newest backwards, taking turns until the budget is spent.
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (!msg || typeof msg.content !== 'string') continue;
    if (kept.length > 0 && total + msg.content.length > charBudget) break;
    // First (latest) turn is always kept, budget or not.
    kept.unshift({ role: msg.role, content: msg.content });
    total += msg.content.length;
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Groq 429 retry
// ---------------------------------------------------------------------------

/** Detects Groq rate-limit payloads in raw error text (belt & suspenders). */
export function isGroqRateLimitPayload(text: string): boolean {
  return /rate limit reached|tokens per minute|\(TPM\)|429/i.test(String(text || ''));
}

export interface GroqRetryOptions {
  maxRetries?: number;
  /** Fallback backoff when the response has no retry-after header (ms). */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a Groq fetch; on 429 waits (retry-after header, else exponential
 * backoff with a safety margin) and retries up to maxRetries times. Non-429
 * responses are returned untouched — only rate limits are worth retrying.
 */
export async function withGroqRetry(
  fetcher: () => Promise<Response>,
  options: GroqRetryOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1500;
  const sleep = options.sleep ?? defaultSleep;

  let response = await fetcher();
  for (let attempt = 0; attempt < maxRetries && response.status === 429; attempt++) {
    const retryAfterHeader = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000 + 250 // small margin over Groq's suggested wait
      : baseDelayMs * Math.pow(2, attempt);
    await sleep(delay);
    response = await fetcher();
  }
  return response;
}

/** Parses "try again in 17.60s" from Groq 429 error text (milliseconds). */
export function parseGroqRetryAfterMs(errorText: string): number | null {
  const match = String(errorText || '').match(/try again in\s*([0-9.]+)s/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 250 : null;
}

/**
 * Retry for THROWN errors (LangChain/ChatOpenAI path: a 429 surfaces as an
 * Error whose message embeds Groq's rate-limit text, not as a Response).
 * Retries only rate-limit errors; anything else rethrows immediately.
 */
export async function retryOnGroqRateLimit<T>(
  fn: () => Promise<T>,
  options: GroqRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1500;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const message = String(err?.message || err || '');
      if (!isGroqRateLimitPayload(message)) throw err;
      if (attempt === maxRetries) throw err;
      const retryAfterMs = parseGroqRetryAfterMs(message);
      await sleep(retryAfterMs ?? baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastError;
}
