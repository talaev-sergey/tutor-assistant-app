import { useState, useEffect, useMemo, useRef } from 'react';
import ListPage from './pages/ListPage';
import ActionsPage from './pages/ActionsPage';
import ProgramsPage from './pages/ProgramsPage';
import LoginPage from './pages/LoginPage';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';
import { useTelegram } from './hooks/useTelegram';
import { usePCs } from './hooks/usePCs';
import { usePrograms } from './hooks/usePrograms';
import { useAuth } from './hooks/useAuth';
import { apiFetch } from './api/client';
import type { PC, Program, CommandRequest } from './api/types';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? '';

type Page = 'list' | 'actions' | 'programs';
type Target = number | number[] | 'all';

function buildCommandRequest(action: string, target: Target, onlinePCIds: number[]): CommandRequest {
  const targetBase = (() => {
    if (target === 'all') return { target_type: 'all' as const };
    if (Array.isArray(target)) return { target_type: 'multi' as const, target_pc_ids: target };
    return { target_type: 'single' as const, target_pc_id: target };
  })();

  const actionMap: Record<string, string> = {
    'protect-on': 'protect_on',
    'protect-off': 'protect_off',
    'lock-on': 'lock',
    'lock-off': 'unlock',
    reboot: 'reboot',
    shutdown: 'shutdown',
  };

  return { ...targetBase, command_type: actionMap[action] ?? action };
}

function getTargetName(target: Target, onlinePCIds: number[], pcs: PC[]): string {
  if (target === 'all') return `все онлайн (${onlinePCIds.length})`;
  if (Array.isArray(target)) {
    const names = target.map(id => pcs.find(p => p.id === id)?.name ?? `#${id}`);
    return names.join(', ');
  }
  return pcs.find(p => p.id === target)?.name ?? `#${target}`;
}

export default function App() {
  const { tg, hapticImpact, hapticSelection, showConfirm } = useTelegram();
  const { toast, showToast } = useToast();
  const { user, loading: authLoading, error: authError, loginWithToken, restoreSession } = useAuth();
  const tokenConsumedRef = useRef(false);
  const { pcs, loading: pcsLoading, error: pcsError, refresh } = usePCs(user ? 5000 : 0);
  const { programs } = usePrograms();

  const [page, setPage] = useState<Page>('list');
  const [target, setTarget] = useState<Target>('all');
  const [multiMode, setMultiMode] = useState(false);
  const [selectedPCs, setSelectedPCs] = useState<Set<number>>(new Set());

  // Derived from API data
  const onlinePCIds = useMemo(() => pcs.filter(p => p.online).map(p => p.id), [pcs]);
  const protectedPCs = useMemo(() => new Set(pcs.filter(p => p.protected).map(p => p.id)), [pcs]);
  const lockedPCs = useMemo(() => new Set(pcs.filter(p => p.locked).map(p => p.id)), [pcs]);

  useEffect(() => {
    if (tokenConsumedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      tokenConsumedRef.current = true;
      window.history.replaceState({}, '', window.location.pathname);
      loginWithToken(urlToken);
    } else {
      restoreSession();
    }
  }, [loginWithToken, restoreSession]);

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#0f0f13');
      tg.setBackgroundColor('#0f0f13');
    }
  }, [tg]);

  useEffect(() => {
    if (!tg) return;
    tg.BackButton.onClick(() => {
      if (page === 'programs') { setPage('actions'); }
      else if (page === 'actions') { setPage('list'); tg.BackButton.hide(); }
    });
  }, [tg, page]);

  function navigateTo(newPage: Page) {
    setPage(newPage);
    if (tg) {
      if (newPage === 'list') tg.BackButton.hide();
      else tg.BackButton.show();
    }
  }

  function openActions(t: Target) {
    setTarget(t);
    setMultiMode(false);
    setSelectedPCs(new Set());
    navigateTo('actions');
  }

  function handlePCClick(pcId: number) { openActions(pcId); }

  function handlePCLongPress(pcId: number) {
    hapticImpact('medium');
    setMultiMode(true);
    setSelectedPCs(new Set([pcId]));
  }

  function handlePCSelect(pcId: number) {
    hapticSelection();
    setSelectedPCs(prev => {
      const next = new Set(prev);
      if (next.has(pcId)) next.delete(pcId);
      else next.add(pcId);
      return next;
    });
  }

  function handleSelectAll() {
    hapticImpact('light');
    if (selectedPCs.size === onlinePCIds.length) {
      setSelectedPCs(new Set());
    } else {
      setSelectedPCs(new Set(onlinePCIds));
    }
  }

  function handleCancelMulti() {
    setMultiMode(false);
    setSelectedPCs(new Set());
  }

  function handleGoMulti() {
    const arr = [...selectedPCs].sort((a, b) => a - b);
    openActions(arr);
  }

  async function handleAction(action: string) {
    if (action === 'launch') {
      navigateTo('programs');
      return;
    }

    const targetName = getTargetName(target, onlinePCIds, pcs);
    const confirms: Record<string, string> = {
      reboot: 'Перезагрузить?',
      shutdown: 'Выключить?',
      'protect-off': 'Отключить защиту?',
    };

    const exec = async () => {
      const msgs: Record<string, (t: string) => string> = {
        'protect-on': t => `🛡 Защита включена → ${t}`,
        'protect-off': t => `🔓 Защита отключена → ${t}`,
        'lock-on': t => `🔒 Экран заблокирован → ${t}`,
        'lock-off': t => `🔓 Экран разблокирован → ${t}`,
        reboot: t => `🔄 Перезагрузка → ${t}`,
        shutdown: t => `⏻ Выключение → ${t}`,
      };

      showToast(msgs[action]?.(targetName) ?? `Команда отправлена → ${targetName}`);
      hapticImpact('medium');

      try {
        const req = buildCommandRequest(action, target, onlinePCIds);
        await apiFetch('/api/commands', { method: 'POST', body: JSON.stringify(req) });
        setTimeout(refresh, 1500);
      } catch {
        showToast('⚠️ Ошибка отправки команды');
      }
    };

    if (confirms[action]) {
      showConfirm(`${confirms[action]}\n${targetName}`, ok => { if (ok) exec(); });
    } else {
      exec();
    }
  }

  async function handleLaunch(selectedPrograms: Program[]) {
    const names = selectedPrograms.map(p => p.name).join(', ');
    showToast('📂 Запуск: ' + names);
    hapticImpact('medium');

    try {
      const slugs = selectedPrograms.map(p => p.slug);
      const req: CommandRequest = {
        ...buildCommandRequest('launch', target, onlinePCIds),
        command_type: 'launch',
        params: { programs: slugs },
      };
      await apiFetch('/api/commands', { method: 'POST', body: JSON.stringify(req) });
    } catch {
      showToast('⚠️ Ошибка отправки команды');
    }
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <LoginPage
        botUsername={BOT_USERNAME}
        error={authError}
        loading={authLoading}
      />
    );
  }

  if (pcsError && !pcs.length) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 12,
        color: '#888', padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ fontSize: 16, color: '#ccc' }}>{pcsError}</div>
        <button
          onClick={refresh}
          style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: '1px solid #444', background: 'transparent', color: '#aaa', cursor: 'pointer' }}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      {page === 'list' && (
        <ListPage
          pcs={pcs}
          loading={pcsLoading}
          protectedPCs={protectedPCs}
          lockedPCs={lockedPCs}
          taskPCs={new Set()}
          multiMode={multiMode}
          selectedPCs={selectedPCs}
          onPCClick={handlePCClick}
          onPCLongPress={handlePCLongPress}
          onPCSelect={handlePCSelect}
          onSelectAll={handleSelectAll}
          onCancelMulti={handleCancelMulti}
          onGoMulti={handleGoMulti}
          onAllClick={() => openActions('all')}
        />
      )}

      {page === 'actions' && (
        <ActionsPage
          target={target}
          pcs={pcs}
          protectedPCs={protectedPCs}
          lockedPCs={lockedPCs}
          onBack={() => navigateTo('list')}
          onAction={handleAction}
        />
      )}

      {page === 'programs' && (
        <ProgramsPage
          target={target}
          pcs={pcs}
          programs={programs}
          onBack={() => navigateTo('actions')}
          onLaunch={handleLaunch}
        />
      )}

      <Toast toast={toast} />
    </>
  );
}
