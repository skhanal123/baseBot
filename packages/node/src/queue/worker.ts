import {
  BaseBotError,
  ErrorCode,
  type Message,
  type StreamEvent,
} from '@basebot/core';
import { Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

import type { LLMMessage } from '../llm/types.js';
import type { BaseBotRuntime } from '../runtime.js';
import { newMessageId } from '../utils/ids.js';
import { bullmqConnection } from './connection.js';
import { TURN_QUEUE_NAME, type TurnJobData } from './types.js';

function metadataString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function messagesToLLM(messages: Message[]): LLMMessage[] {
  const llm: LLMMessage[] = [];

  for (const m of messages) {
    if (m.role === 'tool') {
      const toolCallId = metadataString(m.metadata.tool_call_id) ?? '';
      const toolName = metadataString(m.metadata.tool_name) ?? '';
      const assistantContent = metadataString(m.metadata.assistant_content) ?? '';
      const args = metadataRecord(m.metadata.tool_call_arguments) ?? {};

      llm.push({
        role: 'assistant',
        content: assistantContent,
        tool_calls: [{ id: toolCallId, name: toolName, arguments: args }],
      });
      llm.push({
        role: 'tool',
        content: m.content,
        tool_call_id: toolCallId,
        name: toolName,
      });
      continue;
    }

    switch (m.role) {
      case 'user':
      case 'assistant':
        llm.push({ role: m.role, content: m.content });
        break;
      default:
        break;
    }
  }

  return llm;
}

export interface WorkerHandle {
  close: () => Promise<void>;
}

export function startWorker(
  runtime: BaseBotRuntime,
  connection: Redis,
): WorkerHandle {
  const worker = new Worker<TurnJobData>(
    TURN_QUEUE_NAME,
    async (job: Job<TurnJobData>) => {
      await processTurn(runtime, job.data);
    },
    {
      connection: bullmqConnection(connection),
      concurrency: runtime.config.queue.concurrency,
    },
  );

  worker.on('failed', (job, err) => {
    if (!job) {
      return;
    }
    const data = job.data;
    void runtime.streamEmitter.publish(data.job_id, {
      event: 'error',
      data: {
        code: ErrorCode.INTERNAL_ERROR,
        correlation_id: data.correlation_id,
        message: err.message,
      },
    } satisfies StreamEvent);
  });

  return {
    close: async () => {
      await worker.close();
    },
  };
}

async function processTurn(runtime: BaseBotRuntime, data: TurnJobData): Promise<void> {
  const { job_id, thread_id, user_id, correlation_id } = data;

  const thread = await runtime.store.getThread(thread_id);
  if (!thread || thread.user_id !== user_id) {
    await runtime.streamEmitter.publish(job_id, {
      event: 'error',
      data: {
        code: ErrorCode.THREAD_ACCESS_DENIED,
        correlation_id,
        message: 'Thread access denied at worker',
      },
    });
    return;
  }

  const contextMessages = await runtime.contextManager.loadContext(thread_id);
  const llmMessages = messagesToLLM(contextMessages);
  const llm = runtime.getLLMAdapter();
  const tools = runtime.toolRunner.getDefinitions();

  const assistantMessageId = newMessageId();

  await runtime.streamEmitter.publish(job_id, {
    event: 'message.start',
    data: { message_id: assistantMessageId, thread_id },
  });

  const streamHook = await runtime.hookPipeline.run('before_assistant_stream', {
    user_id,
    thread_id,
    message_id: assistantMessageId,
    correlation_id,
  }, null);

  if (!streamHook.allowed) {
    await runtime.streamEmitter.publish(job_id, {
      event: 'error',
      data: {
        code: ErrorCode.HOOK_REJECTED,
        correlation_id,
        message: streamHook.reason ?? 'Assistant stream rejected by hook',
      },
    });
    return;
  }

  let assembled = '';
  const maxToolLoops = 5;

  for (let loop = 0; loop < maxToolLoops; loop++) {
    let toolCall: { id: string; name: string; arguments: Record<string, unknown> } | null =
      null;
    let loopText = '';

    for await (const chunk of llm.completeStream(llmMessages, tools, {
      maxOutputTokens: runtime.config.llm.maxOutputTokens,
    })) {
      if (chunk.type === 'text_delta') {
        loopText += chunk.delta;
        assembled += chunk.delta;
        await runtime.streamEmitter.publish(job_id, {
          event: 'message.delta',
          data: { message_id: assistantMessageId, delta: chunk.delta },
        });
      } else if (chunk.type === 'tool_call') {
        toolCall = chunk.toolCall;
        break;
      } else {
        break;
      }
    }

    if (!toolCall) {
      break;
    }

    const toolHook = await runtime.hookPipeline.run('before_tool_call', {
      user_id,
      thread_id,
      message_id: assistantMessageId,
      correlation_id,
      tool_name: toolCall.name,
      arguments: toolCall.arguments,
    }, null);

    if (!toolHook.allowed) {
      await runtime.streamEmitter.publish(job_id, {
        event: 'error',
        data: {
          code: ErrorCode.HOOK_REJECTED,
          correlation_id,
          message: toolHook.reason ?? 'Tool call rejected by hook',
        },
      });
      return;
    }

    let toolResult: string;
    try {
      toolResult = await runtime.toolRunner.invoke(
        toolCall.name,
        toolCall.arguments,
        {
          user_id,
          thread_id,
          message_id: assistantMessageId,
          correlation_id,
        },
        correlation_id,
      );
    } catch (err) {
      const message = err instanceof BaseBotError ? err.message : 'Tool execution failed';
      await runtime.streamEmitter.publish(job_id, {
        event: 'error',
        data: {
          code: ErrorCode.INTERNAL_ERROR,
          correlation_id,
          message,
        },
      });
      return;
    }

    const toolMessage: Message = {
      id: randomUUID(),
      thread_id,
      user_id,
      role: 'tool',
      content: toolResult,
      timestamp: new Date(),
      metadata: {
        tool_call_id: toolCall.id,
        tool_name: toolCall.name,
        assistant_content: loopText,
        tool_call_arguments: toolCall.arguments,
      },
    };

    await runtime.store.insertMessage(toolMessage);
    await runtime.cache.appendMessage(thread_id, toolMessage);

    llmMessages.push({
      role: 'assistant',
      content: loopText,
      tool_calls: [toolCall],
    });
    llmMessages.push({
      role: 'tool',
      content: toolResult,
      tool_call_id: toolCall.id,
      name: toolCall.name,
    });
  }

  const completeHook = await runtime.hookPipeline.run('after_assistant_complete', {
    user_id,
    thread_id,
    message_id: assistantMessageId,
    correlation_id,
    content: assembled,
  });

  if (!completeHook.allowed) {
    await runtime.streamEmitter.publish(job_id, {
      event: 'error',
      data: {
        code: ErrorCode.HOOK_REJECTED,
        correlation_id,
        message: completeHook.reason ?? 'Assistant response rejected by hook',
      },
    });
    return;
  }

  const finalContent = completeHook.content;

  const assistantMessage: Message = {
    id: assistantMessageId,
    thread_id,
    user_id,
    role: 'assistant',
    content: finalContent,
    timestamp: new Date(),
    metadata: {},
  };

  await runtime.store.insertMessage(assistantMessage);
  await runtime.cache.appendMessage(thread_id, assistantMessage);

  await runtime.streamEmitter.publish(job_id, {
    event: 'message.end',
    data: { message_id: assistantMessageId, content: finalContent },
  });
}
