import type { ReactNode } from 'react';

export type StampKind = 'caida' | 'caida-atendida' | 'sin-reporte' | 'atendida' | 'sistema';

/**
 * A boxed status code, as a monitoring centre prints it in its event log ("Caída", "Sin reporte").
 * Fixed vocabulary, sentence case, never color alone: the word is the information and each kind also
 * differs in fill and border weight.
 */
export function Stamp({ kind, children }: { kind: StampKind; children: ReactNode }) {
  return <span className={`stamp stamp--${kind}`}>{children}</span>;
}
