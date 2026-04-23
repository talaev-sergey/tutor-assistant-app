import PCGrid from '../components/PCGrid';
import MultiselectBar from '../components/MultiselectBar';
import { Zap } from 'lucide-react';
import type { PC } from '../api/types';

interface ListPageProps {
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
  onSelectAll: () => void;
  onCancelMulti: () => void;
  onGoMulti: () => void;
  onAllClick: () => void;
}

export default function ListPage({
  pcs,
  loading,
  protectedPCs,
  lockedPCs,
  taskPCs,
  multiMode,
  selectedPCs,
  onPCClick,
  onPCLongPress,
  onPCSelect,
  onSelectAll,
  onCancelMulti,
  onGoMulti,
  onAllClick,
}: ListPageProps) {
  const onlineCount = pcs.filter(p => p.online).length;

  return (
    <div className="page-wrapper fade-up-1">
      <div className="header">
        <div className="header-info">
          <div className="header-title">Класс-Контроль</div>
          <div className="header-sub">
            <span>{pcs.length} компьютеров</span>
          </div>
        </div>
        <button className="header-all-btn fade-up-2" onClick={onAllClick} disabled={onlineCount === 0}>
          <Zap size={14} fill="currentColor" />
          <span>{onlineCount} онлайн</span>
        </button>
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
