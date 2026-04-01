import { ONLINE_PCS } from '../data/constants';
import { ChevronLeft, Monitor, Zap, FolderOpen, ShieldCheck, Lock, RotateCw, Power } from 'lucide-react';

type Target = number | number[] | 'all';

interface ActionsPageProps {
  target: Target;
  protectedPCs: Set<number>;
  lockedPCs: Set<number>;
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

function getTargetPCs(target: Target): number[] {
  if (target === 'all') return ONLINE_PCS;
  if (Array.isArray(target)) return target;
  return [target];
}

function TargetIcon({ target }: { target: Target }) {
  if (target === 'all' || Array.isArray(target)) return <Zap size={28} fill="currentColor" />;
  return <Monitor size={28} />;
}

export default function ActionsPage({ target, protectedPCs, lockedPCs, onBack, onAction }: ActionsPageProps) {
  const label = getTargetLabel(target);
  const meta = getTargetMeta(target);
  const targetPCs = getTargetPCs(target);
  const isProtected = targetPCs.length > 0 && targetPCs.every(pc => protectedPCs.has(pc));
  const isLocked = targetPCs.length > 0 && targetPCs.every(pc => lockedPCs.has(pc));

  return (
    <div className="page-wrapper slide-in">
      <div className="header">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft size={24} />
        </button>
        <div className="header-info">
          <div className="header-title">Действия</div>
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
        <div className="toggles-row fade-up-2">
          <div className={`toggle-card toggle-card--protect${isProtected ? ' is-on' : ''}`}>
            <div className="toggle-card-top">
              <div className="toggle-card-icon protect">
                <ShieldCheck size={18} />
              </div>
              <span className="toggle-card-label">Защита</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={isProtected}
                onChange={() => onAction(isProtected ? 'protect-off' : 'protect-on')}
              />
              <span className={`toggle-slider${isProtected ? ' on-protect' : ''}`} />
            </label>
          </div>

          <div className={`toggle-card toggle-card--lock${isLocked ? ' is-on' : ''}`}>
            <div className="toggle-card-top">
              <div className="toggle-card-icon lock">
                <Lock size={18} />
              </div>
              <span className="toggle-card-label">Блокировать экран</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={isLocked}
                onChange={() => onAction(isLocked ? 'lock-off' : 'lock-on')}
              />
              <span className={`toggle-slider${isLocked ? ' on-lock' : ''}`} />
            </label>
          </div>
        </div>

        <div className="action-row fade-up-3">
          <button className="action-btn launch full-width" onClick={() => onAction('launch')}>
            <div className="action-icon"><FolderOpen size={24} /></div>
            <div className="action-text">
              <div className="action-title">Запустить программу</div>
              <div className="action-sub">Открыть приложение на ПК</div>
            </div>
          </button>
        </div>

        <div className="action-row cols-2 fade-up-4">
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
