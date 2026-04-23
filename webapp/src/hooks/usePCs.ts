import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, ApiError } from '../api/client';
import type { PC } from '../api/types';

export function usePCs(pollInterval = 5000) {
  const [pcs, setPCs] = useState<PC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchPCs = useCallback(async () => {
    try {
      const data = await apiFetch<PC[]>('/api/pcs');
      if (mountedRef.current) {
        setPCs(data);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current) {
        const msg = e instanceof ApiError
          ? e.status === 401 || e.status === 403
            ? 'Откройте приложение через Telegram'
            : e.message
          : 'Нет соединения с сервером';
        setError(msg);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchPCs();
    const id = setInterval(fetchPCs, pollInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchPCs, pollInterval]);

  return { pcs, loading, error, refresh: fetchPCs };
}
