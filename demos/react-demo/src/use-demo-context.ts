import { useEffect, useState } from 'react';

export interface DemoContext {
  user_id: string;
  customer_id: string | null;
  display_name: string | null;
  account_status: string | null;
  line_count: number;
  primary_plan_name: string | null;
}

export function useDemoContext(apiBaseUrl: string, userId: string) {
  const [context, setContext] = useState<DemoContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const guard = { cancelled: false };

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = `${apiBaseUrl.replace(/\/$/, '')}/demo/context?user_id=${encodeURIComponent(userId)}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Demo context failed (${String(res.status)})`);
        }
        const body = (await res.json()) as DemoContext;
        if (!guard.cancelled) {
          setContext(body);
        }
      } catch (err) {
        if (!guard.cancelled) {
          setContext(null);
          setError(err instanceof Error ? err.message : 'Failed to load demo context');
        }
      } finally {
        if (!guard.cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      guard.cancelled = true;
    };
  }, [apiBaseUrl, userId]);

  return { context, error, loading };
}
