import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BlockHead } from '../components/BlockHead';
import { PageHeader } from '../components/PageHeader';
import { PersonForm } from '../components/PersonForm';
import { ReadingAge } from '../components/ReadingAge';
import { StatusMarkFor } from '../components/StatusMark';
import { VitalReadout } from '../components/VitalReadout';
import { useReferenceNow, usePeopleSummary, useTelemetry } from '../data/hooks';
import type { PersonSummary } from '../data/summary';
import type { Alert } from '../data/types';

function OpenAlerts({ alerts }: { alerts: Alert[] }) {
  const falls = alerts.filter((alert) => alert.kind === 'caida');
  const pendingFalls = falls.filter((alert) => alert.state === 'pendiente').length;
  const connection = alerts.filter((alert) => alert.kind === 'conexion').length;
  if (alerts.length === 0) return <span className="muted">Ninguna</span>;
  return (
    <span className="alert-counts">
      {falls.length > 0 ? (
        <span className={pendingFalls > 0 ? 'alert-count alert-count--caida' : 'alert-count'}>
          {falls.length} {falls.length === 1 ? 'caída' : 'caídas'}
          {pendingFalls === 0 ? ', atendida' : pendingFalls < falls.length ? `, ${pendingFalls} sin atender` : ', sin atender'}
        </span>
      ) : null}
      {connection > 0 ? <span className="alert-count">{connection} sin reporte</span> : null}
    </span>
  );
}

function Row({ row, now, known }: { row: PersonSummary; now: number; known: boolean }) {
  const { person, device, status } = row;
  const pendingFall = row.openAlerts.some((alert) => alert.kind === 'caida' && alert.state === 'pendiente');
  const noReadings = status === 'sin-dispositivo' || !known;
  return (
    <tr className={pendingFall ? 'row--caida' : undefined}>
      <th scope="row" className="cell-person">
        <Link className="person-name" to={`/personas/${person.id}`}>
          {person.name}
        </Link>
        {person.relation ? <span className="person-sub">{person.relation}</span> : null}
      </th>
      <td className="cell-status">
        <StatusMarkFor status={status} lastSeenAt={device?.last_seen_at} known={known} now={now} />
      </td>
      <td className="cell-device" data-label="Dispositivo">
        {person.deviceId ? <Link to={`/dispositivos/${encodeURIComponent(person.deviceId)}`}>{person.deviceId}</Link> : <span className="muted">Sin dispositivo</span>}
      </td>
      {noReadings ? (
        <td colSpan={3} className="row-message">
          {status === 'sin-dispositivo' ? (
            <>
              Asigne un dispositivo para empezar el seguimiento. <Link to={`/personas/${person.id}`}>Asignar dispositivo</Link>
            </>
          ) : (
            'Esperando datos del servidor.'
          )}
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
      <td className="cell-alerts" data-label="Alertas abiertas">
        <OpenAlerts alerts={row.openAlerts} />
      </td>
    </tr>
  );
}

export function Personas() {
  const summary = usePeopleSummary();
  const telemetry = useTelemetry();
  const now = useReferenceNow();
  const [adding, setAdding] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);
  const known = telemetry.lastSuccessAt !== null;
  const count = summary.people.length;

  useEffect(() => {
    // Closing the form (saved or cancelled) hands focus back to the key that opened it.
    if (wasAdding.current && !adding) trigger.current?.focus();
    wasAdding.current = adding;
  }, [adding]);

  return (
    <>
      <PageHeader title="Personas">
        <p className="updated">
          {count} {count === 1 ? 'persona en seguimiento' : 'personas en seguimiento'}
        </p>
        <div className="status-line-end">
          <button ref={trigger} type="button" className="key" aria-expanded={adding} aria-controls="agregar-persona" onClick={() => setAdding((value) => !value)}>
            Agregar persona
          </button>
        </div>
      </PageHeader>

      {adding ? (
        <section className="block" id="agregar-persona" aria-labelledby="agregar-titulo">
          <BlockHead id="agregar-titulo" title="Agregar persona" />
          <PersonForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </section>
      ) : null}

      <section className="block" aria-labelledby="lista">
        <BlockHead id="lista" title="Personas" count={count}>
          Ordenadas por urgencia. Pulso y SpO2 (saturación de oxígeno) son señales de seguimiento.
        </BlockHead>
        {count === 0 ? (
          <p className="empty-row">
            Todavía no hay personas. Agregue a quien quiere acompañar y el dispositivo que usa; desde ese momento verá aquí su estado, sus lecturas y
            sus alertas.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table persons-table">
              <caption className="visually-hidden">Personas en seguimiento, ordenadas por urgencia</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Dispositivo</th>
                  <th scope="col" className="num">
                    Pulso <span className="unit-head">lpm</span>
                  </th>
                  <th scope="col" className="num">
                    SpO2 <span className="unit-head">%</span>
                  </th>
                  <th scope="col">Lectura</th>
                  <th scope="col">Alertas abiertas</th>
                </tr>
              </thead>
              <tbody>
                {summary.people.map((row) => (
                  <Row key={row.person.id} row={row} now={now} known={known} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
