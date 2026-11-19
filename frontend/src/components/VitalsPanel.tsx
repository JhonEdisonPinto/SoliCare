import { useId } from 'react';
import type { DeviceHistory } from '../data/hooks';
import { useReferenceNow } from '../data/hooks';
import { SelectField } from './Field';
import { VitalsChart } from './VitalsChart';

export const HISTORY_LIMITS = [60, 150, 300, 500] as const;

/**
 * The history of one device as a chart, with its loading, error and empty states. The page owns the
 * `useDeviceHistory` call (so a recent-readings table can share it) and the range choice.
 */
export function VitalsPanel({
  history,
  limit,
  onLimitChange,
}: {
  history: DeviceHistory;
  limit: number;
  onLimitChange: (limit: number) => void;
}) {
  const now = useReferenceNow();
  const selectId = useId();
  const { status, readings, error, refresh } = history;

  return (
    <div className="vitals-panel">
      <form className="panel-controls" onSubmit={(event) => event.preventDefault()}>
        <SelectField
          label="Lecturas a mostrar"
          name={`limit-${selectId}`}
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          {HISTORY_LIMITS.map((value) => (
            <option key={value} value={value}>
              {value === 500 ? 'Últimas 500 (el máximo del servidor)' : `Últimas ${value}`}
            </option>
          ))}
        </SelectField>
      </form>
      {status === 'unreachable' ? (
        <div className="system-row system-row--problem" role="alert">
          <div className="system-body">
            <h3 className="system-title">No se pudieron cargar las lecturas</h3>
            <p>{error} {readings.length > 0 ? 'Abajo se ven las últimas lecturas que sí se cargaron.' : null}</p>
          </div>
          <div className="system-action">
            <button type="button" className="key" onClick={refresh}>
              Reintentar ahora
            </button>
          </div>
        </div>
      ) : null}
      {status === 'loading' ? (
        <p className="empty-row" role="status">
          Cargando lecturas…
        </p>
      ) : readings.length === 0 && status === 'ready' ? (
        <p className="empty-row">El servidor todavía no tiene lecturas de este dispositivo.</p>
      ) : (
        <VitalsChart readings={readings} now={now} />
      )}
    </div>
  );
}
