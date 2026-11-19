import { timeAgo } from '../lib/time';

export type StatusKind = 'en-linea' | 'sin-reporte' | 'nunca' | 'sin-dispositivo' | 'desconocido';

/** A person state that outranks the device state: an unattended fall. */
type MarkKind = StatusKind | 'caida';

const LABEL: Record<MarkKind, string> = {
  caida: 'Caída sin atender',
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
export function StatusMark({ kind, detail }: { kind: MarkKind; detail?: string }) {
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

/**
 * The state of a device (or of the device a person uses) for a table cell. `known` is false until the
 * server has answered once, so a person is not shown as silent only because nothing has loaded.
 * `pendingFall` puts "Caída sin atender" first and moves the device state to the second line.
 */
export function StatusMarkFor({
  status,
  lastSeenAt,
  known,
  now,
  pendingFall = false,
}: {
  status: StatusKind;
  lastSeenAt?: string;
  known: boolean;
  now: number;
  pendingFall?: boolean;
}) {
  const lastSeen = status === 'sin-reporte' && lastSeenAt ? `último ${timeAgo(lastSeenAt, now)}` : undefined;
  if (pendingFall) return <StatusMark kind="caida" detail={known ? (lastSeen ?? LABEL[status]) : undefined} />;
  if (status === 'sin-dispositivo') return <StatusMark kind="sin-dispositivo" />;
  if (!known) return <StatusMark kind="desconocido" />;
  if (lastSeen) return <StatusMark kind="sin-reporte" detail={lastSeen} />;
  return <StatusMark kind={status} />;
}
