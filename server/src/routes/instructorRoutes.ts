import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { processAgentChat, getLLM } from '../agent/langchainAgent.js';
import { createScopedClient } from '../config/supabase.js';

export const instructorRouter = Router();

// POST /api/instructor/chat - Socratic AI Instructor with tool execution & streaming telemetry
instructorRouter.post('/chat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const token = req.token!;
  const { message, history, sessionId } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  const isStream = req.headers.accept?.includes('text/event-stream') || req.query.stream === 'true';

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }
  }

  const sendStep = (step: { phase: string; text: string; tool?: string }) => {
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: 'step', ...step })}\n\n`);
    }
  };

  try {
    const result = await processAgentChat(userId, message, history || [], token, sendStep);

    // Save message pair to chat_messages if session exists
    const scopedClient = createScopedClient(token);
    let session: any = null;

    if (sessionId) {
      const { data: existingSession } = await scopedClient
        .from('chat_sessions')
        .select('id, title')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();
      session = existingSession;
    }

    if (!session) {
      const { data: latestSession } = await scopedClient
        .from('chat_sessions')
        .select('id, title')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      session = latestSession;
    }

    if (!session) {
      const { data: newSession } = await scopedClient
        .from('chat_sessions')
        .insert({ user_id: userId, title: message.slice(0, 30) })
        .select('id, title')
        .single();
      session = newSession;
      await pruneOldSessions(scopedClient, userId, 5);
    } else if (session.title === 'New Conversation') {
      await scopedClient
        .from('chat_sessions')
        .update({ title: message.slice(0, 30) })
        .eq('id', session.id);
    }

    if (session) {
      await scopedClient.from('chat_messages').insert([
        { session_id: session.id, user_id: userId, role: 'user', content: message },
        { session_id: session.id, user_id: userId, role: 'assistant', content: result.reply, tool_calls: result.toolExecutions },
      ]);
    }

    const payload = {
      ...result,
      sessionId: session?.id,
    };

    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: 'done', ...payload })}\n\n`);
      res.end();
    } else {
      res.json(payload);
    }
  } catch (err: any) {
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'AI Instructor failed to process request' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'AI Instructor failed to process request' });
    }
  }
});

// POST /api/instructor/ocr - Vision OCR extraction for uploaded questions
instructorRouter.post('/ocr', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 is required' });
    return;
  }

  try {
    const visionLlm = getLLM('writer.palmyra-vision-7b', 0.1);
    const prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the complete text and all mathematical formulas from this question image. Convert all equations into clean LaTeX format ($...$). Return ONLY the extracted text and formulas, with no conversational filler.',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    const response = await visionLlm.invoke(prompt as any);
    const extractedText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    res.json({ extractedText });
  } catch (err: any) {
    // Fallback message if vision model requires specific payload
    res.status(500).json({ error: `OCR processing error: ${err.message}` });
  }
});

/**
 * Prunes chat sessions for a user so only the latest `maxSessions` (default 5) are kept.
 * Oldest sessions and their associated chat messages are completely removed from the database.
 */
export async function pruneOldSessions(
  scopedClient: any,
  userId: string,
  maxSessions = 5
): Promise<string[]> {
  try {
    const { data: allSessions, error } = await scopedClient
      .from('chat_sessions')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !allSessions || allSessions.length <= maxSessions) {
      return [];
    }

    const excessSessions = allSessions.slice(maxSessions);
    const excessIds = excessSessions.map((s: any) => s.id);

    if (excessIds.length > 0) {
      // 1. Delete associated messages first
      await scopedClient
        .from('chat_messages')
        .delete()
        .in('session_id', excessIds)
        .eq('user_id', userId);

      // 2. Delete excess sessions from database
      await scopedClient
        .from('chat_sessions')
        .delete()
        .in('id', excessIds)
        .eq('user_id', userId);
    }

    return excessIds;
  } catch (err) {
    console.error('Failed to prune old chat sessions:', err);
    return [];
  }
}

// GET /api/instructor/sessions - List recent chat sessions for user (max 5)
instructorRouter.get('/sessions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    // Prune any sessions beyond 5 from the database
    await pruneOldSessions(scopedClient, userId, 5);

    const { data: sessions, error } = await scopedClient
      .from('chat_sessions')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    res.json({ sessions: sessions || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instructor/sessions - Create new chat session (prunes beyond 5)
instructorRouter.post('/sessions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    const { data: newSession, error } = await scopedClient
      .from('chat_sessions')
      .insert({ user_id: userId, title: 'New Conversation' })
      .select('id, title, created_at')
      .single();

    if (error) throw error;

    // Prune so only the latest 5 sessions exist in DB
    await pruneOldSessions(scopedClient, userId, 5);

    res.status(201).json({ session: newSession });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/instructor/sessions/:id - Delete a chat session and its messages
instructorRouter.delete('/sessions/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;
  const sessionId = req.params.id;

  try {
    // Delete associated messages first to maintain relational integrity
    await scopedClient
      .from('chat_messages')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    const { error } = await scopedClient
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({ success: true, id: sessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instructor/sessions/:id/messages - Fetch messages for specific session
instructorRouter.get('/sessions/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;
  const sessionId = req.params.id;

  try {
    const { data: messages, error } = await scopedClient
      .from('chat_messages')
      .select('role, content, tool_calls, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ messages: messages || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instructor/history - Fetch latest chat conversation (backward compatible)
instructorRouter.get('/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    const { data: session } = await scopedClient
      .from('chat_sessions')
      .select('id, title')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      res.json({ messages: [], sessionId: null });
      return;
    }

    const { data: messages } = await scopedClient
      .from('chat_messages')
      .select('role, content, tool_calls, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    res.json({ messages: messages || [], sessionId: session.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
