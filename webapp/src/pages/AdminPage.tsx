import { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Copy, Check, ArrowLeft, Upload } from 'lucide-react';
import { apiFetch } from '../api/client';
import type { PC, Group } from '../api/types';
import { useTelegram } from '../hooks/useTelegram';

interface Release {
  id: number;
  version: string;
  channel: string;
  sha256: string;
  file_size: number | null;
  released_at: string;
  is_active: boolean;
  download_url: string;
}

interface AdminPageProps {
  pcs: PC[];
  groups: Group[];
  onBack: () => void;
  onRefreshPCs: () => void;
  onRefreshGroups: () => void;
  showToast: (msg: string) => void;
}

interface NewTokenResult {
  id: number;
  name: string;
  token: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPage({ pcs, groups, onBack, onRefreshPCs, onRefreshGroups, showToast }: AdminPageProps) {
  const { showConfirm } = useTelegram();

  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [newTokenResult, setNewTokenResult] = useState<NewTokenResult | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);

  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [uploadingRelease, setUploadingRelease] = useState(false);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<Release[]>('/api/releases').then(setReleases).catch(() => {});
  }, []);

  async function handleUploadRelease() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !releaseVersion.trim()) return;
    setUploadingRelease(true);
    try {
      const form = new FormData();
      form.append('version', releaseVersion.trim());
      form.append('channel', 'stable');
      form.append('file', file);
      const res = await apiFetch<Release>('/api/releases', {
        method: 'POST',
        body: form,
      });
      setReleases(prev => [res, ...prev]);
      setReleaseVersion('');
      setShowReleaseForm(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast(`✅ Релиз v${res.version} загружен`);
    } catch {
      showToast('⚠️ Ошибка загрузки релиза');
    } finally {
      setUploadingRelease(false);
    }
  }

  async function handleDeactivateRelease(r: Release) {
    showConfirm(`Деактивировать v${r.version}?`, async (ok) => {
      if (!ok) return;
      try {
        await apiFetch(`/api/releases/${r.id}`, { method: 'DELETE' });
        setReleases(prev => prev.map(x => x.id === r.id ? { ...x, is_active: false } : x));
        showToast(`v${r.version} деактивирован`);
      } catch {
        showToast('⚠️ Ошибка');
      }
    });
  }

  async function handleDeletePC(pc: PC) {
    showConfirm(`Удалить ${pc.name}?\nАгент потеряет доступ.`, async (ok) => {
      if (!ok) return;
      try {
        await apiFetch(`/api/pcs/${pc.id}`, { method: 'DELETE' });
        onRefreshPCs();
        showToast(`🗑 ${pc.name} удалён`);
      } catch {
        showToast('⚠️ Ошибка удаления');
      }
    });
  }

  async function handleRename(pc: PC) {
    const name = renameValue.trim();
    if (!name || name === pc.name) { setRenaming(null); return; }
    try {
      await apiFetch(`/api/pcs/${pc.id}/rename`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      onRefreshPCs();
      showToast(`✏️ Переименован → ${name}`);
    } catch {
      showToast('⚠️ Ошибка переименования');
    } finally {
      setRenaming(null);
    }
  }

  async function handleAssignGroup(pc: PC, groupId: number | null) {
    try {
      await apiFetch(`/api/pcs/${pc.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ group_id: groupId }),
      });
      onRefreshPCs();
    } catch {
      showToast('⚠️ Ошибка назначения группы');
    }
  }

  async function handleCreateToken() {
    const name = newTokenName.trim();
    if (!name) return;
    setCreatingToken(true);
    try {
      const result = await apiFetch<NewTokenResult>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewTokenResult(result);
      setNewTokenName('');
      setShowCreateForm(false);
    } catch {
      showToast('⚠️ Ошибка создания токена');
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      await apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewGroupName('');
      setShowGroupForm(false);
      onRefreshGroups();
      showToast(`✅ Группа «${name}» создана`);
    } catch {
      showToast('⚠️ Ошибка создания группы');
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(group: Group) {
    showConfirm(`Удалить группу «${group.name}»?\nПК останутся, но выйдут из группы.`, async (ok) => {
      if (!ok) return;
      try {
        await apiFetch(`/api/groups/${group.id}`, { method: 'DELETE' });
        onRefreshGroups();
        onRefreshPCs();
        showToast(`🗑 Группа «${group.name}» удалена`);
      } catch {
        showToast('⚠️ Ошибка удаления группы');
      }
    });
  }

  function copyToken(token: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(token).then(() => {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      });
    } else {
      const el = document.createElement('textarea');
      el.value = token;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  }

  return (
    <div className="page-wrapper fade-up-1">
      <div className="header">
        <button style={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-info">
          <div className="header-title">Управление</div>
          <div className="header-sub"><span>{pcs.length} компьютеров</span></div>
        </div>
      </div>

      {newTokenResult && (
        <div style={styles.tokenBanner}>
          <div style={styles.tokenBannerTitle}>
            ✅ Токен для <strong>{newTokenResult.name}</strong> создан
          </div>
          <div style={styles.tokenBannerSub}>Скопируй и вставь в ClassroomSetup.exe — показывается только один раз</div>
          <div style={styles.tokenValueRow}>
            <code style={styles.tokenValue}>{newTokenResult.token}</code>
            <button style={styles.copyBtn} onClick={() => copyToken(newTokenResult.token)}>
              {copiedToken ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <button style={styles.dismissBtn} onClick={() => setNewTokenResult(null)}>Скрыть</button>
        </div>
      )}

      {/* Groups section */}
      <div style={styles.sectionTitle}>
        Группы
        <button style={styles.addBtn} onClick={() => setShowGroupForm(v => !v)}>
          <Plus size={16} />
          <span>Добавить</span>
        </button>
      </div>

      {showGroupForm && (
        <div style={styles.createForm}>
          <input
            autoFocus
            style={styles.createInput}
            placeholder="Напр. Ряд 1"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateGroup(); if (e.key === 'Escape') setShowGroupForm(false); }}
          />
          <button
            style={{ ...styles.createBtn, opacity: creatingGroup || !newGroupName.trim() ? 0.5 : 1 }}
            disabled={creatingGroup || !newGroupName.trim()}
            onClick={handleCreateGroup}
          >
            {creatingGroup ? '…' : 'Создать'}
          </button>
        </div>
      )}

      <div style={{ ...styles.list, marginBottom: 20 }}>
        {groups.length === 0 && !showGroupForm && (
          <div style={styles.empty}>Нет групп. Создай группу, чтобы фильтровать ПК по рядам или кабинетам.</div>
        )}
        {groups.map(g => (
          <div key={g.id} style={styles.card}>
            <div style={styles.cardMain}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{g.name}</span>
                <span style={{ fontSize: 12, color: 'var(--hint)', marginLeft: 8 }}>{g.pc_count} ПК</span>
              </div>
              <button style={styles.deleteBtn} onClick={() => handleDeleteGroup(g)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* PCs section */}
      <div style={styles.sectionTitle}>
        Компьютеры
        <button style={styles.addBtn} onClick={() => setShowCreateForm(v => !v)}>
          <Plus size={16} />
          <span>Добавить</span>
        </button>
      </div>

      {showCreateForm && (
        <div style={styles.createForm}>
          <input
            autoFocus
            style={styles.createInput}
            placeholder="Имя, напр. PC-05"
            value={newTokenName}
            onChange={e => setNewTokenName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateToken(); if (e.key === 'Escape') setShowCreateForm(false); }}
          />
          <button
            style={{ ...styles.createBtn, opacity: creatingToken || !newTokenName.trim() ? 0.5 : 1 }}
            disabled={creatingToken || !newTokenName.trim()}
            onClick={handleCreateToken}
          >
            {creatingToken ? '…' : 'Создать'}
          </button>
        </div>
      )}

      {/* Releases section */}
      <div style={{ ...styles.sectionTitle, marginTop: 24 }}>
        Агент
        <button style={styles.addBtn} onClick={() => setShowReleaseForm(v => !v)}>
          <Upload size={14} />
          <span>Загрузить</span>
        </button>
      </div>

      {showReleaseForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <input
            style={styles.createInput}
            placeholder="Версия, напр. 1.1.0"
            value={releaseVersion}
            onChange={e => setReleaseVersion(e.target.value)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".exe"
            style={{ color: 'var(--hint)', fontSize: 13 }}
          />
          <button
            style={{ ...styles.createBtn, opacity: uploadingRelease || !releaseVersion.trim() ? 0.5 : 1 }}
            disabled={uploadingRelease || !releaseVersion.trim()}
            onClick={handleUploadRelease}
          >
            {uploadingRelease ? 'Загрузка…' : 'Загрузить релиз'}
          </button>
        </div>
      )}

      <div style={{ ...styles.list, marginBottom: 24 }}>
        {releases.length === 0 && !showReleaseForm && (
          <div style={styles.empty}>Нет релизов. Загрузи ClassroomAgent.exe из release/</div>
        )}
        {releases.map(r => (
          <div key={r.id} style={styles.card}>
            <div style={styles.cardMain}>
              <div style={styles.cardLeft}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...styles.dot, background: r.is_active ? 'var(--online)' : 'var(--hint)' }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                    v{r.version}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--hint)', background: 'var(--bg3)', borderRadius: 6, padding: '1px 6px' }}>
                    {r.channel}
                  </span>
                  {r.is_active && (
                    <span style={{ fontSize: 11, color: 'var(--online)' }}>активен</span>
                  )}
                </div>
                <div style={styles.pcMeta}>
                  {r.file_size ? `${(r.file_size / 1024 / 1024).toFixed(1)} МБ · ` : ''}
                  {formatDate(r.released_at)} · SHA256: {r.sha256.slice(0, 12)}…
                </div>
              </div>
              {r.is_active && (
                <button style={styles.deleteBtn} onClick={() => handleDeactivateRelease(r)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.list}>
        {pcs.length === 0 && !showCreateForm && (
          <div style={styles.empty}>Нет компьютеров. Нажми «Добавить» чтобы создать токен для агента.</div>
        )}
        {pcs.map((pc, i) => (
          <div key={pc.id} className={`fade-up-${Math.min(i + 2, 13)}`} style={styles.card}>
            <div style={styles.cardMain}>
              <div style={styles.cardLeft}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...styles.dot, background: pc.online ? 'var(--online)' : 'var(--hint)' }} />
                  {renaming === pc.id ? (
                    <input
                      autoFocus
                      style={styles.renameInput}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(pc); if (e.key === 'Escape') setRenaming(null); }}
                      onBlur={() => handleRename(pc)}
                    />
                  ) : (
                    <span style={styles.pcName} onClick={() => { setRenaming(pc.id); setRenameValue(pc.name); }}>
                      {pc.name}
                    </span>
                  )}
                </div>
                <div style={styles.pcMeta}>
                  {pc.ip_local ?? '—'} · v{pc.agent_version ?? '?'} · {formatDate(pc.last_seen)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {groups.length > 0 && (
                  <select
                    style={styles.groupSelect}
                    value={pc.group_id ?? ''}
                    onChange={e => handleAssignGroup(pc, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Без группы</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                )}
                <button style={styles.deleteBtn} onClick={() => handleDeletePC(pc)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--hint)',
    cursor: 'pointer',
    padding: '4px 8px 4px 0',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--hint)',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    background: 'var(--bg2)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 14px',
  },
  cardMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardLeft: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  pcName: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text)',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pcMeta: {
    fontSize: 12,
    color: 'var(--hint)',
    paddingLeft: 16,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    background: 'rgba(240, 90, 90, 0.12)',
    border: 'none',
    borderRadius: 10,
    color: 'var(--danger)',
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  groupSelect: {
    background: 'var(--bg3)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12,
    padding: '6px 8px',
    cursor: 'pointer',
    maxWidth: 110,
  },
  renameInput: {
    background: 'var(--bg3)',
    border: '1px solid var(--accent)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 15,
    fontWeight: 600,
    padding: '2px 8px',
    outline: 'none',
    width: '100%',
  },
  empty: {
    color: 'var(--hint)',
    fontSize: 14,
    padding: '12px 0',
    textAlign: 'center',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(91, 156, 246, 0.12)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--accent)',
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  createForm: {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
  },
  createInput: {
    flex: 1,
    background: 'var(--bg2)',
    border: '1px solid var(--bg3)',
    borderRadius: 10,
    color: 'var(--text)',
    fontSize: 14,
    padding: '10px 12px',
    outline: 'none',
  },
  createBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 16px',
    cursor: 'pointer',
  },
  tokenBanner: {
    background: 'rgba(52, 201, 118, 0.08)',
    border: '1px solid rgba(52, 201, 118, 0.25)',
    borderRadius: 'var(--radius-sm)',
    padding: '14px 16px',
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  tokenBannerTitle: {
    fontSize: 14,
    color: 'var(--online)',
  },
  tokenBannerSub: {
    fontSize: 12,
    color: 'var(--hint)',
  },
  tokenValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  tokenValue: {
    flex: 1,
    background: 'var(--bg3)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 11,
    color: 'var(--text)',
    wordBreak: 'break-all',
    fontFamily: 'monospace',
  },
  copyBtn: {
    background: 'var(--bg3)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--accent)',
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  dismissBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--hint)',
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'right' as const,
    padding: 0,
  },
};
