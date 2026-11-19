import { expect, test } from '@playwright/test';
import { createLocalCareRepository, parseCareData, StoreValidationError } from '../../src/data/store';
import { DEFAULT_SETTINGS, type AlertJournalEntry, type CareData } from '../../src/data/types';

const person = (id: string, deviceId: string | null = null, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Persona ${id}`,
  relation: '',
  deviceId,
  contacts: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const valid = (overrides: Record<string, unknown> = {}) => ({ version: 1, people: [], acknowledgements: {}, journal: {}, settings: {}, ...overrides });

test.describe('parseCareData with untrusted input', () => {
  test('rejects what is not recognisable at all', () => {
    for (const raw of [null, undefined, 42, 'text', [], {}, { version: 2 }, { version: '1' }]) expect(parseCareData(raw)).toBeNull();
  });

  test('wrong container types become empty ones instead of throwing', () => {
    const data = parseCareData({ version: 1, people: 'x', acknowledgements: [], journal: 7, settings: null });
    expect(data).toEqual({ version: 1, people: [], acknowledgements: {}, journal: {}, settings: DEFAULT_SETTINGS });
  });

  test('drops people and contacts with the wrong shape and fixes wrong field types', () => {
    const data = parseCareData(
      valid({
        people: [
          null,
          'x',
          { id: 1, name: 'No id' },
          { id: 'a' },
          person('b', 42 as unknown as string, { relation: 9, createdAt: 3, contacts: [null, { id: 'c1' }, { id: 'c2', name: 'Ok', phone: 5 }] }),
        ],
      }),
    );
    expect(data?.people.map((p) => p.id)).toEqual(['b']);
    expect(data?.people[0]).toMatchObject({ relation: '', deviceId: null });
    expect(data?.people[0].contacts).toEqual([{ id: 'c2', name: 'Ok', relation: '', phone: '' }]);
  });

  test('settings outside the limits or not integers fall back to the defaults', () => {
    const data = parseCareData(valid({ settings: { offlineWindowMinutes: 'x', pollIntervalSeconds: 2.5 } }));
    expect(data?.settings).toEqual(DEFAULT_SETTINGS);
    expect(parseCareData(valid({ settings: { offlineWindowMinutes: 5000 } }))?.settings.offlineWindowMinutes).toBe(DEFAULT_SETTINGS.offlineWindowMinutes);
  });

  test('a poll interval above half the offline window is lowered to that half', () => {
    const data = parseCareData(valid({ settings: { offlineWindowMinutes: 5, pollIntervalSeconds: 300 } }));
    expect(data?.settings).toEqual({ offlineWindowMinutes: 5, pollIntervalSeconds: 150 });
  });

  test('keeps only journal entries and acknowledgements that have the right shape', () => {
    const data = parseCareData(
      valid({
        journal: {
          ok: { kind: 'caida', deviceId: 'd1', at: '2026-01-01T00:00:00.000Z', personId: 'p1' },
          legacy: { kind: 'conexion', deviceId: 'd1', at: '2026-01-01T00:00:00.000Z' },
          badKind: { kind: 'x', deviceId: 'd1', at: 'y' },
          badDevice: { kind: 'caida', deviceId: 3, at: 'y' },
          notObject: 'x',
        },
        acknowledgements: { a: { acknowledgedAt: 5, acknowledgeNote: 'n' }, b: 'x' },
      }),
    );
    expect(Object.keys(data!.journal).sort()).toEqual(['legacy', 'ok']);
    expect(data!.journal.ok.personId).toBe('p1');
    expect(data!.journal.legacy.personId).toBeUndefined();
    expect(data!.acknowledgements).toEqual({ a: { acknowledgedAt: undefined, acknowledgeNote: 'n', resolvedAt: undefined, resolveNote: undefined } });
  });

  test('duplicate person ids keep the first', () => {
    const data = parseCareData(valid({ people: [person('a', null, { name: 'First' }), person('a', null, { name: 'Second' })] }));
    expect(data?.people.map((p) => p.name)).toEqual(['First']);
  });

  test('duplicate contact ids inside a person keep the first', () => {
    const contacts = [
      { id: 'c', name: 'First', relation: '', phone: '1' },
      { id: 'c', name: 'Second', relation: '', phone: '2' },
    ];
    const data = parseCareData(valid({ people: [person('a', null, { contacts })] }));
    expect(data?.people[0].contacts.map((c) => c.name)).toEqual(['First']);
  });

  test('a device is never assigned to two people: the first keeps it', () => {
    const data = parseCareData(valid({ people: [person('a', 'd1'), person('b', 'd1'), person('c', 'd2')] }));
    expect(data?.people.map((p) => [p.id, p.deviceId])).toEqual([
      ['a', 'd1'],
      ['b', null],
      ['c', 'd2'],
    ]);
  });
});

function repo(people: ReturnType<typeof person>[] = [], journal: Record<string, AlertJournalEntry> = {}) {
  const seed = (): CareData => ({ version: 1, people, acknowledgements: {}, journal, settings: { ...DEFAULT_SETTINGS } });
  return createLocalCareRepository('test', seed);
}

test.describe('assignDevice is one atomic operation (D2)', () => {
  test('moves a device from its owner to a free person in a single change', async () => {
    const r = repo([person('a', 'd1'), person('b')]);
    let changes = 0;
    r.subscribe(() => (changes += 1));
    await r.assignDevice('d1', 'b');
    expect(changes).toBe(1);
    expect(r.getSnapshot().people.map((p) => [p.id, p.deviceId])).toEqual([
      ['a', null],
      ['b', 'd1'],
    ]);
  });

  test('null frees the device', async () => {
    const r = repo([person('a', 'd1')]);
    await r.assignDevice('d1', null);
    expect(r.getSnapshot().people[0].deviceId).toBeNull();
  });

  test('refuses a person that no longer exists and changes nothing, not even the previous owner', async () => {
    const r = repo([person('a', 'd1')]);
    const before = r.getSnapshot();
    await expect(r.assignDevice('d1', 'gone')).rejects.toBeInstanceOf(StoreValidationError);
    expect(r.getSnapshot()).toBe(before);
  });

  test('refuses a person who already has another device, and changes nothing', async () => {
    const r = repo([person('a', 'd1'), person('b', 'd2')]);
    const before = r.getSnapshot();
    await expect(r.assignDevice('d1', 'b')).rejects.toMatchObject({ field: 'personId' });
    expect(r.getSnapshot()).toBe(before);
  });

  test('assigning the device to its current owner is a no-op', async () => {
    const r = repo([person('a', 'd1')]);
    const before = r.getSnapshot();
    await r.assignDevice('d1', 'a');
    expect(r.getSnapshot()).toBe(before);
  });
});

test.describe('settings validation', () => {
  test('a poll interval above half the offline window is rejected', async () => {
    const r = repo();
    await expect(r.updateSettings({ offlineWindowMinutes: 5, pollIntervalSeconds: 151 })).rejects.toMatchObject({ field: 'pollIntervalSeconds' });
    await expect(r.updateSettings({ offlineWindowMinutes: 5, pollIntervalSeconds: 150 })).resolves.toEqual({ offlineWindowMinutes: 5, pollIntervalSeconds: 150 });
  });

  test('shrinking only the window below twice the poll interval is rejected on the window field', async () => {
    const r = repo();
    await r.updateSettings({ pollIntervalSeconds: 300 });
    await expect(r.updateSettings({ offlineWindowMinutes: 5 })).rejects.toMatchObject({ field: 'offlineWindowMinutes' });
  });
});

test.describe('journal cap (D6)', () => {
  const entry = (n: number): AlertJournalEntry => ({
    id: `caida:d1:${n}`,
    kind: 'caida',
    deviceId: 'd1',
    at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
    detectedAt: '2026-02-01T00:00:00.000Z',
  });
  const full = () => {
    const journal: Record<string, AlertJournalEntry> = {};
    for (let n = 1000; n < 2000; n += 1) journal[entry(n).id] = entry(n);
    return journal;
  };

  test('recording a condition older than everything kept changes nothing, so it cannot loop', async () => {
    const r = repo([], full());
    const before = r.getSnapshot();
    let changes = 0;
    r.subscribe(() => (changes += 1));
    await r.recordAlertEvents([entry(1)]);
    await r.recordAlertEvents([entry(1)]);
    expect(changes).toBe(0);
    expect(r.getSnapshot()).toBe(before);
  });

  test('recording a newer condition evicts the oldest one and stays at the cap', async () => {
    const r = repo([], full());
    await r.recordAlertEvents([entry(5000)]);
    const journal = r.getSnapshot().journal;
    expect(Object.keys(journal)).toHaveLength(1000);
    expect(journal[entry(5000).id]).toBeDefined();
    expect(journal[entry(1000).id]).toBeUndefined();
  });

  test('recording the same entry twice commits once', async () => {
    const r = repo();
    let changes = 0;
    r.subscribe(() => (changes += 1));
    await r.recordAlertEvents([entry(1)]);
    await r.recordAlertEvents([entry(1)]);
    expect(changes).toBe(1);
  });
});
