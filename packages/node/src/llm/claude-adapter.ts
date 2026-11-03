import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import type { ToolDefinition } from '@basebot/core';

import type { LLMAdapter, LLMChunk, LLMCompleteOptions, LLMMessage } from './types.js';

function toClaudeMessages(messages: LLMMessage[]): {
  system?: string;
  claudeMessages: MessageParam[];
} {
  const systemParts: string[] = [];
  const claudeMessages: MessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }

    if (message.role === 'tool') {
      claudeMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.tool_call_id ?? '',
            content: message.content,
          },
        ],
      });
      continue;
    }

    if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
      const content: Extract<MessageParam, { role: 'assistant' }>['content'] = [];
      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }
      for (const tc of message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      claudeMessages.push({ role: 'assistant', content });
      continue;
    }

    if (message.role === 'user' || message.role === 'assistant') {
      claudeMessages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  if (systemParts.length > 0) {
    return { system: systemParts.join('\n'), claudeMessages };
  }
  return { claudeMessages };
}

function toClaudeTools(tools: ToolDefinition[]): Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Tool['input_schema'],
  }));
}

export class ClaudeAdapter implements LLMAdapter {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514', client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey });
    this.model = model;
  }

  async *completeStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: LLMCompleteOptions,
  ): AsyncIterable<LLMChunk> {
    const { system, claudeMessages } = toClaudeMessages(messages);
    const claudeTools = toClaudeTools(tools);

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxOutputTokens,
      messages: claudeMessages,
      ...(system ? { system } : {}),
      ...(claudeTools.length > 0 ? { tools: claudeTools } : {}),
    });

    const pendingToolUses = new Map<number, { id: string; name: string; inputJson: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'tool_use') {
          pendingToolUses.set(event.index, {
            id: block.id,
            name: block.name,
            inputJson: '',
          });
        }
      }

      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield { type: 'text_delta', delta: delta.text };
        }
        if (delta.type === 'input_json_delta') {
          const entry = pendingToolUses.get(event.index);
          if (entry) {
            entry.inputJson += delta.partial_json;
          }
        }
      }

      if (event.type === 'message_delta') {
        const stopReason = event.delta.stop_reason;
        if (stopReason === 'tool_use') {
          for (const entry of pendingToolUses.values()) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(entry.inputJson || '{}') as Record<string, unknown>;
            } catch {
              args = {};
            }
            yield {
              type: 'tool_call',
              toolCall: { id: entry.id, name: entry.name, arguments: args },
            };
          }
          return;
        }
        if (stopReason === 'end_turn') {
          yield { type: 'done' };
          return;
        }
      }
    }

    yield { type: 'done' };
  }
}
