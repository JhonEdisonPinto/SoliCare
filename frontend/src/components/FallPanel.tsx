import { AlertTriangle, Rotate3d, ShieldCheck } from 'lucide-react';
import { useDeviceStats } from '../data/hooks';
import type { PersonSummary } from '../data/summary';
import { formatFull, formatWhen, timeAgo } from '../lib/time';
import { PanelHead } from './PanelHead';
import { Pill } from './Pill';

/**
 * The "Detección de caídas" card for one person's device. The state comes from open fall alerts; the
 * month counter and the last fall come from the stats endpoint. Motion is not collected yet, so the last
 * movement and the sensor activity say "Sin datos" instead of drawing anything.
 */
export function FallPanel({ row, now }: { row: PersonSummary | undefined; now: number }) {
  const deviceId = row?.person.deviceId ?? null;
  const { status, stats } = useDeviceStats(deviceId);
  const fall = row?.openAlerts.find((alert) => alert.kind === 'caida');
  const pending = fall?.state === 'pendiente';
  const subject = row ? `${row.person.name} · ${deviceId}` : 'Sin persona con dispositivo';

  const sensor =
    row?.status === 'en-linea' ? (
      <Pill tone="ok">Sensor activo</Pill>
    ) : row?.status === 'sin-reporte' ? (
      <Pill tone="warn">Sensor sin conexión</Pill>
    ) : (
      <Pill tone="neutral">Sin datos del sensor</Pill>
    );

  const month = stats ? String(stats.falls_this_month) : status === 'loading' ? '…' : 'Sin datos';
  const movement = stats?.last_movement_at ? timeAgo(stats.last_movement_at, now) : 'Sin datos';

  return (
    <section className="panel fall-panel" aria-labelledby="caidas-panel">
      <PanelHead id="caidas-panel" kicker="Seguridad del dispositivo" title="Detección de caídas" actions={sensor} />
      <div className="fall-content">
        <div className={`fall-status-card${pending ? ' fall-status-card--danger' : fall ? ' fall-status-card--warn' : ''}`}>
          <div className="fall-sensor-orbit" aria-hidden="true">
            <div className="fall-sensor-core">{fall ? <AlertTriangle size={25} /> : <Rotate3d size={25} />}</div>
            <i className="orbit-dot orbit-dot--one" />
            <i className="orbit-dot orbit-dot--two" />
          </div>
          <div className="fall-status-copy">
            <span>Estado actual</span>
            <strong>{!row ? 'Sin datos' : pending ? 'Caída sin atender' : fall ? 'Caída atendida, pendiente de resolver' : 'Sin eventos detectados'}</strong>
            <small>{fall ? `${fall.simulated ? 'Simulación. ' : ''}Detectada ${timeAgo(fall.at, now)}. ${subject}` : row ? `No hay caídas abiertas. ${subject}` : 'Asigna un dispositivo a una persona.'}</small>
          </div>
        </div>
        <div className="fall-metric">
          <span>Último movimiento</span>
          <strong>{movement}</strong>
          <small>{stats?.last_movement_at ? subject : 'El dispositivo todavía no reporta movimiento.'}</small>
        </div>
        <div className="fall-metric">
          <span>Eventos este mes</span>
          <strong>{month}</strong>
          {stats ? (
            stats.last_fall_at ? (
              <small>
                Última caída:{' '}
                <time dateTime={stats.last_fall_at} title={formatFull(stats.last_fall_at)}>
                  {formatWhen(stats.last_fall_at, now)}
                </time>
              </small>
            ) : (
              <small className="metric-ok">
                <ShieldCheck size={12} aria-hidden="true" /> Sin caídas registradas
              </small>
            )
          ) : (
            <small>{status === 'unavailable' ? 'No se pudo leer el contador del servidor.' : 'Consultando al servidor…'}</small>
          )}
        </div>
        <div className="fall-activity">
          <div className="fall-activity-head">
            <span>Actividad del sensor</span>
          </div>
          <div className="motion-empty">
            <strong>Sin datos</strong>
            <small>
              {stats ? `${stats.readings_24h} ${stats.readings_24h === 1 ? 'reporte' : 'reportes'} del dispositivo en las últimas 24 h.` : 'El movimiento aún no se recibe.'}
            </small>
          </div>
        </div>
      </div>
      <p className="fall-note">
        <AlertTriangle size={13} aria-hidden="true" /> Por ahora SoliCare no avisa a nadie de una caída real. «Simular caída» envía un aviso de prueba al grupo de Telegram.
      </p>
    </section>
  );
}
