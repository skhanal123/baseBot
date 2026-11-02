export type MessageRole = 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  thread_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface MessageRecord {
  id: string;
  thread_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface SendMessageInput {
  user_id: string;
  content: string;
}

export interface ListMessagesResponse {
  messages: MessageRecord[];
  next_cursor: string | null;
}

export const DEFAULT_MESSAGE_PAGE_SIZE = 50;

/** Default max user message content size in bytes (32KB). */
export const DEFAULT_MAX_MESSAGE_CONTENT_BYTES = 32768;
