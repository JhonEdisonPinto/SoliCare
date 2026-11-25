import { Bell, ChevronRight, HeartPulse, LayoutDashboard, Menu, PanelLeftClose, Settings, Smartphone, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { DATA_MODE, switchDataMode } from '../data/dataMode';
import { useAlerts, useCare, useTelemetry } from '../data/hooks';

/** Where the data comes from, stated in the top bar: simulation, live server, or no connection. */
function SourceStatus() {
  const { status, source } = useTelemetry();
  let tone = 'ok';
  let long = 'Servidor conectado';
  let short = 'Conectado';
  if (source.kind === 'demo') {
    tone = 'demo';
    long = 'Modo demostración · datos simulados';
    short = 'Demostración';
  } else if (status === 'unreachable') {
    tone = 'bad';
    long = 'Sin conexión con el servidor';
    short = 'Sin conexión';
  } else if (status === 'loading') {
    tone = 'wait';
    long = 'Conectando con el servidor…';
    short = 'Conectando…';
  }
  return (
    <div className={`connection-status connection-status--${tone}`}>
      <span className="pulse-dot" aria-hidden="true" />
      <span className="status-long">{long}</span>
      <span className="status-short">{short}</span>
    </div>
  );
}

/** "Datos reales": off shows the simulation, on shows what the devices send to the server. Changing it reloads the page. */
function DataModeSwitch() {
  const live = DATA_MODE === 'live';
  return (
    <button type="button" role="switch" aria-checked={live} className="data-switch" onClick={() => switchDataMode(live ? 'demo' : 'live')}>
      <span className="data-switch-track" aria-hidden="true">
        <span className="data-switch-thumb" />
      </span>
      <span className="data-switch-label">Datos reales</span>
    </button>
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
      const names = fresh.map((alert) => people.find((person) => person.id === alert.personId)?.name ?? `dispositivo ${alert.deviceId}`);
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
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/personas', label: 'Personas', icon: UsersRound },
  { to: '/dispositivos', label: 'Dispositivos', icon: Smartphone },
  { to: '/alertas', label: 'Alertas', icon: Bell },
] as const;

type Crumb = { label: string; to?: string };

/** "Panel › Personas › Rosa Elena Pérez": where the current page sits. */
function useCrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const { people } = useCare();
  const [section, id] = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!section) return [{ label: 'Resumen' }];
  if (section === 'personas') {
    const name = id ? (people.find((person) => person.id === id)?.name ?? 'Persona no encontrada') : null;
    return name ? [{ label: 'Personas', to: '/personas' }, { label: name }] : [{ label: 'Personas' }];
  }
  if (section === 'dispositivos') return id ? [{ label: 'Dispositivos', to: '/dispositivos' }, { label: id }] : [{ label: 'Dispositivos' }];
  if (section === 'alertas') return [{ label: 'Alertas' }];
  if (section === 'configuracion') return [{ label: 'Configuración' }];
  return [{ label: 'Página no encontrada' }];
}

export function Shell() {
  const { pendingCount } = useAlerts();
  const location = useLocation();
  const crumbs = useCrumbs();
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const shownPath = useRef(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // After client-side navigation, move focus to the new content so screen readers start there.
    // Comparing paths (instead of a "first run" flag) keeps the initial load untouched even when
    // StrictMode runs the effect twice in development.
    if (shownPath.current === location.pathname) return;
    shownPath.current = location.pathname;
    setMenuOpen(false);
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    // The mobile menu is a drawer: Esc closes it and focus goes back to the button that opened it.
    if (!menuOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const bellLabel = pendingCount > 0 ? `Alertas pendientes: ${pendingCount}` : 'Sin alertas pendientes';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <aside id="menu" className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        <div className="brand">
          <NavLink to="/" end className="brand-link">
            <span className="brand-mark" aria-hidden="true">
              <HeartPulse size={21} strokeWidth={2.5} />
            </span>
            <span>SoliCare</span>
          </NavLink>
          <button
            ref={closeButton}
            type="button"
            className="sidebar-close"
            onClick={() => {
              setMenuOpen(false);
              menuButton.current?.focus();
            }}
          >
            <PanelLeftClose size={18} aria-hidden="true" />
            <span className="visually-hidden">Cerrar menú</span>
          </button>
        </div>

        <div className="workspace-label">
          <span className="workspace-avatar" aria-hidden="true">
            FC
          </span>
          <div>
            <strong>Familia Cuidado</strong>
            <span>Cuenta familiar</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Principal">
          <p className="nav-heading">Panel</p>
          <ul>
            {NAV.map(({ to, label, icon: Icon, ...rest }) => (
              <li key={to}>
                <NavLink to={to} end={'end' in rest} className="nav-item">
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                  {to === '/alertas' && pendingCount > 0 ? (
                    <span className="nav-count">
                      {pendingCount}
                      <span className="visually-hidden"> {pendingCount === 1 ? 'pendiente' : 'pendientes'}</span>
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="nav-heading nav-heading--spaced">Administración</p>
          <ul>
            <li>
              <NavLink to="/configuracion" className="nav-item">
                <Settings size={18} aria-hidden="true" />
                <span>Configuración</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile">
            <span className="profile-avatar" aria-hidden="true">
              JP
            </span>
            <div className="profile-copy">
              <strong>Jhon Edison</strong>
              <span>Administrador</span>
            </div>
          </div>
        </div>
      </aside>
      {menuOpen ? <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} /> : null}

      <div className="main-content">
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="menu-button"
            aria-expanded={menuOpen}
            aria-controls="menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={21} aria-hidden="true" />
            <span className="visually-hidden">Abrir menú</span>
          </button>
          <nav className="breadcrumb" aria-label="Ruta de navegación">
            <ol>
              <li className="crumb-root">
                <span>Panel</span>
                <ChevronRight size={14} aria-hidden="true" />
              </li>
              {crumbs.map((crumb, index) => (
                <li key={crumb.label} className={index === crumbs.length - 1 ? 'crumb-current' : undefined}>
                  {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <strong aria-current="page">{crumb.label}</strong>}
                  {index < crumbs.length - 1 ? <ChevronRight size={14} aria-hidden="true" /> : null}
                </li>
              ))}
            </ol>
          </nav>
          <div className="topbar-actions">
            <SourceStatus />
            <DataModeSwitch />
            <Link to="/alertas" className="icon-button" aria-label={bellLabel}>
              <Bell size={19} aria-hidden="true" />
              {pendingCount > 0 ? <span className="bell-dot" aria-hidden="true" /> : null}
            </Link>
            <span className="topbar-avatar" aria-hidden="true">
              JP
            </span>
          </div>
        </header>
        <main id="contenido" ref={main} className="shell-main" tabIndex={-1}>
          <div className="content-wrap">
            <Outlet />
          </div>
        </main>
        <footer className="shell-footer">
          <p>Las señales de seguimiento no son un diagnóstico: no reemplazan una valoración médica ni la línea de emergencias.</p>
        </footer>
      </div>
      <FallAnnouncer />
      <ScrollRestoration />
    </div>
  );
}
