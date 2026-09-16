'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseServerActionOptions {
  enabled?: boolean;
}

export function useServerAction<T>(
  fn: () => Promise<{ success: boolean; data?: T; error?: string }>,
  options: UseServerActionOptions = {},
) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const execute = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await fn();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'An error occurred');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [fn]);

  useEffect(() => {
    if (options.enabled !== false) {
       
      execute();
    }
  }, [execute, options.enabled]);

  return { data, isLoading, error, refetch: execute };
}
