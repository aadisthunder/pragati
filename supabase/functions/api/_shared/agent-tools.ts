/**
 * Shared, Deno-free helpers for the Edge Function's tool-calling agent.
 *
 * Pure TypeScript only (no Deno APIs) so the same logic is unit-tested under
 * vitest in the server suite (server/src/__tests__/edgeAgentTools.test.ts),
 * keeping the Edge Function's agent on the same CI coverage as the Express
 * server it mirrors.
 */

// ---------------------------------------------------------------------------
// Tool specifications (OpenAI/Groq function-calling format)
// ---------------------------------------------------------------------------

const generateQuizParameters = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: 'The academic topic to generate the quiz on' },
    difficulty: {
      type: 'string',
      enum: ['beginner', 'intermediate', 'advanced'],
      description: 'Difficulty level of the quiz',
    },
    num_questions: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'Number of questions to generate (1-10)',
    },
  },
  required: ['topic'],
} as const;

const limitParameters = (def: number, description: string) => ({
  type: 'object',
  properties: {
    limit: { type: 'number', minimum: 1, maximum: 20, description },
  },
} as const);

const attemptIdParameters = (field: 'attempt_id' | 'question_id', description: string) => ({
  type: 'object',
  properties: {
    [field]: { type: 'string', description },
  },
  required: [field],
} as const);

export const AGENT_TOOL_SPECS: any[] = [
  {
    type: 'function',
    function: {
      name: 'generate_quiz',
      description:
        'Generates a new dynamic quiz on a requested academic topic with multiple-choice questions, hints, and step-by-step explanations, then stores it in the database.',
      parameters: generateQuizParameters,
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_student_attempts',
      description:
        'Fetches the recent quizzes and test attempts completed by the student, including scores and accuracy percentage.',
      parameters: limitParameters(5, 'How many recent attempts to fetch (default 5)'),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attempt_telemetry',
      description:
        'Fetches granular performance telemetry for a specific quiz attempt, identifying dwell times, hints used, and exact questions the student missed or skipped.',
      parameters: attemptIdParameters('attempt_id', 'The UUID of the quiz attempt to inspect'),
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_missed_question',
      description:
        'Retrieves the detailed question prompt, correct answer, and explanation for a specific question so you can provide Socratic tutoring to the student.',
      parameters: attemptIdParameters('question_id', 'The UUID of the question to explain'),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_student_performance',
      description:
        'Fetches the student overall academic performance report, including dynamic Skill Rating, overall accuracy percentage, and recent quiz scores.',
      parameters: limitParameters(5, 'How many recent attempts to include (default 5)'),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_questions_to_review',
      description:
        'Fetches the questions the student missed or skipped, with telemetry, for targeted review and re-teaching.',
      parameters: limitParameters(10, 'How many missed questions to fetch (default 10)'),
    },
  },
];

// ---------------------------------------------------------------------------
// Groq tool-call extraction
// ---------------------------------------------------------------------------

/**
 * Normalizes a Groq/OpenAI assistant message into simple tool calls.
 * Malformed JSON arguments degrade to an empty object instead of throwing.
 */
export function extractToolCallsFromGroq(message: any): Array<{ id: string; name: string; args: any }> {
  const rawCalls = message?.tool_calls;
  if (!Array.isArray(rawCalls)) return [];

  return rawCalls
    .filter((tc: any) => tc && typeof tc === 'object' && tc.function?.name)
    .map((tc: any) => {
      let args: any = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
        if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
      } catch {
        args = {};
      }
      return { id: tc.id || `call_${tc.function.name}`, name: tc.function.name, args };
    });
}

// ---------------------------------------------------------------------------
// Tool argument sanitization / backfill
// ---------------------------------------------------------------------------

/**
 * Sanitizes and backfills tool arguments when the model invokes tools with
 * partial or empty arguments (mirrors the Express agent's behavior).
 */
export function sanitizeToolArgs(toolName: string, rawArgs: any = {}, userMessage: string = ''): any {
  const args = { ...(rawArgs || {}) };
  const MAX_TOPIC_LENGTH = 120;
  const message = userMessage || '';

  if (toolName === 'generate_quiz') {
    if (!args.topic || typeof args.topic !== 'string' || !args.topic.trim()) {
      const topicMatch =
        message.match(/topic\s*:\s*([^,.\n]+)/i) ||
        message.match(/(?:quiz|questions?|test)\s+(?:on|about)\s+([^,.\n]+)/i) ||
        message.match(/on\s+([^,.\n]+)/i);

      if (topicMatch && topicMatch[1]) {
        args.topic = topicMatch[1].trim();
      } else {
        // Fallback: derive a short topic from the user's message instead of
        // interpolating the entire (possibly 5000-char) message.
        args.topic = message.trim().slice(0, MAX_TOPIC_LENGTH);
      }
    }

    // Strip a trailing "N questions" fragment if the topic regex swallowed it
    // (e.g. "Generate a quiz ... on topic : backend 5 questions" → "backend").
    if (typeof args.topic === 'string') {
      args.topic = args.topic
        .replace(/\s+\d+\s*(?:questions?|-question)\s*$/i, '')
        .replace(/\s*:\s*$/, '')
        .trim();
    }

    // Hard-cap the topic regardless of source
    if (typeof args.topic === 'string') {
      args.topic = args.topic.trim().slice(0, MAX_TOPIC_LENGTH);
    }

    let num = args.num_questions;
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      const numMatch = message.match(/(\d+)\s*(?:questions?|-question)/i);
      num = numMatch ? parseInt(numMatch[1], 10) : 5;
    }
    args.num_questions = Math.min(10, Math.max(1, Math.round(num)));

    const difficulty = args.difficulty;
    if (difficulty !== 'beginner' && difficulty !== 'intermediate' && difficulty !== 'advanced') {
      args.difficulty = 'intermediate';
    }
  } else if (toolName === 'get_student_attempts' || toolName === 'get_student_performance') {
    if (typeof args.limit !== 'number' || !Number.isFinite(args.limit)) {
      args.limit = 5;
    }
  } else if (toolName === 'get_questions_to_review') {
    if (typeof args.limit !== 'number' || !Number.isFinite(args.limit)) {
      args.limit = 10;
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Quiz JSON extraction / repair
// ---------------------------------------------------------------------------

/**
 * Robust JSON extractor for LLM-generated quiz payloads.
 * Strips conversational preambles, markdown code fences, and repairs unclosed
 * braces/brackets. Returns null when nothing parseable exists.
 */
export function extractQuizJson(rawContent: string): any {
  if (!rawContent || typeof rawContent !== 'string') return null;

  const text = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  // 1. Try parsing from first '{' to last '}'
  const lastBraceIdx = text.lastIndexOf('}');
  if (lastBraceIdx > startIdx) {
    try {
      return JSON.parse(text.slice(startIdx, lastBraceIdx + 1));
    } catch {
      // fall through
    }
  }

  // 2. Try parsing everything from the first '{'
  const fullSlice = text.slice(startIdx).trim();
  try {
    return JSON.parse(fullSlice);
  } catch {
    // fall through to repair
  }

  // 3. Balance unclosed brackets and braces. Close in reverse nesting order
  // using a stack so interleaved structures repair correctly.
  const closers: string[] = [];
  for (const ch of fullSlice) {
    if (ch === '{') closers.push('}');
    else if (ch === '[') closers.push(']');
    else if (ch === '}' && closers[closers.length - 1] === '}') closers.pop();
    else if (ch === ']' && closers[closers.length - 1] === ']') closers.pop();
  }

  let repaired = fullSlice + closers.reverse().join('');

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Answer-key protection
// ---------------------------------------------------------------------------

/**
 * Strips correct answers and explanations before any quiz payload is delivered
 * to the browser. Hint stays — it is scaffolding, not the answer.
 */
export function stripAnswerKeyForClient(quiz: any): any {
  if (!quiz || typeof quiz !== 'object') return quiz;

  const { correct_answer: _omitCorrect, explanation: _omitExpl, ...quizSafe } = quiz;

  if (!Array.isArray(quizSafe.questions)) return quizSafe;

  quizSafe.questions = quizSafe.questions.map((q: any) => {
    if (!q || typeof q !== 'object') return q;
    const { correct_answer: _c, explanation: _e, ...safe } = q;
    return safe;
  });

  return quizSafe;
}

// ---------------------------------------------------------------------------
// Quiz generation prompt
// ---------------------------------------------------------------------------

/**
 * The strict quiz-generation contract handed to the LLM inside generate_quiz.
 */
export function buildQuizGenerationPrompt(opts: { topic: string; difficulty?: string; num_questions?: number }): string {
  const selectedDifficulty = opts.difficulty || 'intermediate';
  const count = opts.num_questions || 5;
  const safeTopic = String(opts.topic).slice(0, 120);

  return `You are a curriculum expert. Generate a structured ${selectedDifficulty} level multiple-choice quiz on the topic "${safeTopic}" with exactly ${count} questions.
Return ONLY a valid JSON object matching this exact structure, with no markdown code fences or backticks:
{
  "topic": "${safeTopic}",
  "difficulty": "${selectedDifficulty}",
  "questions": [
    {
      "prompt": "Question text with LaTeX if applicable",
      "options": [
        {"id": "A", "text": "Option A text"},
        {"id": "B", "text": "Option B text"},
        {"id": "C", "text": "Option C text"},
        {"id": "D", "text": "Option D text"}
      ],
      "correct_answer": "A",
      "hint": "Targeted conceptual hint",
      "explanation": "Clear step-by-step rationale for why A is correct"
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Chat spoiler prevention
// ---------------------------------------------------------------------------

/**
 * Detects when the model dumps quiz questions/options into the chat text
 * instead of letting the interactive card carry the assessment.
 */
export function containsQuizSpoilers(text: string): boolean {
  if (!text) return false;
  return (
    /Question\s*\d+/i.test(text) ||
    /###\s*Questions/i.test(text) ||
    /\bA\)\s+/.test(text)
  );
}

/**
 * Friendly, spoiler-free reply used when generate_quiz ran but the model's
 * prose would leak the questions (or is empty).
 */
export function buildQuizReadyFallback(topic: string): string {
  return `I have generated your practice quiz on **${topic}**. You can start taking it using the interactive card below!`;
}
