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
3. Strictly DO NOT use emojis anywhere in your responses, titles, or explanations. Use clear typography and bullet points.
4. Conversational Flow & Intent:
   - Always prioritize the user's latest message.
   - When the user sends a greeting (e.g., "hi", "hello", "hey") or casual message, warmly greet them back and ask what they would like to learn or practice today. DO NOT invoke any tools or bring up old quiz topics on greetings.
   - Do NOT fixate or loop on past tool operations unless the user's current message specifically asks about them.
5. You have access to powerful tools (use them ONLY when actively requested by the user's current prompt):
   - "generate_quiz": Call this whenever the user explicitly asks for a test, quiz, practice problems, or assessment on any topic.
   - "get_student_attempts": Call this when the user asks to inspect their quiz history, past attempts, or scores.
   - "get_attempt_telemetry": Call this to see which questions the student missed, skipped, or struggled with on a specific quiz attempt.
   - "explain_missed_question": Call this to retrieve the exact question details to tutor the student on their mistakes.
When a student asks you to review what they got wrong, first use get_student_attempts or get_attempt_telemetry to diagnose their weaknesses, then tutor them Socratically on the missed concepts.
6. Formatting & Visual Presentation:
   - When presenting available tools, key concepts, study topics, or structured steps, format each item as a bullet point with a bold title (e.g. "- **Title**: Description"). These render as individual visual outline cards in the student's interface.
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

export type AgentStepCallback = (step: { phase: string; text: string; tool?: string }) => void;

const FRIENDLY_TOOL_STATUS: Record<string, string> = {
  generate_quiz: 'Crafting your practice assessment...',
  get_student_attempts: 'Looking up your recent quiz performance...',
  get_attempt_telemetry: 'Reviewing the questions you found challenging...',
  explain_missed_question: 'Preparing Socratic tutoring guidance...',
};

export async function processAgentChat(
  userId: string,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  userToken: string,
  onStep?: AgentStepCallback
) {
  onStep?.({ phase: 'thinking', text: 'AI Instructor is thinking...' });

  const scopedClient = createScopedClient(userToken);
  const llm = getLLM(process.env.GROQ_MODEL || 'openai/gpt-oss-120b', 0.2);
  const tools = createAgentTools(scopedClient, userId, llm);
  const toolMap = new Map(tools.map(t => [t.name, t]));
  const llmWithTools = llm.bindTools(tools);

  // Convert history into LangChain messages
  const messages: any[] = [new SystemMessage(SYSTEM_PROMPT)];
  for (const msg of history) {
    if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
    else if (msg.role === 'assistant') messages.push(new AIMessage(msg.content));
  }
  messages.push(new HumanMessage(userMessage));

  // Run initial model call
  let aiResponse = await llmWithTools.invoke(messages);
  const toolExecutions: any[] = [];
  const detectedToolCalls = extractToolCalls(aiResponse);

  // If the model generated tool calls, execute them dynamically and re-invoke
  if (detectedToolCalls.length > 0) {
    // Build a sanitized assistant message with clean, valid JSON tool_calls
    const cleanAIMessage = new AIMessage({
      content: typeof aiResponse.content === 'string' ? aiResponse.content : '',
      tool_calls: detectedToolCalls.map(tc => {
        const sanitized = sanitizeToolArgs(tc.name, tc.args, userMessage);
        return {
          id: tc.id || `call_${tc.name}`,
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
              tool_call_id: toolCall.id || `call_${toolCall.name}`,
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
              tool_call_id: toolCall.id || `call_${toolCall.name}`,
              name: toolCall.name,
              content: `Error executing ${toolCall.name}: ${err.message}`,
            })
          );
        }
      }
    }

    onStep?.({ phase: 'analyzing', text: 'Formulating step-by-step guidance...' });
    // Final response incorporating dynamic tool outputs
    aiResponse = await llmWithTools.invoke(messages);
  }

  let rawContent = typeof aiResponse.content === 'string' 
    ? aiResponse.content.trim()
    : JSON.stringify(aiResponse.content);

  let finalReply = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  if (!finalReply) {
    if (toolExecutions.length > 0) {
      const firstGen = toolExecutions.find(t => t.name === 'generate_quiz');
      if (firstGen) {
        let topic = 'the requested topic';
        let isSuccess = false;
        let errorMsg = '';
        try {
          const resObj = typeof firstGen.result === 'string' ? JSON.parse(firstGen.result) : firstGen.result;
          if (resObj?.action === 'QUIZ_GENERATED') {
            isSuccess = true;
            if (resObj.topic) topic = resObj.topic;
          } else if (resObj?.error) {
            errorMsg = resObj.error;
          }
        } catch {
          errorMsg = String(firstGen.result || firstGen.error || 'Quiz generation failed.');
        }

        if (isSuccess) {
          finalReply = `I have generated a practice quiz on "${topic}". You can start taking it using the card below!`;
        } else {
          finalReply = `I encountered an issue generating the quiz on "${firstGen.args?.topic || 'the requested topic'}": ${errorMsg || 'Could not generate valid questions'}. Would you like me to try again or focus on a specific subtopic?`;
        }
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
