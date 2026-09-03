import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { createScopedClient } from '../config/supabase.js';
import { createAgentTools } from './tools.js';

const bedrockMantleKey = process.env.AWS_BEDROCK_MANTLE || '';
const baseURL = 'https://bedrock-mantle.us-east-1.api.aws/v1';

export function getLLM(modelName: string = 'deepseek.v3.1', temperature: number = 0.3) {
  return new ChatOpenAI({
    apiKey: bedrockMantleKey,
    model: modelName,
    temperature,
    maxTokens: 3072,
    configuration: {
      baseURL,
    },
  });
}

export const SYSTEM_PROMPT = `You are Pragati AI Instructor, an intelligent, empathetic, and highly skilled STEM academic tutor.
Your core teaching philosophy is Socratic:
1. Guide students step-by-step through first principles instead of immediately giving away flat answers.
2. Render all mathematical equations, scientific variables, and formulas using clean LaTeX format (e.g. $E = mc^2$ or $$\\int x dx$$).
3. Strictly DO NOT use emojis anywhere in your responses, titles, or explanations. Use clear typography and bullet points.
4. You have access to powerful tools:
   - "generate_quiz": Call this whenever the user asks for a test, quiz, practice problems, or assessment on any topic.
   - "get_student_attempts": Call this to inspect the user's past quiz history and scores.
   - "get_attempt_telemetry": Call this to see which questions the student missed, skipped, or struggled with on a specific quiz attempt.
   - "explain_missed_question": Call this to retrieve the exact question details to tutor the student on their mistakes.
When a student asks you to review what they got wrong, first use get_student_attempts or get_attempt_telemetry to diagnose their weaknesses, then tutor them Socratically on the missed concepts.`;

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
        try {
          args = JSON.parse(rawArgs);
        } catch {
          // Attempt repair of unclosed JSON brackets from streaming/truncated outputs
          let cleaned = rawArgs.trim();
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

      // Avoid duplicates if already populated by native LangChain tool_calls
      if (!calls.some(c => c.name === name)) {
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
    if (!calls.some(c => c.name === rawFuncCall.name)) {
      calls.push({
        id: 'func_call',
        name: rawFuncCall.name,
        args,
      });
    }
  }

  return calls;
}

export async function processAgentChat(
  userId: string,
  userMessage: string,
  history: Array<{ role: string; content: string }> = [],
  userToken: string
) {
  const scopedClient = createScopedClient(userToken);
  const llm = getLLM('deepseek.v3.1', 0.2);
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
  messages.push(aiResponse);

  const toolExecutions: any[] = [];
  const detectedToolCalls = extractToolCalls(aiResponse);

  // If the model generated tool calls, execute them dynamically and re-invoke
  if (detectedToolCalls.length > 0) {
    for (const toolCall of detectedToolCalls) {
      const selectedTool = toolMap.get(toolCall.name);
      if (selectedTool) {
        try {
          const toolResult = await (selectedTool as any).invoke(toolCall.args);
          toolExecutions.push({
            name: toolCall.name,
            args: toolCall.args,
            result: toolResult,
          });
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || `call_${toolCall.name}`,
              name: toolCall.name,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            })
          );
        } catch (err: any) {
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

    // Final response incorporating dynamic tool outputs
    aiResponse = await llmWithTools.invoke(messages);
  }

  const finalReply = typeof aiResponse.content === 'string' 
    ? aiResponse.content 
    : JSON.stringify(aiResponse.content);

  return {
    reply: finalReply,
    toolExecutions,
  };
}
