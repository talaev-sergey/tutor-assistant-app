import { useState, useEffect, useMemo, useRef } from 'react';
import ListPage from './pages/ListPage';
import ActionsPage from './pages/ActionsPage';
import ProgramsPage from './pages/ProgramsPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';
import { useTelegram } from './hooks/useTelegram';
import { usePCs } from './hooks/usePCs';
import { usePrograms } from './hooks/usePrograms';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { apiFetch } from './api/client';
import type { PC, Program, CommandRequest, CommandResponse, CommandStatus, Target } from './api/types';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME ?? '';

type Page = 'list' | 'actions' | 'programs' | 'admin';

function buildCommandRequest(action: string, target: Target, onlinePCIds: number[]): CommandRequest {
  const targetBase = (() => {
    if (target === 'all') return { target_type: 'all' as const };
    if (Array.isArray(target)) return { target_type: 'multi' as const, target_pc_ids: target };
    if (typeof target === 'object') return { target_type: 'group' as const, target_group_id: target.group_id };
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

function getTargetName(target: Target, onlinePCIds: number[], pcs: PC[], groupName?: string): string {
  if (target === 'all') return `все онлайн (${onlinePCIds.length})`;
  if (Array.isArray(target)) {
    const names = target.map(id => pcs.find(p => p.id === id)?.name ?? `#${id}`);
    return names.join(', ');
  }
  if (typeof target === 'object') return groupName ?? 'группа';
  return pcs.find(p => p.id === target)?.name ?? `#${target}`;
}

export default function App() {
  const { tg, hapticImpact, hapticSelection, showConfirm } = useTelegram();
  const { toast, showToast } = useToast();
  const { user, loading: authLoading, error: authError, loginWithToken, restoreSession } = useAuth();
  const tokenConsumedRef = useRef(false);
  const { pcs, loading: pcsLoading, error: pcsError, refresh: refreshPCs } = usePCs(user ? 5000 : 0);
  const { programs } = usePrograms(!!user);
  const { groups, refresh: refreshGroups } = useGroups(!!user);

  const [page, setPage] = useState<Page>('list');
  const [target, setTarget] = useState<Target>('all');
  const [multiMode, setMultiMode] = useState(false);
  const [selectedPCs, setSelectedPCs] = useState<Set<number>>(new Set());
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [screenshotData, setScreenshotData] = useState<{ name: string; base64: string } | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

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
      else if (page === 'admin') { setPage('list'); tg.BackButton.hide(); }
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
    const visibleOnline = activeGroupId === null
      ? onlinePCIds
      : onlinePCIds.filter(id => pcs.find(p => p.id === id)?.group_id === activeGroupId);
    if (selectedPCs.size === visibleOnline.length) {
      setSelectedPCs(new Set());
    } else {
      setSelectedPCs(new Set(visibleOnline));
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

  function handleAllClick() {
    if (activeGroupId !== null) {
      openActions({ group_id: activeGroupId });
    } else {
      openActions('all');
    }
  }

  async function handleScreenshot() {
    if (typeof target !== 'number') return;
    const pcName = pcs.find(p => p.id === target)?.name ?? `#${target}`;
    setScreenshotLoading(true);
    hapticImpact('medium');
    try {
      const req: CommandRequest = { command_type: 'screenshot', target_type: 'single', target_pc_id: target };
      const res = await apiFetch<CommandResponse>('/api/commands', { method: 'POST', body: JSON.stringify(req) });
      const commandId = res.command_id;

      // Poll until done or timeout (10s)
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 800));
        const status = await apiFetch<CommandStatus>(`/api/commands/${commandId}`);
        const result = status.results[0];
        if (result?.result_data) {
          setScreenshotData({ name: pcName, base64: result.result_data });
          setScreenshotLoading(false);
          return;
        }
        if (result && !result.success) {
          showToast(`⚠️ Скриншот не получен: ${result.error ?? 'ошибка'}`);
          setScreenshotLoading(false);
          return;
        }
      }
      showToast('⚠️ Таймаут — агент не ответил');
    } catch {
      showToast('⚠️ Ошибка запроса скриншота');
    }
    setScreenshotLoading(false);
  }

  async function handleAction(action: string) {
    if (action === 'launch') {
      navigateTo('programs');
      return;
    }
    if (action === 'screenshot') {
      handleScreenshot();
      return;
    }

    const activeGroup = groups.find(g => g.id === activeGroupId);
    const targetName = getTargetName(target, onlinePCIds, pcs, activeGroup?.name);
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
        setTimeout(refreshPCs, 1500);
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

  if (authLoading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0f0f13', color: '#555', fontSize: 14,
    }}>
      Вход…
    </div>
  );

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
          onClick={refreshPCs}
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
          groups={groups}
          loading={pcsLoading}
          protectedPCs={protectedPCs}
          lockedPCs={lockedPCs}
          taskPCs={new Set()}
          multiMode={multiMode}
          selectedPCs={selectedPCs}
          isAdmin={!!user?.is_admin}
          activeGroupId={activeGroupId}
          onGroupSelect={setActiveGroupId}
          onPCClick={handlePCClick}
          onPCLongPress={handlePCLongPress}
          onPCSelect={handlePCSelect}
          onSelectAll={handleSelectAll}
          onCancelMulti={handleCancelMulti}
          onGoMulti={handleGoMulti}
          onAllClick={handleAllClick}
          onAdminClick={() => navigateTo('admin')}
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

      {page === 'admin' && (
        <AdminPage
          pcs={pcs}
          groups={groups}
          onBack={() => navigateTo('list')}
          onRefreshPCs={refreshPCs}
          onRefreshGroups={refreshGroups}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} />

      {screenshotLoading && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, flexDirection: 'column', gap: 12, color: '#ccc', fontSize: 14,
        }}>
          <div style={{ width: 32, height: 32, border: '3px solid #444', borderTopColor: '#aaa', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          Получение скриншота…
        </div>
      )}

      {screenshotData && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, padding: 16, gap: 10,
          }}
          onClick={() => setScreenshotData(null)}
        >
          <div style={{ color: '#ccc', fontSize: 13 }}>{screenshotData.name}</div>
          <img
            src={`data:image/jpeg;base64,${screenshotData.base64}`}
            alt="screenshot"
            style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 80px)', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ color: '#666', fontSize: 12 }}>Нажмите за пределами для закрытия</div>
        </div>
      )}
    </>
  );
}
