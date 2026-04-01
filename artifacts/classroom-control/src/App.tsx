import { useState, useEffect } from 'react';
import ListPage from './pages/ListPage';
import ActionsPage from './pages/ActionsPage';
import ProgramsPage from './pages/ProgramsPage';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';
import { useTelegram } from './hooks/useTelegram';
import { ONLINE_PCS, PROTECTED_PCS, Program } from './data/constants';

type Page = 'list' | 'actions' | 'programs';
type Target = number | number[] | 'all';

function getTargetName(target: Target, onlineCount: number): string {
  if (target === 'all') return `все онлайн (${onlineCount})`;
  if (Array.isArray(target)) return 'ПК ' + target.join(', ');
  return 'ПК ' + target;
}

export default function App() {
  const { tg, hapticImpact, hapticSelection, showConfirm } = useTelegram();
  const { toast, showToast } = useToast();

  const [page, setPage] = useState<Page>('list');
  const [target, setTarget] = useState<Target>('all');
  const [multiMode, setMultiMode] = useState(false);
  const [selectedPCs, setSelectedPCs] = useState<Set<number>>(new Set());
  const [protectedPCs, setProtectedPCs] = useState<Set<number>>(new Set(PROTECTED_PCS));
  const [lockedPCs, setLockedPCs] = useState<Set<number>>(new Set<number>());
  const [taskPCs, setTaskPCs] = useState<Set<number>>(new Set<number>());

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

  function handlePCClick(pc: number) {
    openActions(pc);
  }

  function handlePCLongPress(pc: number) {
    hapticImpact('medium');
    setMultiMode(true);
    setSelectedPCs(new Set([pc]));
  }

  function handlePCSelect(pc: number) {
    hapticSelection();
    setSelectedPCs(prev => {
      const next = new Set(prev);
      if (next.has(pc)) next.delete(pc);
      else next.add(pc);
      return next;
    });
  }

  function handleSelectAll() {
    hapticImpact('light');
    if (selectedPCs.size === ONLINE_PCS.length) {
      setSelectedPCs(new Set());
    } else {
      setSelectedPCs(new Set(ONLINE_PCS));
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

  function handleAction(action: string) {
    if (action === 'launch') {
      navigateTo('programs');
      return;
    }

    const targetName = getTargetName(target, ONLINE_PCS.length);
    const confirms: Record<string, string> = {
      reboot: 'Перезагрузить?',
      shutdown: 'Выключить?',
      'protect-off': 'Отключить защиту?',
    };

    const exec = () => {
      const targets = target === 'all'
        ? ONLINE_PCS
        : Array.isArray(target)
        ? target
        : [target];

      if (action === 'protect-on' || action === 'protect-off') {
        setProtectedPCs(prev => {
          const next = new Set(prev);
          targets.forEach(n => {
            if (action === 'protect-on') next.add(n);
            else next.delete(n);
          });
          return next;
        });
      }

      if (action === 'lock-on' || action === 'lock-off') {
        setLockedPCs(prev => {
          const next = new Set(prev);
          targets.forEach(n => {
            if (action === 'lock-on') next.add(n);
            else next.delete(n);
          });
          return next;
        });
      }

      const msgs: Record<string, (t: string) => string> = {
        'protect-on': t => `🛡 Защита включена → ${t}`,
        'protect-off': t => `🔓 Защита отключена → ${t}`,
        'lock-on': t => `🔒 Экран заблокирован → ${t}`,
        'lock-off': t => `🔓 Экран разблокирован → ${t}`,
        reboot: t => `🔄 Перезагрузка → ${t}`,
        shutdown: t => `⏻ Выключение → ${t}`,
      };

      showToast(msgs[action](targetName));
      hapticImpact('medium');
    };

    if (confirms[action]) {
      showConfirm(`${confirms[action]}\n${targetName}`, ok => { if (ok) exec(); });
    } else {
      exec();
    }
  }

  function handleLaunch(programs: Program[]) {
    const names = programs.map(p => p.name).join(', ');
    showToast('📂 Запущено: ' + names);
    hapticImpact('medium');
  }

  return (
    <>
      {page === 'list' && (
        <ListPage
          protectedPCs={protectedPCs}
          lockedPCs={lockedPCs}
          taskPCs={taskPCs}
          multiMode={multiMode}
          selectedPCs={selectedPCs}
          onPCClick={handlePCClick}
          onPCLongPress={handlePCLongPress}
          onPCSelect={handlePCSelect}
          onSelectAll={handleSelectAll}
          onCancelMulti={handleCancelMulti}
          onGoMulti={handleGoMulti}
        />
      )}

      {page === 'actions' && (
        <ActionsPage
          target={target}
          protectedPCs={protectedPCs}
          lockedPCs={lockedPCs}
          onBack={() => navigateTo('list')}
          onAction={handleAction}
        />
      )}

      {page === 'programs' && (
        <ProgramsPage
          target={target}
          onBack={() => navigateTo('actions')}
          onLaunch={handleLaunch}
        />
      )}

      <Toast toast={toast} />
    </>
  );
}
