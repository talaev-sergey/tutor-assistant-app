import PCGrid from '../components/PCGrid';
import MultiselectBar from '../components/MultiselectBar';
import { ONLINE_PCS, HOST, VERSION } from '../data/constants';

interface ListPageProps {
  protectedPCs: Set<number>;
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
    <div className="page-wrapper">
      <div className="header">
        <div className="header-info">
          <div className="header-title">Tutor Assistant</div>
          <div className="header-sub">
            <span>{VERSION}</span>
            <span>Host: <b>{HOST}</b></span>
          </div>
        </div>
        <div className="status-bar" style={{ margin: 0 }}>
          <div className="status-dot" />
          <span>
            Онлайн: <span className="status-count">{ONLINE_PCS.length}</span>
          </span>
        </div>
      </div>

      {multiMode && (
        <MultiselectBar
          selectedPCs={selectedPCs}
          onSelectAll={onSelectAll}
          onCancel={onCancelMulti}
          onGo={onGoMulti}
        />
      )}

      <button className="all-btn fade-up-2" onClick={onAllClick}>
        <span className="all-btn-icon">⚡</span>
        <div className="all-btn-text">
          <div className="all-btn-title">Все онлайн-ПК</div>
          <div className="all-btn-sub">{ONLINE_PCS.length} компьютеров</div>
        </div>
        <span className="all-btn-arrow">›</span>
      </button>

      <PCGrid
        protectedPCs={protectedPCs}
        multiMode={multiMode}
        selectedPCs={selectedPCs}
        onPCClick={onPCClick}
        onPCLongPress={onPCLongPress}
        onPCSelect={onPCSelect}
      />
    </div>
  );
}
