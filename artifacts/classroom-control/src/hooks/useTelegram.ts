declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          selectionChanged: () => void;
        };
        showConfirm: (message: string, callback: (ok: boolean) => void) => void;
      };
    };
  }
}

export function useTelegram() {
  const tg = window.Telegram?.WebApp ?? null;

  const hapticImpact = (style: 'light' | 'medium' | 'heavy' = 'medium') => {
    tg?.HapticFeedback.impactOccurred(style);
  };

  const hapticSelection = () => {
    tg?.HapticFeedback.selectionChanged();
  };

  const showConfirm = (message: string, callback: (ok: boolean) => void) => {
    if (tg) {
      tg.showConfirm(message, callback);
    } else {
      const ok = confirm(message);
      callback(ok);
    }
  };

  return { tg, hapticImpact, hapticSelection, showConfirm };
}
