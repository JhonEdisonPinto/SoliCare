import { Link } from 'react-router-dom';
import { AlertItem } from '../components/AlertItem';
import { BlockHead } from '../components/BlockHead';
import { PageHeader } from '../components/PageHeader';
import { ReportStrip } from '../components/ReportStrip';
import { Stamp } from '../components/Stamp';
import { StatusMarkFor } from '../components/StatusMark';
import { ReadingAge } from '../components/ReadingAge';
import { VitalReadout } from '../components/VitalReadout';
import { SUMMARY_READING_LIMIT, useAlerts, useCare, useNow, usePeopleSummary, useReferenceNow, useTelemetry } from '../data/hooks';
import type { PersonSummary } from '../data/summary';
import type { Alert } from '../data/types';
import { STRIP_WINDOW_MS } from '../lib/strip';
import { formatFull, formatWhen, timeAgo } from '../lib/time';

type TallyItem = { count: number; label: string; tone?: 'caida' | 'sin-reporte' };

/** The counts in the status line. Every number is counted from data; the core counts show even at zero. */
function tally(people: PersonSummary[], open: Alert[]): TallyItem[] {
  let pendingFalls = 0;
  let handledFalls = 0;
  for (const alert of open) {
    if (alert.kind !== 'caida') continue;
    if (alert.state === 'pendiente') pendingFalls += 1;
    else handledFalls += 1;
  }
  let silent = 0;
  let never = 0;
  let noDevice = 0;
  for (const row of people) {
    if (row.status === 'sin-reporte') silent += 1;
    else if (row.status === 'nunca') never += 1;
    else if (row.status === 'sin-dispositivo') noDevice += 1;
  }
  const items: TallyItem[] = [
    { count: pendingFalls, label: pendingFalls === 1 ? 'caída sin atender' : 'caídas sin atender', tone: 'caida' },
  ];
  if (handledFalls) items.push({ count: handledFalls, label: handledFalls === 1 ? 'caída atendida' : 'caídas atendidas' });
  items.push({ count: silent, label: 'sin reporte reciente', tone: 'sin-reporte' });
  items.push({ count: never, label: 'sin datos todavía' });
  if (noDevice) items.push({ count: noDevice, label: 'sin dispositivo' });
  return items;
}

function StatusLine() {
  const telemetry = useTelemetry();
  const { open } = useAlerts();
  const summary = usePeopleSummary();
  const clock = useNow();
  const hasData = telemetry.lastSuccessAt !== null;
  const updatedIso = telemetry.lastSuccessAt ? new Date(telemetry.lastSuccessAt).toISOString() : null;
  const people = summary.people.length;

  return (
    <PageHeader title="Resumen">
      <ul className="tally" aria-label="Estado general">
        <li className="tally-item">
          <span className="tally-count">{people}</span> {people === 1 ? 'persona' : 'personas'} en seguimiento
        </li>
        {hasData && people > 0
          ? tally(summary.people, open).map((item) => (
              <li key={item.label} className={`tally-item${item.count === 0 ? ' tally-item--zero' : item.tone ? ` tally-item--${item.tone}` : ''}`}>
                <span className="tally-count">{item.count}</span> {item.label}
              </li>
            ))
          : null}
      </ul>
      <div className="status-line-end">
        <p className="updated">
          {updatedIso ? (
            <>
              Actualizado{' '}
              <time dateTime={updatedIso} title={`${formatFull(updatedIso)} (${timeAgo(updatedIso, clock)})`}>
                {formatWhen(updatedIso, clock)}
              </time>
            </>
          ) : (
            'Sin actualizar todavía'
          )}
        </p>
        <button type="button" className="key key--small" onClick={telemetry.refresh}>
          Actualizar
        </button>
      </div>
    </PageHeader>
  );
}

/** Loading, unreachable and no-devices states, printed as a system line above the log. */
function ConnectionNotice() {
  const { status, error, lastSuccessAt, source, refresh, devices } = useTelemetry();
  const { settings } = useCare();
  const now = useNow();
  if (status === 'loading') {
    return (
      <div className="system-row" role="status">
        <p>Cargando datos del servidor…</p>
      </div>
    );
  }
  if (status === 'unreachable') {
    const since = lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null;
    return (
      <div className="system-row system-row--problem" role="alert">
        <span className="system-stamp">
          <Stamp kind="sistema">Sin conexión</Stamp>
        </span>
        <div className="system-body">
          <h2 className="system-title">No se pudo conectar con el servidor</h2>
          <p>
            {error}{' '}
            {since ? `Lo que ve abajo son los datos de las ${formatWhen(since, now)} (${timeAgo(since, now)}).` : 'Todavía no hay datos para mostrar.'}
          </p>
          <p>
            El panel vuelve a intentarlo cada {settings.pollIntervalSeconds} s. Revise su conexión a internet o confirme que el servidor de SoliCare
            esté encendido ({source.origin}).
          </p>
        </div>
        <div className="system-action">
          <button type="button" className="key" onClick={refresh}>
            Reintentar ahora
          </button>
        </div>
      </div>
    );
  }
  if (devices.length === 0) {
    return (
      <div className="system-row">
        <div className="system-body">
          <h2 className="system-title">Ningún dispositivo ha reportado todavía</h2>
          <p>El servidor está en línea, pero aún no ha recibido lecturas. Cuando un dispositivo envíe su primer reporte aparecerá aquí.</p>
        </div>
      </div>
    );
  }
  return null;
}

function PersonRow({ row, now, known }: { row: PersonSummary; now: number; known: boolean }) {
  const { person, device, status } = row;
  const pendingFall = row.openAlerts.some((alert) => alert.kind === 'caida' && alert.state === 'pendiente');
  const handledFall = !pendingFall && row.openAlerts.some((alert) => alert.kind === 'caida');

  let rest;
  if (status === 'sin-dispositivo') {
    rest = (
      <td colSpan={4} className="row-message">
        Asigne un dispositivo para empezar el seguimiento. <Link to={`/personas/${person.id}`}>Asignar dispositivo</Link>
      </td>
    );
  } else if (!known) {
    rest = (
      <td colSpan={4} className="row-message">
        Esperando datos del servidor.
      </td>
    );
  } else if (status === 'nunca' || !device) {
    rest = (
      <td colSpan={4} className="row-message">
        El servidor no ha recibido reportes de {person.deviceId}. Revise que esté encendido y conectado a internet.{' '}
        <Link to={`/dispositivos/${encodeURIComponent(person.deviceId ?? '')}`}>Ver dispositivo</Link>
      </td>
    );
  } else {
    rest = (
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
        <td className="cell-strip">
          <ReportStrip readings={row.readings} now={now} limit={SUMMARY_READING_LIMIT} />
        </td>
      </>
    );
  }

  return (
    <tr className={pendingFall ? 'row--caida' : undefined}>
      <th scope="row" className="cell-person">
        <Link className="person-name" to={`/personas/${person.id}`}>
          {person.name}
        </Link>
        <span className="person-sub">
          {person.relation ? <span>{person.relation}</span> : null}
          {person.deviceId ? (
            <span>
              <span className="visually-hidden">Dispositivo </span>
              {person.deviceId}
            </span>
          ) : null}
        </span>
      </th>
      <td className="cell-status">
        <StatusMarkFor status={status} lastSeenAt={device?.last_seen_at} known={known} now={now} />
        {pendingFall ? <span className="row-flag row-flag--caida">Caída sin atender</span> : null}
        {handledFall ? <span className="row-flag">Caída atendida</span> : null}
      </td>
      {rest}
    </tr>
  );
}

export function Resumen() {
  const telemetry = useTelemetry();
  const { open } = useAlerts();
  const { people } = useCare();
  const summary = usePeopleSummary();
  const now = useReferenceNow();
  const clock = useNow();
  const hasData = telemetry.lastSuccessAt !== null;
  const personById = new Map(people.map((person) => [person.id, person]));
  const windowStartIso = new Date(now - STRIP_WINDOW_MS).toISOString();
  const windowEndIso = new Date(now).toISOString();

  return (
    <>
      <StatusLine />
      <ConnectionNotice />

      <section className="block" aria-labelledby="eventos">
        <BlockHead id="eventos" title="Eventos abiertos" count={hasData ? open.length : undefined} />
        {open.length > 0 ? (
          <ul className="event-log">
            {open.map((alert) => (
              <AlertItem key={alert.id} alert={alert} person={alert.personId ? personById.get(alert.personId) : undefined} now={clock} />
            ))}
          </ul>
        ) : (
          <p className="empty-row">{hasData ? 'No hay alertas abiertas.' : 'Sin datos todavía para revisar alertas.'}</p>
        )}
      </section>

      <section className="block" aria-labelledby="personas">
        <BlockHead id="personas" title="Personas" count={summary.people.length}>
          Ordenadas por urgencia. Pulso y SpO2 (saturación de oxígeno) son señales de seguimiento.
        </BlockHead>
        {summary.people.length === 0 ? (
          <p className="empty-row">
            Agregue a la persona que quiere acompañar y el dispositivo que usa. Desde ese momento verá aquí su estado.{' '}
            <Link to="/personas">Ir a Personas</Link>
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table people-table">
              <caption className="visually-hidden">Personas en seguimiento, ordenadas por urgencia</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">
                    Pulso <span className="unit-head">lpm</span>
                  </th>
                  <th scope="col" className="num">
                    SpO2 <span className="unit-head">%</span>
                  </th>
                  <th scope="col">Lectura</th>
                  <th scope="col" className="col-strip">
                    Reportes, últimas 2 h
                    <span className="axis" aria-hidden="true">
                      <span>{formatWhen(windowStartIso, now)}</span>
                      <span>{formatWhen(windowEndIso, now)}</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.people.map((row) => (
                  <PersonRow key={row.person.id} row={row} now={now} known={hasData} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {summary.unassigned.length > 0 ? (
        <section className="block" aria-labelledby="sin-asignar">
          <BlockHead id="sin-asignar" title="Dispositivos sin persona asignada" count={summary.unassigned.length}>
            El servidor recibe sus reportes, pero ninguna persona del panel los tiene asignados.
          </BlockHead>
          <div className="table-wrap">
            <table className="data-table device-table">
              <caption className="visually-hidden">Dispositivos sin persona asignada</caption>
              <thead>
                <tr>
                  <th scope="col">Dispositivo</th>
                  <th scope="col">Último reporte</th>
                  <th scope="col">
                    <span className="visually-hidden">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.unassigned.map((device) => (
                  <tr key={device.device_id}>
                    <th scope="row" className="device-id">
                      {device.device_id}
                    </th>
                    <td data-label="Último reporte">
                      <time dateTime={device.last_seen_at} title={formatFull(device.last_seen_at)}>
                        {formatWhen(device.last_seen_at, now)} ({timeAgo(device.last_seen_at, now)})
                      </time>
                    </td>
                    <td className="cell-link">
                      <Link to={`/dispositivos/${encodeURIComponent(device.device_id)}`}>
                        Asignar a una persona<span className="visually-hidden"> ({device.device_id})</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="footnote">
        Las señales de seguimiento no son un diagnóstico: no reemplazan una valoración médica ni la línea de emergencias.
      </p>
    </>
  );
}
