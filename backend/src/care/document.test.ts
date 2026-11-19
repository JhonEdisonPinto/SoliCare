import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CARE_LIMITS, DEFAULT_SETTINGS, emptyCareData, validateCareDocument } from './document.js';

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Persona ${id}`,
  relation: '',
  deviceId: null,
  contacts: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const doc = (overrides: Record<string, unknown> = {}) => ({ version: 1, people: [], acknowledgements: {}, journal: {}, settings: {}, ...overrides });

describe('validateCareDocument', () => {
  test('accepts the empty document and a normal one', () => {
    assert.deepEqual(validateCareDocument(emptyCareData()), { ok: true, data: emptyCareData() });
    const result = validateCareDocument(doc({ people: [person('a', { deviceId: 'dev-1', contacts: [{ id: 'c', name: 'Ana', relation: 'Hija', phone: '300' }] })] }));
    assert.ok(result.ok);
    assert.equal(result.data.people[0].contacts[0].phone, '300');
  });

  test('rejects what is not recognisable', () => {
    for (const raw of [null, undefined, 42, 'text', [], {}, { version: 2 }, { version: '1' }]) {
      assert.equal(validateCareDocument(raw).ok, false);
    }
  });

  test('normalizes like the frontend: wrong containers, bad entries, duplicate ids and devices, settings', () => {
    const wrong = validateCareDocument({ version: 1, people: 'x', acknowledgements: [], journal: 7, settings: null });
    assert.ok(wrong.ok);
    assert.deepEqual(wrong.data, { version: 1, people: [], acknowledgements: {}, journal: {}, settings: DEFAULT_SETTINGS });

    const messy = validateCareDocument(
      doc({
        people: [null, { id: 1, name: 'No id' }, person('b', { deviceId: 42, relation: 9, contacts: [null, { id: 'c1' }, { id: 'c2', name: 'Ok', phone: 5 }] }), person('b', { name: 'Again' }), person('c', { deviceId: 'd1' }), person('d', { deviceId: 'd1' })],
        journal: { j1: { kind: 'caida', deviceId: 'd1', at: 'T1', personId: null }, j2: { kind: 'otro', deviceId: 'd1', at: 'T' } },
        settings: { offlineWindowMinutes: 5, pollIntervalSeconds: 300 },
      }),
    );
    assert.ok(messy.ok);
    assert.deepEqual(messy.data.people.map((p) => [p.id, p.deviceId]), [['b', null], ['c', 'd1'], ['d', null]]);
    assert.deepEqual(messy.data.people[0].contacts, [{ id: 'c2', name: 'Ok', relation: '', phone: '' }]);
    assert.deepEqual(Object.keys(messy.data.journal), ['j1']);
    assert.deepEqual(messy.data.journal.j1, { id: 'j1', kind: 'caida', deviceId: 'd1', at: 'T1', detectedAt: 'T1', personId: null });
    // The poll interval is capped at half the offline window (5 min -> 150 s).
    assert.deepEqual(messy.data.settings, { offlineWindowMinutes: 5, pollIntervalSeconds: 150 });
  });

  test('rejects documents over the count limits', () => {
    const people = Array.from({ length: CARE_LIMITS.people + 1 }, (_, i) => person(`p${i}`));
    assert.equal(validateCareDocument(doc({ people })).ok, false);
    const contacts = Array.from({ length: CARE_LIMITS.contactsPerPerson + 1 }, (_, i) => ({ id: `c${i}`, name: 'x', relation: '', phone: '1' }));
    assert.equal(validateCareDocument(doc({ people: [person('a', { contacts })] })).ok, false);
    const journal = Object.fromEntries(Array.from({ length: CARE_LIMITS.journalEntries + 1 }, (_, i) => [`j${i}`, { kind: 'caida', deviceId: 'd', at: 'T' }]));
    assert.equal(validateCareDocument(doc({ journal })).ok, false);
    const acknowledgements = Object.fromEntries(Array.from({ length: CARE_LIMITS.acknowledgements + 1 }, (_, i) => [`a${i}`, {}]));
    assert.equal(validateCareDocument(doc({ acknowledgements })).ok, false);
    // Exactly at the limit is fine.
    assert.ok(validateCareDocument(doc({ people: people.slice(0, CARE_LIMITS.people) })).ok);
  });
});
