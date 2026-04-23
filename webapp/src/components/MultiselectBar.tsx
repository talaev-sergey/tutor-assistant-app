interface MultiselectBarProps {
  selectedPCs: Set<number>;
  totalOnline: number;
  onSelectAll: () => void;
  onCancel: () => void;
  onGo: () => void;
}

export default function MultiselectBar({ selectedPCs, totalOnline, onSelectAll, onCancel, onGo }: MultiselectBarProps) {
  const n = selectedPCs.size;
  const allSelected = n === totalOnline;
  const label = n === 0 ? 'Выберите ПК' : `Выбрано: ${n} из ${totalOnline}`;

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
