import type { LatestVital, VitalKey } from '../lib/vitals';
import { VITAL_UNIT } from '../lib/vitals';

/**
 * Latest valid value of one vital for a table cell, with tabular figures. The unit is in the column
 * header on wide screens and visible beside the value in the stacked layout; screen readers always get
 * it. A missing value says so instead of showing 0.
 */
export function VitalReadout({ vital, kind }: { vital: LatestVital; kind: VitalKey }) {
  if (!vital) return <span className="vital-missing">Sin lectura válida</span>;
  return (
    <span className="vital">
      <span className="vital-value">{vital.value}</span>
      <span className="vital-unit">{kind === 'spo2' ? ' %' : ` ${VITAL_UNIT[kind]}`}</span>
    </span>
  );
}
