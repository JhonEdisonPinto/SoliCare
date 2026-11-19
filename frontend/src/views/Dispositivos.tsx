import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { PanelHead } from '../components/PanelHead';
import { ReadingAge } from '../components/ReadingAge';
import { StatusPillFor } from '../components/StatusPill';
import { VitalReadout } from '../components/VitalReadout';
import { useDeviceSummaries, useReferenceNow, useTelemetry } from '../data/hooks';
import type { DeviceSummary } from '../data/summary';
import { formatFull, formatWhen, timeAgo } from '../lib/time';

function Row({ row, now, known }: { row: DeviceSummary; now: number; known: boolean }) {
  const { device, person } = row;
  const pendingFall = row.openAlerts.some((alert) => alert.kind === 'caida' && alert.state === 'pendiente');
  const noReadings = !device;
  return (
    <tr className={pendingFall ? 'row--caida' : undefined}>
      <th scope="row" className="cell-person">
        <Link className="person-name" to={`/dispositivos/${encodeURIComponent(row.id)}`}>
          {row.id}
        </Link>
      </th>
      <td className="cell-status" data-label="Estado">
        <StatusPillFor status={row.status} lastSeenAt={device?.last_seen_at} known={known} now={now} pendingFall={pendingFall} />
      </td>
      <td className="cell-last" data-label="Último reporte">
        {device ? (
          <time dateTime={device.last_seen_at} title={formatFull(device.last_seen_at)}>
            {formatWhen(device.last_seen_at, now)} ({timeAgo(device.last_seen_at, now)})
          </time>
        ) : (
          <span className="muted">Sin reportes</span>
        )}
      </td>
      <td className="cell-device" data-label="Persona">
        {person ? (
          <Link to={`/personas/${person.id}`}>{person.name}</Link>
        ) : (
          <>
            <span className="muted">Sin persona asignada</span>{' '}
            <Link to={`/dispositivos/${encodeURIComponent(row.id)}`}>
              Asignar<span className="visually-hidden"> {row.id} a una persona</span>
            </Link>
          </>
        )}
      </td>
      {noReadings ? (
        <td colSpan={3} className="row-message">
          El servidor no ha recibido reportes de este dispositivo.
        </td>
      ) : (
        <>
          <td className="num cell-pulso" data-label="Pulso">
            <VitalReadout vital={row.pulso} kind="pulso" />
          </td>
          <td className="num cell-spo2" data-label="SpO2">
            <VitalReadout vital={row.spo2} kind="spo2" />
          </td>
          <td className="cell-age" data-label="Lectura">
            <ReadingAge pulso={row.pulso} spo2={row.spo2} now={now} />
          </td>
        </>
      )}
    </tr>
  );
}

export function Dispositivos() {
  const rows = useDeviceSummaries();
  const telemetry = useTelemetry();
  const now = useReferenceNow();
  const known = telemetry.lastSuccessAt !== null;
  const unassigned = rows.filter((row) => !row.person).length;

  return (
    <>
      <PageHeader
        eyebrow="Tu red"
        title="Dispositivos"
        subtitle={
          <p>
            {known || rows.length > 0
              ? `${rows.length} ${rows.length === 1 ? 'dispositivo' : 'dispositivos'}${rows.length > 0 ? `, ${unassigned} sin persona asignada` : ''}`
              : telemetry.status === 'loading'
                ? 'Cargando dispositivos…'
                : 'Sin datos de dispositivos'}
          </p>
        }
      >
        <button type="button" className="btn btn--outline" onClick={telemetry.refresh}>
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </PageHeader>

      {telemetry.status === 'unreachable' ? (
        <div className="notice notice--problem" role="alert">
          <div className="notice-body">
            <h2 className="notice-title">No se pudo conectar con el servidor</h2>
            <p>
              {telemetry.error}{' '}
              {telemetry.lastSuccessAt
                ? `Lo que ves abajo es lo último que se cargó (${timeAgo(new Date(telemetry.lastSuccessAt).toISOString(), Date.now())}).`
                : 'Todavía no hay datos para mostrar.'}
            </p>
          </div>
          <button type="button" className="btn btn--outline" onClick={telemetry.refresh}>
            Reintentar ahora
          </button>
        </div>
      ) : null}

      <section className="panel" aria-labelledby="lista">
        <PanelHead
          id="lista"
          kicker="Tu red"
          title="Dispositivos"
          count={known ? rows.length : undefined}
          note="Los que reportan al servidor y los asignados a una persona que todavía no han reportado."
        />
        {telemetry.status === 'loading' && rows.length === 0 ? (
          <p className="panel-empty" role="status">
            Cargando datos del servidor…
          </p>
        ) : rows.length === 0 && !known ? (
          <p className="panel-empty">Sin conexión con el servidor no se puede saber qué dispositivos hay. Se volverá a intentar solo.</p>
        ) : rows.length === 0 ? (
          <p className="panel-empty">Ningún dispositivo ha reportado todavía. Cuando uno envíe su primer reporte aparecerá aquí, y podrás asignarlo a una persona.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table devices-table">
              <caption className="visually-hidden">Dispositivos, los que necesitan atención primero</caption>
              <thead>
                <tr>
                  <th scope="col">Dispositivo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Último reporte</th>
                  <th scope="col">Persona</th>
                  <th scope="col" className="num">
                    Pulso <span className="unit-head">lpm</span>
                  </th>
                  <th scope="col" className="num">
                    SpO2 <span className="unit-head">%</span>
                  </th>
                  <th scope="col">Lectura</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row key={row.id} row={row} now={now} known={known} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
