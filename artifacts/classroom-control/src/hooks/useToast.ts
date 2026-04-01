import { useState, useCallback, useRef } from 'react';

export interface ToastState {
  message: string;
  visible: boolean;
  exiting: boolean;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false, exiting: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);

    setToast({ message, visible: true, exiting: false });

    timerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, exiting: true }));
      exitTimerRef.current = setTimeout(() => {
        setToast({ message: '', visible: false, exiting: false });
      }, 300);
    }, 2800);
  }, []);

  return { toast, showToast };
}
