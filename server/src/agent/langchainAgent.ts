import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { createScopedClient } from '../config/supabase.js';
import { createAgentTools, sanitizeToolArgs } from './tools.js';

const baseURL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';

export function getLLM(
  modelName: string = process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  temperature: number = 0.3,
  maxTokens: number = 3072,
  maxRetries: number = 2,
  timeoutMs: number = 20000
) {
  const apiKey = process.env.GROQ_API_KEY || '';
  return new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature,
    maxTokens,
    maxRetries,
    timeout: timeoutMs,
    configuration: {
      baseURL,
      timeout: timeoutMs,
    },
  });
}

export const SYSTEM_PROMPT = `You are Pragati AI Instructor, an intelligent, empathetic, and highly skilled academic tutor.
Your core teaching philosophy is Socratic:
1. Guide students step-by-step through first principles instead of immediately giving away flat answers.
2. Render all mathematical equations, scientific variables, and formulas using clean LaTeX format (e.g. $E = mc^2$ or $$\\int x dx$$).
   - LaTeX delimiter rule: use $...$ for inline math and $$...$$ for display math. NEVER use the delimiters \(...\) or \[...\] — they do not render in the student interface.
3. Strictly DO NOT use emojis anywhere in your responses, titles, or explanations. Use clear typography and bullet points.
4. Conversational Flow & Intent:
   - Always prioritize the user's latest message.
   - When the user sends a greeting (e.g., "hi", "hello", "hey") or casual message, warmly greet them back and ask what they would like to learn or practice today. DO NOT invoke any tools or bring up old quiz topics on greetings.
   - Do NOT fixate or loop on past tool operations unless the user's current message specifically asks about them.
5. You have access to powerful tools (use them ONLY when actively requested by the user's current prompt):
   - "generate_quiz": Call this whenever the user asks for a test, quiz, practice problems, or assessment on any topic (e.g. "Generate a quiz to test my understanding on topic : inflation 2026 10 questions").
     CRITICAL QUIZ GENERATION RULE: After calling "generate_quiz", the interactive quiz card is automatically rendered in the student's user interface. Strictly DO NOT print out the questions, options, or answer keys in your chat text! Provide only a brief 1-2 sentence confirmation (e.g., "I have generated your practice assessment on inflation 2026. Click the card below to start!") and encourage them to take it.
   - "get_student_performance": Call this whenever the user asks to review their performance, overall stats, scores, or skill rating (e.g. "Can you review my recent quiz attempts and performance?").
   - "get_questions_to_review": Call this whenever the user asks to review their missed or skipped questions, struggled concepts, or mistakes (e.g. "Review the questions I missed or skipped in my recent quiz attempts and explain how to solve them step-by-step"). Connects directly to the Analytics Questions to Review dataset. Use the returned struggled questions and explanations to tutor the student Socratically on their exact mistakes.
   - "get_student_attempts": Call this when the user asks for raw past quiz attempts list.
   - "get_attempt_telemetry": Call this when the user asks for telemetry on a specific attempt.
   - "explain_missed_question": Call this to retrieve question details for a specific question ID.
6. Formatting & Visual Presentation:
   - When presenting available tools, key concepts, study topics, or structured steps, format each item as a bullet point with a bold title (e.g. "- **Title**: Description"). These render as individual visual outline cards in the student's interface.
   - Strongly prefer bold bullet-point cards over wide markdown tables for listing attempts, stats, or comparisons (tables with many columns wrap badly on the student's screen). If a markdown table is truly essential, keep it to a maximum of 3 short columns.
   - Separate distinct ideas, sections, and topics with clean blank lines and markdown subheadings (###) to maintain generous vertical spacing and prevent dense walls of text.`;

/**
 * Robust extractor for tool calls from LangChain and OpenAI-compatible raw payloads (Bedrock Mantle).
 * Handles partial JSON strings and missing trailing braces gracefully.
 */
export function extractToolCalls(aiResponse: any): Array<{ id?: string; name: string; args: any }> {
  const calls: Array<{ id?: string; name: string; args: any }> = [];

  // 1. LangChain native parsed tool_calls
  if (Array.isArray(aiResponse?.tool_calls) && aiResponse.tool_calls.length > 0) {
    for (const tc of aiResponse.tool_calls) {
      if (tc && tc.name) {
        calls.push({
          id: tc.id,
          name: tc.name,
          args: tc.args || {},
        });
      }
    }
  }

  // 2. Raw additional_kwargs.tool_calls (OpenAI format returned by Bedrock Mantle DeepSeek)
  const rawToolCalls = aiResponse?.additional_kwargs?.tool_calls;
  if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
    for (const raw of rawToolCalls) {
      const name = raw.function?.name;
      if (!name) continue;

      let args: any = {};
      const rawArgs = raw.function?.arguments;
      if (typeof rawArgs === 'string') {
        let cleaned = rawArgs.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '');
        if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '');
        if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '').trim();
        try {
          args = JSON.parse(cleaned);
        } catch {
          const startIdx = cleaned.indexOf('{');
          const endIdx = cleaned.lastIndexOf('}');
          if (startIdx !== -1 && endIdx > startIdx) {
            try {
              args = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
            } catch {
              // continue to repair
            }
          }
          // Attempt repair of unclosed JSON brackets from streaming/truncated outputs
          if (!cleaned.endsWith('}')) cleaned += '}';
          try {
            args = JSON.parse(cleaned);
          } catch {
            args = {};
          }
        }
      } else if (typeof rawArgs === 'object' && rawArgs !== null) {
        args = rawArgs;
      }

      // Check if already populated by native LangChain tool_calls, backfill empty args if needed
      const existing = calls.find(c => c.name === name);
      if (existing) {
        if ((!existing.args || Object.keys(existing.args).length === 0) && Object.keys(args).length > 0) {
          existing.args = args;
        }
        if (!existing.id && raw.id) {
          existing.id = raw.id;
        }
      } else {
        calls.push({
          id: raw.id,
          name,
          args,
        });
      }
    }
  }

  // 3. Legacy additional_kwargs.function_call
  const rawFuncCall = aiResponse?.additional_kwargs?.function_call;
  if (rawFuncCall && rawFuncCall.name) {
    let args: any = {};
    if (typeof rawFuncCall.arguments === 'string') {
      try {
        args = JSON.parse(rawFuncCall.arguments);
      } catch {
        let cleaned = rawFuncCall.arguments.trim();
        if (!cleaned.endsWith('}')) cleaned += '}';
        try {
          args = JSON.parse(cleaned);
        } catch {
          args = {};
        }
      }
    }
    const existingFunc = calls.find(c => c.name === rawFuncCall.name);
    if (existingFunc) {
      if ((!existingFunc.args || Object.keys(existingFunc.args).length === 0) && Object.keys(args).length > 0) {
        existingFunc.args = args;
      }
    } else {
      calls.push({
        id: 'func_call',
        name: rawFuncCall.name,
        args,
      });
    }
  }

  return calls;
}

/**
 * Strictly sanitizes client-provided chat history to match the standard LLM/OpenAI schema.
 * Strips all client UI attributes (animate, image, id, etc.) and ensures valid roles and non-empty content.
 */
export function sanitizeChatHistory(
  history: any,
  maxAllowedTurns: number = 20
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(history)) return [];

  const sanitized: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const role = item.role;
    if (role !== 'user' && role !== 'assistant') continue;

    const rawContent = item.content;
    if (typeof rawContent !== 'string') continue;
    const trimmed = rawContent.trim();
    if (!trimmed) continue;

    sanitized.push({
      role,
      content: trimmed,
    });
  }

  // Cap to maxAllowedTurns (keeping the latest turns)
  if (sanitized.length > maxAllowedTurns) {
    return sanitized.slice(-maxAllowedTurns);
  }

  return sanitized;
}

/**
 * Validates a user's input chat message.
 */
export function validateChatMessage(message: any): { valid: boolean; error?: string; cleanMessage?: string } {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message is required' };
  }

  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty or whitespace only' };
  }

  if (message.length > 5000) {
    return { valid: false, error: 'Message exceeds maximum allowed length (5000 characters)' };
  }

  return { valid: true, cleanMessage: trimmed };
}

export type AgentStepCallback = (step: { phase: string; text: string; tool?: string }) => void;

const FENCE_TOKEN = '\u0000FENCE';

/**
 * Rewrites OpenAI-style LaTeX delimiters \(...\) and \[...\] into the $/$$ delimiters
 * the client's remark-math pipeline understands, so stored replies never render as raw
 * TeX source in the chat UI. Fenced code blocks are protected from rewriting.
 */
export function normalizeLatexDelimiters(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const fences: string[] = [];
  let text = input.replace(/```[\s\S]*?```/g, (match) => {
    fences.push(match);
    return `${FENCE_TOKEN}${fences.length - 1}${FENCE_TOKEN}`;
  });

  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, body: string) => `$$${body}$$`);
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, body: string) => `$${body}$`);

  text = text.replace(new RegExp(`${FENCE_TOKEN}(\\d+)${FENCE_TOKEN}`, 'g'), (_m, i: string) =>
    fences[Number(i)]
  );

  return text;
}

const FRIENDLY_TOOL_STATUS: Record<string, string> = {
  generate_quiz: 'Crafting your practice assessment...',
  get_student_performance: 'Analyzing your academic performance and stats...',
  get_questions_to_review: 'Retrieving your struggled and missed questions from Analytics...',
  get_student_attempts: 'Looking up your recent quiz performance...',
  get_attempt_telemetry: 'Reviewing the questions you found challenging...',
  explain_missed_question: 'Preparing Socratic tutoring guidance...',
};

export async function processAgentChat(
  userId: string,
  userMessage: string,
  history: any = [],
  userToken: string,
  onStep?: AgentStepCallback
) {
  onStep?.({ phase: 'thinking', text: 'AI Instructor is thinking...' });

  const cleanHistory = sanitizeChatHistory(history);
  const scopedClient = createScopedClient(userToken);
  const llm = getLLM(process.env.GROQ_MODEL || 'openai/gpt-oss-120b', 0.2);
  const tools = createAgentTools(scopedClient, userId, llm);
  const toolMap = new Map(tools.map(t => [t.name, t]));
  const llmWithTools = llm.bindTools(tools);

  // Convert history into LangChain messages
  const messages: any[] = [new SystemMessage(SYSTEM_PROMPT)];
  for (const msg of cleanHistory) {
    if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
    else if (msg.role === 'assistant') messages.push(new AIMessage(msg.content));
  }
  messages.push(new HumanMessage(userMessage));

  // Run model with multi-step tool calling support (up to 3 iterations)
  let aiResponse = await llmWithTools.invoke(messages);
  const toolExecutions: any[] = [];
  const maxIterations = 3;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    const detectedToolCalls = extractToolCalls(aiResponse);
    if (detectedToolCalls.length === 0) {
      break;
    }

    const cleanAIMessage = new AIMessage({
      content: typeof aiResponse.content === 'string' ? aiResponse.content : '',
      tool_calls: detectedToolCalls.map(tc => {
        const sanitized = sanitizeToolArgs(tc.name, tc.args, userMessage);
        return {
          id: tc.id || `call_${tc.name}_${iteration}`,
          name: tc.name,
          args: sanitized,
        };
      }),
    });
    messages.push(cleanAIMessage);
    onStep?.({ phase: 'searching', text: 'Selecting the best learning approach...' });

    for (const toolCall of detectedToolCalls) {
      const sanitizedArgs = sanitizeToolArgs(toolCall.name, toolCall.args, userMessage);
      const selectedTool = toolMap.get(toolCall.name);
      if (selectedTool) {
        const friendlyText = FRIENDLY_TOOL_STATUS[toolCall.name] || `Working on ${toolCall.name}...`;
        onStep?.({ phase: 'calling_tool', tool: toolCall.name, text: friendlyText });
        try {
          const toolResult = await (selectedTool as any).invoke(sanitizedArgs);
          toolExecutions.push({
            name: toolCall.name,
            args: sanitizedArgs,
            result: toolResult,
          });
          onStep?.({ phase: 'viewing_results', tool: toolCall.name, text: 'Finalizing concepts and questions...' });
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || `call_${toolCall.name}_${iteration}`,
              name: toolCall.name,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            })
          );
        } catch (err: any) {
          toolExecutions.push({
            name: toolCall.name,
            args: toolCall.args,
            error: err.message,
            result: `Error executing ${toolCall.name}: ${err.message}`,
          });
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || `call_${toolCall.name}_${iteration}`,
              name: toolCall.name,
              content: `Error executing ${toolCall.name}: ${err.message}`,
            })
          );
        }
      }
    }

    onStep?.({ phase: 'analyzing', text: 'Formulating step-by-step guidance...' });
    aiResponse = await llmWithTools.invoke(messages);
  }

  let rawContent = typeof aiResponse.content === 'string' 
    ? aiResponse.content.trim()
    : JSON.stringify(aiResponse.content);

  let finalReply = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If generate_quiz was executed, strictly prevent question spoilers in chat text
  const quizGenExec = toolExecutions.find(t => t.name === 'generate_quiz');
  if (quizGenExec) {
    let topic = 'the requested topic';
    try {
      const resObj = typeof quizGenExec.result === 'string' ? JSON.parse(quizGenExec.result) : quizGenExec.result;
      if (resObj?.topic) topic = resObj.topic;
    } catch {}

    if (
      !finalReply ||
      /Question\s*\d+/i.test(finalReply) ||
      /###\s*Questions/i.test(finalReply) ||
      /\bA\)\s+/i.test(finalReply) ||
      /\b1\.\s+\*\*Which/i.test(finalReply) ||
      /\b1\.\s+\*\*What/i.test(finalReply)
    ) {
      finalReply = `I have generated your practice quiz on **${topic}**. You can start taking it using the interactive card below!`;
    }
  }

  // Normalize LaTeX delimiters once before persisting/returning so the chat UI renders
  // math correctly regardless of which delimiter style the model chose this turn.
  finalReply = normalizeLatexDelimiters(finalReply);

  if (!finalReply) {
    if (toolExecutions.length > 0) {
      const perfExec = toolExecutions.find(t => t.name === 'get_student_performance');
      const missedExec = toolExecutions.find(t => t.name === 'get_questions_to_review');
      if (perfExec) {
        finalReply = 'Here is your current academic performance report. You can review your complete analytics and learning curves below.';
      } else if (missedExec) {
        finalReply = 'Here are your recent struggled and missed questions from the Questions to Review section. Let us tutor through each concept step-by-step!';
      } else {
        finalReply = `I analyzed the academic tools and data for your request. Let me know how you would like to proceed!`;
      }
    } else {
      finalReply = `I am here to help guide you through academic concepts and practice. What would you like to explore?`;
    }
  }

  return {
    reply: finalReply,
    toolExecutions,
  };
}
