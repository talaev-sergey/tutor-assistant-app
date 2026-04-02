import PCGrid from '../components/PCGrid';
import MultiselectBar from '../components/MultiselectBar';
import { ONLINE_PCS, HOST, VERSION } from '../data/constants';
import { Server, Zap } from 'lucide-react';

interface ListPageProps {
  protectedPCs: Set<number>;
  lockedPCs: Set<number>;
  taskPCs: Set<number>;
  multiMode: boolean;
  selectedPCs: Set<number>;
  onPCClick: (pc: number) => void;
  onPCLongPress: (pc: number) => void;
  onPCSelect: (pc: number) => void;
  onSelectAll: () => void;
  onCancelMulti: () => void;
  onGoMulti: () => void;
  onAllClick: () => void;
}

export default function ListPage({
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
  return (
    <div className="page-wrapper fade-up-1">
      <div className="header">
        <div className="header-info">
          <div className="header-title">Класс-Контроль</div>
          <div className="header-sub">
            <span><Server size={14} /> {HOST}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span>{VERSION}</span>
          </div>
        </div>
        <button className="header-all-btn fade-up-2" onClick={onAllClick}>
          <Zap size={14} fill="currentColor" />
          <span>{ONLINE_PCS.length} ПК</span>
        </button>
      </div>

      {multiMode && (
        <MultiselectBar
          selectedPCs={selectedPCs}
          onSelectAll={onSelectAll}
          onCancel={onCancelMulti}
          onGo={onGoMulti}
        />
      )}

      <PCGrid
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
