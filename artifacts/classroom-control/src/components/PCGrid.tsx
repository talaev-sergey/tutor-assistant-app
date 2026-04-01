import { useState, useRef } from 'react';
import { ONLINE_PCS, TOTAL_PCS } from '../data/constants';

interface PCGridProps {
  protectedPCs: Set<number>;
  multiMode: boolean;
  selectedPCs: Set<number>;
  onPCClick: (pc: number) => void;
  onPCLongPress: (pc: number) => void;
  onPCSelect: (pc: number) => void;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      style={{
        width: 9,
        height: 9,
        fill: 'none',
        stroke: '#fff',
        strokeWidth: 2.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <polyline points="1.5,6 5,9.5 10.5,2.5" />
    </svg>
  );
}

interface PCButtonProps {
  index: number;
  online: boolean;
  isProtected: boolean;
  multiMode: boolean;
  selected: boolean;
  animClass: string;
  onSingleClick: () => void;
  onLongPress: () => void;
}

function PCButton({
  index,
  online,
  isProtected,
  multiMode,
  selected,
  animClass,
  onSingleClick,
  onLongPress,
}: PCButtonProps) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const [isHolding, setIsHolding] = useState(false);

  function startHold() {
    if (!online) return;
    didLongPress.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      didLongPress.current = true;
      setIsHolding(false);
      onLongPress();
    }, 500);
    setIsHolding(true);
  }

  function cancelHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  }

  function handleClick() {
    if (!online) return;
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    onSingleClick();
  }

  const classNames = [
    'pc-btn',
    online ? 'online' : 'offline',
    selected ? 'selected' : '',
    isHolding ? 'holding' : '',
    animClass,
  ]
    .filter(Boolean)
    .join(' ');

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
      {online && (
        <span className="pc-shield">
          {isProtected ? '🛡' : '🔓'}
        </span>
      )}
      {!multiMode && <div className="pc-status-dot" />}
      <span className="pc-icon">🖥</span>
      <span className="pc-label">ПК {index}</span>
    </button>
  );
}

export default function PCGrid({
  protectedPCs,
  multiMode,
  selectedPCs,
  onPCClick,
  onPCLongPress,
  onPCSelect,
}: PCGridProps) {
  const gridClass = `pc-grid${multiMode ? ' multiselect-mode' : ''}`;

  return (
    <div className={gridClass}>
      {Array.from({ length: TOTAL_PCS }, (_, i) => i + 1).map((pc) => {
        const online = ONLINE_PCS.includes(pc);
        const selected = selectedPCs.has(pc);
        const animClass = `fade-up-${Math.min(pc, 13)}`;

        return (
          <PCButton
            key={pc}
            index={pc}
            online={online}
            isProtected={protectedPCs.has(pc)}
            multiMode={multiMode}
            selected={selected}
            animClass={animClass}
            onSingleClick={() => {
              if (multiMode) onPCSelect(pc);
              else onPCClick(pc);
            }}
            onLongPress={() => {
              if (!multiMode) onPCLongPress(pc);
            }}
          />
        );
      })}
    </div>
  );
}
