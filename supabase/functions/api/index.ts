import { createClient } from 'jsr:@supabase/supabase-js@2';

const allowedOrigins = [
  'https://pragati-aadi.web.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

const SYSTEM_PROMPT =
  'You are Pragati AI Instructor, a warm, encouraging, and rigorous Socratic learning mentor. Never give direct answers right away. Guide students with probing questions, analogies, and conceptual hints. Format equations in LaTeX ($...$ for inline, $$...$$ for block). NEVER use emojis.';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = allowedOrigins.includes(origin);
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
        },
        topic_mastery: topicMastery,
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

      // Call Groq API for Socratic reasoning
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            ...boundedHistory,
            { role: 'user', content: promptForAgent },
          ],
          temperature: 0.7,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        return errorResponse(`Groq API Error: ${errText}`, groqRes.status);
      }

      const groqData = await groqRes.json();
      const rawReply = groqData.choices?.[0]?.message?.content || 'I could not process your request at this moment.';
      const cleanReply = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // Save to chat_messages if session provided
      if (body.sessionId && body.sessionId !== 'new') {
        await supabase.from('chat_messages').insert([
          { session_id: body.sessionId, user_id: userId, role: 'user', content: trimmedMessage },
          { session_id: body.sessionId, user_id: userId, role: 'assistant', content: cleanReply, tool_calls: [] },
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
                  toolExecutions: [],
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
        toolExecutions: [],
        sessionId: body.sessionId,
      });
    }

    return errorResponse(`Endpoint not found: ${req.method} ${path}`, 404);
  } catch (err: any) {
    return errorResponse(err.message || 'Internal Server Error', 500);
  }
});
