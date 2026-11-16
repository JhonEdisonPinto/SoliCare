import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Rotate3d,
  Settings,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from 'lucide-react';

type ActivityItem = {
  icon: typeof Activity;
  title: string;
  description: string;
  time: string;
  tone: 'green' | 'amber' | 'blue';
};

const activities: ActivityItem[] = [
  {
    icon: HeartPulse,
    title: 'Lectura recibida',
    description: 'Pulso y SpO2 de María González',
    time: 'Hace 2 min',
    tone: 'green',
  },
  {
    icon: ShieldCheck,
    title: 'Chequeo completado',
    description: 'Dispositivo de Carlos Ruiz en línea',
    time: 'Hace 18 min',
    tone: 'blue',
  },
  {
    icon: Bell,
    title: 'Recordatorio enviado',
    description: 'Revisión de batería para proto-02',
    time: 'Hace 1 h',
    tone: 'amber',
  },
];

const navItems = [
  { label: 'Resumen', icon: LayoutDashboard },
  { label: 'Personas', icon: UsersRound },
  { label: 'Dispositivos', icon: Smartphone },
  { label: 'Alertas', icon: Bell, count: 1 },
];

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedNav, setSelectedNav] = useState('Resumen');
  const [selectedPerson, setSelectedPerson] = useState('María González');
  const [showAlert, setShowAlert] = useState(true);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <HeartPulse size={21} strokeWidth={2.5} />
          </div>
          <span>SoliCare</span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">FC</div>
          <div>
            <strong>Familia Cuidado</strong>
            <span>Cuenta familiar</span>
          </div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          <p className="nav-heading">Panel</p>
          {navItems.map(({ label, icon: Icon, count }) => (
            <button
              key={label}
              className={`nav-item ${selectedNav === label ? 'nav-item--active' : ''}`}
              onClick={() => {
                setSelectedNav(label);
                setSidebarOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {count && <span className="nav-count">{count}</span>}
            </button>
          ))}
          <p className="nav-heading nav-heading--spaced">Administración</p>
          <button className="nav-item">
            <Settings size={18} />
            <span>Configuración</span>
          </button>
          <button className="nav-item">
            <CircleHelp size={18} />
            <span>Centro de ayuda</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="support-card">
            <div className="support-icon"><MessageCircle size={17} /></div>
            <div>
              <strong>¿Necesitas ayuda?</strong>
              <span>Estamos para acompañarte</span>
            </div>
            <ChevronRight size={16} />
          </div>
          <button className="profile-button">
            <div className="profile-avatar">JP</div>
            <div className="profile-copy">
              <strong>Jhon Edison</strong>
              <span>Administrador</span>
            </div>
            <LogOut size={17} className="muted-icon" />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            <span>Panel</span>
            <ChevronRight size={14} />
            <strong>{selectedNav}</strong>
          </div>
          <div className="topbar-actions">
            <div className="connection-status">
              <span className="pulse-dot" />
              <span>Sistema operativo</span>
            </div>
            <button className="icon-button notification-button" aria-label="Notificaciones">
              <Bell size={19} />
              <span />
            </button>
            <div className="topbar-avatar">JP</div>
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">Domingo, 16 de noviembre de 2026</p>
              <h1>Buenos días, Jhon <span>✦</span></h1>
              <p className="welcome-copy">Este es el estado de tu red de cuidado.</p>
            </div>
            <button className="primary-button"><Plus size={18} /> Añadir persona</button>
          </section>

          {showAlert && (
            <section className="alert-banner">
              <div className="alert-banner-icon"><AlertTriangle size={20} /></div>
              <div className="alert-banner-copy">
                <strong>Revisa una conexión</strong>
                <p>El dispositivo de <b>Elena Martínez</b> no reporta datos desde hace 32 minutos.</p>
              </div>
              <button className="outline-button">Ver dispositivo <ChevronRight size={15} /></button>
              <button className="close-button" onClick={() => setShowAlert(false)} aria-label="Cerrar alerta"><X size={17} /></button>
            </section>
          )}

          <section className="stats-grid">
            <StatCard label="Personas monitoreadas" value="4" detail="+1 este mes" icon={UsersRound} tone="purple" />
            <StatCard label="Dispositivos conectados" value="3 / 4" detail="75% en línea" icon={Wifi} tone="green" />
            <StatCard label="Alertas atendidas" value="12" detail="Todas respondidas" icon={ShieldCheck} tone="blue" />
            <StatCard label="Tiempo de respuesta" value="2:14" detail="Promedio este mes" icon={Clock3} tone="amber" />
          </section>

          <div className="dashboard-grid">
            <section className="panel health-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Seguimiento</p>
                  <h2>Signos vitales</h2>
                </div>
                <div className="select-wrap">
                  <UserRound size={15} />
                  <select value={selectedPerson} onChange={(event) => setSelectedPerson(event.target.value)} aria-label="Seleccionar persona">
                    <option>María González</option>
                    <option>Carlos Ruiz</option>
                    <option>Elena Martínez</option>
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>
              <div className="vitals-row">
                <VitalCard label="Pulso" value="74" unit="lpm" status="En rango normal" icon={HeartPulse} tone="coral" />
                <VitalCard label="Saturación SpO2" value="97" unit="%" status="En rango normal" icon={Activity} tone="teal" />
              </div>
              <div className="chart-area">
                <div className="chart-labels"><span>100</span><span>95</span><span>90</span><span>85</span></div>
                <svg className="health-chart" viewBox="0 0 640 160" preserveAspectRatio="none" role="img" aria-label="Gráfico de saturación de oxígeno de las últimas 24 horas">
                  <defs>
                    <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#38bfa0" stopOpacity=".22" />
                      <stop offset="100%" stopColor="#38bfa0" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="chart-grid-line" d="M0 10 H640 M0 58 H640 M0 106 H640 M0 154 H640" />
                  <path className="chart-fill" d="M0,76 C24,69 32,81 51,71 S86,65 106,75 S136,89 155,73 S179,60 204,68 S229,83 248,68 S281,73 302,58 S327,69 349,64 S375,81 397,68 S421,63 442,72 S464,60 487,63 S512,78 530,67 S556,56 578,67 S608,73 640,57 L640,160 L0,160 Z" />
                  <path className="chart-line" d="M0,76 C24,69 32,81 51,71 S86,65 106,75 S136,89 155,73 S179,60 204,68 S229,83 248,68 S281,73 302,58 S327,69 349,64 S375,81 397,68 S421,63 442,72 S464,60 487,63 S512,78 530,67 S556,56 578,67 S608,73 640,57" />
                  <circle className="chart-point" cx="530" cy="67" r="4" />
                </svg>
                <div className="chart-times"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>Ahora</span></div>
              </div>
              <div className="panel-footer">
                <span><span className="legend-dot teal" /> SpO2</span>
                <span className="last-updated">Última lectura hace 2 minutos</span>
              </div>
            </section>

            <section className="panel people-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Tu red</p>
                  <h2>Personas</h2>
                </div>
                <button className="text-button">Ver todas <ChevronRight size={15} /></button>
              </div>
              <div className="people-list">
                <PersonRow initials="MG" name="María González" relation="Mamá · proto-01" status="Conectada" color="purple" />
                <PersonRow initials="CR" name="Carlos Ruiz" relation="Papá · proto-02" status="Conectado" color="blue" />
                <PersonRow initials="EM" name="Elena Martínez" relation="Abuela · proto-03" status="Sin conexión" color="orange" offline />
                <PersonRow initials="JR" name="Jorge Ramírez" relation="Tío · proto-04" status="Conectado" color="teal" />
              </div>
              <button className="add-person-button"><Plus size={16} /> Añadir una persona</button>
            </section>
          </div>

          <section className="panel fall-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Seguridad del dispositivo</p>
                <h2>Detección de caídas</h2>
              </div>
              <div className="sensor-status"><span /> Sensor activo</div>
            </div>
            <div className="fall-content">
              <div className="fall-status-card">
                <div className="fall-sensor-orbit">
                  <div className="fall-sensor-core"><Rotate3d size={25} /></div>
                  <i className="orbit-dot orbit-dot--one" />
                  <i className="orbit-dot orbit-dot--two" />
                </div>
                <div className="fall-status-copy">
                  <span>Estado actual</span>
                  <strong>Sin eventos detectados</strong>
                  <small>El giroscopio y acelerómetro están monitoreando el movimiento.</small>
                </div>
              </div>
              <div className="fall-metric">
                <span>Último movimiento</span>
                <strong>Hace 3 min</strong>
                <small>María González · proto-01</small>
              </div>
              <div className="fall-metric">
                <span>Eventos este mes</span>
                <strong>0</strong>
                <small className="metric-ok"><ShieldCheck size={12} /> Todo en orden</small>
              </div>
              <div className="fall-activity">
                <div className="fall-activity-head"><span>Actividad del sensor</span><small>Últimas 6 h</small></div>
                <div className="motion-bars" aria-label="Actividad del giroscopio en las últimas seis horas">
                  {[32, 46, 26, 60, 42, 75, 38, 51, 30, 67, 45, 54, 28, 62, 39, 70, 47, 58].map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <div className="motion-times"><span>6:00</span><span>Ahora</span></div>
              </div>
            </div>
            <div className="fall-note"><AlertTriangle size={13} /> Ante una posible caída, el dispositivo activa una pre-alerta de 15 segundos antes de avisar a los contactos.</div>
          </section>

          <div className="bottom-grid">
            <section className="panel activity-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">En tiempo real</p>
                  <h2>Actividad reciente</h2>
                </div>
                <button className="icon-button"><MoreHorizontal size={19} /></button>
              </div>
              <div className="activity-list">
                {activities.map(({ icon: Icon, title, description, time, tone }) => (
                  <div className="activity-item" key={title}>
                    <div className={`activity-icon activity-icon--${tone}`}><Icon size={17} /></div>
                    <div className="activity-copy"><strong>{title}</strong><span>{description}</span></div>
                    <time>{time}</time>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel care-panel">
              <div className="care-illustration">
                <div className="care-spark spark-one">✦</div>
                <div className="care-spark spark-two">✦</div>
                <div className="care-heart"><HeartPulse size={38} /></div>
              </div>
              <div className="care-copy">
                <p className="panel-kicker">Todo bajo control</p>
                <h2>Cuidar también es estar cerca.</h2>
                <p>SoliCare te ayuda a acompañar a quienes más quieres, incluso a la distancia.</p>
                <button className="text-button">Conoce cómo funciona <ChevronRight size={15} /></button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Activity; tone: string }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon stat-icon--${tone}`}><Icon size={18} /></div>
      <div className="stat-content"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

function VitalCard({ label, value, unit, status, icon: Icon, tone }: { label: string; value: string; unit: string; status: string; icon: typeof Activity; tone: string }) {
  return (
    <div className="vital-card">
      <div className={`vital-icon vital-icon--${tone}`}><Icon size={19} /></div>
      <div className="vital-copy"><span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div><em><span />{status}</em></div>
    </div>
  );
}

function PersonRow({ initials, name, relation, status, color, offline = false }: { initials: string; name: string; relation: string; status: string; color: string; offline?: boolean }) {
  return (
    <div className="person-row">
      <div className={`person-avatar person-avatar--${color}`}>{initials}</div>
      <div className="person-info"><strong>{name}</strong><span>{relation}</span></div>
      <span className={`person-status ${offline ? 'person-status--offline' : ''}`}><i />{status}</span>
      <button className="row-arrow" aria-label={`Ver a ${name}`}><ChevronRight size={16} /></button>
    </div>
  );
}

export default App;
