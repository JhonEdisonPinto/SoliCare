import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  HeartPulse,
  Plus,
  ShieldCheck,
  Siren,
  UserX,
  UsersRound,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FallPanel } from '../components/FallPanel';
import { PageHeader } from '../components/PageHeader';
import { PanelHead } from '../components/PanelHead';
import { StatusPillFor } from '../components/StatusPill';
import { useToast } from '../components/Toast';
import { useAlertActions } from '../components/useAlertActions';
import { VitalsCard } from '../components/VitalsCard';
import { recentActivity, responseStats, type ActivityKind } from '../data/dashboard';
import { useAlerts, useCare, useDeviceSummaries, useNow, usePeopleSummary, useReferenceNow, useSimulation, useTelemetry } from '../data/hooks';
import { simulationCandidates, type SimulationCategory, type TelegramOutcome } from '../data/simulation';
import type { PersonSummary } from '../data/summary';
import type { Alert, Person } from '../data/types';
import { avatarTone, initials } from '../lib/people';
import { formatDuration, formatFull, formatWhen, timeAgo } from '../lib/time';

const dateLine = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function greeting(date: Date): string {
  const hour = date.getHours();
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Alerts the person closed with the banner's cross, for this visit only (a reload shows them again). */
const dismissedAlerts = new Set<string>();

/** Loading, unreachable and no-devices states, printed as a card under the greeting. */
function ConnectionNotice() {
  const { status, error, lastSuccessAt, source, refresh, devices } = useTelemetry();
  const { settings } = useCare();
  const now = useNow();
  if (status === 'loading') {
    return (
      <div className="notice" role="status">
        <p>Cargando datos del servidor…</p>
      </div>
    );
  }
  if (status === 'unreachable') {
    const since = lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null;
    return (
      <div className="notice notice--problem" role="alert">
        <span className="notice-icon" aria-hidden="true">
          <WifiOff size={20} />
        </span>
        <div className="notice-body">
          <h2 className="notice-title">No se pudo conectar con el servidor</h2>
          <p>
            {error}{' '}
            {since ? `Lo que ves abajo son los datos de las ${formatWhen(since, now)} (${timeAgo(since, now)}).` : 'Todavía no hay datos para mostrar.'}
          </p>
          <p>
            El panel vuelve a intentarlo cada {settings.pollIntervalSeconds} s. Revisa tu conexión a internet o confirma que el servidor de SoliCare esté
            encendido ({source.origin}).
          </p>
        </div>
        <button type="button" className="btn btn--outline" onClick={refresh}>
          Reintentar ahora
        </button>
      </div>
    );
  }
  if (devices.length === 0) {
    return (
      <div className="notice">
        <span className="notice-icon" aria-hidden="true">
          <Wifi size={20} />
        </span>
        <div className="notice-body">
          <h2 className="notice-title">Ningún dispositivo ha reportado todavía</h2>
          <p>El servidor está en línea, pero aún no ha recibido lecturas. Cuando un dispositivo envíe su primer reporte aparecerá aquí.</p>
        </div>
      </div>
    );
  }
  return null;
}

/** The most urgent open alert, with its real action. It can be closed for this visit. */
function AlertBanner({ alert, others, onDismiss, now }: { alert: Alert; others: number; onDismiss: () => void; now: number }) {
  const { people } = useCare();
  const act = useAlertActions(alert);
  const person: Person | undefined = alert.personId ? people.find((item) => item.id === alert.personId) : undefined;
  const isFall = alert.kind === 'caida';
  const pending = alert.state === 'pendiente';
  const name = person ? person.name : `el dispositivo ${alert.deviceId}`;
  const subject = `${isFall ? 'caída' : 'sin reporte'} de ${person ? person.name : `Dispositivo ${alert.deviceId}`}`;

  let title: string;
  let message: ReactNode;
  if (isFall) {
    title = pending ? 'Caída sin atender' : 'Caída atendida, falta resolverla';
    message = (
      <>
        {alert.simulated ? 'Simulación: ' : null}
        <b>{name}</b> tuvo una caída {timeAgo(alert.at, now)}.
      </>
    );
  } else {
    title = alert.simulated ? 'Persona sin señales' : 'Revisa una conexión';
    message = alert.simulated ? (
      <>
        Simulación: <b>{name}</b> no da señales de actividad.
      </>
    ) : (
      <>
        El dispositivo de <b>{person ? person.name : alert.deviceId}</b> no reporta datos {timeAgo(alert.at, now).replace('hace', 'desde hace')}.
      </>
    );
  }

  return (
    <section className={`alert-banner${isFall ? ' alert-banner--fall' : ''}`} aria-labelledby="banner-titulo">
      <div className="alert-banner-icon" aria-hidden="true">
        {isFall ? <AlertTriangle size={20} /> : <WifiOff size={20} />}
      </div>
      <div className="alert-banner-copy">
        <h2 id="banner-titulo">{title}</h2>
        <p>{message}</p>
        {others > 0 ? (
          <p className="alert-banner-more">
            <Link to="/alertas">
              {others === 1 ? '1 alerta abierta más' : `${others} alertas abiertas más`}
            </Link>
          </p>
        ) : null}
      </div>
      {alert.simulated ? null : isFall ? (
        <button type="button" className={pending ? 'btn btn--primary' : 'btn btn--outline'} onClick={() => void act(pending ? 'atender' : 'resolver')}>
          {pending ? 'Marcar como atendida' : 'Marcar como resuelta'}
          <span className="visually-hidden">: {subject}</span>
        </button>
      ) : (
        <Link className="btn btn--outline" to={`/dispositivos/${encodeURIComponent(alert.deviceId)}`}>
          Ver dispositivo <ChevronRight size={15} aria-hidden="true" />
          <span className="visually-hidden"> {alert.deviceId}</span>
        </Link>
      )}
      <button type="button" className="close-button" onClick={onDismiss}>
        <X size={17} aria-hidden="true" />
        <span className="visually-hidden">Cerrar aviso</span>
      </button>
    </section>
  );
}

const SIMULATION_TOAST: Record<TelegramOutcome, string> = {
  enviado: 'Simulación en curso: revisa el grupo de Telegram.',
  'sin-configurar': 'Simulación en curso. Telegram no está configurado en el servidor: no se enviaron mensajes.',
  error: 'Simulación en curso, pero Telegram rechazó el mensaje. Revisa el token y el chat del bot.',
  demo: 'Simulación en curso. En modo demostración no se envían mensajes a Telegram.',
  'sin-servidor': 'Simulación en curso solo en este panel: el servidor no respondió y Telegram no recibió avisos.',
  ocupado: 'Ya hay una simulación en curso desde otro panel; Telegram no se avisó otra vez.',
};

const SIMULATE: Record<SimulationCategory, { label: string; icon: LucideIcon; alertKind: Alert['kind'] }> = {
  caida: { label: 'Simular caída', icon: Siren, alertKind: 'caida' },
  ausencia: { label: 'Simular ausencia', icon: UserX, alertKind: 'conexion' },
};

/** Picks a person who is green right now and plays a case of the category; they go back to green on their own. */
function SimulateButton({ rows, category }: { rows: PersonSummary[]; category: SimulationCategory }) {
  const { label, icon: Icon, alertKind } = SIMULATE[category];
  const { active, start } = useSimulation();
  const toast = useToast();
  const run = async () => {
    if (active) return;
    const candidates = simulationCandidates(rows);
    if (candidates.length === 0) {
      toast({ text: 'No hay nadie en verde para simular: hace falta una persona con su dispositivo en línea y sin alertas abiertas.' });
      return;
    }
    const row = candidates[Math.floor(Math.random() * candidates.length)];
    const result = await start(row.person.id, row.person.deviceId as string, category);
    toast({ text: `${result.caseId ? `Caso #${result.caseId}. ` : ''}${SIMULATION_TOAST[result.telegram]}` });
  };
  return (
    // aria-disabled rather than disabled, so keyboard focus stays on the button while the simulation runs.
    <button type="button" className="btn btn--outline" aria-disabled={active !== null} onClick={() => void run()}>
      <Icon size={18} aria-hidden="true" /> {active?.kind === alertKind ? 'Simulación en curso…' : label}
    </button>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: LucideIcon; tone: string }) {
  return (
    <article className="stat-card">
      <div className={`tile tile--${tone}`} aria-hidden="true">
        <Icon size={18} />
      </div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        <small className="stat-detail">{detail}</small>
      </div>
    </article>
  );
}

function PersonRow({ row, now, known }: { row: PersonSummary; now: number; known: boolean }) {
  const { person, device, status } = row;
  const pendingFall = row.openAlerts.some((alert) => alert.kind === 'caida' && alert.state === 'pendiente');
  return (
    <li>
      <Link className="person-row" to={`/personas/${person.id}`}>
        <span className={`person-avatar person-avatar--${avatarTone(person.id)}`} aria-hidden="true">
          {initials(person.name)}
        </span>
        <span className="person-info">
          <strong>{person.name}</strong>
          <span>
            {[person.relation, person.deviceId].filter(Boolean).join(' · ') || 'Sin dispositivo asignado'}
          </span>
        </span>
        <StatusPillFor status={status} lastSeenAt={device?.last_seen_at} known={known} now={now} pendingFall={pendingFall} />
        <ChevronRight size={16} className="row-arrow" aria-hidden="true" />
      </Link>
    </li>
  );
}

const PEOPLE_SHOWN = 6;

function PeopleCard({ rows, unassigned, now, known }: { rows: PersonSummary[]; unassigned: string[]; now: number; known: boolean }) {
  return (
    <section className="panel people-panel" aria-labelledby="red">
      <PanelHead
        id="red"
        kicker="Tu red"
        title="Personas"
        actions={
          <Link className="text-button" to="/personas">
            Ver todas <ChevronRight size={15} aria-hidden="true" />
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="panel-empty">Añade a la persona que quieres acompañar y el dispositivo que usa. Desde ese momento verás aquí su estado.</p>
      ) : (
        <ul className="people-list">
          {rows.slice(0, PEOPLE_SHOWN).map((row) => (
            <PersonRow key={row.person.id} row={row} now={now} known={known} />
          ))}
        </ul>
      )}
      {rows.length > PEOPLE_SHOWN ? (
        <p className="people-more">
          y {rows.length - PEOPLE_SHOWN} {rows.length - PEOPLE_SHOWN === 1 ? 'persona más' : 'personas más'}. <Link to="/personas">Ver todas</Link>
        </p>
      ) : null}
      <Link className="add-person-button" to="/personas?agregar=1">
        <Plus size={16} aria-hidden="true" /> Añadir una persona
      </Link>
      {unassigned.length > 0 ? (
        <div className="unassigned">
          <p className="unassigned-title">
            {unassigned.length === 1 ? 'Un dispositivo reporta sin persona asignada' : `${unassigned.length} dispositivos reportan sin persona asignada`}
          </p>
          <ul>
            {unassigned.map((id) => (
              <li key={id}>
                <span className="device-id">{id}</span>
                <Link to={`/dispositivos/${encodeURIComponent(id)}`}>
                  Asignar a una persona<span className="visually-hidden"> ({id})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const ACTIVITY_ICON: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  lectura: { icon: HeartPulse, tone: 'green' },
  caida: { icon: AlertTriangle, tone: 'coral' },
  'sin-reporte': { icon: WifiOff, tone: 'amber' },
  atendida: { icon: ShieldCheck, tone: 'blue' },
  resuelta: { icon: CheckCircle2, tone: 'green' },
};

function ActivityCard({ now, known }: { now: number; known: boolean }) {
  const { devices } = useTelemetry();
  const { alerts } = useAlerts();
  const { people } = useCare();
  const items = recentActivity({ devices, alerts, people });
  return (
    <section className="panel activity-panel" aria-labelledby="actividad">
      <PanelHead id="actividad" kicker="Últimos eventos" title="Actividad reciente" />
      {items.length === 0 ? (
        <p className="panel-empty">{known ? 'Todavía no hay actividad registrada.' : 'Sin datos todavía.'}</p>
      ) : (
        <ul className="activity-list">
          {items.map((item) => {
            const { icon: Icon, tone } = ACTIVITY_ICON[item.kind];
            return (
              <li className="activity-item" key={item.id}>
                <span className={`tile tile--${tone} tile--sm`} aria-hidden="true">
                  <Icon size={17} />
                </span>
                <span className="activity-copy">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
                <time dateTime={item.at} title={formatFull(item.at)}>
                  {capitalize(timeAgo(item.at, now))}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Resumen() {
  const telemetry = useTelemetry();
  const { open, alerts } = useAlerts();
  const { people } = useCare();
  const summary = usePeopleSummary();
  const devices = useDeviceSummaries();
  const now = useReferenceNow();
  const clock = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setDismissals] = useState(0);
  const known = telemetry.lastSuccessAt !== null;

  const tracked = summary.people.filter((row) => row.person.deviceId);
  const selected = tracked.find((row) => row.person.id === selectedId) ?? tracked[0];
  const banner = open.find((alert) => !dismissedAlerts.has(alert.id));

  const online = devices.filter((device) => device.status === 'en-linea').length;
  const withDevice = people.filter((person) => person.deviceId).length;
  const response = responseStats(alerts, now);

  const today = new Date(clock);
  const updatedIso = telemetry.lastSuccessAt ? new Date(telemetry.lastSuccessAt).toISOString() : null;

  return (
    <>
      <PageHeader
        eyebrow={dateLine.format(today)}
        title={
          <>
            {greeting(today)}, Jhon <span className="spark" aria-hidden="true">✦</span>
          </>
        }
        documentTitle="Resumen"
        subtitle={
          <>
            <p>Este es el estado de tu red de cuidado.</p>
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
              {' · '}
              <button type="button" className="text-button" onClick={telemetry.refresh}>
                Actualizar
              </button>
            </p>
          </>
        }
      >
        <SimulateButton rows={summary.people} category="caida" />
        <SimulateButton rows={summary.people} category="ausencia" />
        <Link className="btn btn--primary" to="/personas?agregar=1">
          <Plus size={18} aria-hidden="true" /> Añadir persona
        </Link>
      </PageHeader>

      <ConnectionNotice />

      {banner ? (
        <AlertBanner
          key={banner.id}
          alert={banner}
          others={open.length - 1}
          now={clock}
          onDismiss={() => {
            dismissedAlerts.add(banner.id);
            setDismissals((count) => count + 1);
          }}
        />
      ) : null}

      <section className="stats-grid" aria-label="Indicadores">
        <StatCard
          label="Personas monitoreadas"
          value={String(people.length)}
          detail={people.length === 0 ? 'Todavía no hay personas' : `${withDevice} con dispositivo asignado`}
          icon={UsersRound}
          tone="purple"
        />
        <StatCard
          label="Dispositivos conectados"
          value={known ? `${online} / ${devices.length}` : 'Sin datos'}
          detail={!known ? 'Esperando al servidor' : devices.length === 0 ? 'Ningún dispositivo todavía' : `${Math.round((online / devices.length) * 100)}% en línea`}
          icon={Wifi}
          tone="green"
        />
        <StatCard
          label="Alertas atendidas"
          value={String(response.attended)}
          detail="Últimos 30 días"
          icon={ShieldCheck}
          tone="blue"
        />
        <StatCard
          label="Tiempo de respuesta"
          value={response.meanResponseMs === null ? 'Sin datos' : formatDuration(response.meanResponseMs)}
          detail={response.meanResponseMs === null ? 'Aún no atiendes alertas' : 'Promedio, últimos 30 días'}
          icon={Clock3}
          tone="amber"
        />
      </section>

      <div className="dashboard-grid">
        <VitalsCard rows={tracked} selected={selected} onSelect={setSelectedId} now={now} />
        <PeopleCard rows={summary.people} unassigned={summary.unassigned.map((device) => device.device_id)} now={now} known={known} />
      </div>

      <FallPanel row={selected} now={now} />

      <ActivityCard now={clock} known={known} />
    </>
  );
}

