import type { Reading } from '../data/types';

export type VitalKey = 'pulso' | 'spo2';

/** A vital value of 0 (or anything not a positive finite number) is "no valid reading". */
export function validVital(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export type LatestVital = { value: number; at: string } | null;

/** Latest valid value of a vital, scanning readings sorted oldest first. */
export function latestValid(readings: readonly Reading[], key: VitalKey): LatestVital {
  for (let i = readings.length - 1; i >= 0; i -= 1) {
    const value = validVital(readings[i][key]);
    if (value !== null) return { value, at: readings[i].received_at };
  }
  return null;
}

/** Min and max of the valid values only; null when there is none. Zeros never enter the range. */
export function validRange(readings: readonly Reading[], key: VitalKey): { min: number; max: number; count: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const reading of readings) {
    const value = validVital(reading[key]);
    if (value === null) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    count += 1;
  }
  return count === 0 ? null : { min, max, count };
}

export const VITAL_LABEL: Record<VitalKey, string> = { pulso: 'Pulso', spo2: 'SpO2' };
export const VITAL_UNIT: Record<VitalKey, string> = { pulso: 'lpm', spo2: '%' };
