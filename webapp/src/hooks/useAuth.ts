import { useState, useCallback } from 'react';
import { apiFetch } from '../api/client';

export interface AuthUser {
  telegram_id: number;
  full_name: string;
  is_admin: boolean;
}

const TOKEN_KEY = 'classroom_jwt';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginWithTelegram = useCallback(async (tgData: Record<string, string | number>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? 'Auth failed');
      }
      const data = await res.json();
      storeToken(data.token);
      setUser({ telegram_id: data.telegram_id, full_name: data.full_name, is_admin: data.is_admin });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const restoreSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return false;
    try {
      const data = await apiFetch<AuthUser>('/api/auth/me');
      setUser(data);
      return true;
    } catch {
      clearToken();
      return false;
    }
  }, []);

  return { user, loading, error, loginWithTelegram, logout, restoreSession };
}
