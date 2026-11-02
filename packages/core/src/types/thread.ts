export type ThreadStatus = 'active' | 'archived';

export interface Thread {
  id: string;
  user_id: string;
  created_at: Date;
  last_message_at: Date;
  archived_at: Date | null;
  status: ThreadStatus;
}

export interface CreateThreadInput {
  user_id: string;
}

export interface ThreadSummary {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at: string;
  status: ThreadStatus;
}

export interface ListThreadsResponse {
  threads: ThreadSummary[];
}

/** Maximum non-archived threads per user (MVP). */
export const MAX_THREADS_PER_USER = 5;

export const USER_ID_MAX_LENGTH = 256;
