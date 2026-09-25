import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  AGENT_TOOL_SPECS,
  extractToolCallsFromGroq,
  sanitizeToolArgs,
  extractQuizJson,
  buildQuizGenerationPrompt,
  containsQuizSpoilers,
  buildQuizReadyFallback,
  stripEmojis,
  extractGroqErrorMessage,
  normalizeConceptTags,
  KNOWN_CONCEPTS,
  slugifyConceptName,
} from './_shared/agent-tools.ts';
import {
  updateMastery,
  diagnosePrerequisite,
  chooseNextAction,
  nextReviewAt,
  buildAgentTrace,
  type ConceptGraph,
  type PrerequisiteDiagnosis,
  type AdaptiveDecision,
  type TraceEvent,
} from './_shared/mastery.ts';
import {
  buildQuestionToSlugs,
  mergeLearnerStates,
  buildLearningEventRow,
  buildAssessedInputs,
  type ConceptEvidenceInput,
} from './_shared/adaptiveLoop.ts';

const allowedOrigins = [
  'https://pragati-aadi.web.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

/**
 * Origin allowlist patterns: any localhost/dev-server port plus Firebase
 * Hosting sites and preview channels (e.g. pragati-aadi--abc123.web.app).
 */
function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.web\.app$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/.test(origin)) return true;
  return false;
}

const SYSTEM_PROMPT =
  'You are Pragati AI Instructor, a warm, encouraging, and rigorous Socratic learning mentor. Never give direct answers right away. Guide students with probing questions, analogies, and conceptual hints. Format equations in LaTeX ($...$ for inline, $$...$$ for block). NEVER use emojis.';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = isAllowedOrigin(origin);
  const corsOrigin = isAllowed ? origin : 'https://pragati-aadi.web.app';

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };

  const jsonResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  };

  const errorResponse = (message: string, status = 400) => {
    return jsonResponse({ error: message }, status);
  };

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Normalize path across /functions/v1/api and /api (including nested /api prefixes)
  let path = url.pathname.replace(/^\/functions\/v1\/api/, '');
  while (path.startsWith('/api/')) {
    path = path.slice(4);
  }
  if (path === '/api' || !path) path = '/';

  // Environment variables (automatically injected by Supabase Edge Runtime)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const groqApiKey = Deno.env.get('GROQ_API_KEY') || '';

  // Health check endpoint
  if (path === '/' || path === '/health') {
    return jsonResponse({
      status: 'ok',
      service: 'pragati-supabase-api',
      project: 'pragati',
      time: new Date().toISOString(),
    });
  }

  // Extract auth token
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return errorResponse('Not authenticated: Missing Bearer token in Authorization header', 401);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse('Server configuration error: SUPABASE_URL or SUPABASE_ANON_KEY is missing in environment', 500);
  }

  // Scoped Supabase Client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Service client for shared reference data only (concepts, graph edges).
  // RLS keeps concepts/concept_prerequisites read-only for users; seeding is a
  // trusted server-side operation, not a user capability. All learner-owned
  // tables continue to use the scoped client so RLS remains the enforcement layer.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const serviceClient = serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  // Verify user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return errorResponse('Invalid or expired authentication session', 401);
  }

  const userId = user.id;

  try {
    // -----------------------------------------------------------------
    // Auth Routes
    // -----------------------------------------------------------------
    if (path === '/auth/me' && req.method === 'GET') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      return jsonResponse({
        user: {
          id: userId,
          email: user.email,
          full_name: profile?.full_name || user.email?.split('@')[0],
          skill_rating: profile?.skill_rating || 1200,
          streak_days: profile?.streak_days || 0,
          avatar_url: profile?.avatar_url,
        },
      });
    }

    // -----------------------------------------------------------------
    // Quiz Routes
    // -----------------------------------------------------------------
    if (path === '/quizzes' && req.method === 'GET') {
      const { data: quizzes, error } = await supabase
        .from('quizzes')
        .select('id, topic, difficulty, total_questions, created_at, created_by')
        .order('created_at', { ascending: false });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ quizzes: quizzes || [] });
    }

    // Single Quiz: /quizzes/:id
    const quizMatch = path.match(/^\/quizzes\/([a-zA-Z0-9_-]+)$/);
    if (quizMatch) {
      const quizId = quizMatch[1];

      if (req.method === 'GET') {
        const { data: quiz, error: quizError } = await supabase
          .from('quizzes')
          .select('*')
          .eq('id', quizId)
          .single();

        if (quizError || !quiz) return errorResponse('Quiz not found', 404);

        const { data: questions, error: qError } = await supabase
          .from('questions')
          .select('*')
          .eq('quiz_id', quizId)
          .order('order_index', { ascending: true });

        if (qError) return errorResponse(qError.message, 500);

        const sanitizedQuestions = (questions || []).map((q: any) => {
          const { correct_answer, explanation, ...safeQ } = q;
          return safeQ;
        });

        return jsonResponse({ quiz, questions: sanitizedQuestions });
      }

      if (req.method === 'DELETE') {
        // Cascade delete telemetry and attempts
        const { data: attempts } = await supabase
          .from('quiz_attempts')
          .select('id')
          .eq('quiz_id', quizId);

        const attemptIds = (attempts || []).map((a: any) => a.id);
        if (attemptIds.length > 0) {
          await supabase.from('question_telemetry').delete().in('attempt_id', attemptIds);
        }

        await supabase.from('quiz_attempts').delete().eq('quiz_id', quizId);
        await supabase.from('questions').delete().eq('quiz_id', quizId);
        const { error: delError } = await supabase.from('quizzes').delete().eq('id', quizId);

        if (delError) return errorResponse(delError.message, 500);
        return jsonResponse({ success: true, message: 'Quiz deleted successfully' });
      }
    }

    // Submit Quiz: /quizzes/:id/submit
    const submitMatch = path.match(/^\/quizzes\/([a-zA-Z0-9_-]+)\/submit$/);
    if (submitMatch && req.method === 'POST') {
      const quizId = submitMatch[1];
      const body = await req.json().catch(() => ({}));
      const answers = body.answers;

      if (!Array.isArray(answers) || answers.length === 0) {
        return errorResponse('answers must be a non-empty array', 400);
      }

      const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('id, correct_answer, explanation, prompt')
        .eq('quiz_id', quizId);

      if (qError || !questions || questions.length === 0) {
        return errorResponse('Failed to retrieve quiz questions', 500);
      }

      const qMap = new Map(questions.map((q: any) => [q.id, q]));
      const evaluatedTelemetry: any[] = [];
      let correctCount = 0;
      let totalDwell = 0;

      for (const ans of answers) {
        const q: any = qMap.get(ans.question_id);
        if (!q) continue;

        const is_skipped = !ans.selected_answer;
        const is_correct = !is_skipped && ans.selected_answer === q.correct_answer;
        if (is_correct) correctCount++;

        // Clamp dwell time [0, 7200] and hints [0, 10]
        const dwell = Math.max(0, Math.min(7200, Number(ans.dwell_time_sec) || 0));
        const hints = Math.max(0, Math.min(10, Number(ans.hints_used) || 0));
        totalDwell += dwell;

        evaluatedTelemetry.push({
          question_id: ans.question_id,
          user_id: userId,
          selected_answer: ans.selected_answer || null,
          is_correct,
          is_skipped,
          dwell_time_sec: dwell,
          hints_used: hints,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          prompt: q.prompt,
        });
      }
      // The attempt id does not exist until the attempt row is inserted below;
      // it is threaded into the adaptive loop explicitly after creation.

      const totalQuestions = answers.length;
      const accuracyPct = totalQuestions > 0 ? Number(((correctCount / totalQuestions) * 100).toFixed(1)) : 0;

      // Insert attempt
      const { data: attempt, error: attemptError } = await supabase
        .from('quiz_attempts')
        .insert({
          user_id: userId,
          quiz_id: quizId,
          score: correctCount,
          total_questions: totalQuestions,
          total_time_sec: totalDwell,
          accuracy_pct: accuracyPct,
        })
        .select()
        .single();

      if (attemptError || !attempt) {
        return errorResponse(attemptError?.message || 'Failed to save attempt', 500);
      }

      // Insert question telemetry
      const telemetryToInsert = evaluatedTelemetry.map((t) => ({
        attempt_id: attempt.id,
        question_id: t.question_id,
        user_id: userId,
        selected_answer: t.selected_answer,
        is_correct: t.is_correct,
        is_skipped: t.is_skipped,
        dwell_time_sec: t.dwell_time_sec,
        hints_used: t.hints_used,
      }));

      await supabase.from('question_telemetry').insert(telemetryToInsert);

      // Update skill rating
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('skill_rating')
        .eq('id', userId)
        .single();

      const currentRating = profile?.skill_rating || 1200;
      const ratingChange = accuracyPct >= 80 ? 25 : accuracyPct >= 50 ? 10 : -15;
      const newRating = Math.max(800, currentRating + ratingChange);

      await supabase
        .from('user_profiles')
        .update({ skill_rating: newRating, updated_at: new Date().toISOString() })
        .eq('id', userId);

      // Adaptive learner model: convert quiz evidence into concept mastery,
      // then decide the next best action. Pure functions from _shared/mastery.ts
      // — deterministic, no LLM in the decision loop. Adaptation must never
      // fail the submit: on any error the response degrades to the legacy shape.
      let adaptation: Awaited<ReturnType<typeof runAdaptiveLoop>> = null;
      try {
        adaptation = await runAdaptiveLoop(
          supabase,
          serviceClient,
          userId,
          quizId,
          evaluatedTelemetry,
          attempt.id
        );
      } catch (adaptErr: any) {
        console.error('Adaptive loop failed (non-fatal):', adaptErr?.message || adaptErr);
      }

      return jsonResponse({
        attempt_id: attempt.id,
        summary: {
          score: correctCount,
          total_questions: totalQuestions,
          total_time_sec: totalDwell,
          accuracy_pct: accuracyPct,
          old_rating: currentRating,
          new_rating: newRating,
          rating_change: ratingChange,
        },
        results: evaluatedTelemetry,
        ...(adaptation
          ? {
              nextStep: adaptation.decision,
              masteryDeltas: adaptation.masteryDeltas,
              trace: adaptation.trace,
              currentDifficulty: adaptation.currentDifficulty,
            }
          : {}),
      });
    }

    // -----------------------------------------------------------------
    // Analytics Dashboard & Missed Questions Cleanup
    // -----------------------------------------------------------------
    if (path === '/analytics/dashboard' && req.method === 'GET') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const { data: attempts } = await supabase
        .from('quiz_attempts')
        .select('id, quiz_id, score, total_questions, accuracy_pct, total_time_sec, completed_at, quizzes(topic, difficulty)')
        .eq('user_id', userId)
        .order('completed_at', { ascending: true });

      const attemptsList = attempts || [];
      let totalScore = 0;
      let totalQuestions = 0;
      let totalTimeSec = 0;

      for (const att of attemptsList) {
        totalScore += att.score;
        totalQuestions += att.total_questions;
        totalTimeSec += att.total_time_sec;
      }

      const overallAccuracy = totalQuestions > 0 ? Number(((totalScore / totalQuestions) * 100).toFixed(1)) : 0;
      const avgDwellTimeSec = totalQuestions > 0 ? Number((totalTimeSec / totalQuestions).toFixed(1)) : 0;

      // Topic mastery
      const topicMap: Record<string, { attempts: number; score: number; total: number }> = {};
      for (const att of attemptsList) {
        const topic = (att.quizzes as any)?.topic || 'General';
        if (!topicMap[topic]) topicMap[topic] = { attempts: 0, score: 0, total: 0 };
        topicMap[topic].attempts++;
        topicMap[topic].score += att.score;
        topicMap[topic].total += att.total_questions;
      }

      const topicMastery = Object.entries(topicMap).map(([topic, stats]) => ({
        topic,
        attempts: stats.attempts,
        accuracy_pct: stats.total > 0 ? Number(((stats.score / stats.total) * 100).toFixed(1)) : 0,
      }));

      // Missed & skipped questions
      const { data: missedQuestions } = await supabase
        .from('question_telemetry')
        .select('id, question_id, attempt_id, selected_answer, is_correct, is_skipped, dwell_time_sec, hints_used, created_at, questions(prompt, options, correct_answer, explanation, quiz_id, quizzes(topic))')
        .eq('user_id', userId)
        .or('is_correct.eq.false,is_skipped.eq.true')
        .order('created_at', { ascending: false })
        .limit(10);

      const formattedMissed = (missedQuestions || []).map((m: any) => ({
        id: m.id,
        question_id: m.question_id,
        topic: (m.questions as any)?.quizzes?.topic || 'General',
        prompt: (m.questions as any)?.prompt,
        options: (m.questions as any)?.options || [],
        selected_answer: m.selected_answer,
        correct_answer: (m.questions as any)?.correct_answer,
        explanation: (m.questions as any)?.explanation,
        dwell_time_sec: m.dwell_time_sec,
        hints_used: m.hints_used,
        is_skipped: m.is_skipped,
      }));

      // Adaptive learner model: concept-level mastery map + due reviews.
      const nowIso = new Date().toISOString();
      const { data: conceptStates } = await supabase
        .from('learner_concept_state')
        .select('mastery, attempts, last_seen_at, next_review_at, concepts(name, slug, topic)')
        .eq('user_id', userId)
        .order('mastery', { ascending: true })
        .limit(30);

      const conceptMastery = (conceptStates || [])
        .filter((s: any) => (s.concepts as any)?.name)
        .map((s: any) => ({
          concept: (s.concepts as any).name,
          slug: (s.concepts as any).slug,
          topic: (s.concepts as any).topic || 'General',
          mastery_pct: Math.round(Number(s.mastery ?? 0) * 100),
          attempts: Number(s.attempts ?? 0),
          last_seen_at: s.last_seen_at,
          next_review_at: s.next_review_at,
          due: Boolean(s.next_review_at && s.next_review_at <= nowIso),
        }));

      const dueReviews = conceptMastery.filter((c: any) => c.due).length;

      return jsonResponse({
        profile: {
          email: user.email,
          full_name: profile?.full_name || user.email?.split('@')[0],
          skill_rating: profile?.skill_rating || 1200,
          streak_days: profile?.streak_days || 0,
          avatar_url: profile?.avatar_url,
        },
        metrics: {
          total_attempts: attemptsList.length,
          total_questions_answered: totalQuestions,
          overall_accuracy: overallAccuracy,
          avg_dwell_time_sec: avgDwellTimeSec,
          total_time_spent_min: Math.round(totalTimeSec / 60),
          due_reviews: dueReviews,
        },
        topic_mastery: topicMastery,
        concept_mastery: conceptMastery,
        recent_attempts: attemptsList.slice(-10),
        missed_questions: formattedMissed,
      });
    }

    // Delete single missed question item
    const singleMissedMatch = path.match(/^\/analytics\/missed-questions\/([a-zA-Z0-9_-]+)$/);
    if (singleMissedMatch && req.method === 'DELETE') {
      const id = singleMissedMatch[1];
      const { error } = await supabase
        .from('question_telemetry')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true, id });
    }

    // Clear all missed questions
    if (path === '/analytics/missed-questions' && req.method === 'DELETE') {
      const { error } = await supabase
        .from('question_telemetry')
        .delete()
        .eq('user_id', userId)
        .or('is_correct.eq.false,is_skipped.eq.true');

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true, message: 'All missed questions cleared' });
    }

    // -----------------------------------------------------------------
    // Instructor Sessions Endpoints
    // -----------------------------------------------------------------
    if (path === '/instructor/sessions' && req.method === 'GET') {
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ sessions: sessions || [] });
    }

    if (path === '/instructor/sessions' && req.method === 'POST') {
      const { data: newSession, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: userId, title: 'New Conversation' })
        .select('id, title, created_at')
        .single();

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ session: newSession }, 201);
    }

    const sessionMatch = path.match(/^\/instructor\/sessions\/([a-zA-Z0-9_-]+)$/);
    if (sessionMatch && req.method === 'DELETE') {
      const sessionId = sessionMatch[1];
      await supabase.from('chat_messages').delete().eq('session_id', sessionId).eq('user_id', userId);
      const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId).eq('user_id', userId);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true, id: sessionId });
    }

    const sessionMessagesMatch = path.match(/^\/instructor\/sessions\/([a-zA-Z0-9_-]+)\/messages$/);
    if (sessionMessagesMatch && req.method === 'GET') {
      const sessionId = sessionMessagesMatch[1];
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('role, content, tool_calls, created_at')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ messages: messages || [] });
    }

    if (path === '/instructor/history' && req.method === 'GET') {
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('id, title')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!session) {
        return jsonResponse({ messages: [], sessionId: null });
      }

      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, content, tool_calls, created_at')
        .eq('session_id', session.id)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      return jsonResponse({ messages: messages || [], sessionId: session.id });
    }

    // -----------------------------------------------------------------
    // Vision OCR Endpoint
    // -----------------------------------------------------------------
    if (path === '/instructor/ocr' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const imageBase64 = body.imageBase64;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return errorResponse('imageBase64 string is required', 400);
      }

      if (!groqApiKey) {
        return errorResponse('Groq API Key is not configured', 500);
      }

      const formattedUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      try {
        const ocrRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract all problem text, math equations, and diagrams from this image. Format all mathematical equations into clean LaTeX ($...$ for inline, $$...$$ for block). Return ONLY the extracted problem content without preamble or conversational filler.',
                  },
                  {
                    type: 'image_url',
                    image_url: { url: formattedUrl },
                  },
                ],
              },
            ],
            max_tokens: 1024,
            temperature: 0.1,
          }),
        });

        if (!ocrRes.ok) {
          const errText = await ocrRes.text();
          return errorResponse(`OCR processing failed: ${errText}`, ocrRes.status);
        }

        const ocrData = await ocrRes.json();
        const extractedText = ocrData.choices?.[0]?.message?.content || '';
        return jsonResponse({ extractedText });
      } catch (ocrErr: any) {
        return errorResponse(`OCR extraction error: ${ocrErr.message}`, 500);
      }
    }

    // -----------------------------------------------------------------
    // AI Instructor Socratic Chat (Groq API)
    // -----------------------------------------------------------------
    if (path === '/instructor/chat' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const rawMessage = body.message;

      if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
        return errorResponse('Message is required and cannot be empty or whitespace only', 400);
      }

      const trimmedMessage = rawMessage.trim();
      if (trimmedMessage.length > 5000) {
        return errorResponse('Message exceeds maximum allowed length (5000 characters)', 400);
      }

      if (!groqApiKey) {
        return errorResponse('Groq API Key is not configured. Please ensure GROQ_API_KEY is set in Supabase secrets.', 500);
      }

      let promptForAgent = trimmedMessage;

      // Handle attached image if present
      if (body.imageBase64 && typeof body.imageBase64 === 'string' && body.imageBase64.trim()) {
        const formattedUrl = body.imageBase64.startsWith('data:')
          ? body.imageBase64
          : `data:image/jpeg;base64,${body.imageBase64}`;

        try {
          const visionRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
              model: Deno.env.get('GROQ_VISION_MODEL') || 'qwen/qwen3.8-27b',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Extract all problem text, math equations, and diagrams from this image. Format all mathematical equations into clean LaTeX ($...$ for inline, $$...$$ for block). Return ONLY the extracted problem content without preamble or filler.',
                    },
                    {
                      type: 'image_url',
                      image_url: { url: formattedUrl },
                    },
                  ],
                },
              ],
              max_tokens: 1024,
              temperature: 0.1,
            }),
          });

          if (!visionRes.ok) {
            const visionErrText = await visionRes.text().catch(() => '');
            console.error(`Vision model error in chat: ${visionRes.status} ${visionErrText}`);
            // Tell the model the image failed so it can tell the user, instead of silently ignoring it
            promptForAgent = `${trimmedMessage}\n\n[System note: The attached image could not be processed (error ${visionRes.status}). Please briefly mention that the image could not be read and ask the student to re-upload or type the problem.]`;
          } else {
            const visionData = await visionRes.json();
            const extracted = visionData.choices?.[0]?.message?.content?.trim();
            if (extracted && extracted !== 'NONE') {
              promptForAgent = `${trimmedMessage}\n\n[Attached Problem Image Content]:\n${extracted}`;
            }
          }
        } catch (visErr: any) {
          console.warn('Vision extraction error in Edge Function:', visErr.message);
        }
      }

      // STRICT CHAT HISTORY SANITIZATION:
      // Strip any client UI attributes (animate, image, toolExecutions, id, etc.)
      // Groq will throw an error if ANY property other than role, content is sent!
      const sanitizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (Array.isArray(body.history)) {
        for (const item of body.history) {
          if (!item || typeof item !== 'object') continue;
          if (item.role !== 'user' && item.role !== 'assistant') continue;
          if (typeof item.content !== 'string' || !item.content.trim()) continue;

          sanitizedHistory.push({
            role: item.role,
            content: item.content.trim(),
          });
        }
      }

      // Cap to latest 15 turns
      const boundedHistory = sanitizedHistory.slice(-15);

      // ---------------------------------------------------------------------
      // Tool-calling agent loop (mirrors the Express server's LangChain agent)
      // ---------------------------------------------------------------------
      const chatMessages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...boundedHistory,
        { role: 'user', content: promptForAgent },
      ];

      const toolExecutions: any[] = [];
      const maxIterations = 3;
      let assistantMessage: any = null;

      const callGroq = (messages: any[], withTools: boolean) =>
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b',
            messages,
            temperature: 0.7,
            ...(withTools ? { tools: AGENT_TOOL_SPECS, tool_choice: 'auto' } : {}),
          }),
        });

      let iteration = 0;
      while (iteration < maxIterations) {
        iteration++;

        const res = await callGroq(chatMessages, true);
        if (!res.ok) {
          // Friendly message to the user; log the raw error server-side for debugging
          const errText = await res.text();
          console.error('Groq error (agent turn):', errText.slice(0, 500));
          return errorResponse(extractGroqErrorMessage(errText), 502);
        }
        const data = await res.json();
        assistantMessage = data.choices?.[0]?.message;
        if (!assistantMessage) break;

        const toolCalls = extractToolCallsFromGroq(assistantMessage);
        if (toolCalls.length === 0) break;

        // Replay the assistant's tool-call turn so the transcript stays valid
        chatMessages.push(assistantMessage);

        for (const call of toolCalls) {
          const args = sanitizeToolArgs(call.name, call.args, trimmedMessage);

          if (call.name === 'generate_quiz') {
            // 1) Ask the LLM for the quiz JSON
            const quizPrompt = buildQuizGenerationPrompt({
              topic: args.topic,
              difficulty: args.difficulty,
              num_questions: args.num_questions,
            });
            const quizRes = await callGroq(
              [
                { role: 'system', content: 'You are a quiz generation engine. Output ONLY the requested JSON object. No prose, no code fences.' },
                { role: 'user', content: quizPrompt },
              ],
              false
            );
            let toolResult: string;
            if (quizRes.ok) {
              const quizData = await quizRes.json();
              const quizContent = quizData.choices?.[0]?.message?.content || '';
              const parsed = extractQuizJson(quizContent);
              const questionsList = Array.isArray(parsed?.questions)
                ? parsed.questions
                : Array.isArray(parsed?.quiz)
                ? parsed.quiz
                : [];

              if (parsed && questionsList.length > 0) {
                // Normalize/backfill per-question concept tags before persisting
                normalizeConceptTags(parsed, parsed.topic || args.topic);

                // 2) Persist quiz + questions with Row Level Security intact
                const { data: quizRow, error: quizError } = await supabase
                  .from('quizzes')
                  .insert({
                    created_by: userId,
                    topic: parsed.topic || args.topic,
                    difficulty: parsed.difficulty || args.difficulty,
                    total_questions: questionsList.length,
                  })
                  .select()
                  .single();

                if (quizError || !quizRow) {
                  toolResult = JSON.stringify({
                    action: 'ERROR',
                    error: `Failed to save quiz: ${quizError?.message || 'Unknown database error'}`,
                  });
                } else {
                  const questionsToInsert = questionsList.map((q: any, idx: number) => ({
                    quiz_id: quizRow.id,
                    prompt: q.prompt || 'Question',
                    options: Array.isArray(q.options) ? q.options : [],
                    correct_answer: q.correct_answer || 'A',
                    hint: q.hint || '',
                    explanation: q.explanation || '',
                    order_index: idx,
                  }));

                  const { data: questionRows, error: questionsError } = await supabase
                    .from('questions')
                    .insert(questionsToInsert)
                    .select('id, order_index');

                  // Persist question->concept mappings so the adaptive loop can
                  // attribute evidence without re-running the LLM. The concepts
                  // upsert needs the service client; skip tagging if unavailable
                  // (quiz still works, adaptation falls back to keyword matching).
                  let mappingsError: string | null = null;
                  if (serviceClient && questionRows && !questionsError) {
                    const orderToId = new Map<number, string>();
                    for (const r of questionRows) orderToId.set(r.order_index, r.id);

                    // Ensure all tagged concepts exist (upsert by topic,slug).
                    const tagSlugs = new Map<string, { name: string; prerequisites: string[] }>();
                    for (const q of questionsList) {
                      for (const tag of q.concepts || []) {
                        tagSlugs.set(tag.slug, { name: tag.name, prerequisites: tag.prerequisites || [] });
                      }
                    }
                    const { data: conceptIdRows, error: conceptsError } = await serviceClient
                      .from('concepts')
                      .upsert(
                        Array.from(tagSlugs.entries()).map(([slug, v]) => ({
                          topic: quizRow.topic,
                          slug,
                          name: v.name,
                          description: '',
                        })),
                        { onConflict: 'topic,slug' }
                      )
                      .select('id, slug');

                    if (conceptsError) {
                      mappingsError = conceptsError.message;
                    } else {
                      const conceptIdBySlug = new Map<string, string>();
                      for (const c of conceptIdRows || []) conceptIdBySlug.set(c.slug, c.id);

                      const mappingRows: any[] = [];
                      for (let i = 0; i < questionsList.length; i++) {
                        const questionId = orderToId.get(i);
                        if (!questionId) continue;
                        for (const tag of questionsList[i].concepts || []) {
                          const conceptId = conceptIdBySlug.get(tag.slug);
                          if (conceptId) {
                            mappingRows.push({ question_id: questionId, concept_id: conceptId, weight: 1.0 });
                          }
                        }
                      }
                      if (mappingRows.length > 0) {
                        const { error: mapErr } = await serviceClient
                          .from('question_concepts')
                          .upsert(mappingRows, { onConflict: 'question_id,concept_id', ignoreDuplicates: true });
                        if (mapErr) mappingsError = mapErr.message;
                      }
                    }
                  }
                  if (mappingsError) {
                    console.error('Concept mapping persist failed (non-fatal):', mappingsError);
                  }

                  toolResult = questionsError
                    ? JSON.stringify({
                        action: 'ERROR',
                        error: `Quiz created (${quizRow.id}) but failed to insert questions: ${questionsError.message}`,
                      })
                    : JSON.stringify({
                        action: 'QUIZ_GENERATED',
                        quiz_id: quizRow.id,
                        topic: quizRow.topic,
                        difficulty: quizRow.difficulty,
                        total_questions: questionsList.length,
                        message: `Successfully generated a ${questionsList.length}-question quiz on "${quizRow.topic}".`,
                      });
                }
              } else {
                toolResult = JSON.stringify({
                  action: 'ERROR',
                  error: 'Failed to parse generated quiz structure into valid JSON.',
                });
              }
            } else {
              const quizErr = await quizRes.text().catch(() => '');
              toolResult = JSON.stringify({
                action: 'ERROR',
                error: `Quiz generation LLM call failed: ${quizErr.slice(0, 300)}`,
              });
            }

            toolExecutions.push({ name: call.name, args, result: toolResult });
            chatMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: toolResult,
            });
            continue;
          }

          // ---- Read-only tools: query Supabase with the user's JWT (RLS applies)
          let toolResult: string;
          try {
            if (call.name === 'get_student_attempts') {
              const { data, error } = await supabase
                .from('quiz_attempts')
                .select('id, quiz_id, score, total_questions, accuracy_pct, total_time_sec, completed_at, quizzes(topic, difficulty)')
                .order('completed_at', { ascending: false })
                .limit(args.limit || 5);
              toolResult = error
                ? `Error fetching quiz history: ${error.message}`
                : !data || data.length === 0
                ? 'The student has not attempted any quizzes yet.'
                : JSON.stringify(data);
            } else if (call.name === 'get_attempt_telemetry') {
              const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!args.attempt_id || !uuidRe.test(args.attempt_id)) {
                toolResult = 'Error: a valid attempt_id (UUID) is required. Ask the student to pick a specific past attempt.';
              } else {
                const { data, error } = await supabase
                  .from('question_telemetry')
                  .select('id, question_id, selected_answer, is_correct, is_skipped, dwell_time_sec, hints_used, questions(prompt, options, correct_answer, explanation)')
                  .eq('attempt_id', args.attempt_id);
                if (error) {
                  toolResult = `Error fetching attempt telemetry: ${error.message}`;
                } else if (!data || data.length === 0) {
                  toolResult = `No telemetry records found for attempt ID ${args.attempt_id}.`;
                } else {
                  const missed = data.filter((t: any) => !t.is_correct || t.is_skipped);
                  toolResult = JSON.stringify({
                    total_answered: data.length,
                    missed_or_skipped_count: missed.length,
                    questions: data,
                  });
                }
              }
            } else if (call.name === 'explain_missed_question') {
              const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (!args.question_id || !uuidRe.test(args.question_id)) {
                toolResult = 'Error: a valid question_id (UUID) is required.';
              } else {
                const { data, error } = await supabase
                  .from('questions')
                  .select('id, prompt, options, correct_answer, hint, explanation')
                  .eq('id', args.question_id)
                  .single();
                toolResult = error || !data
                  ? `Question not found: ${error?.message || ''}`
                  : JSON.stringify(data);
              }
            } else if (call.name === 'get_student_performance') {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('skill_rating, full_name')
                .maybeSingle();

              const { count: totalAttempts } = await supabase
                .from('quiz_attempts')
                .select('id', { count: 'exact', head: true });

              const { data: attempts, error } = await supabase
                .from('quiz_attempts')
                .select('id, quiz_id, score, total_questions, accuracy_pct, total_time_sec, completed_at, quizzes(topic, difficulty)')
                .order('completed_at', { ascending: false })
                .limit(args.limit || 5);

              if (error) {
                toolResult = JSON.stringify({ action: 'ERROR', error: `Failed to retrieve performance: ${error.message}` });
              } else {
                const attemptsList = attempts || [];
                const trueTotalAttempts = typeof totalAttempts === 'number' ? totalAttempts : attemptsList.length;
                if (attemptsList.length === 0) {
                  toolResult = JSON.stringify({
                    action: 'PERFORMANCE_RETRIEVED',
                    has_attempts: false,
                    skill_rating: profile?.skill_rating || 1200,
                    overall_accuracy: 0,
                    total_attempts: trueTotalAttempts,
                    recent_attempts_count: 0,
                    recent_attempts: [],
                    message: 'You have not completed any quizzes yet. Take your first quiz in the Quizzes Arena to build your performance profile!',
                  });
                } else {
                  let totalScore = 0;
                  let totalQuestions = 0;
                  for (const att of attemptsList) {
                    totalScore += att.score || 0;
                    totalQuestions += att.total_questions || 0;
                  }
                  const overallAccuracy = totalQuestions > 0 ? Number(((totalScore / totalQuestions) * 100).toFixed(1)) : 0;
                  toolResult = JSON.stringify({
                    action: 'PERFORMANCE_RETRIEVED',
                    has_attempts: true,
                    skill_rating: profile?.skill_rating || 1200,
                    overall_accuracy: overallAccuracy,
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
                }
              }
            } else if (call.name === 'get_questions_to_review') {
              const { data: missedQuestions, error } = await supabase
                .from('question_telemetry')
                .select('id, question_id, attempt_id, selected_answer, is_correct, is_skipped, dwell_time_sec, hints_used, created_at, questions(prompt, options, correct_answer, explanation, quiz_id, quizzes(topic))')
                .or('is_correct.eq.false,is_skipped.eq.true')
                .order('created_at', { ascending: false })
                .limit(args.limit || 10);

              if (error) {
                toolResult = JSON.stringify({ action: 'ERROR', error: `Failed to retrieve questions to review: ${error.message}` });
              } else {
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
                toolResult = JSON.stringify({
                  action: 'QUESTIONS_TO_REVIEW_RETRIEVED',
                  has_questions: list.length > 0,
                  total_missed: list.length,
                  questions: list,
                  message: list.length === 0 ? 'Great job! You have zero unreviewed missed questions.' : undefined,
                });
              }
            } else {
              toolResult = `Unknown tool: ${call.name}`;
            }
          } catch (toolErr: any) {
            toolResult = `Error executing ${call.name}: ${toolErr?.message || 'unknown error'}`;
          }

          toolExecutions.push({ name: call.name, args, result: toolResult });
          chatMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: toolResult,
          });
        }
      }

      // Final prose turn (no tools) so the model summarizes with tool results in context
      if (!assistantMessage || extractToolCallsFromGroq(assistantMessage).length > 0 || toolExecutions.length > 0) {
        const finalRes = await callGroq(chatMessages, false);
        if (finalRes.ok) {
          const finalData = await finalRes.json();
          const finalMessage = finalData.choices?.[0]?.message;
          if (finalMessage?.content) {
            assistantMessage = finalMessage;
          }
        }
      }

      const rawReply = assistantMessage?.content || 'I could not process your request at this moment.';
      let cleanReply = stripEmojis(String(rawReply).replace(/<[\s\S]*?<\/think>/gi, '').trim());

      // If generate_quiz ran, never let question text leak into chat prose
      const quizGenExec = toolExecutions.find((t) => t.name === 'generate_quiz');
      if (quizGenExec) {
        let resObj: any = null;
        try {
          resObj = typeof quizGenExec.result === 'string' ? JSON.parse(quizGenExec.result) : quizGenExec.result;
        } catch {
          // result is not JSON — treat as generic success path below
        }
        if (resObj?.action === 'ERROR') {
          cleanReply = stripEmojis(
            `I ran into a problem while creating that quiz: ${resObj.error}. Want me to try again with a different topic or difficulty?`
          );
        } else {
          const topic = resObj?.topic || 'the requested topic';
          if (!cleanReply || containsQuizSpoilers(cleanReply)) {
            cleanReply = buildQuizReadyFallback(topic);
          }
        }
      }

      // Save to chat_messages if session provided
      if (body.sessionId && body.sessionId !== 'new') {
        await supabase.from('chat_messages').insert([
          { session_id: body.sessionId, user_id: userId, role: 'user', content: trimmedMessage },
          { session_id: body.sessionId, user_id: userId, role: 'assistant', content: cleanReply, tool_calls: toolExecutions },
        ]);
      }

      // Support Server-Sent Events (SSE) streaming if requested by client
      if (req.headers.get('Accept')?.includes('text/event-stream')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'step',
                  phase: 'thinking',
                  text: 'Formulating Socratic guidance...',
                })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'done',
                  reply: cleanReply,
                  toolExecutions,
                  sessionId: body.sessionId,
                })}\n\n`
              )
            );
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      return jsonResponse({
        reply: cleanReply,
        toolExecutions,
        sessionId: body.sessionId,
      });
    }

    return errorResponse(`Endpoint not found: ${req.method} ${path}`, 404);
  } catch (err: any) {
    return errorResponse(err.message || 'Internal Server Error', 500);
  }
});

// ============================================================================
// Adaptive learner model — event-to-state conversion and next-action decision
// ============================================================================

interface MasteryDelta {
  conceptSlug: string;
  conceptName: string;
  before: number;
  after: number;
  nextReviewAt: string | null;
}

interface AdaptiveLoopResult {
  decision: AdaptiveDecision;
  masteryDeltas: MasteryDelta[];
  trace: TraceEvent[];
  /** Difficulty label the quiz was taken at (for the transition display). */
  currentDifficulty: string;
}

/**
 * Builds the concept graph for a quiz from the seeded taxonomy, persisting any
 * newly seen concepts so learner_concept_state always has valid concept rows to
 * reference. Ensures the union of taxonomy concepts matching the topic text OR
 * any question text, plus the topic itself as a fallback concept.
 */
async function ensureConceptsSeeded(
  serviceClient: any | null,
  scopedClient: any,
  topic: string,
  searchTexts: string[] = []
): Promise<ConceptGraph> {
  const bySlug: ConceptGraph['bySlug'] = {};

  const lowerTopic = String(topic || '').toLowerCase();
  const lowerTexts = searchTexts.map((t) => String(t || '').toLowerCase());
  const taxonomy = KNOWN_CONCEPTS.filter(
    (c) =>
      lowerTopic.includes(c.topic.toLowerCase()) ||
      c.keywords.some((k) => lowerTopic.includes(k)) ||
      lowerTexts.some((t) => c.keywords.some((k) => t.includes(k)))
  );

  const conceptsToEnsure =
    taxonomy.length > 0
      ? taxonomy.map((c) => ({ name: c.name, slug: c.slug, topic: c.topic, prerequisites: c.prerequisites }))
      : [{ name: topic || 'General', slug: slugifyConceptName(topic || 'General'), topic: topic || 'General', prerequisites: [] }];

  for (const c of conceptsToEnsure) {
    let conceptId: string | null = null;

    // Service client can upsert shared reference data; otherwise look up only.
    if (serviceClient) {
      const { data, error } = await serviceClient
        .from('concepts')
        .upsert(
          { topic: c.topic, name: c.name, slug: c.slug, description: '' },
          { onConflict: 'topic,slug' }
        )
        .select('id, name, slug')
        .maybeSingle();
      if (!error && data) conceptId = data.id;
    }

    if (!conceptId) {
      const { data } = await scopedClient
        .from('concepts')
        .select('id, name, slug')
        .eq('topic', c.topic)
        .eq('slug', c.slug)
        .maybeSingle();
      if (data) conceptId = data.id;
    }

    if (conceptId) {
      bySlug[c.slug] = { id: conceptId, name: c.name, slug: c.slug, prerequisites: c.prerequisites };
    }
  }

  // Persist prerequisite edges for any concepts we just ensured.
  if (serviceClient) {
    for (const slug of Object.keys(bySlug)) {
      const node = bySlug[slug];
      for (const preSlug of node.prerequisites) {
        const pre = bySlug[preSlug];
        if (!pre) continue;
        await serviceClient.from('concept_prerequisites').upsert(
          { concept_id: node.id, prerequisite_id: pre.id },
          { onConflict: 'concept_id,prerequisite_id', ignoreDuplicates: true }
        );
      }
    }
  }

  return { bySlug };
}

/**
 * The adaptive loop: quiz evidence -> concept mastery -> prerequisite
 * diagnosis -> next best action -> review scheduling -> learning events.
 * Deterministic; the LLM is never asked to decide pedagogy.
 */
async function runAdaptiveLoop(
  scopedClient: any,
  serviceClient: any | null,
  userId: string,
  quizId: string,
  telemetry: any[],
  attemptId: string
): Promise<AdaptiveLoopResult | null> {
  if (!telemetry || telemetry.length === 0) return null;

  // 1. Load the quiz (for topic) and question->concept tags. Seeded judge
  //    quizzes carry explicit mappings; generated quizzes fall back to tags
  //    embedded at generation time or keyword matching.
  const { data: quizRow } = await scopedClient
    .from('quizzes')
    .select('topic, difficulty')
    .eq('id', quizId)
    .maybeSingle();
  const topic = quizRow?.topic || 'General';
  const quizDifficulty = quizRow?.difficulty || 'intermediate';

  const questionIds = telemetry.map((t) => t.question_id);
  const { data: mappings } = await scopedClient
    .from('question_concepts')
    .select('question_id, concept_id, weight, concepts(name, slug)')
    .in('question_id', questionIds);

  const conceptGraph = await ensureConceptsSeeded(
    serviceClient,
    scopedClient,
    topic,
    telemetry.map((t) => t.prompt || '')
  );

  // 2. Attribute each question to concepts (pure; precedence: DB mappings >
  //    embedded generation tags > keyword match > topic fallback).
  const questionToSlugs = buildQuestionToSlugs(mappings, telemetry, topic);
  const touchedSlugs = Array.from(new Set(Array.from(questionToSlugs.values()).flat()));
  if (touchedSlugs.length === 0) return null;

  // 3. Load existing learner state for touched concepts.
  const touchedSlugs = Array.from(new Set(Array.from(questionToSlugs.values()).flat()));
  const { data: conceptRows } = await scopedClient
    .from('concepts')
    .select('id, name, slug')
    .in('slug', touchedSlugs);
  const slugToId = new Map<string, string>();
  const slugToName = new Map<string, string>();
  for (const row of conceptRows || []) {
    slugToId.set(row.slug, row.id);
    slugToName.set(row.slug, row.name);
  }

  const { data: existingStates } = await scopedClient
    .from('learner_concept_state')
    .select('*')
    .eq('user_id', userId)
    .in('concept_id', Array.from(slugToId.values()));

  const stateBySlug = new Map<string, any>();
  for (const s of existingStates || []) {
    const slug = Array.from(slugToId.entries()).find(([, id]) => id === s.concept_id)?.[0];
    if (slug) stateBySlug.set(slug, s);
  }

  // 4. Compute evidence once per concept (single source of truth), then
  //    update mastery and persist per concept.
  const evidenceBySlug: Record<string, ConceptEvidenceInput[]> = {};
  for (const t of telemetry) {
    for (const slug of questionToSlugs.get(t.question_id) || []) {
      (evidenceBySlug[slug] ??= []).push({
        correct: Boolean(t.is_correct),
        skipped: Boolean(t.is_skipped),
        dwellTimeSec: Number(t.dwell_time_sec) || 0,
        hintsUsed: Number(t.hints_used) || 0,
      });
    }
  }

  const masteryDeltas: MasteryDelta[] = [];
  const updates: Array<{ slug: string; updated: ReturnType<typeof updateMastery> }> = [];
  const now = new Date();
  const nowIso = now.toISOString();

  for (const slug of touchedSlugs) {
    const conceptId = slugToId.get(slug);
    const evidence = evidenceBySlug[slug] || [];
    if (!conceptId || evidence.length === 0) continue;

    const prevRow = stateBySlug.get(slug);
    const prevState: LearnerConceptState | null = prevRow
      ? {
          conceptSlug: slug,
          mastery: Number(prevRow.mastery ?? 0.5),
          attempts: Number(prevRow.attempts ?? 0),
          correct: Number(prevRow.correct ?? 0),
          incorrect: Number(prevRow.incorrect ?? 0),
          hintsUsed: Number(prevRow.hints_used ?? 0),
          avgResponseTimeSec: Number(prevRow.avg_response_time_sec ?? 0),
        }
      : null;

    const updated = updateMastery(prevState, evidence);
    const beforeMastery = prevState ? prevState.mastery : 0.5;
    const reviewAt = nextReviewAt(updated.mastery, now);

    // Upsert learner state (scoped client — RLS enforces ownership).
    const { error: upsertError } = await scopedClient.from('learner_concept_state').upsert(
      {
        user_id: userId,
        concept_id: conceptId,
        mastery: updated.mastery,
        confidence: Math.max(0, 1 - Math.min(1, updated.hintsUsed / Math.max(1, updated.attempts * 2))),
        attempts: updated.attempts,
        correct: updated.correct,
        incorrect: updated.incorrect,
        avg_response_time_sec: updated.avgResponseTimeSec,
        hints_used: updated.hintsUsed,
        last_seen_at: now.toISOString(),
        next_review_at: reviewAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,concept_id' }
    );
    if (upsertError) {
      console.error(`learner_concept_state upsert failed for ${slug}:`, upsertError.message);
      continue;
    }

    // attemptId comes from the caller (the created attempt row) — never a
    // best-effort read off telemetry, which does not carry it.
    await scopedClient.from('learning_events').insert(
      buildLearningEventRow({
        userId,
        conceptId,
        attemptId,
        eventType: 'quiz_evidence',
        beforeMastery,
        afterMastery: updated.mastery,
        questionCount: evidence.length,
        hintsUsed: updated.hintsUsed,
      })
    );

    updates.push({ slug, updated });
    masteryDeltas.push({
      conceptSlug: slug,
      conceptName: slugToName.get(slug) || slug,
      before: beforeMastery,
      after: updated.mastery,
      nextReviewAt: reviewAt.toISOString(),
    });
  }

  if (masteryDeltas.length === 0) return null;

  // 5. Load remaining (untouched) persisted learner state for decision context
  //    (weak concepts are visible across topics for review scheduling).
  const { data: allStates } = await scopedClient
    .from('learner_concept_state')
    .select('mastery, attempts, correct, incorrect, hints_used, avg_response_time_sec, concepts(slug)')
    .eq('user_id', userId);

  const persistedView: Record<string, { conceptSlug: string; mastery: number; attempts: number; correct: number; incorrect: number; hintsUsed: number; avgResponseTimeSec: number }> = {};
  for (const s of allStates || []) {
    const slug = (s.concepts as any)?.slug;
    if (!slug || updates.some((u) => u.slug === slug)) continue;
    persistedView[slug] = {
      conceptSlug: slug,
      mastery: Number(s.mastery ?? 0.5),
      attempts: Number(s.attempts ?? 0),
      correct: Number(s.correct ?? 0),
      incorrect: Number(s.incorrect ?? 0),
      hintsUsed: Number(s.hints_used ?? 0),
      avgResponseTimeSec: Number(s.avg_response_time_sec ?? 0),
    };
  }

  // Touched concepts take the authoritative updateMastery output — the same
  // values that were just persisted (running averages included).
  const learner = mergeLearnerStates(persistedView, updates);

  // 6. Diagnose + decide (evidence reused, not recomputed).
  const assessed = buildAssessedInputs(masteryDeltas, learner, evidenceBySlug);

  const focusSlug = assessed[0]?.slug;
  let diagnosis: PrerequisiteDiagnosis | undefined;
  if (focusSlug) {
    diagnosis = diagnosePrerequisite(focusSlug, conceptGraph, learner);
  }

  const decision = chooseNextAction({
    assessed,
    graph: conceptGraph,
    learner,
    currentDifficulty: quizDifficulty,
  });

  const trace = buildAgentTrace(
    [{ correctCount: telemetry.filter((t) => t.is_correct).length, total: telemetry.length }],
    decision,
    diagnosis
  );

  return { decision, masteryDeltas, trace, currentDifficulty: quizDifficulty };
}
