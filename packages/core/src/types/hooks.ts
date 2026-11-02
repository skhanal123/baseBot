export type HookPoint =
  | 'before_user_message'
  | 'before_tool_call'
  | 'before_assistant_stream'
  | 'after_assistant_complete';

export interface HookResult {
  allowed: boolean;
  content: string;
  reason?: string;
}

export interface BeforeUserMessagePayload {
  user_id: string;
  thread_id: string;
  content: string;
  correlation_id: string;
}

export interface BeforeToolCallPayload {
  user_id: string;
  thread_id: string;
  message_id: string;
  correlation_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface BeforeAssistantStreamPayload {
  user_id: string;
  thread_id: string;
  message_id: string;
  correlation_id: string;
}

export interface AfterAssistantCompletePayload {
  user_id: string;
  thread_id: string;
  message_id: string;
  correlation_id: string;
  content: string;
}

export type HookPayloadMap = {
  before_user_message: BeforeUserMessagePayload;
  before_tool_call: BeforeToolCallPayload;
  before_assistant_stream: BeforeAssistantStreamPayload;
  after_assistant_complete: AfterAssistantCompletePayload;
};

export type HookHandler<P extends HookPoint> = (
  payload: HookPayloadMap[P],
) => HookResult | Promise<HookResult>;

export interface HookRegistry {
  before_user_message?: HookHandler<'before_user_message'>;
  before_tool_call?: HookHandler<'before_tool_call'>;
  before_assistant_stream?: HookHandler<'before_assistant_stream'>;
  after_assistant_complete?: HookHandler<'after_assistant_complete'>;
}

/** Pass-through hook result used as default for all hook points. */
export const PASS_THROUGH_HOOK_RESULT = (content: string): HookResult => ({
  allowed: true,
  content,
});
