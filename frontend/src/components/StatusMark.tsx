export type StatusKind = 'en-linea' | 'sin-reporte' | 'nunca' | 'sin-dispositivo' | 'desconocido';

const LABEL: Record<StatusKind, string> = {
  'en-linea': 'En línea',
  'sin-reporte': 'Sin reporte reciente',
  nunca: 'Sin datos todavía',
  'sin-dispositivo': 'Sin dispositivo',
  desconocido: 'Estado desconocido',
};

/**
 * A device or person state for a table cell: a small shape plus text, never color alone. Filled square
 * for "en línea", a heavy hollow square for "sin reporte", a dashed hollow square for setup states.
 * `detail` adds a second line such as "último hace 47 min".
 */
export function StatusMark({ kind, detail }: { kind: StatusKind; detail?: string }) {
  return (
    <span className={`status status--${kind}`}>
      <span className="status-glyph" aria-hidden="true" />
      <span className="status-text">
        {LABEL[kind]}
        {detail ? <span className="status-detail">{detail}</span> : null}
      </span>
    </span>
  );
}
