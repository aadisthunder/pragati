import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { SupabaseClient } from '@supabase/supabase-js';

export const generateQuizSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  num_questions: z.number().min(1).max(10).default(5),
});

export const getAttemptTelemetrySchema = z.object({
  attempt_id: z.string().uuid('Invalid UUID format'),
});

export const explainMissedQuestionSchema = z.object({
  question_id: z.string().uuid('Invalid UUID format'),
});

export const getStudentAttemptsSchema = z.object({
  limit: z.number().min(1).max(20).default(5),
});

export function createAgentTools(supabaseClient: SupabaseClient, userId: string, llm: ChatOpenAI) {
  const generateQuizTool = tool(
    async ({ topic, difficulty, num_questions }) => {
      try {
        const prompt = `You are a curriculum expert. Generate a structured ${difficulty} level multiple-choice quiz on the topic "${topic}" with exactly ${num_questions} questions.
Return ONLY a valid JSON object matching this exact structure, with no markdown code fences or backticks:
{
  "topic": "${topic}",
  "difficulty": "${difficulty}",
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
        let rawContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        
        // Clean markdown fences if any
        rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawContent);

        // Save to Supabase
        const { data: quiz, error: quizError } = await supabaseClient
          .from('quizzes')
          .insert({
            created_by: userId,
            topic: parsed.topic || topic,
            difficulty: parsed.difficulty || difficulty,
            total_questions: parsed.questions.length,
          })
          .select()
          .single();

        if (quizError || !quiz) {
          return `Failed to save quiz: ${quizError?.message || 'Unknown database error'}`;
        }

        const questionsToInsert = parsed.questions.map((q: any, idx: number) => ({
          quiz_id: quiz.id,
          prompt: q.prompt,
          options: q.options,
          correct_answer: q.correct_answer,
          hint: q.hint,
          explanation: q.explanation,
          order_index: idx,
        }));

        const { error: questionsError } = await supabaseClient
          .from('questions')
          .insert(questionsToInsert);

        if (questionsError) {
          return `Quiz created (${quiz.id}) but failed to insert questions: ${questionsError.message}`;
        }

        return JSON.stringify({
          action: 'QUIZ_GENERATED',
          quiz_id: quiz.id,
          topic: quiz.topic,
          difficulty: quiz.difficulty,
          total_questions: parsed.questions.length,
          message: `Successfully generated a ${parsed.questions.length}-question quiz on "${topic}".`,
        });
      } catch (err: any) {
        return `Error generating quiz: ${err.message}`;
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
          .limit(limit);

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

  return [generateQuizTool, getStudentAttemptsTool, getAttemptTelemetryTool, explainMissedQuestionTool];
}
