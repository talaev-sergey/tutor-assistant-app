import { ChevronLeft, Monitor, Zap, FolderOpen, ShieldCheck, Lock, RotateCw, Power, Camera } from 'lucide-react';
import type { PC, Target } from '../api/types';

interface ActionsPageProps {
  target: Target;
  pcs: PC[];
  protectedPCs: Set<number>;
  lockedPCs: Set<number>;
  onBack: () => void;
  onAction: (action: string) => void;
}

function getTargetLabel(target: Target, pcs: PC[]): string {
  if (target === 'all') return 'Все онлайн-ПК';
  if (Array.isArray(target)) {
    const names = target.map(id => pcs.find(p => p.id === id)?.name ?? `#${id}`);
    return names.join(', ');
  }
  if (typeof target === 'object') return 'Группа';
  return pcs.find(p => p.id === target)?.name ?? `#${target}`;
}

function getTargetMeta(target: Target, pcs: PC[]): { text: string; isAll: boolean } {
  if (target === 'all') return { text: pcs.filter(p => p.online).length + ' компьютеров', isAll: true };
  if (Array.isArray(target)) return { text: target.length + ' компьютеров', isAll: true };
  if (typeof target === 'object') {
    const count = pcs.filter(p => p.group_id === target.group_id && p.online).length;
    return { text: count + ' онлайн', isAll: true };
  }
  const pc = pcs.find(p => p.id === target);
  return { text: pc?.online ? 'онлайн' : 'офлайн', isAll: false };
}

function getTargetPCIds(target: Target, pcs: PC[]): number[] {
  if (target === 'all') return pcs.filter(p => p.online).map(p => p.id);
  if (Array.isArray(target)) return target;
  if (typeof target === 'object') return pcs.filter(p => p.group_id === target.group_id).map(p => p.id);
  return [target];
}

function TargetIcon({ target, size = 18 }: { target: Target; size?: number }) {
  if (target === 'all' || Array.isArray(target) || typeof target === 'object') return <Zap size={size} fill="currentColor" />;
  return <Monitor size={size} />;
}

export default function ActionsPage({ target, pcs, protectedPCs, lockedPCs, onBack, onAction }: ActionsPageProps) {
  const label = getTargetLabel(target, pcs);
  const meta = getTargetMeta(target, pcs);
  const targetPCIds = getTargetPCIds(target, pcs);
  const isProtected = targetPCIds.length > 0 && targetPCIds.every(id => protectedPCs.has(id));
  const isLocked = targetPCIds.length > 0 && targetPCIds.every(id => lockedPCs.has(id));

  return (
    <div className="page-wrapper slide-in">
      <div className="header">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft size={24} />
        </button>
        <div className="header-info">
          <div className="header-title">Действия</div>
        </div>
        <div className="header-target fade-up-2">
          <div className="header-target-icon">
            <TargetIcon target={target} />
          </div>
          <div className="header-target-text">
            <div className="header-target-name">{label}</div>
            <div className={`header-target-meta${meta.isAll ? ' all' : ''}`}>{meta.text}</div>
          </div>
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

        {typeof target === 'number' && (
          <div className="action-row fade-up-4">
            <button className="action-btn screenshot full-width" onClick={() => onAction('screenshot')}>
              <div className="action-icon"><Camera size={24} /></div>
              <div className="action-text">
                <div className="action-title">Скриншот</div>
                <div className="action-sub">Снимок экрана ученика</div>
              </div>
            </button>
          </div>
        )}

        <div className="action-row cols-2 fade-up-5">
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
