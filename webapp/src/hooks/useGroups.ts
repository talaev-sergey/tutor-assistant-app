import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/client';
import type { Group } from '../api/types';

export function useGroups(enabled: boolean) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchGroups = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await apiFetch<Group[]>('/api/groups');
      setGroups(data);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  return { groups, loading, refresh: fetchGroups };
}
