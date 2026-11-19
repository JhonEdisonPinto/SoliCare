import { Activity, ChevronDown, HeartPulse, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PersonSummary } from '../data/summary';
import type { LatestVital, VitalKey } from '../lib/vitals';
import { VITAL_LABEL, VITAL_UNIT } from '../lib/vitals';
import { timeAgo } from '../lib/time';
import { PanelHead } from './PanelHead';
import { VitalArea } from './VitalArea';

/**
 * Pulso and SpO2 are tracking signals and the app has no clinical thresholds, so a card never says
 * "normal" or "out of range": it shows the value and how old the reading is.
 */
function VitalCard({
  label,
  vital,
  unit,
  now,
  online,
  tone,
  children,
}: {
  label: string;
  vital: LatestVital;
  unit: string;
  now: number;
  online: boolean;
  tone: 'coral' | 'teal';
  children: ReactNode;
}) {
  return (
    <div className="vital-card">
      <div className={`tile tile--${tone}`} aria-hidden="true">
        {children}
      </div>
      <div className="vital-copy">
        <span className="vital-label">{label}</span>
        <p className="vital-reading">
          <strong>{vital ? vital.value : '--'}</strong>
          {vital ? <small>{unit}</small> : null}
        </p>
        <em className={`vital-age${online ? '' : ' vital-age--off'}`}>
          <span aria-hidden="true" />
          {vital ? timeAgo(vital.at, now) : 'Sin lectura válida'}
        </em>
      </div>
    </div>
  );
}

/** The "Signos vitales" card of the Resumen: person selector, latest Pulso and SpO2, and a chart of the real history. */
export function VitalsCard({
  rows,
  selected,
  onSelect,
  now,
}: {
  rows: PersonSummary[];
  selected: PersonSummary | undefined;
  onSelect: (personId: string) => void;
  now: number;
}) {
  const [vital, setVital] = useState<VitalKey>('pulso');
  const online = selected?.status === 'en-linea';
  const lastAt = selected ? [selected.pulso?.at, selected.spo2?.at].filter(Boolean).sort().pop() : undefined;

  return (
    <section className="panel health-panel" aria-labelledby="signos">
      <PanelHead
        id="signos"
        kicker="Seguimiento"
        title="Signos vitales"
        actions={
          rows.length > 0 ? (
            <label className="select-wrap">
              <UserRound size={15} aria-hidden="true" />
              <span className="visually-hidden">Persona</span>
              <select value={selected?.person.id ?? ''} onChange={(event) => onSelect(event.target.value)}>
                {rows.map((row) => (
                  <option key={row.person.id} value={row.person.id}>
                    {row.person.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          ) : undefined
        }
      />
      {!selected ? (
        <p className="panel-empty">
          Ninguna persona tiene un dispositivo asignado todavía. <Link to="/personas">Asigna uno desde Personas</Link> para ver aquí su pulso y su SpO2.
        </p>
      ) : (
        <>
          <div className="vitals-row">
            <VitalCard label="Pulso" vital={selected.pulso} unit="lpm" now={now} online={online} tone="coral">
              <HeartPulse size={19} />
            </VitalCard>
            <VitalCard label="Saturación SpO2" vital={selected.spo2} unit="%" now={now} online={online} tone="teal">
              <Activity size={19} />
            </VitalCard>
          </div>
          <div className="chart-switch" role="group" aria-label="Señal a graficar">
            {(['pulso', 'spo2'] as const).map((key) => (
              <button key={key} type="button" className="chip" aria-pressed={vital === key} onClick={() => setVital(key)}>
                {VITAL_LABEL[key]}
              </button>
            ))}
          </div>
          <VitalArea readings={selected.readings} vital={vital} now={now} />
          <div className="panel-footer">
            <span className="legend">
              <i className="legend-dot" aria-hidden="true" /> {VITAL_LABEL[vital]} ({VITAL_UNIT[vital]})
            </span>
            <span className="last-updated">{lastAt ? `Última lectura ${timeAgo(lastAt, now)}` : 'Sin lecturas válidas'}</span>
          </div>
        </>
      )}
    </section>
  );
}
