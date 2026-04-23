import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

interface LoginPageProps {
  botUsername: string;
  onAuth: (data: Record<string, string | number>) => void;
  error: string | null;
  loading: boolean;
}

export default function LoginPage({ botUsername, onAuth, error, loading }: LoginPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.onTelegramAuth = onAuth;

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(script);
    }

    return () => { delete window.onTelegramAuth; };
  }, [botUsername, onAuth]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 24,
      background: '#0f0f13', color: '#fff', padding: 24,
    }}>
      <div style={{ fontSize: 48 }}>🖥</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>Класс-Контроль</div>
      <div style={{ fontSize: 14, color: '#888', textAlign: 'center', maxWidth: 280 }}>
        Войдите через Telegram для доступа к управлению классом
      </div>

      {loading ? (
        <div style={{ color: '#888', fontSize: 14 }}>Вход…</div>
      ) : (
        <div ref={containerRef} />
      )}

      {error && (
        <div style={{
          color: '#f87171', fontSize: 13, textAlign: 'center',
          background: 'rgba(248,113,113,0.1)', padding: '10px 16px',
          borderRadius: 8, maxWidth: 300,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
