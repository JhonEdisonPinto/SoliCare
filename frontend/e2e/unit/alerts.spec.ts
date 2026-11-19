import { expect, test } from '@playwright/test';
import { connectionAlertId, deriveAlerts, fallAlertId, type AlertInputs } from '../../src/data/alerts';
import type { Device, Reading } from '../../src/data/types';
import { DEFAULT_SETTINGS } from '../../src/data/types';

const MIN = 60_000;
const NOW = Date.parse('2026-11-18T15:00:00.000Z');
const iso = (offsetMin: number) => new Date(NOW + offsetMin * MIN).toISOString();

const device = (id: string, lastSeenMinAgo: number): Device => ({
  device_id: id,
  last_seen_at: iso(-lastSeenMinAgo),
  last_type: 'lectura',
  spo2: 97,
  pulso: 70,
});
const reading = (type: string, minAgo: number): Reading => ({ type, spo2: 97, pulso: 70, received_at: iso(-minAgo) });

function inputs(overrides: Partial<AlertInputs> = {}): AlertInputs {
  return {
    devices: [],
    readingsByDevice: {},
    people: [],
    settings: { ...DEFAULT_SETTINGS },
    acknowledgements: {},
    journal: {},
    now: NOW,
    ...overrides,
  };
}

test.describe('deriveAlerts', () => {
  test('a caida reading becomes a pending fall alert and is journaled', () => {
    const fallAt = reading('caida', 6);
    const { alerts, newJournalEntries } = deriveAlerts(
      inputs({ devices: [device('d1', 1)], readingsByDevice: { d1: [reading('lectura', 7), fallAt, reading('lectura', 1)] } }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: fallAlertId('d1', fallAt.received_at), kind: 'caida', deviceId: 'd1', state: 'pendiente' });
    expect(newJournalEntries.map((entry) => entry.id)).toEqual([alerts[0].id]);
  });

  test('plain readings never create an alert', () => {
    const { alerts } = deriveAlerts(inputs({ devices: [device('d1', 1)], readingsByDevice: { d1: [reading('lectura', 2), reading('lectura', 1)] } }));
    expect(alerts).toEqual([]);
  });

  test('a connection alert appears only after the offline window', () => {
    const inside = deriveAlerts(inputs({ devices: [device('d1', 29)] }));
    expect(inside.alerts).toEqual([]);

    const outside = deriveAlerts(inputs({ devices: [device('d1', 31)] }));
    expect(outside.alerts).toHaveLength(1);
    expect(outside.alerts[0]).toMatchObject({ id: connectionAlertId('d1', iso(-31)), kind: 'conexion', state: 'pendiente' });
    expect(outside.alerts[0].overdueSince).toBe(iso(-1));
  });

  test('the offline window comes from settings', () => {
    const settings = { ...DEFAULT_SETTINGS, offlineWindowMinutes: 10 };
    expect(deriveAlerts(inputs({ devices: [device('d1', 11)], settings })).alerts).toHaveLength(1);
    expect(deriveAlerts(inputs({ devices: [device('d1', 11)] })).alerts).toHaveLength(0);
  });

  test('acknowledging moves an alert to atendida and keeps the note', () => {
    const fallAt = reading('caida', 6);
    const id = fallAlertId('d1', fallAt.received_at);
    const { alerts } = deriveAlerts(
      inputs({
        devices: [device('d1', 1)],
        readingsByDevice: { d1: [fallAt] },
        acknowledgements: { [id]: { acknowledgedAt: iso(-3), acknowledgeNote: 'Llamé a su hijo' } },
      }),
    );
    expect(alerts[0]).toMatchObject({ state: 'atendida', acknowledgedAt: iso(-3), acknowledgeNote: 'Llamé a su hijo' });
  });

  test('resolving by hand marks the alert resuelta by the user', () => {
    const fallAt = reading('caida', 6);
    const id = fallAlertId('d1', fallAt.received_at);
    const { alerts } = deriveAlerts(
      inputs({
        devices: [device('d1', 1)],
        readingsByDevice: { d1: [fallAt] },
        acknowledgements: { [id]: { acknowledgedAt: iso(-3), resolvedAt: iso(-2) } },
      }),
    );
    expect(alerts[0]).toMatchObject({ state: 'resuelta', resolvedAt: iso(-2), resolvedBy: 'usuario' });
  });

  test('a connection alert resolves by itself when the device reports again', () => {
    const lastSeen = iso(-90);
    const journal = { [connectionAlertId('d1', lastSeen)]: { id: connectionAlertId('d1', lastSeen), kind: 'conexion' as const, deviceId: 'd1', at: lastSeen, detectedAt: iso(-60) } };
    const back = reading('lectura', 2);
    const { alerts } = deriveAlerts(inputs({ devices: [device('d1', 1)], readingsByDevice: { d1: [back] }, journal }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'conexion', state: 'resuelta', resolvedBy: 'datos', resolvedAt: back.received_at });
  });

  test('journaled alerts survive after the reading leaves the API window', () => {
    const fallAt = iso(-600);
    const id = fallAlertId('d1', fallAt);
    const { alerts, newJournalEntries } = deriveAlerts(
      inputs({ devices: [device('d1', 1)], journal: { [id]: { id, kind: 'caida', deviceId: 'd1', at: fallAt, detectedAt: iso(-599) } } }),
    );
    expect(alerts.map((alert) => alert.id)).toEqual([id]);
    expect(newJournalEntries).toEqual([]);
  });

  test('open alerts sort before resolved ones, falls before connection', () => {
    const fallAt = reading('caida', 6);
    const { alerts } = deriveAlerts(
      inputs({
        devices: [device('d1', 1), device('d2', 120)],
        readingsByDevice: { d1: [fallAt] },
      }),
    );
    expect(alerts.map((alert) => alert.kind)).toEqual(['caida', 'conexion']);
  });

  test('links the alert to the person who has the device', () => {
    const { alerts } = deriveAlerts(
      inputs({
        devices: [device('d1', 1)],
        readingsByDevice: { d1: [reading('caida', 6)] },
        people: [{ id: 'p1', name: 'Rosa', relation: 'Mamá', deviceId: 'd1', contacts: [], createdAt: iso(-1000) }],
      }),
    );
    expect(alerts[0].personId).toBe('p1');
  });
});
