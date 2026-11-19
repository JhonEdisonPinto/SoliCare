import { CircleDashed, Clock3, TriangleAlert, WifiOff } from 'lucide-react';

export type StatusKind = 'en-linea' | 'sin-reporte' | 'nunca' | 'sin-dispositivo' | 'desconocido' | 'caida' | 'conexion';

const LABEL: Record<StatusKind, string> = {
  'en-linea': 'En línea',
  'sin-reporte': 'Sin reporte reciente',
  nunca: 'Sin datos todavía',
  'sin-dispositivo': 'Sin dispositivo asignado',
  desconocido: 'Estado desconocido',
  caida: 'Caída',
  conexion: 'Sin conexión',
};

function Glyph({ kind }: { kind: StatusKind }) {
  switch (kind) {
    case 'en-linea':
      return (
        <svg className="status-glyph" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5" fill="currentColor" />
        </svg>
      );
    case 'sin-reporte':
      return <Clock3 className="status-glyph" aria-hidden="true" />;
    case 'conexion':
      return <WifiOff className="status-glyph" aria-hidden="true" />;
    case 'caida':
      return <TriangleAlert className="status-glyph" aria-hidden="true" />;
    default:
      return <CircleDashed className="status-glyph" aria-hidden="true" />;
  }
}

/** A state shown as icon shape plus text, never color alone. `detail` adds context such as "hace 12 min". */
export function StatusMark({ kind, detail, label }: { kind: StatusKind; detail?: string; label?: string }) {
  return (
    <span className={`status status--${kind}`}>
      <Glyph kind={kind} />
      <span className="status-text">
        {label ?? LABEL[kind]}
        {detail ? <span className="status-detail"> {detail}</span> : null}
      </span>
    </span>
  );
}
