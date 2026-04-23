import { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import type { Program } from '../api/types';

export function usePrograms(enabled = true) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    apiFetch<Program[]>('/api/programs')
      .then(setPrograms)
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, [enabled]);

  return { programs, loading };
}
