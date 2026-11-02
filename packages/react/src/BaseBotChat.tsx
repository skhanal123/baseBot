import { ErrorCode, type BaseBotErrorBody } from '@basebot/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BaseBotClient } from './api/client.js';
import { streamField, toStreamError } from './utils/stream.js';

export interface BaseBotChatProps {
  userId: string;
  apiBaseUrl: string;
  threadId?: string;
  transport?: 'sse' | 'websocket';
  onThreadCreated?: (threadId: string) => void;
  onError?: (error: BaseBotErrorBody) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    maxHeight: '600px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontFamily: 'system-ui, sans-serif',
    background: '#fff',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  threadSelect: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
  },
  messages: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  bubble: (role: 'user' | 'assistant') => ({
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: '12px',
    background: role === 'user' ? '#3b82f6' : '#f1f5f9',
    color: role === 'user' ? '#fff' : '#1e293b',
    whiteSpace: 'pre-wrap' as const,
  }),
  inputRow: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #e2e8f0',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
  },
  button: {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  newThreadBtn: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  },
};

export function BaseBotChat({
  userId,
  apiBaseUrl,
  threadId: initialThreadId,
  transport = 'sse',
  onThreadCreated,
  onError,
}: BaseBotChatProps) {
  const client = useMemo(() => new BaseBotClient(apiBaseUrl), [apiBaseUrl]);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null);
  const [threads, setThreads] = useState<Array<{ id: string; label: string }>>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const onThreadCreatedRef = useRef(onThreadCreated);
  const onErrorRef = useRef(onError);
  onThreadCreatedRef.current = onThreadCreated;
  onErrorRef.current = onError;

  const finalizeStream = useCallback(() => {
    setLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
    streamCleanupRef.current = null;
  }, []);

  const abortStream = useCallback(() => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    finalizeStream();
  }, [finalizeStream]);

  const sessionThreadKey = `basebot:active-thread:${userId}`;

  const loadThreads = useCallback(async () => {
    const list = await client.listThreads(userId);
    setThreads(
      list.map((t) => ({
        id: t.id,
        label: `Thread ${t.id.slice(0, 8)}…`,
      })),
    );
  }, [client, userId]);

  const loadMessages = useCallback(
    async (tid: string) => {
      const page = await client.listMessages(tid, userId);
      setMessages(
        page.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .reverse()
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
      );
    },
    [client, userId],
  );

  useEffect(() => {
    const guard = { cancelled: false };
    const isCancelled = (): boolean => guard.cancelled;

    async function init() {
      try {
        const list = await client.listThreads(userId);
        if (isCancelled()) {
          return;
        }

        setThreads(
          list.map((t) => ({
            id: t.id,
            label: `Thread ${t.id.slice(0, 8)}…`,
          })),
        );

        let tid = initialThreadId ?? null;

        if (!tid) {
          const saved = sessionStorage.getItem(sessionThreadKey);
          if (saved && list.some((t) => t.id === saved)) {
            tid = saved;
          } else if (list.length > 0) {
            tid = list[0]?.id ?? null;
          } else {
            tid = await client.createThread(userId);
            if (isCancelled()) {
              return;
            }
            onThreadCreatedRef.current?.(tid);
            const updated = await client.listThreads(userId);
            if (isCancelled()) {
              return;
            }
            setThreads(
              updated.map((t) => ({
                id: t.id,
                label: `Thread ${t.id.slice(0, 8)}…`,
              })),
            );
          }
        }

        if (!tid) {
          throw new Error('Failed to resolve thread');
        }

        sessionStorage.setItem(sessionThreadKey, tid);
        setThreadId(tid);
        await loadMessages(tid);
      } catch (err) {
        if (!isCancelled()) {
          const msg = err instanceof Error ? err.message : 'Init failed';
          setInitError(msg);
          onErrorRef.current?.({ code: ErrorCode.INTERNAL_ERROR, message: msg });
        }
      }
    }

    void init();
    return () => {
      guard.cancelled = true;
    };
  }, [userId, client, initialThreadId, sessionThreadKey, loadMessages]);

  useEffect(() => {
    return () => {
      abortStream();
    };
  }, [abortStream]);

  const handleSend = async () => {
    if (!input.trim() || !threadId) {
      return;
    }

    const content = input.trim();
    const activeThreadId = threadId;
    setInput('');
    abortStream();
    setLoading(true);

    const userMsgId = `local_${String(Date.now())}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content }]);

    try {
      const result = await client.sendMessage(activeThreadId, userId, content);

      if (transport !== 'sse') {
        setLoading(false);
        onError?.({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'WebSocket transport not yet supported',
        });
        return;
      }

      let assistantId = '';
      let assistantContent = '';
      let streamSettled = false;

      const cleanup = client.streamJob(
        result.job_id,
        result.stream_token,
        (event) => {
          switch (event.type) {
            case 'message.start':
              assistantId = streamField(event.data, 'message_id');
              setMessages((prev) => {
                if (prev.some((m) => m.id === assistantId)) {
                  return prev;
                }
                return [
                  ...prev,
                  { id: assistantId, role: 'assistant', content: '', streaming: true },
                ];
              });
              break;
            case 'message.delta': {
              if (streamSettled) {
                break;
              }
              const delta = streamField(event.data, 'delta');
              assistantContent += delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantContent } : m,
                ),
              );
              break;
            }
            case 'message.end': {
              streamSettled = true;
              const finalContent = streamField(event.data, 'content') || assistantContent;
              assistantContent = finalContent;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: finalContent, streaming: false }
                    : m,
                ),
              );
              break;
            }
            case 'error':
              onErrorRef.current?.(toStreamError(event.data));
              break;
          }
        },
        finalizeStream,
        finalizeStream,
      );

      streamCleanupRef.current = cleanup;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      onErrorRef.current?.({ code: ErrorCode.INTERNAL_ERROR, message: msg });
      setLoading(false);
    }
  };

  const handleNewThread = async () => {
    try {
      abortStream();
      const tid = await client.createThread(userId);
      sessionStorage.setItem(sessionThreadKey, tid);
      setThreadId(tid);
      onThreadCreatedRef.current?.(tid);
      await loadThreads();
      await loadMessages(tid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create thread';
      onErrorRef.current?.({ code: ErrorCode.INTERNAL_ERROR, message: msg });
    }
  };

  const handleThreadChange = async (tid: string) => {
    abortStream();
    sessionStorage.setItem(sessionThreadKey, tid);
    setThreadId(tid);
    await loadMessages(tid);
  };

  if (initError) {
    return <div style={{ padding: 16, color: '#dc2626' }}>{initError}</div>;
  }

  return (
    <div style={styles.container} data-testid="basebot-chat">
      <div style={styles.header}>
        <select
          style={styles.threadSelect}
          value={threadId ?? ''}
          onChange={(e) => void handleThreadChange(e.target.value)}
        >
          {threads.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="button" style={styles.newThreadBtn} onClick={() => void handleNewThread()}>
          New thread
        </button>
      </div>

      <div style={styles.messages}>
        {messages.map((m) => (
          <div key={m.id} style={styles.bubble(m.role)}>
            {m.content}
            {m.streaming ? ' ▍' : ''}
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div style={{ color: '#64748b', fontSize: 13 }}>Thinking…</div>
        )}
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type a message…"
          disabled={!threadId}
        />
        <button
          type="button"
          style={styles.button}
          onClick={() => void handleSend()}
          disabled={!threadId || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
