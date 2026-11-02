export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  thread_id: string;
  user_id: string;
  message_id: string;
  status: JobStatus;
  correlation_id: string;
}

export type StreamEventType = 'message.start' | 'message.delta' | 'message.end' | 'error';

export interface StreamMessageStartEvent {
  message_id: string;
  thread_id: string;
}

export interface StreamMessageDeltaEvent {
  message_id: string;
  delta: string;
}

export interface StreamMessageEndEvent {
  message_id: string;
  content: string;
}

export interface StreamErrorEvent {
  code: string;
  correlation_id: string;
  message: string;
}

export type StreamEvent =
  | { event: 'message.start'; data: StreamMessageStartEvent }
  | { event: 'message.delta'; data: StreamMessageDeltaEvent }
  | { event: 'message.end'; data: StreamMessageEndEvent }
  | { event: 'error'; data: StreamErrorEvent };

/** Default stream token lifetime in seconds (15 min). */
export const DEFAULT_STREAM_TOKEN_TTL_SECONDS = 900;

/** Client reconnect window in seconds. */
export const STREAM_RECONNECT_WINDOW_SECONDS = 30;
