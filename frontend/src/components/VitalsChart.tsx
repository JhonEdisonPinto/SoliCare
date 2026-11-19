import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Reading } from '../data/types';
import { buildSeries, nearestIndex, type SeriesModel } from '../lib/chart';
import { formatClockSeconds, formatDuration, formatWhen, timeAgo, toMs } from '../lib/time';
import { VITAL_LABEL, VITAL_UNIT, validVital, type VitalKey } from '../lib/vitals';

const HEIGHT = 150;
const MARGIN = { top: 10, right: 40, bottom: 4, left: 40 };
const AXIS_HEIGHT = 22;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type Falls = { x: number; at: string }[];

function Metric({
  model,
  falls,
  width,
  t0,
  t1,
  showAxis,
  cursorX,
}: {
  model: SeriesModel;
  falls: Falls;
  width: number;
  t0: number;
  t1: number;
  showAxis: boolean;
  cursorX: number | null;
}) {
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const total = HEIGHT + (showAxis ? AXIS_HEIGHT : 0);
  const count = Math.max(2, Math.min(6, Math.floor(plotW / 104)));
  const xTicks = Array.from({ length: count }, (_, i) => i / (count - 1));
  const lastPoint = model.last;
  const cursor = cursorX === null ? null : Math.min(plotW, Math.max(0, cursorX));

  return (
    <svg className="chart-svg" width={width} height={total} viewBox={`0 0 ${width} ${total}`} aria-hidden="true" focusable="false">
      <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
        {model.ticks.map((tick) => (
          <g key={tick.value}>
            <line className="chart-grid" x1={0} x2={plotW} y1={tick.y} y2={tick.y} />
            <text className="chart-tick" x={-8} y={tick.y} textAnchor="end" dominantBaseline="middle">
              {tick.value}
            </text>
          </g>
        ))}
        {falls.map((fall) => (
          <g key={fall.at}>
            <line className="chart-fall-ring" x1={fall.x} x2={fall.x} y1={0} y2={plotH} />
            <line className="chart-fall" x1={fall.x} x2={fall.x} y1={0} y2={plotH} />
          </g>
        ))}
        {model.paths.map((d) => (
          <path key={d} className="chart-line" d={d} />
        ))}
        {model.dots.map((dot) => (
          <circle key={dot.at} className="chart-dot" cx={dot.x} cy={dot.y} r={2.5} />
        ))}
        {lastPoint ? (
          <>
            <circle className="chart-end" cx={lastPoint.x} cy={lastPoint.y} r={4} />
            <text className="chart-end-label" x={Math.min(plotW, lastPoint.x) + 9} y={lastPoint.y} dominantBaseline="middle">
              {lastPoint.value}
            </text>
          </>
        ) : null}
        {cursor !== null ? <line className="chart-cursor" x1={cursor} x2={cursor} y1={0} y2={plotH} /> : null}
        {showAxis
          ? xTicks.map((fraction, index) => {
              const at = t0 + (t1 - t0) * fraction;
              return (
                <text
                  key={fraction}
                  className="chart-tick"
                  x={fraction * plotW}
                  y={plotH + 17}
                  textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
                >
                  {formatWhen(new Date(at).toISOString(), t1)}
                </text>
              );
            })
          : null}
      </g>
    </svg>
  );
}

function summaryOf(vital: VitalKey, model: SeriesModel | null, now: number): string {
  if (!model) return `${VITAL_LABEL[vital]}: ninguna de las lecturas de este período tiene un valor válido.`;
  const unit = VITAL_UNIT[vital];
  const parts = [
    `${model.validCount} ${model.validCount === 1 ? 'lectura válida' : 'lecturas válidas'}, entre ${model.min} y ${model.max} ${unit}.`,
  ];
  if (model.last) parts.push(`Último valor válido: ${model.last.value} ${unit}, ${timeAgo(model.last.at, now)}.`);
  if (model.invalidCount > 0) {
    parts.push(`${model.invalidCount} ${model.invalidCount === 1 ? 'lectura sin valor válido no se dibuja' : 'lecturas sin valor válido no se dibujan'}.`);
  }
  return parts.join(' ');
}

/**
 * Pulso and SpO2 over time as two stacked single-axis line charts that share one time axis. Readings
 * with no valid value (0) are never plotted and break the line, as does a long silence; falls are red
 * marks across both charts. The text under each chart is the accessible alternative, and the shared
 * cursor (pointer or arrow keys) prints each reading. Tracking signals, not a diagnosis; no thresholds.
 */
export function VitalsChart({ readings, now }: { readings: readonly Reading[]; now: number }) {
  const [wrap, width] = useWidth();
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const model = useMemo(() => {
    const times = readings.map((reading) => toMs(reading.received_at) ?? 0);
    const t0 = times[0] ?? 0;
    const t1 = Math.max(times[times.length - 1] ?? 0, t0 + 60_000);
    const box = { width: plotW, height: plotH, t0, t1 };
    const falls: Falls = readings
      .filter((reading) => reading.type === 'caida')
      .map((reading) => ({ at: reading.received_at, x: (((toMs(reading.received_at) ?? t0) - t0) / (t1 - t0)) * plotW }));
    return { times, t0, t1, falls, pulso: buildSeries(readings, 'pulso', box), spo2: buildSeries(readings, 'spo2', box) };
  }, [readings, plotW, plotH]);

  if (readings.length === 0) return null;
  const { times, t0, t1, falls } = model;
  const index = cursorIndex !== null && cursorIndex < readings.length ? cursorIndex : null;
  const cursorReading = index !== null ? readings[index] : null;
  const cursorX = index !== null ? ((times[index] - t0) / (t1 - t0)) * plotW : null;

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const svg = (event.target as Element).closest('svg');
    if (!svg) return;
    const x = event.clientX - svg.getBoundingClientRect().left - MARGIN.left;
    if (x < 0 || x > plotW) return;
    setCursorIndex(nearestIndex(times, t0 + (x / plotW) * (t1 - t0)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = readings.length - 1;
    const from = index ?? last;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, from - 1);
    else if (event.key === 'ArrowRight') next = Math.min(last, from + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape') setCursorIndex(null);
    if (next === null) return;
    event.preventDefault();
    setCursorIndex(next);
  };

  const spo2HasData = model.spo2 !== null;
  const span = formatDuration(t1 - t0);
  const charts: { vital: VitalKey; series: SeriesModel | null }[] = [
    { vital: 'pulso', series: model.pulso },
    { vital: 'spo2', series: model.spo2 },
  ];

  return (
    <div className="vitals-chart" ref={wrap}>
      <p className="chart-range">
        <time dateTime={readings[0].received_at}>{formatWhen(readings[0].received_at, t1)}</time> a{' '}
        <time dateTime={readings[readings.length - 1].received_at}>{formatWhen(readings[readings.length - 1].received_at, t1)}</time>, {span}
        {' '}y {readings.length} {readings.length === 1 ? 'lectura' : 'lecturas'}.
        {falls.length > 0 ? (
          <span className="chart-key">
            <span className="chart-key-mark" aria-hidden="true" />
            {falls.length === 1 ? 'Caída' : `${falls.length} caídas`}
          </span>
        ) : null}
      </p>
      <div
        className="chart-plots"
        tabIndex={0}
        role="group"
        aria-label="Gráficos de pulso y SpO2. Use las flechas izquierda y derecha para revisar cada lectura."
        onPointerMove={fromPointer}
        onPointerLeave={() => setCursorIndex(null)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {charts.map(({ vital, series }) => (
          <figure key={vital} className="chart">
            <figcaption className="chart-title">
              {VITAL_LABEL[vital]} <span className="chart-unit">{VITAL_UNIT[vital]}</span>
            </figcaption>
            {series ? (
              <Metric
                model={series}
                falls={falls}
                width={width}
                t0={t0}
                t1={t1}
                showAxis={vital === 'spo2' || !spo2HasData}
                cursorX={cursorX}
              />
            ) : null}
            <p className="chart-summary">{summaryOf(vital, series, now)}</p>
          </figure>
        ))}
      </div>
      <p className="chart-readout" aria-live={focused ? 'polite' : 'off'}>
        {cursorReading ? (
          <>
            <time dateTime={cursorReading.received_at}>{formatClockSeconds(cursorReading.received_at)}</time>
            {cursorReading.type === 'caida' ? <strong className="chart-readout-fall"> Caída.</strong> : null}{' '}
            {(['pulso', 'spo2'] as const).map((vital) => {
              const value = validVital(cursorReading[vital]);
              return (
                <span key={vital} className="chart-readout-item">
                  {VITAL_LABEL[vital]} {value === null ? 'sin lectura válida' : `${value} ${VITAL_UNIT[vital]}`}.
                </span>
              );
            })}
          </>
        ) : (
          'Pase el cursor sobre los gráficos, o enfóquelos y use las flechas, para ver cada lectura.'
        )}
      </p>
      <p className="chart-note">
        Señales de seguimiento, no un diagnóstico. Los huecos en la línea son lecturas sin valor válido o tiempo sin reportes. La escala vertical
        se ajusta a los valores de este período.
      </p>
    </div>
  );
}
