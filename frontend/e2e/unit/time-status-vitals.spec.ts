import { expect, test } from '@playwright/test';
import type { Device } from '../../src/data/types';
import { deviceStatus } from '../../src/lib/status';
import { formatWhenParts, timeAgo } from '../../src/lib/time';
import { latestValid, validRange, validVital } from '../../src/lib/vitals';

const MIN = 60_000;
const NOW = Date.parse('2026-11-18T15:00:00.000Z');
const at = (minAgo: number) => new Date(NOW - minAgo * MIN).toISOString();
const device = (minAgo: number): Device => ({ device_id: 'd1', last_seen_at: at(minAgo), last_type: 'lectura', spo2: 97, pulso: 70 });

test.describe('timeAgo', () => {
  test('says "sin reportes" without a timestamp', () => {
    expect(timeAgo(null, NOW)).toBe('sin reportes');
    expect(timeAgo(undefined, NOW)).toBe('sin reportes');
    expect(timeAgo('not a date', NOW)).toBe('sin reportes');
  });

  test('uses minutes, hours and days', () => {
    expect(timeAgo(at(0.5), NOW)).toBe('hace menos de 1 min');
    expect(timeAgo(at(5), NOW)).toMatch(/5 min/);
    expect(timeAgo(at(125), NOW)).toMatch(/2 h/);
    expect(timeAgo(at(3 * 24 * 60), NOW)).toMatch(/3 d/);
  });

  test('a future timestamp never reads as negative', () => {
    expect(timeAgo(at(-10), NOW)).toBe('hace menos de 1 min');
  });
});

test.describe('deviceStatus', () => {
  test('en-linea inside the window, including exactly on it', () => {
    expect(deviceStatus(device(5), NOW, 30)).toBe('en-linea');
    expect(deviceStatus(device(30), NOW, 30)).toBe('en-linea');
  });

  test('sin-reporte after the window', () => {
    expect(deviceStatus(device(31), NOW, 30)).toBe('sin-reporte');
  });

  test('nunca when the device is unknown or has no valid timestamp', () => {
    expect(deviceStatus(undefined, NOW, 30)).toBe('nunca');
    expect(deviceStatus({ ...device(1), last_seen_at: 'garbage' }, NOW, 30)).toBe('nunca');
  });
});

test.describe('validVital', () => {
  test('0 means no reading', () => {
    expect(validVital(0)).toBeNull();
  });

  test('rejects missing, negative and non-finite values', () => {
    expect(validVital(null)).toBeNull();
    expect(validVital(undefined)).toBeNull();
    expect(validVital(-5)).toBeNull();
    expect(validVital(Number.NaN)).toBeNull();
    expect(validVital(Infinity)).toBeNull();
  });

  test('keeps positive values', () => {
    expect(validVital(72)).toBe(72);
    expect(validVital(97)).toBe(97);
  });

  test('zeros never enter the latest value or the range', () => {
    const readings = [
      { type: 'lectura', pulso: 70, spo2: 96, received_at: at(3) },
      { type: 'lectura', pulso: 80, spo2: 0, received_at: at(2) },
      { type: 'lectura', pulso: 0, spo2: 0, received_at: at(1) },
    ];
    expect(latestValid(readings, 'pulso')).toEqual({ value: 80, at: at(2) });
    expect(latestValid(readings, 'spo2')).toEqual({ value: 96, at: at(3) });
    expect(validRange(readings, 'pulso')).toEqual({ min: 70, max: 80, count: 2 });
    expect(validRange([readings[2]], 'pulso')).toBeNull();
  });
});

test.describe('formatWhenParts', () => {
  test('today has no day part, so the event time column stays one line', () => {
    const parts = formatWhenParts(at(1), NOW);
    expect(parts.day).toBeNull();
    expect(parts.time).not.toBe('');
  });

  test('another day splits the date from the clock time', () => {
    const parts = formatWhenParts(at(2 * 24 * 60), NOW);
    expect(parts.day).toMatch(/nov/);
    expect(parts.time).not.toMatch(/nov/);
    expect(parts.time).not.toBe('');
  });

  test('an invalid date gives empty parts', () => {
    expect(formatWhenParts('not a date', NOW)).toEqual({ day: null, time: '' });
  });
});
