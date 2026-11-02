import { z } from 'zod';

import { ErrorCode } from '../errors.js';
import {
  DEFAULT_MAX_MESSAGE_CONTENT_BYTES,
  DEFAULT_MESSAGE_PAGE_SIZE,
} from '../types/message.js';
import { USER_ID_MAX_LENGTH } from '../types/thread.js';

export const UserIdSchema = z
  .string()
  .min(1, 'user_id is required')
  .max(USER_ID_MAX_LENGTH, `user_id must be at most ${String(USER_ID_MAX_LENGTH)} characters`);

export const CreateThreadRequestSchema = z.object({
  user_id: UserIdSchema,
});

export const CreateThreadResponseSchema = z.object({
  thread_id: z.string().uuid(),
});

export const ListThreadsQuerySchema = z.object({
  user_id: UserIdSchema,
});

export const ThreadSummarySchema = z.object({
  id: z.string().uuid(),
  user_id: UserIdSchema,
  created_at: z.string().datetime(),
  last_message_at: z.string().datetime(),
  status: z.enum(['active', 'archived']),
});

export const ListThreadsResponseSchema = z.object({
  threads: z.array(ThreadSummarySchema),
});

export const SendMessageRequestSchema = z.object({
  user_id: UserIdSchema,
  content: z
    .string()
    .min(1, 'content is required')
    .refine(
      (val) => Buffer.byteLength(val, 'utf8') <= DEFAULT_MAX_MESSAGE_CONTENT_BYTES,
      `content must be at most ${String(DEFAULT_MAX_MESSAGE_CONTENT_BYTES)} bytes`,
    ),
});

export const SendMessageResponseSchema = z.object({
  job_id: z.string(),
  message_id: z.string().uuid(),
  stream_token: z.string(),
  stream_expires_at: z.string().datetime(),
});

export const MessageRecordSchema = z.object({
  id: z.string().uuid(),
  thread_id: z.string().uuid(),
  user_id: UserIdSchema,
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()),
});

export const ListMessagesQuerySchema = z.object({
  user_id: UserIdSchema,
  cursor: z.string().optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(DEFAULT_MESSAGE_PAGE_SIZE),
});

export const ListMessagesResponseSchema = z.object({
  messages: z.array(MessageRecordSchema),
  next_cursor: z.string().nullable(),
});

export const ErrorResponseSchema = z.object({
  code: z.enum([
    ErrorCode.STREAM_TOKEN_INVALID,
    ErrorCode.STREAM_TOKEN_EXPIRED,
    ErrorCode.THREAD_ACCESS_DENIED,
    ErrorCode.THREAD_LIMIT_EXCEEDED,
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.HOOK_REJECTED,
    ErrorCode.INTERNAL_ERROR,
  ]),
  message: z.string(),
  correlation_id: z.string().optional(),
});

export const StreamMessageStartSchema = z.object({
  message_id: z.string(),
  thread_id: z.string().uuid(),
});

export const StreamMessageDeltaSchema = z.object({
  message_id: z.string(),
  delta: z.string(),
});

export const StreamMessageEndSchema = z.object({
  message_id: z.string(),
  content: z.string(),
});

export const StreamErrorSchema = z.object({
  code: z.string(),
  correlation_id: z.string(),
  message: z.string(),
});

export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;
export type CreateThreadResponse = z.infer<typeof CreateThreadResponseSchema>;
export type ListThreadsQuery = z.infer<typeof ListThreadsQuerySchema>;
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;