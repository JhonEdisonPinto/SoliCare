import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastMessage = { id: number; text: string; actionLabel?: string; onAction?: () => void };
type ShowToast = (message: Omit<ToastMessage, 'id'>) => void;

const ToastContext = createContext<ShowToast | null>(null);
const DURATION_MS = 8000;

/** One confirmation at a time, announced politely, with an optional undo-style action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback<ShowToast>((next) => {
    counter.current += 1;
    setMessage({ ...next, id: counter.current });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), DURATION_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message ? (
          <div className="toast" key={message.id}>
            <span>{message.text}</span>
            {message.actionLabel && message.onAction ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  message.onAction?.();
                  setMessage(null);
                }}
              >
                {message.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
