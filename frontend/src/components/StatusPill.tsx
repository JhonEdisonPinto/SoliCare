import { timeAgo } from '../lib/time';
import { Pill, type PillTone } from './Pill';

export type StatusKind = 'en-linea' | 'sin-reporte' | 'nunca' | 'sin-dispositivo' | 'desconocido';

/** A person state that outranks the device state: an unattended fall. */
type PillKind = StatusKind | 'caida';

const LABEL: Record<PillKind, string> = {
  caida: 'Caída sin atender',
  'en-linea': 'Conectado',
  'sin-reporte': 'Sin conexión',
  nunca: 'Sin datos',
  'sin-dispositivo': 'Sin dispositivo',
  desconocido: 'Sin datos',
};

const TONE: Record<PillKind, PillTone> = {
  caida: 'danger',
  'en-linea': 'ok',
  'sin-reporte': 'warn',
  nunca: 'neutral',
  'sin-dispositivo': 'neutral',
  desconocido: 'neutral',
};

/** Longer wording for screen readers and tooltips, so "Sin conexión" is never read as the panel's own connection. */
const HINT: Partial<Record<PillKind, string>> = {
  'sin-reporte': 'Sin reporte reciente del dispositivo',
  nunca: 'El servidor no ha recibido reportes todavía',
};

/** A device or person state for a list or table cell. `detail` adds a second line such as "último hace 47 min". */
export function StatusPill({ kind, detail }: { kind: PillKind; detail?: string }) {
  return (
    <span className="status-cell" title={HINT[kind]}>
      <Pill tone={TONE[kind]}>{LABEL[kind]}</Pill>
      {detail ? <span className="status-detail">{detail}</span> : null}
    </span>
  );
}

/**
 * The state of a device (or of the device a person uses). `known` is false until the server has answered
 * once, so a person is not shown as silent only because nothing has loaded. `pendingFall` puts "Caída sin
 * atender" first and moves the device state to the second line.
 */
export function StatusPillFor({
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
  if (pendingFall) return <StatusPill kind="caida" detail={known ? (lastSeen ?? LABEL[status]) : undefined} />;
  if (status === 'sin-dispositivo') return <StatusPill kind="sin-dispositivo" />;
  if (!known) return <StatusPill kind="desconocido" />;
  if (lastSeen) return <StatusPill kind="sin-reporte" detail={lastSeen} />;
  return <StatusPill kind={status} />;
}

export { LABEL as STATUS_LABEL };
