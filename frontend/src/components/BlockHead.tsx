import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Explanation behind an "i" toggle instead of always-visible text.
 * Mouse hover or a click/tap opens it; Esc, a second click or a click outside closes it.
 * The text is also the button's accessible description, so screen readers hear it on focus.
 */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const hovered = useRef(false);

  // A short delay on mouse leave lets the pointer cross the gap into the bubble (WCAG 1.4.13, hoverable).
  const hoverOpen = () => {
    hovered.current = true;
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    hovered.current = false;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className="info-tip"
      onPointerEnter={(event) => event.pointerType === 'mouse' && hoverOpen()}
      onPointerLeave={(event) => event.pointerType === 'mouse' && hoverClose()}
    >
      <button
        type="button"
        className="info-tip-button"
        aria-label={`Más información: ${label}`}
        aria-expanded={open}
        aria-describedby={bubbleId}
        onClick={() => setOpen((value) => (hovered.current ? true : !value))}
      >
        i
      </button>
      <span id={bubbleId} role="tooltip" className="info-tip-bubble" hidden={!open}>
        {children}
      </span>
    </span>
  );
}

/** The ruled heading of a block: title, optional count of what it lists, optional explanation behind an "i" tooltip. */
export function BlockHead({ id, title, count, children }: { id: string; title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="block-head">
      <h2 id={id} className="block-title">
        {title}
        {count !== undefined ? <span className="block-count">{count}</span> : null}
      </h2>
      {children ? <InfoTip label={title}>{children}</InfoTip> : null}
    </div>
  );
}
