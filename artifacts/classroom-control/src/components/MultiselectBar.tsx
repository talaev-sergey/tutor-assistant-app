import { ONLINE_PCS } from '../data/constants';

interface MultiselectBarProps {
  selectedPCs: Set<number>;
  onSelectAll: () => void;
  onCancel: () => void;
  onGo: () => void;
}

export default function MultiselectBar({ selectedPCs, onSelectAll, onCancel, onGo }: MultiselectBarProps) {
  const n = selectedPCs.size;
  const allSelected = n === ONLINE_PCS.length;
  const label = n === 0 ? 'Выберите ПК' : `Выбрано: ${n} из ${ONLINE_PCS.length}`;

  return (
    <div className="multiselect-bar">
      <span className="ms-label">{label}</span>
      <div className="ms-actions">
        <button className="ms-btn sel-all" onClick={onSelectAll}>
          {allSelected ? 'Снять' : 'Все'}
        </button>
        <button className="ms-btn cancel" onClick={onCancel}>Отмена</button>
        <button className="ms-btn go" disabled={n === 0} onClick={onGo}>Действия</button>
      </div>
    </div>
  );
}
