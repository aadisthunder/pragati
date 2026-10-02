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

/**
 * Hard limit for Groq's openai/gpt-oss-120b free/dev tier: 8,000 TPM.
 * Safe context budget for input messages is ~5,500 tokens (~22,000 chars),
 * leaving room for output generation and tool schemas within the 8k/min window.
 */
export const GROQ_MAX_CONTEXT_TOKENS = 5500;
export const GROQ_TPM_LIMIT = 8000;

function extractMessageText(m: any): string {
  if (!m) return '';
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.content)) {
    return m.content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join(' ');
  }
  return String(m.content ?? '');
}

function cloneMessageWithText<T>(m: T, text: string): T {
  if (!m || typeof m !== 'object') return m;
  const cloned = Object.assign(Object.create(Object.getPrototypeOf(m)), m);
  cloned.content = text;
  return cloned;
}

/**
 * Dynamically shrinks a chat messages array if total estimated tokens
 * approach or exceed the token budget (e.g. Groq 8k TPM cap).
 *
 * Algorithm:
 * 1. Preserves the first message (system prompt / rules / memory).
 * 2. Preserves the latest message (user query or latest tool result).
 * 3. Progressively drops oldest intermediate conversation turns.
 * 4. Truncates oversized messages (e.g. huge pasted code or fat dumps).
 */
export function shrinkContextForTokenBudget<T extends { content?: any }>(
  messages: T[],
  maxTokens: number = GROQ_MAX_CONTEXT_TOKENS
): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  if (messages.length === 1) {
    const text = extractMessageText(messages[0]);
    if (estimateTokens(text) <= maxTokens) return messages;
    const maxChars = Math.max(100, maxTokens * 4);
    const truncatedText = `${text.slice(0, maxChars)}\n[...context truncated to stay within Groq 8k token limit...]`;
    return [cloneMessageWithText(messages[0], truncatedText)];
  }

  let totalTokens = messages.reduce((acc, m) => acc + estimateTokens(extractMessageText(m)), 0);
  if (totalTokens <= maxTokens) {
    return messages;
  }

  // Always retain first (system) and last (current query/turn)
  const systemMsg = messages[0];
  const lastMsg = messages[messages.length - 1];
  const intermediate = messages.slice(1, -1);

  // 1. Drop oldest intermediate turns
  while (intermediate.length > 0 && totalTokens > maxTokens) {
    const dropped = intermediate.shift();
    totalTokens -= estimateTokens(extractMessageText(dropped));
  }

  const result: T[] = [systemMsg, ...intermediate, lastMsg];
  totalTokens = result.reduce((acc, m) => acc + estimateTokens(extractMessageText(m)), 0);

  // 2. If still exceeding budget, truncate oversized messages
  if (totalTokens > maxTokens) {
    const lastText = extractMessageText(lastMsg);
    const lastTokens = estimateTokens(lastText);
    const sysText = extractMessageText(systemMsg);
    const sysTokens = estimateTokens(sysText);

    // Reserve headroom for system prompt
    const allowedLastTokens = Math.max(400, maxTokens - sysTokens - 50);
    if (lastTokens > allowedLastTokens) {
      const allowedChars = allowedLastTokens * 4;
      const truncatedLast = `${lastText.slice(0, allowedChars)}\n[...context truncated to stay within Groq 8k token limit...]`;
      result[result.length - 1] = cloneMessageWithText(lastMsg, truncatedLast);
    }

    totalTokens = result.reduce((acc, m) => acc + estimateTokens(extractMessageText(m)), 0);
    if (totalTokens > maxTokens) {
      const allowedSysTokens = Math.max(200, maxTokens - estimateTokens(extractMessageText(result[result.length - 1])) - 20);
      const allowedChars = allowedSysTokens * 4;
      const truncatedSys = `${sysText.slice(0, allowedChars)}\n[...context truncated to stay within Groq 8k token limit...]`;
      result[0] = cloneMessageWithText(systemMsg, truncatedSys);
    }
  }

  return result;
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
