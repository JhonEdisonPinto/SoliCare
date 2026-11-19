import { memo, useId } from 'react';
import type { Reading } from '../data/types';
import { buildReportStrip } from '../lib/strip';
import { formatDuration, formatWhen } from '../lib/time';

const WIDTH = 240;
const HEIGHT = 30;
const BAR_TOP = 12;
const BAR_HEIGHT = 14;

function summaryText(strip: ReturnType<typeof buildReportStrip>): string {
  if (strip.reports === 0) return 'Sin reportes en las últimas 2 h';
  const parts: string[] = [];
  if (strip.gaps === 0) parts.push('Sin interrupciones en las últimas 2 h');
  else if (strip.gaps === 1) parts.push(`1 interrupción de ${formatDuration(strip.longestGapMs)}`);
  else parts.push(`${strip.gaps} interrupciones; la más larga de ${formatDuration(strip.longestGapMs)}`);
  if (strip.falls.length === 1) parts.push('1 caída');
  if (strip.falls.length > 1) parts.push(`${strip.falls.length} caídas`);
  if (strip.partial) parts.push('historial parcial');
  return parts.join(', ');
}

/**
 * Answers "¿Ha reportado el dispositivo sin interrupciones en las últimas 2 horas?". One 2-minute bin per
 * tick: filled when the device reported, empty for a gap, hatched where no history was loaded. Falls are
 * triangles above the bin. The visible summary text is also the accessible description.
 */
export const ReportStrip = memo(function ReportStrip({ readings, now, limit }: { readings: readonly Reading[]; now: number; limit: number }) {
  const patternId = `strip-unknown-${useId().replace(/:/g, '')}`;
  const strip = buildReportStrip(readings, now, limit);
  const binWidth = WIDTH / strip.bins.length;
  const text = summaryText(strip);
  return (
    <figure className="strip">
      <svg className="strip-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" className="strip-unknown-bg" />
            <line x1="0" y1="0" x2="0" y2="4" className="strip-unknown-line" />
          </pattern>
        </defs>
        <rect x="0" y={BAR_TOP} width={WIDTH} height={BAR_HEIGHT} className="strip-track" />
        {strip.bins.map((bin, index) =>
          bin === 'sin-reporte' ? null : (
            <rect
              key={index}
              x={(index * binWidth + 0.5).toFixed(1)}
              y={BAR_TOP}
              width={Math.max(binWidth - 1, 1).toFixed(1)}
              height={BAR_HEIGHT}
              className={bin === 'reporto' ? 'strip-bin' : undefined}
              fill={bin === 'reporto' ? undefined : `url(#${patternId})`}
            />
          ),
        )}
        {strip.falls.map((fall) => {
          const x = Math.min(Math.max(fall.position * WIDTH, 5), WIDTH - 5);
          return <path key={fall.at} d={`M${x.toFixed(1)} 11 l-5.5 -10 h11 z`} className="strip-fall" />;
        })}
      </svg>
      <figcaption className="strip-caption">
        <span className="strip-range">
          <span>{formatWhen(new Date(strip.windowStart).toISOString(), now)}</span>
          <span>{formatWhen(new Date(strip.windowEnd).toISOString(), now)}</span>
        </span>
        <span className="strip-summary">{text}</span>
      </figcaption>
    </figure>
  );
});
