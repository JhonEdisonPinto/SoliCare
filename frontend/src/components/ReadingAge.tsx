import type { LatestVital } from '../lib/vitals';
import { formatFull, timeAgo } from '../lib/time';

/** Age of the latest valid vitals; both ages when pulse and SpO2 come from different readings. */
export function ReadingAge({ pulso, spo2, now }: { pulso: LatestVital; spo2: LatestVital; now: number }) {
  if (!pulso && !spo2) return <span className="muted">Sin lecturas válidas</span>;
  if (pulso && spo2 && pulso.at !== spo2.at) {
    return (
      <span className="reading-age">
        <time dateTime={pulso.at} title={formatFull(pulso.at)}>
          Pulso {timeAgo(pulso.at, now)}
        </time>
        <time dateTime={spo2.at} title={formatFull(spo2.at)}>
          SpO2 {timeAgo(spo2.at, now)}
        </time>
      </span>
    );
  }
  const at = (pulso ?? spo2)!.at;
  return (
    <time className="reading-age" dateTime={at} title={formatFull(at)}>
      {timeAgo(at, now)}
    </time>
  );
}
