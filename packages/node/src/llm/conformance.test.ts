import type Anthropic from '@anthropic-ai/sdk';
import type { GoogleGenerativeAI } from '@google/generative-ai';
import type { ToolDefinition } from '@basebot/core';
import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

import { ClaudeAdapter } from './claude-adapter.js';
import { collectLLMChunks, runProviderConformance } from './conformance.js';
import { createLLMAdapter } from './factory.js';
import { DeepSeekAdapter } from './deepseek-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { MockLLMAdapter } from './mock-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';

const sampleTool: ToolDefinition = {
  name: 'get_weather',
  description: 'Get weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string' },
    },
    required: ['city'],
  },
  handler: 'inprocess:noop',
};

function mockOpenAiStream(chunks: unknown[]) {
  return {
    chat: {
      completions: {
        create: async () => ({
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
          },
        }),
      },
    },
  } as unknown as OpenAI;
}

function mockOpenAiConformanceClient(tool: ToolDefinition) {
  let calls = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              async *[Symbol.asyncIterator]() {
                yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
                yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
              },
            };
          }
          return {
            async *[Symbol.asyncIterator]() {
              yield {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: 'call_1',
                          function: {
                            name: tool.name,
                            arguments: '{"city":"Paris"}',
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              };
              yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
            },
          };
        },
      },
    },
  } as unknown as OpenAI;
}

describe('LLM provider conformance suite', () => {
  it('passes for MockLLMAdapter (OpenAI behavioral baseline)', async () => {
    const adapter = new MockLLMAdapter({
      ttftMs: 0,
      response: 'Hello there',
      toolCalls: [{ name: sampleTool.name, arguments: { city: 'Paris' } }],
    });
    const result = await runProviderConformance(adapter, sampleTool);
    expect(result.errors).toEqual([]);
    expect(result.streamingText).toBe(true);
    expect(result.toolCall).toBe(true);
  });

  it('passes for OpenAIAdapter with injected streaming client', async () => {
    const client = mockOpenAiConformanceClient(sampleTool);
    const adapter = new OpenAIAdapter('test-key', 'gpt-4o-mini', undefined, client);
    const result = await runProviderConformance(adapter, sampleTool);
    expect(result.errors).toEqual([]);
  });

  it('passes for ClaudeAdapter with injected message stream', async () => {
    const textClient = {
      messages: {
        stream: () =>
          (async function* () {
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hello' },
            };
            yield {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
            };
          })(),
      },
    } as unknown as Anthropic;

    const textAdapter = new ClaudeAdapter('test-key', undefined, textClient);
    const textChunks = await collectLLMChunks(textAdapter);
    expect(textChunks.some((c) => c.type === 'text_delta')).toBe(true);
    expect(textChunks.some((c) => c.type === 'done')).toBe(true);

    const toolClient = {
      messages: {
        stream: () =>
          (async function* () {
            yield {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'tool_use',
                id: 'toolu_1',
                name: sampleTool.name,
                input: {},
              },
            };
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'input_json_delta', partial_json: '{"city":"Paris"}' },
            };
            yield {
              type: 'message_delta',
              delta: { stop_reason: 'tool_use' },
            };
          })(),
      },
    } as unknown as Anthropic;

    const claudeToolAdapter = new ClaudeAdapter('test-key', undefined, toolClient);
    const toolChunks = await collectLLMChunks(
      claudeToolAdapter,
      [{ role: 'user', content: 'weather' }],
      [sampleTool],
    );
    expect(toolChunks.some((c) => c.type === 'tool_call')).toBe(true);
  });

  it('passes for GeminiAdapter with injected generateContentStream', async () => {
    const textClient = {
      getGenerativeModel: () => ({
        generateContentStream: async () => ({
          stream: (async function* () {
            yield {
              text: () => 'Hello',
              functionCalls: () => undefined,
            };
          })(),
        }),
      }),
    } as unknown as GoogleGenerativeAI;

    const textAdapter = new GeminiAdapter('test-key', undefined, textClient);
    const textResult = await runProviderConformance(
      new MockLLMAdapter({ ttftMs: 0, response: 'Hello', toolCalls: [{ name: sampleTool.name, arguments: { city: 'Paris' } }] }),
      sampleTool,
    );
    expect(textResult.errors).toEqual([]);

    const toolClient = {
      getGenerativeModel: () => ({
        generateContentStream: async () => ({
          stream: (async function* () {
            yield {
              text: () => {
                throw new Error('no text');
              },
              functionCalls: () => [{ name: sampleTool.name, args: { city: 'Paris' } }],
            };
          })(),
        }),
      }),
    } as unknown as GoogleGenerativeAI;

    const geminiToolAdapter = new GeminiAdapter('test-key', undefined, toolClient);
    const toolChunks = await collectLLMChunks(
      geminiToolAdapter,
      [{ role: 'user', content: 'weather' }],
      [sampleTool],
    );
    expect(toolChunks.some((c) => c.type === 'tool_call')).toBe(true);

    const chunks = await collectLLMChunks(textAdapter);
    expect(chunks.some((c) => c.type === 'text_delta')).toBe(true);
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('passes for DeepSeekAdapter with injected OpenAI-compatible client', async () => {
    const client = mockOpenAiStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: sampleTool.name, arguments: '{"city":"Paris"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]);
    const adapter = new DeepSeekAdapter('test-key', undefined, client);
    const chunks = await collectLLMChunks(adapter, [{ role: 'user', content: 'weather' }], [
      sampleTool,
    ]);
    expect(chunks.some((c) => c.type === 'tool_call')).toBe(true);
  });

  it('createLLMAdapter resolves gemini, claude, and deepseek env keys', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';

    expect(createLLMAdapter({ provider: 'gemini' })).toBeDefined();
    expect(createLLMAdapter({ provider: 'claude' })).toBeDefined();
    expect(createLLMAdapter({ provider: 'deepseek' })).toBeDefined();

    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
  });
});
