import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/generative-ai';
import type { ToolDefinition } from '@basebot/core';

import type { LLMAdapter, LLMChunk, LLMCompleteOptions, LLMMessage } from './types.js';

function toGeminiContents(messages: LLMMessage[]): { systemInstruction?: string; contents: Content[] } {
  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }

    if (message.role === 'tool') {
      const name = message.name ?? 'tool';
      let response: Record<string, unknown>;
      try {
        response = JSON.parse(message.content) as Record<string, unknown>;
      } catch {
        response = { result: message.content };
      }
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name,
              response,
            },
          },
        ],
      });
      continue;
    }

    if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
      const parts: Part[] = [];
      if (message.content) {
        parts.push({ text: message.content });
      }
      for (const tc of message.tool_calls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments,
          },
        });
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.content }] });
      continue;
    }

    if (message.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: message.content }] });
    }
  }

  if (systemParts.length > 0) {
    return { systemInstruction: systemParts.join('\n'), contents };
  }
  return { contents };
}

function toFunctionDeclarations(tools: ToolDefinition[]): FunctionDeclaration[] {
  return tools.map((t) => {
    const decl: FunctionDeclaration = {
      name: t.name,
      description: t.description,
    };
    if (t.parameters) {
      decl.parameters = t.parameters as unknown as NonNullable<FunctionDeclaration['parameters']>;
    }
    return decl;
  });
}

export class GeminiAdapter implements LLMAdapter {
  private readonly client: GoogleGenerativeAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gemini-2.0-flash', client?: GoogleGenerativeAI) {
    this.client = client ?? new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async *completeStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: LLMCompleteOptions,
  ): AsyncIterable<LLMChunk> {
    const { systemInstruction, contents } = toGeminiContents(messages);
    const functionDeclarations = toFunctionDeclarations(tools);

    const model = this.client.getGenerativeModel({
      model: this.model,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(functionDeclarations.length > 0
        ? { tools: [{ functionDeclarations }] }
        : {}),
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens,
      },
    });

    const result = await model.generateContentStream({ contents });
    const emittedToolCalls = new Set<string>();

    for await (const chunk of result.stream) {
      let text = '';
      try {
        text = chunk.text();
      } catch {
        text = '';
      }
      if (text) {
        yield { type: 'text_delta', delta: text };
      }

      const functionCalls = chunk.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          const callKey = `${call.name}:${JSON.stringify(call.args ?? {})}`;
          if (emittedToolCalls.has(callKey)) {
            continue;
          }
          emittedToolCalls.add(callKey);
          yield {
            type: 'tool_call',
            toolCall: {
              id: `call_${call.name}_${String(emittedToolCalls.size)}`,
              name: call.name,
              arguments: (call.args ?? {}) as Record<string, unknown>,
            },
          };
        }
        return;
      }
    }

    yield { type: 'done' };
  }
}
