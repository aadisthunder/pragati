import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { extractToolCalls } from './langchainAgent.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

describe('Bedrock Mantle AI Agent Connectivity & Tool Calling', () => {
  const apiKey = process.env.AWS_BEDROCK_MANTLE;

  it('extractToolCalls should correctly parse both LangChain and additional_kwargs tool calls', () => {
    const mockResponse1 = {
      tool_calls: [],
      additional_kwargs: {
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'generate_quiz',
              arguments: '{"topic": "Calculus", "num_questions": 3',
            },
          },
        ],
      },
    };

    const extracted1 = extractToolCalls(mockResponse1);
    expect(extracted1.length).toBe(1);
    expect(extracted1[0].name).toBe('generate_quiz');
    expect(extracted1[0].args).toEqual({ topic: 'Calculus', num_questions: 3 });

    const mockResponse2 = {
      tool_calls: [
        {
          id: 'call_456',
          name: 'get_student_attempts',
          args: { limit: 5 },
        },
      ],
      additional_kwargs: {},
    };

    const extracted2 = extractToolCalls(mockResponse2);
    expect(extracted2.length).toBe(1);
    expect(extracted2[0].name).toBe('get_student_attempts');
    expect(extracted2[0].args).toEqual({ limit: 5 });
  });

  it('natural prompt should trigger generate_quiz tool call dynamically on deepseek.v3.1 without hardcoding', async () => {
    if (!apiKey) return;
    const llm = new ChatOpenAI({
      apiKey,
      model: 'deepseek.v3.1',
      temperature: 0.1,
      maxTokens: 2048,
      configuration: {
        baseURL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
      },
    });

    const quizTool = tool(
      async ({ topic, num_questions }) => {
        return JSON.stringify({ action: 'QUIZ_GENERATED', topic, num_questions });
      },
      {
        name: 'generate_quiz',
        description: 'Generates a practice quiz on a requested academic topic',
        schema: z.object({
          topic: z.string().describe('The academic topic'),
          num_questions: z.number().default(5).describe('Number of questions'),
        }),
      }
    );

    const llmWithTools = llm.bindTools([quizTool]);
    const response = await llmWithTools.invoke('Please generate a 3-question quiz on Calculus Derivatives');
    const toolCalls = extractToolCalls(response);
    console.log('Natural prompt extracted tool calls:', toolCalls);

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].name).toBe('generate_quiz');
    expect(toolCalls[0].args.topic.toLowerCase()).toContain('calculus');
  }, 30000);
});
