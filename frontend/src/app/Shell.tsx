import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { Stamp } from '../components/Stamp';
import { useAlerts, useCare, useNow, useTelemetry } from '../data/hooks';
import { formatFull, formatWhen } from '../lib/time';

/** Where the data comes from, stated in the chrome: simulation, live server, or no connection. */
function SourceStatus() {
  const { status, source } = useTelemetry();
  if (source.kind === 'demo') {
    return (
      <span className="source">
        <span className="source-label">Demostración</span>
        <span className="source-note">
          <span className="visually-hidden">: personas, dispositivos y lecturas </span>
          <span aria-hidden="true">datos </span>simulados
        </span>
      </span>
    );
  }
  if (status === 'unreachable') {
    return (
      <span className="source">
        <Stamp kind="sistema">Sin conexión</Stamp>
        <span className="source-note">con el servidor</span>
      </span>
    );
  }
  return <span className="source source-note">{status === 'loading' ? 'Conectando con el servidor…' : 'Servidor conectado'}</span>;
}

function Clock() {
  const now = useNow();
  const iso = new Date(now).toISOString();
  return (
    <time className="clock" dateTime={iso} title={formatFull(iso)}>
      <span className="visually-hidden">Hora actual: </span>
      {formatWhen(iso, now)}
    </time>
  );
}

/** Announces new falls assertively, once each, after the first load. */
function FallAnnouncer() {
  const { open } = useAlerts();
  const { people } = useCare();
  const { status } = useTelemetry();
  const known = useRef<Set<string> | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    const falls = open.filter((alert) => alert.kind === 'caida' && alert.state === 'pendiente');
    if (known.current === null) {
      known.current = new Set(falls.map((alert) => alert.id));
      return;
    }
    const fresh = falls.filter((alert) => !known.current!.has(alert.id));
    fresh.forEach((alert) => known.current!.add(alert.id));
    if (fresh.length > 0) {
      const names = fresh.map((alert) => people.find((person) => person.deviceId === alert.deviceId)?.name ?? `dispositivo ${alert.deviceId}`);
      setMessage(`Nueva caída detectada: ${names.join(', ')}.`);
    }
  }, [open, people, status]);

  return (
    <div className="visually-hidden" aria-live="assertive">
      {message}
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Resumen', end: true },
  { to: '/personas', label: 'Personas' },
  { to: '/dispositivos', label: 'Dispositivos' },
  { to: '/alertas', label: 'Alertas' },
  { to: '/configuracion', label: 'Configuración' },
] as const;

export function Shell() {
  const { pendingCount } = useAlerts();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    // After client-side navigation, move focus to the new content so screen readers start there.
    if (firstRender.current) firstRender.current = false;
    else main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="console-bar">
        <div className="console-bar-inner">
          <NavLink to="/" className="brand" end>
            SoliCare
          </NavLink>
          <nav className="tabs" aria-label="Principal">
            <ul className="tab-list">
              {NAV.map(({ to, label, ...rest }) => (
                <li key={to}>
                  <NavLink to={to} end={'end' in rest} className="tab">
                    {label}
                    {to === '/alertas' && pendingCount > 0 ? (
                      <span className="tab-count">
                        {pendingCount}
                        <span className="visually-hidden"> {pendingCount === 1 ? 'pendiente' : 'pendientes'}</span>
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="console-meta">
            <SourceStatus />
            <Clock />
          </div>
        </div>
      </header>
      <main id="contenido" ref={main} className="shell-main" tabIndex={-1}>
        <div className="page">
          <Outlet />
        </div>
      </main>
      <FallAnnouncer />
      <ScrollRestoration />
    </div>
  );
}
