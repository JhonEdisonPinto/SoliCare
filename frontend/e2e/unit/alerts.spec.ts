import { expect, test } from '@playwright/test';
import { alertReferenceTime, connectionAlertId, deriveAlerts, fallAlertId, type AlertInputs } from '../../src/data/alerts';
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

test.describe('deriveAlerts boundaries', () => {
  test('exactly the offline window is not overdue; one millisecond more is', () => {
    const atWindow = { ...device('d1', 30) };
    expect(deriveAlerts(inputs({ devices: [atWindow] })).alerts).toEqual([]);
    const justOver = { ...device('d1', 30), last_seen_at: new Date(NOW - 30 * MIN - 1).toISOString() };
    expect(deriveAlerts(inputs({ devices: [justOver] })).alerts).toHaveLength(1);
  });
});

test.describe('alert attribution (D4)', () => {
  const rosa = { id: 'p1', name: 'Rosa', relation: 'Mamá', deviceId: 'd1', contacts: [], createdAt: iso(-1000) };

  test('a new journal entry records who had the device when the event was first observed', () => {
    const { newJournalEntries } = deriveAlerts(inputs({ devices: [device('d1', 1)], readingsByDevice: { d1: [reading('caida', 6)] }, people: [rosa] }));
    expect(newJournalEntries[0].personId).toBe('p1');
    const unowned = deriveAlerts(inputs({ devices: [device('d1', 1)], readingsByDevice: { d1: [reading('caida', 6)] } }));
    expect(unowned.newJournalEntries[0].personId).toBeNull();
  });

  test('history stays with the person recorded, even after the device moves to someone else', () => {
    const fall = reading('caida', 600);
    const id = fallAlertId('d1', fall.received_at);
    const journal = { [id]: { id, kind: 'caida' as const, deviceId: 'd1', at: fall.received_at, detectedAt: iso(-599), personId: 'p1' } };
    const luis = { ...rosa, id: 'p2', name: 'Luis' };
    const { alerts } = deriveAlerts(inputs({ devices: [device('d1', 1)], journal, people: [{ ...rosa, deviceId: null }, luis] }));
    expect(alerts[0].personId).toBe('p1');
  });

  test('entries from before the change (no person stored) fall back to the current owner', () => {
    const fall = reading('caida', 600);
    const id = fallAlertId('d1', fall.received_at);
    const journal = { [id]: { id, kind: 'caida' as const, deviceId: 'd1', at: fall.received_at, detectedAt: iso(-599) } };
    const { alerts } = deriveAlerts(inputs({ devices: [device('d1', 1)], journal, people: [rosa] }));
    expect(alerts[0].personId).toBe('p1');
  });
});

test.describe('connection alerts when the window grows (D7)', () => {
  const lastSeen = iso(-40);
  const id = connectionAlertId('d1', lastSeen);
  const journal = { [id]: { id, kind: 'conexion' as const, deviceId: 'd1', at: lastSeen, detectedAt: iso(-5) } };
  const wide = { ...DEFAULT_SETTINGS, offlineWindowMinutes: 60 };

  test('an unacknowledged one disappears', () => {
    expect(deriveAlerts(inputs({ devices: [device('d1', 40)], journal, settings: wide })).alerts).toEqual([]);
  });

  test('an acknowledged one no longer stays open either', () => {
    const { alerts } = deriveAlerts(
      inputs({ devices: [device('d1', 40)], journal, settings: wide, acknowledgements: { [id]: { acknowledgedAt: iso(-3) } } }),
    );
    expect(alerts.filter((alert) => alert.state !== 'resuelta')).toEqual([]);
  });

  test('one the user resolved stays in the history', () => {
    const { alerts } = deriveAlerts(
      inputs({ devices: [device('d1', 40)], journal, settings: wide, acknowledgements: { [id]: { acknowledgedAt: iso(-3), resolvedAt: iso(-2) } } }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ state: 'resuelta', resolvedBy: 'usuario' });
  });

  test('it comes back if the window shrinks again', () => {
    const { alerts } = deriveAlerts(inputs({ devices: [device('d1', 40)], journal, acknowledgements: { [id]: { acknowledgedAt: iso(-3) } } }));
    expect(alerts[0]).toMatchObject({ state: 'atendida' });
  });
});

test.describe('alertReferenceTime (D1)', () => {
  const POLL = 15_000;
  const lastSuccessAt = NOW;
  const base = { lastSuccessAt, unreachable: false, hidden: false, pollIntervalMs: POLL };

  test('uses the live clock while data is fresh', () => {
    expect(alertReferenceTime({ ...base, now: NOW + 20_000 })).toBe(NOW + 20_000);
  });

  test('uses the last successful fetch while the tab is hidden, the server is unreachable or the data is stale', () => {
    expect(alertReferenceTime({ ...base, now: NOW + 5_000, hidden: true })).toBe(NOW);
    expect(alertReferenceTime({ ...base, now: NOW + 5_000, unreachable: true })).toBe(NOW);
    expect(alertReferenceTime({ ...base, now: NOW + POLL + 31_000 })).toBe(NOW);
  });

  test('with a slow poll interval, data goes stale only after interval plus margin', () => {
    const slow = { ...base, pollIntervalMs: 300_000 };
    expect(alertReferenceTime({ ...slow, now: NOW + 329_000 })).toBe(NOW + 329_000);
    expect(alertReferenceTime({ ...slow, now: NOW + 331_000 })).toBe(NOW);
  });

  test('without any successful fetch there is nothing older to use', () => {
    expect(alertReferenceTime({ ...base, lastSuccessAt: null, now: NOW, hidden: true })).toBe(NOW);
  });

  test('a viewer-side pause never writes a connection alert, but a really silent device is found on the next success', () => {
    const quiet = device('d1', 10); // reported 10 min before the last fetch
    const hiddenForAnHour = alertReferenceTime({ ...base, now: NOW + 60 * MIN, hidden: true });
    expect(deriveAlerts(inputs({ devices: [quiet], now: hiddenForAnHour })).newJournalEntries).toEqual([]);
    // Tab visible again, before the next fetch answers: still stale.
    const backButNotYetFetched = alertReferenceTime({ ...base, now: NOW + 60 * MIN });
    expect(deriveAlerts(inputs({ devices: [quiet], now: backButNotYetFetched })).newJournalEntries).toEqual([]);
    // The fetch answers: the device reported 10 min before the old fetch, so it is now 70 min silent.
    const afterFetch = alertReferenceTime({ ...base, lastSuccessAt: NOW + 60 * MIN, now: NOW + 60 * MIN + 1_000 });
    const found = deriveAlerts(inputs({ devices: [quiet], now: afterFetch }));
    expect(found.alerts.map((alert) => alert.kind)).toEqual(['conexion']);
  });
});
