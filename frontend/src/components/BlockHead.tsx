import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A block title with its explanation behind a small superscript "i".
 * Hovering the title or the "i" with a mouse opens it, as does a click, tap or Enter on the "i";
 * Esc, a click outside, or moving the mouse away closes it. The text is also the button's
 * accessible description, so screen readers hear it on focus.
 */
function TitleWithTip({ heading, label, children }: { heading: ReactNode; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bubbleId = useId();
  const group = useRef<HTMLSpanElement>(null);
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
      if (group.current && !group.current.contains(event.target as Node)) setOpen(false);
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
      ref={group}
      className="block-title-group"
      onPointerEnter={(event) => event.pointerType === 'mouse' && hoverOpen()}
      onPointerLeave={(event) => event.pointerType === 'mouse' && hoverClose()}
    >
      {heading}
      <button
        type="button"
        className="info-tip-button"
        aria-label={`Más información: ${label}`}
        aria-expanded={open}
        aria-describedby={bubbleId}
        // A mouse click lands after hover already opened it: keep it open instead of toggling it shut.
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

/**
 * The ruled heading of a block: title, optional explanation behind a superscript "i", optional count.
 * The count is read as part of the heading but drawn after the "i", so the "i" sits on the title's last letter.
 */
export function BlockHead({ id, title, count, children }: { id: string; title: string; count?: number; children?: ReactNode }) {
  const heading = (
    <h2 id={id} className="block-title">
      {title}
      {count !== undefined ? <span className="visually-hidden"> ({count})</span> : null}
    </h2>
  );
  return (
    <div className="block-head">
      {children ? (
        <TitleWithTip heading={heading} label={title}>
          {children}
        </TitleWithTip>
      ) : (
        heading
      )}
      {count !== undefined ? (
        <span className="block-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </div>
  );
}
