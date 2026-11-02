export const TURN_QUEUE_NAME = 'basebot-turns';

export interface TurnJobData {
  job_id: string;
  thread_id: string;
  user_id: string;
  message_id: string;
  correlation_id: string;
}
