import type { ReactNode } from 'react';

export type PillTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

/** A small state label: a dot plus text, so the state never depends on color alone. */
export function Pill({ tone, children, dot = true }: { tone: PillTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`pill pill--${tone}`}>
      {dot ? <i aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
