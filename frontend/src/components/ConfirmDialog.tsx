import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  confirmLabel: string;
  /** `danger` (default) for destructive actions; `primary` when the action only adds or changes. */
  tone?: 'danger' | 'primary';
  children: ReactNode;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
};

/**
 * Native modal dialog for destructive confirmations. The safe action ("Cancelar") takes focus, Esc closes
 * it, and the browser returns focus to the control that opened it. No role or focus trap is added: the
 * platform provides them.
 */
export function ConfirmDialog({ open, title, confirmLabel, tone = 'danger', children, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="confirm" aria-labelledby={titleId} onClose={onCancel}>
      <h2 id={titleId} className="confirm-title">
        {title}
      </h2>
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <button ref={cancelRef} type="button" className="btn btn--outline" onClick={() => ref.current?.close()}>
          Cancelar
        </button>
        <button type="button" className={`btn btn--${tone}`} disabled={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
