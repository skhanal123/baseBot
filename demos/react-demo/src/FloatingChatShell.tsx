import { BaseBotChat } from '@basebot/react';
import { useState } from 'react';

export interface FloatingChatShellProps {
  userId: string;
  apiBaseUrl: string;
  getThreadTitle: (threadId: string) => string | undefined;
  onThreadTitle: (threadId: string, firstUserMessage: string) => void;
}

function ChatBubbleIcon() {
  return (
    <svg
      className="nm-chat-fab__icon"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5h-.75l-3.1 1.55a1 1 0 0 1-1.45-.9v-1.4A7.5 7.5 0 1 1 20 11.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="11.5" r="1" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1" fill="currentColor" />
      <circle cx="15" cy="11.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function FloatingChatShell({
  userId,
  apiBaseUrl,
  getThreadTitle,
  onThreadTitle,
}: FloatingChatShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <div className="nm-chat-panel" role="dialog" aria-label="Support chat">
          <div className="nm-chat-panel__header">
            <div>
              <span className="nm-chat-panel__title">Nano Mobility Support</span>
              <span className="nm-chat-panel__subtitle">AI assistant · account-scoped</span>
            </div>
            <button
              type="button"
              className="nm-chat-panel__minimize"
              aria-label="Minimize chat"
              onClick={() => {
                setOpen(false);
              }}
            >
              −
            </button>
          </div>
          <div className="nm-chat-panel__body">
            <BaseBotChat
              key={userId}
              userId={userId}
              apiBaseUrl={apiBaseUrl}
              active={open}
              fillHeight
              getThreadTitle={getThreadTitle}
              onThreadTitle={onThreadTitle}
            />
          </div>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          className="nm-chat-fab"
          aria-label="Open support chat"
          onClick={() => {
            setOpen(true);
          }}
        >
          <ChatBubbleIcon />
        </button>
      ) : null}
    </>
  );
}
