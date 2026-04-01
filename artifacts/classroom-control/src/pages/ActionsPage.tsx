import { ONLINE_PCS } from '../data/constants';

type Target = number | number[] | 'all';

interface ActionsPageProps {
  target: Target;
  onBack: () => void;
  onAction: (action: string) => void;
}

function getTargetLabel(target: Target): string {
  if (target === 'all') return 'Все онлайн-ПК';
  if (Array.isArray(target)) return 'ПК ' + target.join(', ');
  return 'ПК ' + target;
}

function getTargetMeta(target: Target): { text: string; isAll: boolean } {
  if (target === 'all') return { text: ONLINE_PCS.length + ' компьютеров', isAll: true };
  if (Array.isArray(target)) return { text: target.length + ' компьютеров', isAll: true };
  return { text: 'онлайн', isAll: false };
}

function getTargetIcon(target: Target): string {
  if (target === 'all' || Array.isArray(target)) return '⚡';
  return '🖥';
}

export default function ActionsPage({ target, onBack, onAction }: ActionsPageProps) {
  const label = getTargetLabel(target);
  const meta = getTargetMeta(target);
  const icon = getTargetIcon(target);

  return (
    <div className="page-wrapper slide-in">
      <div className="header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="header-info">
          <div className="header-title">Действия</div>
          <div className="header-sub">
            <span>{Array.isArray(target) ? `Выбрано: ${target.length}` : label}</span>
          </div>
        </div>
      </div>

      <div className="target-card fade-up-1">
        <div className="target-icon-wrap">{icon}</div>
        <div>
          <div className="target-name">{label}</div>
          <div className={`target-meta${meta.isAll ? ' all' : ''}`}>{meta.text}</div>
        </div>
      </div>

      <div className="actions-grid">
        <div className="action-row fade-up-4">
          <button className="action-btn launch" onClick={() => onAction('launch')}>
            <span className="action-icon">📂</span>
            <div className="action-text">
              <div className="action-title">Запустить программу</div>
              <div className="action-sub">Открыть приложение на ПК</div>
            </div>
          </button>
        </div>

        <div className="action-row cols-2 fade-up-5">
          <button className="action-btn protect-on" onClick={() => onAction('protect-on')}>
            <span className="action-icon">🛡</span>
            <div className="action-text">
              <div className="action-title">Вкл. защиту</div>
              <div className="action-sub">Включить</div>
            </div>
          </button>
          <button className="action-btn protect-off" onClick={() => onAction('protect-off')}>
            <span className="action-icon">🔓</span>
            <div className="action-text">
              <div className="action-title">Выкл. защиту</div>
              <div className="action-sub">Отключить</div>
            </div>
          </button>
        </div>

        <div className="action-row cols-2 fade-up-6">
          <button className="action-btn reboot" onClick={() => onAction('reboot')}>
            <span className="action-icon">🔄</span>
            <div className="action-text">
              <div className="action-title">Перезагрузить</div>
              <div className="action-sub">Restart</div>
            </div>
          </button>
          <button className="action-btn shutdown" onClick={() => onAction('shutdown')}>
            <span className="action-icon">⏻</span>
            <div className="action-text">
              <div className="action-title">Выключить</div>
              <div className="action-sub">Shutdown</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
