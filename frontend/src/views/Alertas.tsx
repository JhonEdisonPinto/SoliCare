import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertItem } from '../components/AlertItem';
import { SelectField } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { PanelHead } from '../components/PanelHead';
import { Pill } from '../components/Pill';
import { useAlerts, useCare, useNow, useTelemetry } from '../data/hooks';
import type { AlertKind, AlertState } from '../data/types';

const PAGE = 50;
const STATES: AlertState[] = ['pendiente', 'atendida', 'resuelta'];
const KINDS: AlertKind[] = ['caida', 'conexion'];

const parse = <T extends string>(value: string | null, allowed: readonly T[]): T | '' => (allowed.includes(value as T) ? (value as T) : '');

export function Alertas() {
  const { alerts } = useAlerts();
  const { people } = useCare();
  const telemetry = useTelemetry();
  const clock = useNow();
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const results = useRef<HTMLDivElement>(null);

  const state = parse(params.get('estado'), STATES);
  const kind = parse(params.get('tipo'), KINDS);
  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const counts = useMemo(() => {
    const byState: Record<AlertState, number> = { pendiente: 0, atendida: 0, resuelta: 0 };
    for (const alert of alerts) byState[alert.state] += 1;
    return byState;
  }, [alerts]);
  const pendingFall = useMemo(() => alerts.some((alert) => alert.kind === 'caida' && alert.state === 'pendiente'), [alerts]);

  const filtered = useMemo(() => alerts.filter((alert) => (!state || alert.state === state) && (!kind || alert.kind === kind)), [alerts, state, kind]);
  const visible = filtered.slice(0, shown);
  const filtering = state !== '' || kind !== '';

  const setFilter = (name: 'estado' | 'tipo', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  // A row that leaves a filtered list takes keyboard focus with it; hand it to the list instead.
  const keepFocus = () =>
    requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement === null) results.current?.focus();
    });

  return (
    <>
      <PageHeader
        eyebrow="Seguridad"
        title="Alertas"
        subtitle={
          <ul className="tally" aria-label="Conteo de alertas">
            <li>
              <Pill tone={counts.pendiente === 0 ? 'neutral' : pendingFall ? 'danger' : 'warn'}>
                <span className="tally-count">{counts.pendiente}</span> {counts.pendiente === 1 ? 'pendiente' : 'pendientes'}
              </Pill>
            </li>
            <li>
              <Pill tone={counts.atendida === 0 ? 'neutral' : 'info'}>
                <span className="tally-count">{counts.atendida}</span> {counts.atendida === 1 ? 'atendida' : 'atendidas'}
              </Pill>
            </li>
            <li>
              <Pill tone="neutral">
                <span className="tally-count">{counts.resuelta}</span> {counts.resuelta === 1 ? 'resuelta' : 'resueltas'}
              </Pill>
            </li>
          </ul>
        }
      />

      <section className="panel" aria-labelledby="diario">
        <PanelHead
          id="diario"
          kicker="Historial"
          title="Diario de alertas"
          count={telemetry.lastSuccessAt !== null || alerts.length > 0 ? filtered.length : undefined}
          note="Atendida significa que alguien ya actuó; resuelta, que la situación terminó. Una alerta de conexión se resuelve sola cuando el dispositivo vuelve a reportar."
        />

        <search>
          <form className="filters" onSubmit={(event) => event.preventDefault()}>
            <SelectField label="Estado" name="estado" value={state} onChange={(event) => setFilter('estado', event.target.value)}>
              <option value="">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="atendida">Atendidas</option>
              <option value="resuelta">Resueltas</option>
            </SelectField>
            <SelectField label="Tipo" name="tipo" value={kind} onChange={(event) => setFilter('tipo', event.target.value)}>
              <option value="">Todos</option>
              <option value="caida">Caídas</option>
              <option value="conexion">Sin reporte (conexión)</option>
            </SelectField>
            {filtering ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setParams(new URLSearchParams(), { replace: true });
                  setShown(PAGE);
                }}
              >
                Quitar filtros
              </button>
            ) : null}
          </form>
        </search>

        <p className="result-count" role="status">
          {filtered.length === alerts.length
            ? `${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}.`
            : `${filtered.length} de ${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}.`}
        </p>

        <div ref={results} tabIndex={-1} className="results">
          {visible.length > 0 ? (
            <ul className="event-log">
              {visible.map((alert) => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  person={alert.personId ? personById.get(alert.personId) : undefined}
                  now={clock}
                  withNote
                  onActed={keepFocus}
                />
              ))}
            </ul>
          ) : (
            <p className="panel-empty">
              {alerts.length === 0
                ? telemetry.lastSuccessAt === null
                  ? 'Sin datos todavía para revisar alertas.'
                  : 'No se ha detectado ninguna caída ni interrupción en los reportes de los dispositivos.'
                : 'Ninguna alerta coincide con estos filtros.'}
            </p>
          )}
        </div>
        {filtered.length > visible.length ? (
          <div className="block-actions">
            <button type="button" className="btn btn--outline" onClick={() => setShown((value) => value + PAGE)}>
              Mostrar más alertas
            </button>
            <span className="muted">
              Se muestran {visible.length} de {filtered.length}.
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
