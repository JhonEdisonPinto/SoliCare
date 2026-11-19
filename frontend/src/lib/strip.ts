import type { Reading } from '../data/types';
import { toMs } from './time';

export type StripBin = 'reporto' | 'sin-reporte' | 'sin-cargar';

export type ReportStrip = {
  bins: StripBin[];
  /** Fall events inside the window, as a 0..1 position from the window start. */
  falls: { at: string; position: number }[];
  reports: number;
  gaps: number;
  longestGapMs: number;
  /** True when the loaded readings do not reach back to the window start. */
  partial: boolean;
  windowStart: number;
  windowEnd: number;
};

export const STRIP_WINDOW_MS = 2 * 60 * 60_000;
export const STRIP_BIN_MS = 2 * 60_000;

/**
 * Buckets readings (oldest first) into fixed bins over the last `windowMs`. A bin without any report is a
 * gap. When the request hit `limit` and the oldest reading is newer than the window start, the bins before
 * it are "sin-cargar" (unknown), never a gap.
 */
export function buildReportStrip(
  readings: readonly Reading[],
  now: number,
  limit: number,
  windowMs = STRIP_WINDOW_MS,
  binMs = STRIP_BIN_MS,
): ReportStrip {
  const windowStart = now - windowMs;
  const count = Math.ceil(windowMs / binMs);
  const bins: StripBin[] = new Array(count).fill('sin-reporte');
  const falls: ReportStrip['falls'] = [];
  let reports = 0;

  const oldest = readings.length > 0 ? toMs(readings[0].received_at) : null;
  const partial = readings.length >= limit && oldest !== null && oldest > windowStart;
  if (partial && oldest !== null) {
    const firstKnown = Math.floor((oldest - windowStart) / binMs);
    for (let i = 0; i < Math.min(firstKnown, count); i += 1) bins[i] = 'sin-cargar';
  }

  for (const reading of readings) {
    const t = toMs(reading.received_at);
    if (t === null || t < windowStart || t > now) continue;
    const index = Math.min(count - 1, Math.floor((t - windowStart) / binMs));
    bins[index] = 'reporto';
    reports += 1;
    if (reading.type === 'caida') falls.push({ at: reading.received_at, position: (t - windowStart) / windowMs });
  }

  let gaps = 0;
  let longest = 0;
  let run = 0;
  for (const bin of bins) {
    if (bin === 'sin-reporte') {
      run += 1;
      if (run === 1) gaps += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  return { bins, falls, reports, gaps, longestGapMs: longest * binMs, partial, windowStart, windowEnd: now };
}
