import PCGrid from '../components/PCGrid';
import MultiselectBar from '../components/MultiselectBar';
import { Zap, Settings } from 'lucide-react';
import type { PC } from '../api/types';

interface ListPageProps {
  pcs: PC[];
  loading: boolean;
  protectedPCs: Set<number>;
  lockedPCs: Set<number>;
  taskPCs: Set<number>;
  multiMode: boolean;
  selectedPCs: Set<number>;
  isAdmin: boolean;
  onPCClick: (pcId: number) => void;
  onPCLongPress: (pcId: number) => void;
  onPCSelect: (pcId: number) => void;
  onSelectAll: () => void;
  onCancelMulti: () => void;
  onGoMulti: () => void;
  onAllClick: () => void;
  onAdminClick: () => void;
}

export default function ListPage({
  pcs,
  loading,
  protectedPCs,
  lockedPCs,
  taskPCs,
  multiMode,
  selectedPCs,
  isAdmin,
  onPCClick,
  onPCLongPress,
  onPCSelect,
  onSelectAll,
  onCancelMulti,
  onGoMulti,
  onAllClick,
  onAdminClick,
}: ListPageProps) {
  const onlineCount = pcs.filter(p => p.online).length;

  return (
    <div className="page-wrapper fade-up-1">
      <div className="header">
        <div className="header-info" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/logo.png"
            alt="logo"
            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
          <div>
          <div className="header-title">Tutor Assistant App</div>
          <div className="header-sub">
            <span>{pcs.length} компьютеров</span>
          </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <button className="header-all-btn fade-up-2" onClick={onAdminClick} style={{ background: 'rgba(91,156,246,0.10)', color: 'var(--accent)' }}>
              <Settings size={14} />
            </button>
          )}
          <button className="header-all-btn fade-up-2" onClick={onAllClick} disabled={onlineCount === 0}>
            <Zap size={14} fill="currentColor" />
            <span>{onlineCount} онлайн</span>
          </button>
        </div>
      </div>

      {multiMode && (
        <MultiselectBar
          selectedPCs={selectedPCs}
          totalOnline={onlineCount}
          onSelectAll={onSelectAll}
          onCancel={onCancelMulti}
          onGo={onGoMulti}
        />
      )}

      <PCGrid
        pcs={pcs}
        loading={loading}
        protectedPCs={protectedPCs}
        lockedPCs={lockedPCs}
        taskPCs={taskPCs}
        multiMode={multiMode}
        selectedPCs={selectedPCs}
        onPCClick={onPCClick}
        onPCLongPress={onPCLongPress}
        onPCSelect={onPCSelect}
      />
    </div>
  );
}
