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
        <div className="notice notice--problem" role="alert">
          <div className="notice-body">
            <p className="notice-title">No se pudieron cargar las lecturas</p>
            <p>{error} {readings.length > 0 ? 'Abajo se ven las últimas lecturas que sí se cargaron.' : null}</p>
          </div>
          <button type="button" className="btn btn--outline" onClick={refresh}>
            Reintentar ahora
          </button>
        </div>
      ) : null}
      {status === 'loading' ? (
        <p className="panel-empty" role="status">
          Cargando lecturas…
        </p>
      ) : readings.length === 0 && status === 'ready' ? (
        <p className="panel-empty">El servidor todavía no tiene lecturas de este dispositivo.</p>
      ) : (
        <VitalsChart readings={readings} now={now} />
      )}
    </div>
  );
}
