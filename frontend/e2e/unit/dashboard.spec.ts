import { expect, test } from '@playwright/test';
import { recentActivity, responseStats } from '../../src/data/dashboard';
import type { Alert, Device, Person } from '../../src/data/types';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = Date.parse('2026-11-19T15:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const fall = (id: string, agoMs: number, ackAfterMs?: number): Alert => ({
  id,
  kind: 'caida',
  deviceId: 'd1',
  personId: 'p1',
  at: at(agoMs),
  state: ackAfterMs === undefined ? 'pendiente' : 'atendida',
  acknowledgedAt: ackAfterMs === undefined ? undefined : at(agoMs - ackAfterMs),
});

test.describe('responseStats', () => {
  test('has no mean when nothing was acknowledged', () => {
    expect(responseStats([], NOW)).toEqual({ attended: 0, meanResponseMs: null });
    expect(responseStats([fall('a', 5 * MIN)], NOW)).toEqual({ attended: 0, meanResponseMs: null });
  });

  test('averages alert-to-acknowledgement time over the same alerts it counts', () => {
    const stats = responseStats([fall('a', DAY, 2 * MIN), fall('b', 2 * DAY, 6 * MIN), fall('pending', 10 * MIN)], NOW);
    expect(stats.attended).toBe(2);
    expect(stats.meanResponseMs).toBe(4 * MIN);
  });

  test('ignores acknowledgements older than 30 days', () => {
    const stats = responseStats([fall('old', 40 * DAY, 1 * MIN), fall('recent', 3 * DAY, 10 * MIN)], NOW);
    expect(stats).toEqual({ attended: 1, meanResponseMs: 10 * MIN });
  });

  test('measures a silence from the moment it crossed the offline window', () => {
    const silence: Alert = {
      id: 'c',
      kind: 'conexion',
      deviceId: 'd1',
      personId: 'p1',
      at: at(60 * MIN),
      overdueSince: at(30 * MIN),
      state: 'atendida',
      acknowledgedAt: at(20 * MIN),
    };
    expect(responseStats([silence], NOW).meanResponseMs).toBe(10 * MIN);
  });
});

test.describe('recentActivity', () => {
  const people: Person[] = [{ id: 'p1', name: 'Ana', relation: '', deviceId: 'd1', contacts: [], createdAt: at(DAY) }];
  const devices: Device[] = [
    { device_id: 'd1', last_seen_at: at(1 * MIN), last_type: 'lectura', spo2: 97, pulso: 70 },
    { device_id: 'd2', last_seen_at: at(90 * MIN), last_type: 'lectura', spo2: 95, pulso: 66 },
  ];

  test('lists the newest events first and names the person or the device', () => {
    const alerts = [fall('f1', 30 * MIN, 5 * MIN)];
    const items = recentActivity({ devices, alerts, people });
    expect(items.map((item) => item.title)).toEqual(['Lectura recibida', 'Alerta atendida', 'Caída detectada', 'Lectura recibida']);
    expect(items[0].description).toBe('Pulso y SpO2 de Ana');
    expect(items[3].description).toBe('Pulso y SpO2 del dispositivo d2');
  });

  test('is empty without data and honours the limit', () => {
    expect(recentActivity({ devices: [], alerts: [], people })).toEqual([]);
    expect(recentActivity({ devices, alerts: [], people, limit: 1 })).toHaveLength(1);
  });
});
