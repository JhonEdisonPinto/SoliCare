import { memo } from 'react';
import type { Reading } from '../data/types';
import { buildReportStrip, type StripBin } from '../lib/strip';
import { formatDuration, formatWhen } from '../lib/time';

type Run = { kind: Exclude<StripBin, 'sin-reporte'>; start: number; length: number };

/** Consecutive bins with the same state merged into one span, so the bar shows stretches, not ticks. */
function runsOf(bins: readonly StripBin[]): Run[] {
  const runs: Run[] = [];
  bins.forEach((bin, index) => {
    if (bin === 'sin-reporte') return;
    const last = runs[runs.length - 1];
    if (last && last.kind === bin && last.start + last.length === index) last.length += 1;
    else runs.push({ kind: bin, start: index, length: 1 });
  });
  return runs;
}

function summaryText(strip: ReturnType<typeof buildReportStrip>): string {
  if (strip.reports === 0) return 'Sin reportes';
  const parts: string[] = [];
  if (strip.gaps === 0) parts.push('Sin interrupciones');
  else if (strip.gaps === 1) parts.push(`1 interrupción de ${formatDuration(strip.longestGapMs)}`);
  else parts.push(`${strip.gaps} interrupciones, la más larga de ${formatDuration(strip.longestGapMs)}`);
  if (strip.falls.length === 1) parts.push('1 caída');
  if (strip.falls.length > 1) parts.push(`${strip.falls.length} caídas`);
  if (strip.partial) parts.push('historial parcial');
  return parts.join(', ');
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

/**
 * Answers "¿Ha reportado el dispositivo sin interrupciones en las últimas 2 horas?". A solid stretch where
 * the device reported, a bare baseline where it was silent, a dotted baseline where no history was
 * loaded, and a red mark at each fall. The time axis is printed once in the table header; the stacked
 * layout shows it under each bar. The visible summary text is the accessible alternative.
 */
export const ReportStrip = memo(function ReportStrip({ readings, now, limit }: { readings: readonly Reading[]; now: number; limit: number }) {
  const strip = buildReportStrip(readings, now, limit);
  const count = strip.bins.length;
  return (
    <div className={strip.reports > 0 ? 'strip' : 'strip strip--empty'}>
      {strip.reports > 0 ? (
        <div className="strip-bar" aria-hidden="true">
          {runsOf(strip.bins).map((run) => (
            <span
              key={run.start}
              className={`strip-run strip-run--${run.kind}`}
              style={{ insetInlineStart: pct(run.start / count), inlineSize: pct(run.length / count) }}
            />
          ))}
          {strip.falls.map((fall) => (
            <span key={fall.at} className="strip-fall" style={{ insetInlineStart: pct(fall.position) }} />
          ))}
        </div>
      ) : null}
      <span className="strip-range" aria-hidden="true">
        <span>{formatWhen(new Date(strip.windowStart).toISOString(), now)}</span>
        <span>{formatWhen(new Date(strip.windowEnd).toISOString(), now)}</span>
      </span>
      <span className="strip-summary">{summaryText(strip)}</span>
    </div>
  );
});
