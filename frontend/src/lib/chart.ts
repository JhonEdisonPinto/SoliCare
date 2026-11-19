import type { Reading } from '../data/types';
import { VITAL_LABEL, VITAL_UNIT, validVital, type VitalKey } from './vitals';
import { timeAgo, toMs } from './time';

export type Point = { x: number; y: number; at: string; value: number };

export type SeriesModel = {
  /** Polyline paths, one per unbroken stretch of valid readings. */
  paths: string[];
  /** The same stretches closed down to the baseline, for an area fill. */
  areas: string[];
  /** Stretches with a single valid reading (a line needs two points). */
  dots: Point[];
  ticks: { value: number; y: number }[];
  /** Valid readings per index, by reading position; null where the reading has no valid value. */
  points: (Point | null)[];
  validCount: number;
  invalidCount: number;
  min: number;
  max: number;
  last: Point | null;
};

/** Y axis limits with round tick steps. Values are real data only; no clinical bands. */
export function niceDomain(min: number, max: number, cap?: number): { lo: number; hi: number; ticks: number[] } {
  const pad = Math.max(2, (max - min) * 0.15);
  let lo = Math.floor(min - pad);
  let hi = Math.ceil(max + pad);
  const span = hi - lo;
  const step = [1, 2, 5, 10, 20, 50].find((candidate) => span / candidate <= 4) ?? 100;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (cap !== undefined && hi > cap) hi = cap;
  const ticks: number[] = [];
  for (let value = lo; value <= hi; value += step) ticks.push(value);
  return { lo, hi, ticks };
}

/** Median gap between consecutive readings, used to tell a silent stretch from normal cadence. */
export function medianInterval(times: readonly number[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const diff = times[i] - times[i - 1];
    if (diff > 0) diffs.push(diff);
  }
  if (diffs.length === 0) return 30_000;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/**
 * Turns readings (oldest first) into drawable geometry for one vital. A reading without a valid value
 * (0) is never plotted and breaks the line; so does a silent stretch longer than three typical intervals.
 */
export function buildSeries(
  readings: readonly Reading[],
  key: VitalKey,
  box: { width: number; height: number; t0: number; t1: number },
): SeriesModel | null {
  const times = readings.map((reading) => toMs(reading.received_at) ?? 0);
  const valid = readings.map((reading) => validVital(reading[key]));
  const values = valid.filter((value): value is number => value !== null);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const { lo, hi, ticks } = niceDomain(min, max, key === 'spo2' ? 100 : undefined);
  const span = box.t1 - box.t0 || 1;
  const xOf = (t: number) => ((t - box.t0) / span) * box.width;
  const yOf = (value: number) => box.height - ((value - lo) / (hi - lo || 1)) * box.height;
  const gapLimit = Math.max(90_000, medianInterval(times) * 3);

  const stretches: Point[][] = [];
  let current: Point[] | null = null;
  const points: (Point | null)[] = [];
  readings.forEach((reading, index) => {
    const value = valid[index];
    if (value === null) {
      current = null;
      points.push(null);
      return;
    }
    const point: Point = { x: xOf(times[index]), y: yOf(value), at: reading.received_at, value };
    points.push(point);
    const previous: Point | undefined = current?.[current.length - 1];
    const previousTime = previous ? toMs(previous.at) ?? 0 : 0;
    if (current && previous && times[index] - previousTime <= gapLimit) current.push(point);
    else {
      current = [point];
      stretches.push(current);
    }
  });

  const round = (n: number) => Math.round(n * 10) / 10;
  const paths: string[] = [];
  const areas: string[] = [];
  const dots: Point[] = [];
  for (const stretch of stretches) {
    if (stretch.length === 1) dots.push(stretch[0]);
    else {
      const line = stretch.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
      paths.push(line);
      areas.push(`${line} L${round(stretch[stretch.length - 1].x)} ${round(box.height)} L${round(stretch[0].x)} ${round(box.height)} Z`);
    }
  }

  return {
    paths,
    areas,
    dots,
    ticks: ticks.map((value) => ({ value, y: yOf(value) })),
    points,
    validCount: values.length,
    invalidCount: readings.length - values.length,
    min,
    max,
    last: [...points].reverse().find((point): point is Point => point !== null) ?? null,
  };
}

/** Index of the reading closest in time to `t`; readings are oldest first. */
export function nearestIndex(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}

/** The text alternative of a chart: how many valid readings, their range, the latest one and what is not drawn. */
export function summaryOf(vital: VitalKey, model: SeriesModel | null, now: number): string {
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
