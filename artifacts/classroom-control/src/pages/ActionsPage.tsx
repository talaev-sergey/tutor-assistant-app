import { ONLINE_PCS } from '../data/constants';
import { ChevronLeft, Monitor, Zap, FolderOpen, ShieldCheck, ShieldAlert, RotateCw, Power } from 'lucide-react';

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

function TargetIcon({ target }: { target: Target }) {
  if (target === 'all' || Array.isArray(target)) return <Zap size={28} fill="currentColor" />;
  return <Monitor size={28} />;
}

export default function ActionsPage({ target, onBack, onAction }: ActionsPageProps) {
  const label = getTargetLabel(target);
  const meta = getTargetMeta(target);

  return (
    <div className="page-wrapper slide-in">
      <div className="header">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft size={24} />
        </button>
        <div className="header-info">
          <div className="header-title">Действия</div>
          <div className="header-sub">
            <span>{Array.isArray(target) ? `Выбрано: ${target.length}` : label}</span>
          </div>
        </div>
      </div>

      <div className="target-card fade-up-1">
        <div className="target-icon-wrap">
          <TargetIcon target={target} />
        </div>
        <div>
          <div className="target-name">{label}</div>
          <div className={`target-meta${meta.isAll ? ' all' : ''}`}>{meta.text}</div>
        </div>
      </div>

      <div className="actions-grid">
        <div className="action-row fade-up-4">
          <button className="action-btn launch full-width" onClick={() => onAction('launch')}>
            <div className="action-icon"><FolderOpen size={24} /></div>
            <div className="action-text">
              <div className="action-title">Запустить программу</div>
              <div className="action-sub">Открыть приложение на ПК</div>
            </div>
          </button>
        </div>

        <div className="action-row cols-2 fade-up-5">
          <button className="action-btn protect-on" onClick={() => onAction('protect-on')}>
            <div className="action-icon"><ShieldCheck size={24} /></div>
            <div className="action-text">
              <div className="action-title">Вкл. защиту</div>
              <div className="action-sub">Блокировка</div>
            </div>
          </button>
          <button className="action-btn protect-off" onClick={() => onAction('protect-off')}>
            <div className="action-icon"><ShieldAlert size={24} /></div>
            <div className="action-text">
              <div className="action-title">Выкл. защиту</div>
              <div className="action-sub">Снять блок</div>
            </div>
          </button>
        </div>

        <div className="action-row cols-2 fade-up-6">
          <button className="action-btn reboot" onClick={() => onAction('reboot')}>
            <div className="action-icon"><RotateCw size={24} /></div>
            <div className="action-text">
              <div className="action-title">Перезагрузить</div>
              <div className="action-sub">Restart</div>
            </div>
          </button>
          <button className="action-btn shutdown" onClick={() => onAction('shutdown')}>
            <div className="action-icon"><Power size={24} /></div>
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
