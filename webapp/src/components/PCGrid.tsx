import { useState, useRef } from 'react';
import { ShieldCheck, Lock, ClipboardList, Monitor, Network, Wifi } from 'lucide-react';
import type { PC } from '../api/types';

interface PCGridProps {
  pcs: PC[];
  loading: boolean;
  protectedPCs: Set<number>;
  lockedPCs: Set<number>;
  taskPCs: Set<number>;
  multiMode: boolean;
  selectedPCs: Set<number>;
  onPCClick: (pcId: number) => void;
  onPCLongPress: (pcId: number) => void;
  onPCSelect: (pcId: number) => void;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" style={{ width: 12, height: 12, fill: 'none', stroke: '#fff', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <polyline points="1.5,6 5,9.5 10.5,2.5" />
    </svg>
  );
}

interface PCButtonProps {
  pc: PC;
  isProtected: boolean;
  isLocked: boolean;
  hasTask: boolean;
  multiMode: boolean;
  selected: boolean;
  animClass: string;
  onSingleClick: () => void;
  onLongPress: () => void;
}

function PCButton({ pc, isProtected, isLocked, hasTask, multiMode, selected, animClass, onSingleClick, onLongPress }: PCButtonProps) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const [isHolding, setIsHolding] = useState(false);

  function startHold() {
    if (!pc.online) return;
    didLongPress.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      didLongPress.current = true;
      setIsHolding(false);
      onLongPress();
    }, 400);
    setIsHolding(true);
  }

  function cancelHold() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    setIsHolding(false);
  }

  function handleClick() {
    if (!pc.online) return;
    if (didLongPress.current) { didLongPress.current = false; return; }
    onSingleClick();
  }

  const classNames = ['pc-btn', pc.online ? 'online' : 'offline', selected ? 'selected' : '', isHolding ? 'holding' : '', animClass]
    .filter(Boolean).join(' ');

  return (
    <button
      className={classNames}
      onMouseDown={startHold}
      onTouchStart={startHold}
      onMouseUp={cancelHold}
      onTouchEnd={cancelHold}
      onMouseLeave={cancelHold}
      onTouchCancel={cancelHold}
      onClick={handleClick}
    >
      <div className={`pc-check${selected ? ' checked' : ''}`}>
        {selected && <CheckIcon />}
      </div>

      <div className="pc-status-indicators">
        <span className={`pc-ind${isProtected ? ' active protect' : ''}`} title="Защита"><ShieldCheck size={13} /></span>
        <span className={`pc-ind${isLocked ? ' active lock' : ''}`} title="Блокировка"><Lock size={13} /></span>
        <span className={`pc-ind${hasTask ? ' active task' : ''}`} title="Задача"><ClipboardList size={13} /></span>
      </div>

      <div className="pc-divider" />

      <div className="pc-info">
        <div className="pc-info-row">
          <Monitor size={12} className="pc-info-icon" />
          <span className="pc-info-name">{pc.name}</span>
          {!multiMode && <div className="pc-status-dot" />}
        </div>
        {pc.ip_local && (
          <div className="pc-info-row">
            <Network size={12} className="pc-info-icon muted" />
            <span className="pc-info-ip">{pc.ip_local}</span>
          </div>
        )}
        {pc.agent_version && (
          <div className="pc-info-row">
            <span className="pc-info-version">{pc.agent_version}</span>
          </div>
        )}
      </div>
    </button>
  );
}

export default function PCGrid({ pcs, loading, protectedPCs, lockedPCs, taskPCs, multiMode, selectedPCs, onPCClick, onPCLongPress, onPCSelect }: PCGridProps) {
  const [showOffline, setShowOffline] = useState(false);
  const gridClass = `pc-grid${multiMode ? ' multiselect-mode' : ''}`;

  if (loading && pcs.length === 0) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`pc-btn offline fade-up-${i + 2}`} style={{ opacity: 0.2 }}>
            <div className="pc-info"><div className="pc-info-row"><Monitor size={12} className="pc-info-icon" /><span className="pc-info-name">...</span></div></div>
          </div>
        ))}
      </div>
    );
  }

  if (pcs.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 64, color: '#555' }}>
        <Wifi size={40} />
        <span>Нет зарегистрированных ПК</span>
        <span style={{ fontSize: 12 }}>Установите агент на компьютеры учеников</span>
      </div>
    );
  }

  const onlinePCs = pcs.filter(p => p.online);
  const offlinePCs = pcs.filter(p => !p.online);
  const visiblePCs = showOffline ? pcs : onlinePCs;

  return (
    <>
      <div className={gridClass}>
        {visiblePCs.map((pc, i) => (
          <PCButton
            key={pc.id}
            pc={pc}
            isProtected={protectedPCs.has(pc.id)}
            isLocked={lockedPCs.has(pc.id)}
            hasTask={taskPCs.has(pc.id)}
            multiMode={multiMode}
            selected={selectedPCs.has(pc.id)}
            animClass={`fade-up-${Math.min(i + 2, 13)}`}
            onSingleClick={() => { if (multiMode) onPCSelect(pc.id); else onPCClick(pc.id); }}
            onLongPress={() => { if (!multiMode) onPCLongPress(pc.id); }}
          />
        ))}
      </div>

      {offlinePCs.length > 0 && (
        <button
          onClick={() => setShowOffline(v => !v)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: 'var(--hint)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--hint)', flexShrink: 0, display: 'inline-block',
          }} />
          {showOffline ? `Скрыть недоступные` : `Недоступные: ${offlinePCs.length}`}
        </button>
      )}
    </>
  );
}
