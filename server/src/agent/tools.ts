import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { SupabaseClient } from '@supabase/supabase-js';
import { loadGoalMastery, buildQuizInsertRow, insertQuizRow, type GoalLinkRowLike } from '../services/goalService.js';
import { compactMissedQuestions, compactAttempts } from './tokenBudget.js';
import { tagQuestionsWithConcepts, slugifyConceptName } from '../services/masteryCore.js';

export const getLearningGoalsSchema = z.object({});

export const checkTopicMasterySchema = z.object({
  topic: z.string().describe("The name or title of the learning goal or academic topic to check mastery for (e.g. 'DSA', 'Calculus')."),
});

export const generateQuizSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable().optional().default('intermediate'),
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
  const MAX_TOPIC_LENGTH = 120;

  if (toolName === 'generate_quiz') {
    if (!args.topic || typeof args.topic !== 'string' || !args.topic.trim()) {
      const topicMatch =
        userMessage.match(/topic\s*:\s*([^,\.\n]+)/i) ||
        userMessage.match(/(?:quiz|questions?|test)\s+(?:on|about)\s+([^,\.\n]+)/i) ||
        userMessage.match(/on\s+([^,\.\n]+)/i);

      if (topicMatch && topicMatch[1]) {
        args.topic = topicMatch[1].trim();
      } else {
        // Fallback: derive a short topic from the user's message instead of interpolating
        // the entire (possibly 5000-char) message into the quiz generation prompt.
        args.topic = userMessage.trim().slice(0, MAX_TOPIC_LENGTH);
      }
    }

    // Hard-cap the topic regardless of source (LLM-provided or regex-derived)
    if (typeof args.topic === 'string') {
      args.topic = args.topic.trim().slice(0, MAX_TOPIC_LENGTH);
    }

    if (!args.num_questions || typeof args.num_questions !== 'number') {
      const numMatch = userMessage.match(/(\d+)\s*(?:questions?|-question)/i);
      args.num_questions = numMatch ? parseInt(numMatch[1], 10) : 5;
    }

    if (!args.difficulty || typeof args.difficulty !== 'string') {
      const diffMatch = userMessage.match(/\b(beginner|intermediate|advanced|expert)\b/i);
      args.difficulty = diffMatch ? (diffMatch[1].toLowerCase() as any) : 'intermediate';
    }
  } else if (toolName === 'get_student_attempts' || toolName === 'get_student_performance') {
    if (!args.limit || typeof args.limit !== 'number') {
      args.limit = 5;
    }
  } else if (toolName === 'get_questions_to_review') {
    if (!args.limit || typeof args.limit !== 'number') {
      args.limit = 10;
    }
  } else if (toolName === 'check_topic_mastery') {
    if (!args.topic || typeof args.topic !== 'string' || !args.topic.trim()) {
      const topicMatch =
        userMessage.match(/(?:goal|topic)\s*["':]?\s*([^"'\.\n]+)["']?/i) ||
        userMessage.match(/on\s+["']?([^"'\.\n]+)["']?/i);
      args.topic = topicMatch && topicMatch[1] ? topicMatch[1].trim() : '';
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
        const safeTopic = String(topic).slice(0, 120);
        const prompt = `You are a curriculum expert. Generate a structured ${selectedDifficulty} level multiple-choice quiz on the topic "${safeTopic}" with exactly ${count} questions.
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

        // Resolve goal linkage before saving: quizzes generated from a
        // learning goal ("Test me on my learning goal") carry goal_linkage so
        // deleting that goal in My Topics erases them via the schema cascade.
        // Standalone quizzes get goal_linkage: null. Non-fatal: linkage is a
        // progressive enhancement; generation must not fail without it.
        let goalRows: GoalLinkRowLike[] = [];
        try {
          const { data: links } = await supabaseClient
            .from('learning_goals')
            .select('id, title, slug');
          goalRows = links || [];
        } catch (linkErr: any) {
          console.error('goal-linkage load failed (non-fatal):', linkErr?.message || linkErr);
        }

        // Save to Supabase (tolerant of a DB that hasn't received the
        // goal_linkage migration yet — degrades to unlinked quizzes).
        const { data: quiz, error: quizError } = await insertQuizRow(
          supabaseClient,
          buildQuizInsertRow(
            {
              created_by: userId,
              topic: parsed.topic || topic,
              difficulty: parsed.difficulty || difficulty,
              total_questions: questionsList.length,
            },
            goalRows
          )
        );

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

        const { data: questionRows, error: questionsError } = await supabaseClient
          .from('questions')
          .insert(questionsToInsert)
          .select('id, order_index');

        // Persist question→concept mappings so the adaptive submit loop
        // attributes evidence exactly instead of keyword-guessing (parity
        // with the Edge Function's generate_quiz). Tagging is pure and
        // non-fatal: quiz generation must succeed even if mapping fails.
        if (!questionsError && questionRows && questionRows.length > 0) {
          try {
            const tagged = tagQuestionsWithConcepts(questionsList, parsed.topic || topic);
            const orderToId = new Map<number, string>();
            for (const r of questionRows) orderToId.set(r.order_index, r.id);

            const tagSlugs = new Map<string, { name: string; slug: string }>();
            for (const q of tagged) {
              for (const tag of q.concepts || []) {
                tagSlugs.set(tag.slug, { name: tag.name, slug: tag.slug });
              }
            }

            // Ensure the tagged concepts exist (insert missing ones only).
            const existingSlugs = new Set<string>();
            if (tagSlugs.size > 0) {
              const { data: conceptRows } = await supabaseClient
                .from('concepts')
                .select('id, slug')
                .in('slug', Array.from(tagSlugs.keys()));
              for (const c of conceptRows || []) existingSlugs.add(c.slug);

              const missing = Array.from(tagSlugs.values()).filter((c) => !existingSlugs.has(c.slug));
              if (missing.length > 0) {
                const { data: created, error: conceptError } = await supabaseClient
                  .from('concepts')
                  .insert(
                    missing.map((c) => ({
                      topic: parsed.topic || topic || 'General',
                      name: c.name,
                      slug: c.slug,
                      description: `Concept for ${parsed.topic || topic || 'General'}`,
                    }))
                  )
                  .select('id, slug');
                if (conceptError) {
                  console.error('concept insert failed (non-fatal):', conceptError.message);
                } else {
                  for (const c of created || []) existingSlugs.add(c.slug);
                }
              }
            }

            const conceptIdsBySlug = new Map<string, string>();
            if (existingSlugs.size > 0) {
              const { data: allConceptRows } = await supabaseClient
                .from('concepts')
                .select('id, slug')
                .in('slug', Array.from(existingSlugs));
              for (const c of allConceptRows || []) conceptIdsBySlug.set(c.slug, c.id);
            }

            const mappingRows: any[] = [];
            for (let i = 0; i < tagged.length; i++) {
              const questionId = orderToId.get(i);
              if (!questionId) continue;
              for (const tag of tagged[i].concepts || []) {
                const conceptId = conceptIdsBySlug.get(tag.slug);
                if (conceptId) {
                  mappingRows.push({ question_id: questionId, concept_id: conceptId, weight: 1.0 });
                }
              }
            }
            if (mappingRows.length > 0) {
              const { error: mappingError } = await supabaseClient
                .from('question_concepts')
                .upsert(mappingRows, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });
              if (mappingError) {
                console.error('question_concepts persist failed (non-fatal):', mappingError.message);
              }
            }
          } catch (tagErr: any) {
            console.error('Concept tagging failed (non-fatal):', tagErr?.message || tagErr);
          }
        }

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

        // Token budget: attempts dumps re-enter the prompt on every agent-loop
        // iteration; keep only the fields the reply needs.
        return JSON.stringify(compactAttempts(attempts, limit || 5));
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
        // Token budget: compact the missed questions (truncated prompt/options/
        // explanation, telemetry noise dropped) so one turn cannot exhaust the
        // org's per-minute token cap.
        return JSON.stringify({
          total_answered: telemetry.length,
          missed_or_skipped_count: missed.length,
          questions: compactMissedQuestions(missed, 5),
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

        // True all-time attempt count (independent of the recent-attempts page limit)
        const { count: totalAttempts, error: countError } = await supabaseClient
          .from('quiz_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

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
        const trueTotalAttempts = typeof totalAttempts === 'number' ? totalAttempts : attemptsList.length;
        if (attemptsList.length === 0) {
          return JSON.stringify({
            action: 'PERFORMANCE_RETRIEVED',
            has_attempts: false,
            skill_rating: profile?.skill_rating || 1200,
            overall_accuracy: 0,
            total_attempts: trueTotalAttempts,
            recent_attempts_count: 0,
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
          // total_attempts is the ALL-TIME count; recent_attempts only covers the last `limit` attempts.
          total_attempts: trueTotalAttempts,
          recent_attempts_count: attemptsList.length,
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

        // Token budget: this dump is the single largest payload in the chat
        // (10 full questions × prompt + options + explanation), and it re-sends
        // on every loop iteration. Cap to 5, truncate text, drop telemetry noise.
        return JSON.stringify({
          action: 'QUESTIONS_TO_REVIEW_RETRIEVED',
          has_questions: true,
          total_missed: list.length,
          topics,
          questions: compactMissedQuestions(list, 5),
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

  const getLearningGoalsTool = tool(
    async () => {
      try {
        // Re-read live mastery so the model always quotes fresh numbers.
        const goalsData = await loadGoalMastery(supabaseClient, userId);
        return JSON.stringify({
          action: 'GOALS_RETRIEVED',
          has_goals: goalsData.length > 0,
          goals: goalsData.map((g) => ({
            title: g.title,
            mastery_pct: g.masteryPct,
            subtopics: g.subtopics.map((s) => ({ name: s.name, mastery_pct: s.masteryPct })),
          })),
          message: goalsData.length === 0 ? 'The student has not set any learning goals yet.' : undefined,
        });
      } catch (err: any) {
        return JSON.stringify({
          action: 'ERROR',
          error: `Error retrieving learning goals: ${err.message}`,
        });
      }
    },
    {
      name: 'get_learning_goals',
      description: "Fetches the student's current learning goals with live mastery percentages per subtopic, so you can reference their progress and offer targeted tests. Takes no arguments.",
      schema: getLearningGoalsSchema,
    }
  );

  const checkTopicMasteryTool = tool(
    async ({ topic }: { topic: string }) => {
      try {
        const goalsData = await loadGoalMastery(supabaseClient, userId);
        const query = (topic || '').trim().toLowerCase();

        const goal = goalsData.find(
          (g) =>
            g.title.toLowerCase().trim() === query ||
            g.title.toLowerCase().includes(query) ||
            query.includes(g.title.toLowerCase().trim())
        );

        if (goal) {
          const diff = goal.masteryPct < 50 ? 'beginner' : goal.masteryPct < 80 ? 'intermediate' : 'advanced';
          return JSON.stringify({
            action: 'TOPIC_MASTERY_RETRIEVED',
            found: true,
            topic: goal.title,
            mastery_pct: goal.masteryPct,
            recommended_difficulty: diff,
            subtopics: goal.subtopics.map((s) => ({
              name: s.name,
              mastery_pct: s.masteryPct,
              recommended_difficulty: s.masteryPct < 50 ? 'beginner' : s.masteryPct < 80 ? 'intermediate' : 'advanced',
            })),
            instructions:
              'Present the student with their current mastery percentage and recommended difficulty level. List the available subtopics with their recommended difficulties. Ask the student which subtopic they want to test before calling generate_quiz, and wait for their answer.',
          });
        }

        return JSON.stringify({
          action: 'TOPIC_MASTERY_RETRIEVED',
          found: false,
          topic: topic || '',
          mastery_pct: 0,
          recommended_difficulty: 'beginner',
          subtopics: [],
          available_goals: goalsData.map((g) => g.title),
          message: `No active learning goal named "${topic}" was found in your tracked goals. Starting at beginner level.`,
        });
      } catch (err: any) {
        return JSON.stringify({
          action: 'ERROR',
          error: `Error checking topic mastery: ${err.message}`,
        });
      }
    },
    {
      name: 'check_topic_mastery',
      description:
        "Checks the student's live mastery percentage and subtopics for a specific academic topic or learning goal (e.g. 'DSA'). Returns current mastery percentage, recommended difficulty level (beginner <50%, intermediate 50-80%, advanced >80%), and all available subtopics with their recommended difficulties.",
      schema: checkTopicMasterySchema,
    }
  );

  return [
    generateQuizTool,
    getStudentPerformanceTool,
    getQuestionsToReviewTool,
    getStudentAttemptsTool,
    getAttemptTelemetryTool,
    explainMissedQuestionTool,
    getLearningGoalsTool,
    checkTopicMasteryTool,
  ];
}
