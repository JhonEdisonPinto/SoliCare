import { useEffect, useRef, useState } from 'react';
import { Bell, FlaskConical, House, Menu, Settings, UsersRound, Watch, X } from 'lucide-react';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useAlerts, useCare, useNow, useTelemetry } from '../data/hooks';
import { timeAgo } from '../lib/time';

function BrandMark() {
  // A house with one lit window: someone is keeping watch.
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M4 13.5 14 5l10 8.5V24H4z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="11" y="14" width="6" height="6" rx="1" className="brand-window" />
    </svg>
  );
}

function ServerStatus() {
  const { status, lastSuccessAt, source } = useTelemetry();
  const now = useNow();
  if (source.kind === 'demo') return <p className="server-status">Datos simulados en este navegador.</p>;
  if (status === 'loading') return <p className="server-status">Conectando con el servidor…</p>;
  if (status === 'unreachable') {
    return (
      <p className="server-status server-status--down">
        Sin conexión con el servidor.
        {lastSuccessAt ? ` Último dato ${timeAgo(new Date(lastSuccessAt).toISOString(), now)}.` : ''}
      </p>
    );
  }
  return <p className="server-status">Servidor conectado.</p>;
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
  { to: '/', label: 'Resumen', icon: House, end: true },
  { to: '/personas', label: 'Personas', icon: UsersRound },
  { to: '/dispositivos', label: 'Dispositivos', icon: Watch },
  { to: '/alertas', label: 'Alertas', icon: Bell },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
] as const;

export function Shell() {
  const { pendingCount } = useAlerts();
  const { source } = useTelemetry();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    setMenuOpen(false);
    // After client-side navigation, move focus to the new content so screen readers start there.
    if (firstRender.current) firstRender.current = false;
    else main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="shell-header">
        <div className="rail">
          <div className="shell-header-row">
            <NavLink to="/" className="brand" end>
              <BrandMark />
              <span>SoliCare</span>
            </NavLink>
            <button
              ref={menuButton}
              type="button"
              className="menu-button"
              aria-expanded={menuOpen}
              aria-controls="menu-principal"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" className="icon" /> : <Menu aria-hidden="true" className="icon" />}
              <span>Menú</span>
              {pendingCount > 0 ? <span className="count-badge">{pendingCount}</span> : null}
            </button>
          </div>
          <nav className="shell-nav" aria-label="Principal" data-open={menuOpen}>
            <ul className="nav-list" id="menu-principal">
              {NAV.map(({ to, label, icon: Icon, ...rest }) => (
                <li key={to}>
                  <NavLink to={to} end={'end' in rest} className="nav-link">
                    <Icon aria-hidden="true" className="icon" />
                    <span>{label}</span>
                    {to === '/alertas' && pendingCount > 0 ? (
                      <span className="count-badge">
                        {pendingCount}
                        <span className="visually-hidden"> {pendingCount === 1 ? 'pendiente' : 'pendientes'}</span>
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="shell-foot">
            <ServerStatus />
          </div>
        </div>
      </header>
      <main id="contenido" ref={main} className="shell-main" tabIndex={-1}>
        {source.kind === 'demo' ? (
          <p className="demo-strip">
            <FlaskConical aria-hidden="true" className="icon" />
            <span>
              <strong>Modo demostración.</strong> Las personas, los dispositivos y las lecturas son simulados.
            </span>
          </p>
        ) : null}
        <div className="page">
          <Outlet />
        </div>
      </main>
      <FallAnnouncer />
      <ScrollRestoration />
    </div>
  );
}
