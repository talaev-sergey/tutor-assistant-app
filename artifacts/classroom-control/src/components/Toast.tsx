import type { ToastState } from '../hooks/useToast';

interface ToastProps {
  toast: ToastState;
}

export default function Toast({ toast }: ToastProps) {
  if (!toast.visible) return null;

  return (
    <div className={`toast${toast.exiting ? ' toast-out' : ''}`}>
      {toast.message}
    </div>
  );
}
