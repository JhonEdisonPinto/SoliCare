import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AlertItem } from '../components/AlertItem';
import { PageHeader } from '../components/PageHeader';
import { ReportStrip } from '../components/ReportStrip';
import { StatusMark } from '../components/StatusMark';
import { VitalReadout } from '../components/VitalReadout';
import { SUMMARY_READING_LIMIT, useAlerts, useCare, useNow, usePeopleSummary, useReferenceNow, useTelemetry } from '../data/hooks';
import type { PersonSummary } from '../data/summary';
import type { Alert } from '../data/types';
import { formatFull, formatWhen, timeAgo } from '../lib/time';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** The one-sentence summary that replaces KPI tiles. Every number is counted from data. */
function summarySentence(people: PersonSummary[], open: Alert[], hasData: boolean): string {
  if (people.length === 0) return 'Aún no hay personas registradas en este panel.';
  const head = `${plural(people.length, 'persona', 'personas')} en seguimiento.`;
  if (!hasData) return head;
  const pendingFalls = open.filter((alert) => alert.kind === 'caida' && alert.state === 'pendiente').length;
  const handledFalls = open.filter((alert) => alert.kind === 'caida' && alert.state === 'atendida').length;
  const silent = people.filter((row) => row.status === 'sin-reporte').length;
  const never = people.filter((row) => row.status === 'nunca').length;
  const noDevice = people.filter((row) => row.status === 'sin-dispositivo').length;
  const issues: string[] = [];
  if (pendingFalls) issues.push(plural(pendingFalls, 'caída sin atender', 'caídas sin atender'));
  if (handledFalls) issues.push(plural(handledFalls, 'caída atendida sin resolver', 'caídas atendidas sin resolver'));
  if (silent) issues.push(plural(silent, 'dispositivo sin reporte reciente', 'dispositivos sin reporte reciente'));
  if (never) issues.push(plural(never, 'dispositivo sin datos todavía', 'dispositivos sin datos todavía'));
  if (noDevice) issues.push(plural(noDevice, 'persona sin dispositivo asignado', 'personas sin dispositivo asignado'));
  if (issues.length === 0) return `${head} Todos sus dispositivos están en línea.`;
  const sentence = joinSpanish(issues);
  return `${head} ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function ConnectionNotice() {
  const { status, error, lastSuccessAt, source, refresh, devices } = useTelemetry();
  const { settings } = useCare();
  const now = useNow();
  if (status === 'loading') {
    return (
      <div className="notice notice--loading" role="status">
        <p>Cargando datos del servidor…</p>
      </div>
    );
  }
  if (status === 'unreachable') {
    const since = lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null;
    return (
      <div className="notice notice--problem" role="alert">
        <h2 className="notice-title">No se pudo conectar con el servidor</h2>
        <p>
          {error} {since ? `Lo que ve abajo son los datos de ${timeAgo(since, now)} (${formatWhen(since, now)}).` : 'Todavía no hay datos para mostrar.'}
        </p>
        <p>
          El panel vuelve a intentarlo cada {settings.pollIntervalSeconds} s. Revise su conexión a internet o confirme que el servidor de
          SoliCare esté encendido ({source.origin}).
        </p>
        <button type="button" className="button button--secondary" onClick={refresh}>
          Reintentar ahora
        </button>
      </div>
    );
  }
  if (devices.length === 0) {
    return (
      <div className="notice">
        <h2 className="notice-title">Ningún dispositivo ha reportado todavía</h2>
        <p>El servidor está en línea, pero aún no ha recibido lecturas. Cuando un dispositivo envíe su primer reporte aparecerá aquí.</p>
      </div>
    );
  }
  return null;
}

/** Both vitals; when they come from the same reading, its age is shown once below them. */
function PersonVitals({ row, now }: { row: PersonSummary; now: number }) {
  const shared = row.pulso && row.spo2 && row.pulso.at === row.spo2.at ? row.pulso.at : null;
  return (
    <div className="person-vitals">
      <VitalReadout vital={row.pulso} kind="pulso" now={now} showAge={!shared} />
      <VitalReadout vital={row.spo2} kind="spo2" now={now} showAge={!shared} />
      {shared ? (
        <time className="vitals-age" dateTime={shared} title={formatFull(shared)}>
          Lectura de {timeAgo(shared, now)}
        </time>
      ) : null}
    </div>
  );
}

function PersonRow({ row, now, known }: { row: PersonSummary; now: number; known: boolean }) {
  const { person, device, status } = row;
  let statusNode;
  if (status === 'sin-dispositivo') statusNode = <StatusMark kind="sin-dispositivo" />;
  else if (!known) statusNode = <StatusMark kind="desconocido" />;
  else if (status === 'nunca') statusNode = <StatusMark kind="nunca" />;
  else
    statusNode = (
      <StatusMark
        kind={status}
        detail={status === 'sin-reporte' && device ? `(último ${timeAgo(device.last_seen_at, now)})` : undefined}
      />
    );

  return (
    <li className={`person-row person-row--rank-${row.rank}`}>
      <div className="person-id">
        <Link className="person-name" to={`/personas/${person.id}`}>
          {person.name}
        </Link>
        <span className="person-sub">
          {person.relation ? <span>{person.relation}</span> : null}
          {person.deviceId ? <span>Dispositivo {person.deviceId}</span> : null}
        </span>
      </div>
      <div className="person-status">{statusNode}</div>
      {status === 'sin-dispositivo' ? (
        <p className="person-hint">
          Asigne un dispositivo para empezar el seguimiento. <Link to={`/personas/${person.id}`}>Asignar dispositivo</Link>
        </p>
      ) : known && status === 'nunca' ? (
        <p className="person-hint">
          El servidor no ha recibido reportes de {person.deviceId}. Revise que esté encendido y conectado a internet.{' '}
          <Link to={`/dispositivos/${encodeURIComponent(person.deviceId ?? '')}`}>Ver dispositivo</Link>
        </p>
      ) : device ? (
        <>
          <PersonVitals row={row} now={now} />
          <div className="person-strip">
            <ReportStrip readings={row.readings} now={now} limit={SUMMARY_READING_LIMIT} />
          </div>
        </>
      ) : null}
    </li>
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
  const updatedIso = telemetry.lastSuccessAt ? new Date(telemetry.lastSuccessAt).toISOString() : null;

  return (
    <>
      <PageHeader title="Resumen">
        <p className="updated">
          {updatedIso ? (
            <>
              Actualizado{' '}
              <time dateTime={updatedIso} title={formatFull(updatedIso)}>
                {timeAgo(updatedIso, clock)}
              </time>
            </>
          ) : (
            'Sin actualizar todavía'
          )}
        </p>
        <button type="button" className="button button--quiet" onClick={telemetry.refresh}>
          <RefreshCw aria-hidden="true" className="icon" />
          Actualizar ahora
        </button>
      </PageHeader>

      <p className="lede">{summarySentence(summary.people, open, hasData)}</p>

      <ConnectionNotice />

      {open.length > 0 ? (
        <section className="section" aria-labelledby="atencion">
          <h2 id="atencion" className="section-title">
            Requiere atención
          </h2>
          <ul className="alert-list">
            {open.map((alert) => (
              <AlertItem key={alert.id} alert={alert} person={alert.personId ? personById.get(alert.personId) : undefined} now={clock} />
            ))}
          </ul>
        </section>
      ) : hasData && people.length > 0 ? (
        <p className="all-clear">No hay alertas abiertas.</p>
      ) : null}

      <section className="section" aria-labelledby="personas">
        <h2 id="personas" className="section-title">
          Personas
        </h2>
        {summary.people.length === 0 ? (
          <div className="notice">
            <p>Agregue a la persona que quiere acompañar y el dispositivo que usa. Desde ese momento verá aquí su estado.</p>
            <p>
              <Link to="/personas">Ir a Personas</Link>
            </p>
          </div>
        ) : (
          <ul className="people-list">
            {summary.people.map((row) => (
              <PersonRow key={row.person.id} row={row} now={now} known={hasData} />
            ))}
          </ul>
        )}
      </section>

      {summary.unassigned.length > 0 ? (
        <section className="section" aria-labelledby="sin-asignar">
          <h2 id="sin-asignar" className="section-title">
            Dispositivos sin persona asignada
          </h2>
          <div className="panel">
            <p className="panel-intro">El servidor recibe reportes de estos dispositivos, pero ninguna persona del panel los tiene asignados.</p>
            <ul className="device-list">
              {summary.unassigned.map((device) => (
                <li key={device.device_id}>
                  <Link to={`/dispositivos/${encodeURIComponent(device.device_id)}`}>{device.device_id}</Link>
                  <span className="device-seen">
                    Último reporte{' '}
                    <time dateTime={device.last_seen_at} title={formatFull(device.last_seen_at)}>
                      {timeAgo(device.last_seen_at, now)}
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <p className="footnote">
        El pulso y la saturación de oxígeno (SpO2) son señales de seguimiento. Esta información no reemplaza una valoración médica ni la
        línea de emergencias.
      </p>
    </>
  );
}
