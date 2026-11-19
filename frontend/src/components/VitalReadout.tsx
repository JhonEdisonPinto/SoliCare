import type { LatestVital, VitalKey } from '../lib/vitals';
import { VITAL_LABEL, VITAL_UNIT } from '../lib/vitals';
import { formatFull, timeAgo } from '../lib/time';

/** Latest valid value with its unit and age. A missing value says so instead of showing 0. */
export function VitalReadout({ vital, kind, now, showAge = true }: { vital: LatestVital; kind: VitalKey; now: number; showAge?: boolean }) {
  return (
    <div className="vital">
      <span className="vital-label">{VITAL_LABEL[kind]}</span>
      {vital ? (
        <>
          <span className="vital-value">
            {vital.value}
            <span className="vital-unit">{kind === 'spo2' ? ' %' : ` ${VITAL_UNIT[kind]}`}</span>
          </span>
          {showAge ? (
            <time className="vital-age" dateTime={vital.at} title={formatFull(vital.at)}>
              {timeAgo(vital.at, now)}
            </time>
          ) : null}
        </>
      ) : (
        <span className="vital-missing">Sin lectura válida</span>
      )}
    </div>
  );
}
