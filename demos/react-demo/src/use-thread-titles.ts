import { truncateThreadTitle } from '@basebot/react';
import { useCallback, useMemo, useState } from 'react';

function readTitleMap(storageKey: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function useThreadTitles(userId: string) {
  const storageKey = `basebot:thread-titles:${userId}`;
  const [revision, setRevision] = useState(0);

  const getThreadTitle = useCallback(
    (threadId: string): string | undefined => {
      void revision;
      return readTitleMap(storageKey)[threadId];
    },
    [storageKey, revision],
  );

  const onThreadTitle = useCallback(
    (threadId: string, firstUserMessage: string) => {
      const map = readTitleMap(storageKey);
      if (map[threadId]?.trim()) {
        return;
      }
      map[threadId] = truncateThreadTitle(firstUserMessage);
      localStorage.setItem(storageKey, JSON.stringify(map));
      setRevision((v) => v + 1);
    },
    [storageKey],
  );

  return useMemo(
    () => ({ getThreadTitle, onThreadTitle }),
    [getThreadTitle, onThreadTitle],
  );
}
