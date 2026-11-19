import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertItem } from '../components/AlertItem';
import { BlockHead } from '../components/BlockHead';
import { SelectField } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { Stamp } from '../components/Stamp';
import { StatusMarkFor } from '../components/StatusMark';
import { useToast } from '../components/Toast';
import { VitalReadout } from '../components/VitalReadout';
import { VitalsPanel } from '../components/VitalsPanel';
import { fallAlertId } from '../data/alerts';
import { useAlerts, useCare, useCareActions, useDeviceHistory, useDeviceSummaries, useNow, useReferenceNow, useTelemetry } from '../data/hooks';
import type { Person, Reading } from '../data/types';
import { formatFull, formatReadingTime, formatWhen, timeAgo } from '../lib/time';
import { text, useForm } from '../lib/useForm';

const RECENT = 25;

function PersonAssignment({ deviceId, owner }: { deviceId: string; owner: Person | undefined }) {
  const actions = useCareActions();
  const { people } = useCare();
  const toast = useToast();
  const options = people.filter((person) => !person.deviceId || person.id === owner?.id);
  const { formRef, errors, general, pending, onSubmit, onInput } = useForm(async (data) => {
    const chosen = text(data, 'personId') || null;
    if (chosen === (owner?.id ?? null)) return;
    // One store operation: the previous owner loses the device in the same write that gives it to the new one.
    await actions.assignDevice(deviceId, chosen);
    toast({ text: 'Asignación guardada' });
  });

  if (people.length === 0) {
    return (
      <p className="empty-row">
        Todavía no hay personas en el panel. <Link to="/personas">Agregue una persona</Link> para asignarle este dispositivo.
      </p>
    );
  }
  return (
    <form ref={formRef} className="form form--inline" noValidate onSubmit={onSubmit} onInput={onInput}>
      <SelectField
        label="Persona asignada"
        name="personId"
        key={owner?.id ?? 'none'}
        defaultValue={owner?.id ?? ''}
        error={errors.personId ?? errors.deviceId}
        hint="Solo aparecen personas que todavía no tienen un dispositivo. Para cambiar el de otra persona, hágalo desde su detalle."
      >
        <option value="">Sin persona asignada</option>
        {options.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
            {person.relation ? ` (${person.relation})` : ''}
          </option>
        ))}
      </SelectField>
      {general ? (
        <p className="form-error" role="alert">
          {general}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="key" disabled={pending}>
          Guardar asignación
        </button>
      </div>
    </form>
  );
}

/** A fall in the loaded history that never became an alert (older than anything this browser watched). */
function HistoryFall({ reading, now }: { reading: Reading; now: number }) {
  return (
    <li className="event event--caida event--resuelta">
      <span className="event-stamp">
        <Stamp kind="caida-atendida">Caída</Stamp>
      </span>
      <time className="event-time" dateTime={reading.received_at} title={formatFull(reading.received_at)}>
        {formatWhen(reading.received_at, now)}
      </time>
      <span className="event-age">{timeAgo(reading.received_at, now)}</span>
      <div className="event-detail">
        <p>Lectura de caída anterior al registro de alertas de este navegador: no tiene estado de atención.</p>
      </div>
    </li>
  );
}

function RecentReadings({ readings }: { readings: readonly Reading[] }) {
  const clock = useNow();
  const shown = readings.slice(-RECENT).reverse();
  return (
    <div className="table-wrap">
      <table className="data-table readings-table">
        <caption className="visually-hidden">Lecturas recientes, la más nueva primero</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Tipo</th>
            <th scope="col" className="num">
              Pulso <span className="unit-head">lpm</span>
            </th>
            <th scope="col" className="num">
              SpO2 <span className="unit-head">%</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((reading) => (
            <tr key={reading.received_at + reading.type} className={reading.type === 'caida' ? 'row-fall' : undefined}>
              <th scope="row" className="cell-time">
                <time dateTime={reading.received_at} title={formatFull(reading.received_at)}>
                  {formatReadingTime(reading.received_at, clock)}
                </time>
              </th>
              <td className="cell-kind" data-label="Tipo">
                {reading.type === 'caida' ? <strong className="kind-fall">Caída</strong> : 'Lectura'}
              </td>
              <td className="num cell-pulso" data-label="Pulso">
                <VitalReadout vital={reading.pulso > 0 ? { value: reading.pulso, at: reading.received_at } : null} kind="pulso" />
              </td>
              <td className="num cell-spo2" data-label="SpO2">
                <VitalReadout vital={reading.spo2 > 0 ? { value: reading.spo2, at: reading.received_at } : null} kind="spo2" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DispositivoDetail() {
  const { deviceId = '' } = useParams();
  const rows = useDeviceSummaries();
  const telemetry = useTelemetry();
  const { alerts } = useAlerts();
  const { people } = useCare();
  const now = useReferenceNow();
  const clock = useNow();
  const [limit, setLimit] = useState(300);
  const history = useDeviceHistory(deviceId, limit);
  const row = rows.find((item) => item.id === deviceId);
  const known = telemetry.lastSuccessAt !== null;

  if (!row) {
    return (
      <>
        <p className="crumb">
          <Link to="/dispositivos">Todos los dispositivos</Link>
        </p>
        <PageHeader title={`Dispositivo ${deviceId}`} />
        <p className="empty-row">
          {known
            ? 'El servidor no conoce este dispositivo y ninguna persona lo tiene asignado. '
            : 'Esperando datos del servidor para comprobar este dispositivo. '}
          <Link to="/dispositivos">Ver todos los dispositivos</Link>
        </p>
      </>
    );
  }

  const { device, person } = row;
  const falls = alerts.filter((alert) => alert.deviceId === deviceId && alert.kind === 'caida');
  // The chart can show more readings than the alerts were derived from: list the falls it shows too.
  const alertIds = new Set(falls.map((alert) => alert.id));
  const olderFalls = history.readings
    .filter((reading) => reading.type === 'caida' && !alertIds.has(fallAlertId(deviceId, reading.received_at)))
    .reverse();
  const fallCount = falls.length + olderFalls.length;

  return (
    <>
      <p className="crumb">
        <Link to="/dispositivos">Todos los dispositivos</Link>
      </p>
      <PageHeader title={`Dispositivo ${row.id}`}>
        <div className="status-line-end">
          <button type="button" className="key key--small" onClick={history.refresh}>
            Actualizar
          </button>
        </div>
      </PageHeader>

      <section className="block" aria-labelledby="estado">
        <BlockHead id="estado" title="Estado y asignación" />
        <dl className="facts">
          <div className="fact">
            <dt>Estado</dt>
            <dd>
              <StatusMarkFor status={row.status} lastSeenAt={device?.last_seen_at} known={known} now={now} />
            </dd>
          </div>
          <div className="fact">
            <dt>Último reporte</dt>
            <dd>
              {device ? (
                <time dateTime={device.last_seen_at} title={formatFull(device.last_seen_at)}>
                  {formatWhen(device.last_seen_at, clock)} ({timeAgo(device.last_seen_at, now)})
                </time>
              ) : (
                <span className="muted">El servidor no ha recibido reportes de este dispositivo. Revise que esté encendido y conectado a internet.</span>
              )}
            </dd>
          </div>
          <div className="fact">
            <dt>Persona</dt>
            <dd>{person ? <Link to={`/personas/${person.id}`}>{person.name}</Link> : <span className="muted">Sin persona asignada</span>}</dd>
          </div>
        </dl>
        <PersonAssignment deviceId={row.id} owner={person} />
      </section>

      <section className="block" aria-labelledby="senales">
        <BlockHead id="senales" title="Pulso y SpO2" />
        <VitalsPanel history={history} limit={limit} onLimitChange={setLimit} />
      </section>

      <section className="block" aria-labelledby="lecturas">
        <BlockHead id="lecturas" title="Lecturas recientes" count={history.readings.length > 0 ? Math.min(RECENT, history.readings.length) : undefined}>
          Una lectura sin valor válido se muestra como «Sin lectura válida», nunca como 0.
        </BlockHead>
        {history.readings.length > 0 ? (
          <RecentReadings readings={history.readings} />
        ) : (
          <p className="empty-row">{history.status === 'loading' ? 'Cargando lecturas…' : 'No hay lecturas para mostrar.'}</p>
        )}
      </section>

      <section className="block" aria-labelledby="caidas">
        <BlockHead id="caidas" title="Caídas detectadas" count={fallCount} />
        {fallCount > 0 ? (
          <ul className="event-log">
            {falls.map((alert) => (
              <AlertItem key={alert.id} alert={alert} person={alert.personId ? people.find((item) => item.id === alert.personId) : undefined} now={clock} />
            ))}
            {olderFalls.map((reading) => (
              <HistoryFall key={reading.received_at} reading={reading} now={clock} />
            ))}
          </ul>
        ) : (
          <p className="empty-row">Este dispositivo no ha registrado caídas.</p>
        )}
      </section>
    </>
  );
}
