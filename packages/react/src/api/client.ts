import type { BaseBotErrorBody, MessageRecord } from '@basebot/core';

import { parseSseBlock } from '../utils/stream.js';

export interface ThreadSummary {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at: string;
  status: 'active' | 'archived';
}

export interface SendMessageResult {
  job_id: string;
  message_id: string;
  stream_token: string;
  stream_expires_at: string;
}

export type StreamEventHandler = (event: {
  type: 'message.start' | 'message.delta' | 'message.end' | 'error';
  data: Record<string, unknown>;
}) => void;

export class BaseBotClient {
  constructor(private readonly apiBaseUrl: string) {}

  private url(path: string): string {
    return `${this.apiBaseUrl.replace(/\/$/, '')}${path}`;
  }

  async createThread(userId: string): Promise<string> {
    const res = await fetch(this.url('/v1/threads'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    if (!res.ok) {
      throw await this.parseError(res);
    }
    const body = (await res.json()) as { thread_id: string };
    return body.thread_id;
  }

  async listThreads(userId: string): Promise<ThreadSummary[]> {
    const res = await fetch(this.url(`/v1/threads?user_id=${encodeURIComponent(userId)}`));
    if (!res.ok) {
      throw await this.parseError(res);
    }
    const body = (await res.json()) as { threads: ThreadSummary[] };
    return body.threads;
  }

  async listMessages(
    threadId: string,
    userId: string,
    cursor?: string,
  ): Promise<{ messages: MessageRecord[]; next_cursor: string | null }> {
    const params = new URLSearchParams({ user_id: userId });
    if (cursor) {
      params.set('cursor', cursor);
    }
    const res = await fetch(
      this.url(`/v1/threads/${threadId}/messages?${params.toString()}`),
    );
    if (!res.ok) {
      throw await this.parseError(res);
    }
    return (await res.json()) as { messages: MessageRecord[]; next_cursor: string | null };
  }

  async sendMessage(
    threadId: string,
    userId: string,
    content: string,
  ): Promise<SendMessageResult> {
    const res = await fetch(this.url(`/v1/threads/${threadId}/messages`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, content }),
    });
    if (!res.ok) {
      throw await this.parseError(res);
    }
    return (await res.json()) as SendMessageResult;
  }

  streamJob(
    jobId: string,
    streamToken: string,
    onEvent: StreamEventHandler,
    onDone: () => void,
    onError: (err: Error) => void,
  ): () => void {
    const url = this.url(
      `/v1/stream/${jobId}?token=${encodeURIComponent(streamToken)}`,
    );
    const abort = new AbortController();
    const seenMessageIds = new Set<string>();
    const streamState = { finished: false };

    const complete = (err?: Error): void => {
      if (streamState.finished) {
        return;
      }
      streamState.finished = true;
      clearTimeout(timeoutId);
      abort.abort();
      if (err) {
        onError(err);
      } else {
        onDone();
      }
    };

    const timeoutId = setTimeout(() => {
      complete(new Error('Stream timed out'));
    }, 120_000);

    const dispatch = (eventType: string, data: Record<string, unknown>): void => {
      if (streamState.finished) {
        return;
      }

      switch (eventType) {
        case 'message.start': {
          const messageId = data.message_id;
          if (typeof messageId === 'string') {
            seenMessageIds.add(messageId);
          }
          onEvent({ type: 'message.start', data });
          break;
        }
        case 'message.delta':
          onEvent({ type: 'message.delta', data });
          break;
        case 'message.end': {
          const messageId = data.message_id;
          if (typeof messageId === 'string' && !seenMessageIds.has(messageId)) {
            onEvent({
              type: 'message.start',
              data: { message_id: messageId, thread_id: '' },
            });
          }
          onEvent({ type: 'message.end', data });
          complete();
          break;
        }
        case 'error':
          onEvent({ type: 'error', data });
          complete(new Error('Stream error'));
          break;
      }
    };

    void (async () => {
      try {
        const res = await fetch(url, { signal: abort.signal });
        if (!res.ok) {
          complete(await this.parseError(res));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          complete(new Error('Stream body unavailable'));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          let separator = buffer.indexOf('\n\n');
          while (separator !== -1) {
            const block = buffer.slice(0, separator);
            buffer = buffer.slice(separator + 2);
            separator = buffer.indexOf('\n\n');

            const parsed = parseSseBlock(block);
            if (!parsed) {
              continue;
            }

            dispatch(parsed.event, JSON.parse(parsed.data) as Record<string, unknown>);
          }
        }

        if (!streamState.finished) {
          complete();
        }
      } catch (err) {
        if (streamState.finished) {
          return;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        complete(err instanceof Error ? err : new Error('Stream failed'));
      }
    })();

    return () => {
      if (!streamState.finished) {
        streamState.finished = true;
        clearTimeout(timeoutId);
        abort.abort();
      }
    };
  }

  private async parseError(res: Response): Promise<Error> {
    try {
      const body = (await res.json()) as BaseBotErrorBody;
      return new Error(`${body.code}: ${body.message}`);
    } catch {
      return new Error(`HTTP ${String(res.status)}`);
    }
  }
}
