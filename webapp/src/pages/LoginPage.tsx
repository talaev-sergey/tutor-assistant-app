interface LoginPageProps {
  botUsername: string;
  error: string | null;
  loading: boolean;
}

export default function LoginPage({ botUsername, error, loading }: LoginPageProps) {
  const botLink = botUsername ? `https://t.me/${botUsername}` : '#';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 24,
      background: '#0f0f13', color: '#fff', padding: 24,
    }}>
      <div style={{ fontSize: 48 }}>🖥</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>Класс-Контроль</div>

      {loading ? (
        <div style={{ color: '#888', fontSize: 14 }}>Вход…</div>
      ) : (
        <>
          <div style={{ fontSize: 15, color: '#bbb', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
            Для входа напишите боту <strong style={{ color: '#fff' }}>@{botUsername || 'боту'}</strong> команду{' '}
            <code style={{ background: '#1e1e2e', padding: '2px 6px', borderRadius: 4 }}>/start</code>
            {' '}и нажмите кнопку из ответа.
          </div>

          {botUsername && (
            <a
              href={botLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block', padding: '12px 28px',
                background: '#2481cc', color: '#fff', borderRadius: 10,
                textDecoration: 'none', fontSize: 15, fontWeight: 600,
              }}
            >
              Открыть бота
            </a>
          )}
        </>
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
