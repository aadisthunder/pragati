import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { processAgentChat, getLLM } from '../agent/langchainAgent.js';
import { createScopedClient } from '../config/supabase.js';

export const instructorRouter = Router();

// POST /api/instructor/chat - Socratic AI Instructor with tool execution
instructorRouter.post('/chat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const token = req.token!;
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  try {
    const result = await processAgentChat(userId, message, history || [], token);

    // Save message pair to chat_messages if session exists
    const scopedClient = createScopedClient(token);
    let { data: session } = await scopedClient
      .from('chat_sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      const { data: newSession } = await scopedClient
        .from('chat_sessions')
        .insert({ user_id: userId, title: message.slice(0, 30) })
        .select('id')
        .single();
      session = newSession;
    }

    if (session) {
      await scopedClient.from('chat_messages').insert([
        { session_id: session.id, user_id: userId, role: 'user', content: message },
        { session_id: session.id, user_id: userId, role: 'assistant', content: result.reply, tool_calls: result.toolExecutions },
      ]);
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Instructor failed to process request' });
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

// GET /api/instructor/history - Fetch recent chat conversation
instructorRouter.get('/history', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const scopedClient = createScopedClient(req.token!);
  const userId = req.user!.id;

  try {
    const { data: session } = await scopedClient
      .from('chat_sessions')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      res.json({ messages: [] });
      return;
    }

    const { data: messages } = await scopedClient
      .from('chat_messages')
      .select('role, content, tool_calls, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    res.json({ messages: messages || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
