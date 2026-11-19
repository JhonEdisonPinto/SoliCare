import { expect, test } from '@playwright/test';
import { mergeCareData } from '../../src/data/merge';
import { CARE_LIMITS, emptyCareData } from '../../src/data/store';
import type { AlertJournalEntry, CareData, EmergencyContact, Person } from '../../src/data/types';

const contact = (id: string): EmergencyContact => ({ id, name: `Contacto ${id}`, relation: '', phone: '300' });
const person = (id: string, deviceId: string | null = null, contacts: EmergencyContact[] = []): Person => ({
  id,
  name: `Persona ${id}`,
  relation: '',
  deviceId,
  contacts,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const entry = (id: string, at = '2026-01-01T00:00:00.000Z'): AlertJournalEntry => ({ id, kind: 'caida', deviceId: 'd', at, detectedAt: at });
const doc = (overrides: Partial<CareData> = {}): CareData => ({ ...emptyCareData(), ...overrides });

test.describe('mergeCareData', () => {
  test('adds local people with their contacts to an empty server document', () => {
    const local = doc({ people: [person('a', 'dev-1', [contact('c1'), contact('c2')]), person('b')] });
    const { data, report } = mergeCareData(emptyCareData(), 0, local);
    expect(data.people.map((p) => [p.id, p.deviceId, p.contacts.length])).toEqual([['a', 'dev-1', 2], ['b', null, 0]]);
    expect(report).toMatchObject({ peopleAdded: 2, contactsAdded: 2, skippedDevices: [], changed: true });
  });

  test('a person that is already on the server stays as the server has it; only missing contacts are added', () => {
    const server = doc({ people: [{ ...person('a', 'dev-9', [contact('c1')]), name: 'Nombre del servidor' }] });
    const local = doc({ people: [{ ...person('a', 'dev-1', [{ ...contact('c1'), name: 'Local' }, contact('c2')]), name: 'Nombre local' }] });
    const { data, report } = mergeCareData(server, 3, local);
    expect(data.people).toHaveLength(1);
    expect(data.people[0]).toMatchObject({ name: 'Nombre del servidor', deviceId: 'dev-9' });
    expect(data.people[0].contacts.map((c) => [c.id, c.name])).toEqual([['c1', 'Contacto c1'], ['c2', 'Contacto c2']]);
    expect(report).toMatchObject({ peopleAdded: 0, contactsAdded: 1, changed: true });
  });

  test('a device assigned on the server stays with the server person and the local assignment is reported as skipped', () => {
    const server = doc({ people: [person('s', 'dev-1')] });
    const local = doc({ people: [person('l', 'dev-1'), person('m', 'dev-2')] });
    const { data, report } = mergeCareData(server, 2, local);
    expect(data.people.map((p) => [p.id, p.deviceId])).toEqual([['s', 'dev-1'], ['l', null], ['m', 'dev-2']]);
    expect(report.skippedDevices).toEqual([{ deviceId: 'dev-1', person: 'Persona l', owner: 'Persona s' }]);
  });

  test('two local people with the same device: the first gets it, the second is reported', () => {
    const { data, report } = mergeCareData(emptyCareData(), 0, doc({ people: [person('a', 'dev-1'), person('b', 'dev-1')] }));
    expect(data.people.map((p) => p.deviceId)).toEqual(['dev-1', null]);
    expect(report.skippedDevices).toHaveLength(1);
  });

  test('acknowledgements and journal entries merge by id and the server wins on equal ids', () => {
    const server = doc({ acknowledgements: { x: { acknowledgedAt: 'server' } }, journal: { j1: { ...entry('j1'), deviceId: 'server' } } });
    const local = doc({
      acknowledgements: { x: { acknowledgedAt: 'local' }, y: { resolvedAt: 'local' } },
      journal: { j1: { ...entry('j1'), deviceId: 'local' }, j2: entry('j2') },
    });
    const { data, report } = mergeCareData(server, 5, local);
    expect(data.acknowledgements.x.acknowledgedAt).toBe('server');
    expect(data.acknowledgements.y.resolvedAt).toBe('local');
    expect(data.journal.j1.deviceId).toBe('server');
    expect(Object.keys(data.journal).sort()).toEqual(['j1', 'j2']);
    expect(report).toMatchObject({ acknowledgementsAdded: 1, journalAdded: 1 });
  });

  test('settings: the server keeps its own unless the server document is version 0', () => {
    const server = doc({ settings: { offlineWindowMinutes: 60, pollIntervalSeconds: 20 } });
    const local = doc({ people: [person('a')], settings: { offlineWindowMinutes: 10, pollIntervalSeconds: 10 } });
    expect(mergeCareData(server, 4, local).data.settings).toEqual({ offlineWindowMinutes: 60, pollIntervalSeconds: 20 });
    const fresh = mergeCareData(server, 0, local);
    expect(fresh.data.settings).toEqual({ offlineWindowMinutes: 10, pollIntervalSeconds: 10 });
    expect(fresh.report.settingsFromLocal).toBe(true);
  });

  test('nothing new: the very same server object comes back and the report says unchanged', () => {
    const server = doc({ people: [person('a', 'dev-1', [contact('c1')])], acknowledgements: { x: {} }, journal: { j1: entry('j1') } });
    const local = doc({ people: [person('a', 'dev-1', [contact('c1')])], acknowledgements: { x: {} }, journal: { j1: entry('j1') } });
    const result = mergeCareData(server, 7, local);
    expect(result.data).toBe(server);
    expect(result.report.changed).toBe(false);
  });

  test('the server document is never modified', () => {
    const server = doc({ people: [person('a', null, [contact('c1')])] });
    const snapshot = JSON.stringify(server);
    mergeCareData(server, 1, doc({ people: [person('a', null, [contact('c1'), contact('c2')]), person('b')], acknowledgements: { z: {} } }));
    expect(JSON.stringify(server)).toBe(snapshot);
  });

  test('respects the document limits: people, contacts per person and journal entries', () => {
    const many = Array.from({ length: CARE_LIMITS.people + 5 }, (_, i) => person(`p${i}`));
    const { data, report } = mergeCareData(emptyCareData(), 0, doc({ people: many }));
    expect(data.people).toHaveLength(CARE_LIMITS.people);
    expect(report.peopleAdded).toBe(CARE_LIMITS.people);

    const contacts = Array.from({ length: CARE_LIMITS.contactsPerPerson + 3 }, (_, i) => contact(`c${i}`));
    expect(mergeCareData(emptyCareData(), 0, doc({ people: [person('a', null, contacts)] })).data.people[0].contacts).toHaveLength(CARE_LIMITS.contactsPerPerson);

    const journal = Object.fromEntries(Array.from({ length: CARE_LIMITS.journalEntries + 10 }, (_, i) => [`j${i}`, entry(`j${i}`, new Date(2026, 0, 1, 0, 0, i).toISOString())]));
    const merged = mergeCareData(emptyCareData(), 0, doc({ journal })).data;
    expect(Object.keys(merged.journal)).toHaveLength(CARE_LIMITS.journalEntries);
    expect(merged.journal[`j${CARE_LIMITS.journalEntries + 9}`]).toBeDefined();
    expect(merged.journal.j0).toBeUndefined();
  });
});
