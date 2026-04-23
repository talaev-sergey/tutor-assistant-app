import { useState, useMemo } from 'react';
import { ChevronLeft, Search, X, MonitorPlay } from 'lucide-react';
import type { PC, Program } from '../api/types';

type Target = number | number[] | 'all';

interface ProgramsPageProps {
  target: Target;
  pcs: PC[];
  programs: Program[];
  onBack: () => void;
  onLaunch: (programs: Program[]) => void;
}

function getSubtitle(target: Target, pcs: PC[]): string {
  if (target === 'all') return 'Все онлайн-ПК';
  if (Array.isArray(target)) {
    return target.map(id => pcs.find(p => p.id === id)?.name ?? `#${id}`).join(', ');
  }
  return pcs.find(p => p.id === target)?.name ?? `#${target}`;
}

function hlMatch(text: string, q: string): string {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    `<span class="highlight">${text.slice(idx, idx + q.length)}</span>` +
    text.slice(idx + q.length)
  );
}

function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <div className={`prog-checkbox${checked ? ' checked' : ''}`}>
      <svg viewBox="0 0 12 12" style={{ width: 14, height: 14, fill: 'none', stroke: '#fff', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: checked ? 1 : 0, transition: 'all 0.2s', transform: checked ? 'scale(1)' : 'scale(0.5)' }}>
        <polyline points="1.5,6 5,9.5 10.5,2.5" />
      </svg>
    </div>
  );
}

export default function ProgramsPage({ target, pcs, programs, onBack, onLaunch }: ProgramsPageProps) {
  const [query, setQuery] = useState('');
  const [selectedProgs, setSelectedProgs] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter(p =>
      p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
    );
  }, [query, programs]);

  function toggleProg(slug: string) {
    setSelectedProgs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function handleLaunch() {
    const chosen = programs.filter(p => selectedProgs.has(p.slug));
    onLaunch(chosen);
  }

  const subtitle = getSubtitle(target, pcs);
  const n = selectedProgs.size;

  return (
    <div className="page-wrapper slide-in">
      <div className="header">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft size={24} />
        </button>
        <div className="header-info">
          <div className="header-title">Программы</div>
          <div className="header-sub"><span>{subtitle}</span></div>
        </div>
      </div>

      <div className="search-wrap fade-up-1">
        <Search className="search-icon" size={18} />
        <input
          className="search-input"
          type="text"
          placeholder="Поиск программы..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="no-results fade-up-2">
          <MonitorPlay size={48} opacity={0.2} />
          <span>Ничего не найдено</span>
        </div>
      ) : (
        <div className="prog-list">
          {filtered.map((p, i) => {
            const checked = selectedProgs.has(p.slug);
            const nameHtml = hlMatch(p.name, query);
            return (
              <div
                key={p.slug}
                className={`prog-item${checked ? ' checked' : ''} fade-up-${Math.min(i + 2, 13)}`}
                onClick={() => toggleProg(p.slug)}
              >
                <span className="prog-icon">{p.icon ?? '📁'}</span>
                <div className="prog-info">
                  <div className="prog-name" dangerouslySetInnerHTML={{ __html: nameHtml }} />
                  <div className="prog-desc">{p.description ?? ''}</div>
                </div>
                <CheckboxIcon checked={checked} />
              </div>
            );
          })}
        </div>
      )}

      <div className="launch-bar slide-in" style={{ animationDelay: '0.1s' }}>
        <button
          className="launch-bar-btn"
          disabled={n === 0}
          onClick={handleLaunch}
        >
          {n === 0 ? 'Выберите программу' : `Запустить (${n})`}
        </button>
      </div>
    </div>
  );
}
