import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { SupabaseClient } from '@supabase/supabase-js';

export const generateQuizSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).nullable().optional().default('intermediate'),
  num_questions: z.number().min(1).max(10).nullable().optional().default(5),
});

export const getAttemptTelemetrySchema = z.object({
  attempt_id: z.string().uuid('Invalid UUID format'),
});

export const explainMissedQuestionSchema = z.object({
  question_id: z.string().uuid('Invalid UUID format'),
});

export const getStudentAttemptsSchema = z.object({
  limit: z.number().min(1).max(20).nullable().optional().default(5),
});

export const getStudentPerformanceSchema = z.object({
  limit: z.number().min(1).max(20).nullable().optional().default(5),
});

export const getQuestionsToReviewSchema = z.object({
  limit: z.number().min(1).max(20).nullable().optional().default(10),
});

/**
 * Robust JSON extractor for LLM-generated quiz payloads.
 * Strips conversational preambles, markdown code fences, and repairs unclosed braces.
 */
export function extractQuizJson(rawContent: string): any {
  if (!rawContent || typeof rawContent !== 'string') return null;

  // Remove code fences
  let text = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Find the first '{'
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  // 1. Try parsing from first '{' to last '}'
  const lastBraceIdx = text.lastIndexOf('}');
  if (lastBraceIdx > startIdx) {
    try {
      return JSON.parse(text.slice(startIdx, lastBraceIdx + 1));
    } catch {}
  }

  // 2. Try parsing entire text from startIdx
  const fullSlice = text.slice(startIdx).trim();
  try {
    return JSON.parse(fullSlice);
  } catch {}

  // 3. Balance unclosed brackets and braces
  let openBraces = (fullSlice.match(/{/g) || []).length;
  let closeBraces = (fullSlice.match(/}/g) || []).length;
  let openBrackets = (fullSlice.match(/\[/g) || []).length;
  let closeBrackets = (fullSlice.match(/\]/g) || []).length;

  let repaired = fullSlice;
  while (closeBrackets < openBrackets) {
    repaired += ']';
    closeBrackets++;
  }
  while (closeBraces < openBraces) {
    repaired += '}';
    closeBraces++;
  }

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

/**
 * Sanitizes and backfills tool arguments when an LLM invokes tools with partial or empty arguments.
 */
export function sanitizeToolArgs(toolName: string, rawArgs: any = {}, userMessage: string = ''): any {
  const args = { ...(rawArgs || {}) };

  if (toolName === 'generate_quiz') {
    if (!args.topic || typeof args.topic !== 'string' || !args.topic.trim()) {
      const topicMatch =
        userMessage.match(/topic\s*:\s*([^,\.\n]+)/i) ||
        userMessage.match(/(?:quiz|questions?|test)\s+(?:on|about)\s+([^,\.\n]+)/i) ||
        userMessage.match(/on\s+([^,\.\n]+)/i);

      if (topicMatch && topicMatch[1]) {
        args.topic = topicMatch[1].trim();
      } else {
        args.topic = userMessage.trim();
      }
    }

    if (!args.num_questions || typeof args.num_questions !== 'number') {
      const numMatch = userMessage.match(/(\d+)\s*(?:questions?|-question)/i);
      args.num_questions = numMatch ? parseInt(numMatch[1], 10) : 5;
    }

    if (!args.difficulty || typeof args.difficulty !== 'string') {
      args.difficulty = 'intermediate';
    }
  } else if (toolName === 'get_student_attempts' || toolName === 'get_student_performance') {
    if (!args.limit || typeof args.limit !== 'number') {
      args.limit = 5;
    }
  } else if (toolName === 'get_questions_to_review') {
    if (!args.limit || typeof args.limit !== 'number') {
      args.limit = 10;
    }
  }

  return args;
}

export function createAgentTools(supabaseClient: SupabaseClient, userId: string, llm: ChatOpenAI) {
  const generateQuizTool = tool(
    async ({ topic, difficulty, num_questions }) => {
      try {
        const selectedDifficulty = difficulty || 'intermediate';
        const count = num_questions || 5;
        const prompt = `You are a curriculum expert. Generate a structured ${selectedDifficulty} level multiple-choice quiz on the topic "${topic}" with exactly ${count} questions.
Return ONLY a valid JSON object matching this exact structure, with no markdown code fences or backticks:
{
  "topic": "${topic}",
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

        const response = await llm.invoke(prompt);
        const rawContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        
        const parsed = extractQuizJson(rawContent);
        if (!parsed) {
          return JSON.stringify({
            action: 'ERROR',
            error: 'Failed to parse generated quiz structure into valid JSON.',
          });
        }

        const questionsList = Array.isArray(parsed?.questions)
          ? parsed.questions
          : Array.isArray(parsed?.quiz)
          ? parsed.quiz
          : [];

        if (questionsList.length === 0) {
          return JSON.stringify({
            action: 'ERROR',
            error: 'Failed to generate quiz: LLM did not return a valid list of questions.',
          });
        }

        // Save to Supabase
        const { data: quiz, error: quizError } = await supabaseClient
          .from('quizzes')
          .insert({
            created_by: userId,
            topic: parsed.topic || topic,
            difficulty: parsed.difficulty || difficulty,
            total_questions: questionsList.length,
          })
          .select()
          .single();

        if (quizError || !quiz) {
          return JSON.stringify({
            action: 'ERROR',
            error: `Failed to save quiz: ${quizError?.message || 'Unknown database error'}`,
          });
        }

        const questionsToInsert = questionsList.map((q: any, idx: number) => ({
          quiz_id: quiz.id,
          prompt: q.prompt || 'Question',
          options: Array.isArray(q.options) ? q.options : [],
          correct_answer: q.correct_answer || 'A',
          hint: q.hint || '',
          explanation: q.explanation || '',
          order_index: idx,
        }));

        const { error: questionsError } = await supabaseClient
          .from('questions')
          .insert(questionsToInsert);

        if (questionsError) {
          return JSON.stringify({
            action: 'ERROR',
            error: `Quiz created (${quiz.id}) but failed to insert questions: ${questionsError.message}`,
          });
        }

        return JSON.stringify({
          action: 'QUIZ_GENERATED',
          quiz_id: quiz.id,
          topic: quiz.topic,
          difficulty: quiz.difficulty,
          total_questions: questionsList.length,
          message: `Successfully generated a ${questionsList.length}-question quiz on "${topic}".`,
        });
      } catch (err: any) {
        return JSON.stringify({
          action: 'ERROR',
          error: `Error generating quiz: ${err.message}`,
        });
      }
    },
    {
      name: 'generate_quiz',
      description: 'Generates a new dynamic quiz on a requested academic topic with multiple-choice questions, hints, and step-by-step explanations, then stores it in the database.',
      schema: generateQuizSchema,
    }
  );

  const getStudentAttemptsTool = tool(
    async ({ limit }) => {
      try {
        const { data: attempts, error } = await supabaseClient
          .from('quiz_attempts')
          .select('id, quiz_id, score, total_questions, accuracy_pct, total_time_sec, completed_at, quizzes(topic, difficulty)')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .limit(limit || 5);

        if (error) return `Error fetching quiz history: ${error.message}`;
        if (!attempts || attempts.length === 0) return 'The student has not attempted any quizzes yet.';

        return JSON.stringify(attempts);
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'get_student_attempts',
      description: 'Fetches the recent quizzes and test attempts completed by the student, including scores and accuracy percentage.',
      schema: getStudentAttemptsSchema,
    }
  );

  const getAttemptTelemetryTool = tool(
    async ({ attempt_id }) => {
      try {
        const { data: telemetry, error } = await supabaseClient
          .from('question_telemetry')
          .select('id, question_id, selected_answer, is_correct, is_skipped, dwell_time_sec, hints_used, questions(prompt, options, correct_answer, explanation)')
          .eq('attempt_id', attempt_id)
          .eq('user_id', userId);

        if (error) return `Error fetching attempt telemetry: ${error.message}`;
        if (!telemetry || telemetry.length === 0) return `No telemetry records found for attempt ID ${attempt_id}.`;

        const missed = telemetry.filter(t => !t.is_correct || t.is_skipped);
        return JSON.stringify({
          total_answered: telemetry.length,
          missed_or_skipped_count: missed.length,
          questions: telemetry,
        });
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'get_attempt_telemetry',
      description: 'Fetches granular performance telemetry for a specific quiz attempt, identifying dwell times, hints used, and exact questions the student missed or skipped.',
      schema: getAttemptTelemetrySchema,
    }
  );

  const explainMissedQuestionTool = tool(
    async ({ question_id }) => {
      try {
        const { data: question, error } = await supabaseClient
          .from('questions')
          .select('id, prompt, options, correct_answer, hint, explanation')
          .eq('id', question_id)
          .single();

        if (error || !question) return `Question not found: ${error?.message || ''}`;

        return JSON.stringify({
          question_id: question.id,
          prompt: question.prompt,
          options: question.options,
          correct_answer: question.correct_answer,
          hint: question.hint,
          explanation: question.explanation,
        });
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    },
    {
      name: 'explain_missed_question',
      description: 'Retrieves the detailed question prompt, correct answer, and explanation for a specific question so you can provide Socratic tutoring to the student.',
      schema: explainMissedQuestionSchema,
    }
  );

  const getStudentPerformanceTool = tool(
    async ({ limit }) => {
      try {
        const { data: profile } = await supabaseClient
          .from('user_profiles')
          .select('skill_rating, full_name')
          .eq('id', userId)
          .maybeSingle();

        const { data: attempts, error } = await supabaseClient
          .from('quiz_attempts')
          .select('id, quiz_id, score, total_questions, accuracy_pct, total_time_sec, completed_at, quizzes(topic, difficulty)')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .limit(limit || 5);

        if (error) {
          return JSON.stringify({
            action: 'ERROR',
            error: `Failed to retrieve performance: ${error.message}`,
          });
        }

        const attemptsList = attempts || [];
        if (attemptsList.length === 0) {
          return JSON.stringify({
            action: 'PERFORMANCE_RETRIEVED',
            has_attempts: false,
            skill_rating: profile?.skill_rating || 1200,
            overall_accuracy: 0,
            total_attempts: 0,
            recent_attempts: [],
            message: 'You have not completed any quizzes yet. Take your first quiz in the Quizzes Arena to build your performance profile!',
          });
        }

        let totalScore = 0;
        let totalQuestions = 0;
        for (const att of attemptsList) {
          totalScore += att.score || 0;
          totalQuestions += att.total_questions || 0;
        }

        const overallAccuracy = totalQuestions > 0 ? Number(((totalScore / totalQuestions) * 100).toFixed(1)) : 0;

        return JSON.stringify({
          action: 'PERFORMANCE_RETRIEVED',
          has_attempts: true,
          skill_rating: profile?.skill_rating || 1200,
          overall_accuracy: overallAccuracy,
          total_attempts: attemptsList.length,
          recent_attempts: attemptsList.map((a: any) => ({
            id: a.id,
            topic: (a.quizzes as any)?.topic || 'General',
            difficulty: (a.quizzes as any)?.difficulty || 'intermediate',
            score: a.score,
            total_questions: a.total_questions,
            accuracy_pct: a.accuracy_pct,
            completed_at: a.completed_at,
          })),
        });
      } catch (err: any) {
        return JSON.stringify({
          action: 'ERROR',
          error: `Error retrieving performance data: ${err.message}`,
        });
      }
    },
    {
      name: 'get_student_performance',
      description: 'Fetches the student overall academic performance report, including dynamic Skill Rating, overall accuracy percentage, and recent quiz scores.',
      schema: getStudentPerformanceSchema,
    }
  );

  const getQuestionsToReviewTool = tool(
    async ({ limit }) => {
      try {
        const { data: missedQuestions, error } = await supabaseClient
          .from('question_telemetry')
          .select('id, question_id, attempt_id, selected_answer, is_correct, is_skipped, dwell_time_sec, hints_used, created_at, questions(prompt, options, correct_answer, explanation, quiz_id, quizzes(topic))')
          .eq('user_id', userId)
          .or('is_correct.eq.false,is_skipped.eq.true')
          .order('created_at', { ascending: false })
          .limit(limit || 10);

        if (error) {
          return JSON.stringify({
            action: 'ERROR',
            error: `Failed to retrieve questions to review: ${error.message}`,
          });
        }

        const list = (missedQuestions || []).map((m: any) => ({
          id: m.id,
          question_id: m.question_id,
          topic: (m.questions as any)?.quizzes?.topic || 'General',
          prompt: (m.questions as any)?.prompt || '',
          options: (m.questions as any)?.options || [],
          selected_answer: m.selected_answer,
          correct_answer: (m.questions as any)?.correct_answer,
          explanation: (m.questions as any)?.explanation,
          dwell_time_sec: m.dwell_time_sec,
          hints_used: m.hints_used,
          is_skipped: m.is_skipped,
        }));

        if (list.length === 0) {
          return JSON.stringify({
            action: 'QUESTIONS_TO_REVIEW_RETRIEVED',
            has_questions: false,
            total_missed: 0,
            questions: [],
            message: 'Great job! You have zero unreviewed missed questions.',
          });
        }

        const topics = Array.from(new Set(list.map((q: any) => q.topic)));

        return JSON.stringify({
          action: 'QUESTIONS_TO_REVIEW_RETRIEVED',
          has_questions: true,
          total_missed: list.length,
          topics,
          questions: list,
        });
      } catch (err: any) {
        return JSON.stringify({
          action: 'ERROR',
          error: `Error retrieving questions to review: ${err.message}`,
        });
      }
    },
    {
      name: 'get_questions_to_review',
      description: 'Connects directly to the Analytics Questions to Review section. Fetches the student struggling, missed, and skipped questions with explanations and chosen answers for Socratic tutoring.',
      schema: getQuestionsToReviewSchema,
    }
  );

  return [
    generateQuizTool,
    getStudentPerformanceTool,
    getQuestionsToReviewTool,
    getStudentAttemptsTool,
    getAttemptTelemetryTool,
    explainMissedQuestionTool,
  ];
}
