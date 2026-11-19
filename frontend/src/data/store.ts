import type { AlertAck, AlertJournalEntry, CareData, EmergencyContact, Person, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { newId } from '../lib/id';

export type PersonInput = { name: string; relation: string; deviceId: string | null };
export type ContactInput = Omit<EmergencyContact, 'id'>;

/**
 * Local entities the backend does not have yet: people, their device, emergency contacts, alert
 * acknowledgements, the alert journal and settings. Views reach it only through hooks, so a backend
 * implementation of this interface can replace the localStorage one without touching them.
 * Reads are synchronous snapshots; writes are async so a remote implementation fits the same shape.
 */
export interface CareRepository {
  getSnapshot(): CareData;
  subscribe(listener: () => void): () => void;
  addPerson(input: PersonInput): Promise<Person>;
  updatePerson(id: string, input: Partial<PersonInput>): Promise<Person>;
  /**
   * Gives a device to a person (or to nobody with `null`) in one change: the previous owner loses it in
   * the same write. Refuses a person that no longer exists or already has another device.
   */
  assignDevice(deviceId: string, personId: string | null): Promise<void>;
  removePerson(id: string): Promise<void>;
  addContact(personId: string, input: ContactInput): Promise<EmergencyContact>;
  updateContact(personId: string, contactId: string, input: Partial<ContactInput>): Promise<EmergencyContact>;
  removeContact(personId: string, contactId: string): Promise<void>;
  acknowledgeAlert(alertId: string, note?: string): Promise<void>;
  resolveAlert(alertId: string, note?: string): Promise<void>;
  /** Puts an alert's acknowledgement back to an earlier value ("Deshacer"). */
  restoreAlertAck(alertId: string, previous: AlertAck | undefined): Promise<void>;
  recordAlertEvents(entries: readonly AlertJournalEntry[]): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Deletes every local entity and returns to defaults. */
  reset(): Promise<void>;
}

/** A user-facing validation problem. `message` is Spanish UI copy. */
export class StoreValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreValidationError';
  }
}

export const SETTINGS_LIMITS = {
  offlineWindowMinutes: { min: 5, max: 1440 },
  pollIntervalSeconds: { min: 5, max: 300 },
} as const;

const JOURNAL_LIMIT = 1000;

/**
 * Polling faster than half the offline window keeps the data fresh enough that a gap between two
 * fetches can never look like a silent device (the viewer sees data at most one interval plus a margin
 * old, and devices report about every 30 s).
 */
export const maxPollSeconds = (offlineWindowMinutes: number) => Math.floor(offlineWindowMinutes * 30);

export function emptyCareData(): CareData {
  return { version: 1, people: [], acknowledgements: {}, journal: {}, settings: { ...DEFAULT_SETTINGS } };
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function parseContact(value: unknown): EmergencyContact | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)) return null;
  return {
    id: value.id,
    name: value.name,
    relation: isString(value.relation) ? value.relation : '',
    phone: isString(value.phone) ? value.phone : '',
  };
}

function parsePerson(value: unknown): Person | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name)) return null;
  return {
    id: value.id,
    name: value.name,
    relation: isString(value.relation) ? value.relation : '',
    deviceId: isString(value.deviceId) && value.deviceId ? value.deviceId : null,
    contacts: Array.isArray(value.contacts) ? value.contacts.map(parseContact).filter((c): c is EmergencyContact => c !== null) : [],
    createdAt: isString(value.createdAt) ? value.createdAt : new Date(0).toISOString(),
  };
}

function clampInt(value: unknown, fallback: number, limits: { min: number; max: number }): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= limits.min && value <= limits.max ? value : fallback;
}

/** Turns untrusted stored JSON into valid data. Returns null when it is not recognisable at all. */
export function parseCareData(raw: unknown): CareData | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const acknowledgements: Record<string, AlertAck> = {};
  if (isRecord(raw.acknowledgements)) {
    for (const [id, ack] of Object.entries(raw.acknowledgements)) {
      if (!isRecord(ack)) continue;
      acknowledgements[id] = {
        acknowledgedAt: isString(ack.acknowledgedAt) ? ack.acknowledgedAt : undefined,
        acknowledgeNote: isString(ack.acknowledgeNote) ? ack.acknowledgeNote : undefined,
        resolvedAt: isString(ack.resolvedAt) ? ack.resolvedAt : undefined,
        resolveNote: isString(ack.resolveNote) ? ack.resolveNote : undefined,
      };
    }
  }
  const journal: Record<string, AlertJournalEntry> = {};
  if (isRecord(raw.journal)) {
    for (const [id, entry] of Object.entries(raw.journal)) {
      if (!isRecord(entry) || (entry.kind !== 'caida' && entry.kind !== 'conexion') || !isString(entry.deviceId) || !isString(entry.at)) continue;
      journal[id] = {
        id,
        kind: entry.kind,
        deviceId: entry.deviceId,
        at: entry.at,
        detectedAt: isString(entry.detectedAt) ? entry.detectedAt : entry.at,
        ...(isString(entry.personId) ? { personId: entry.personId } : entry.personId === null ? { personId: null } : {}),
      };
    }
  }
  const offlineWindowMinutes = clampInt(settings.offlineWindowMinutes, DEFAULT_SETTINGS.offlineWindowMinutes, SETTINGS_LIMITS.offlineWindowMinutes);
  const pollIntervalSeconds = Math.min(
    clampInt(settings.pollIntervalSeconds, DEFAULT_SETTINGS.pollIntervalSeconds, SETTINGS_LIMITS.pollIntervalSeconds),
    maxPollSeconds(offlineWindowMinutes),
  );
  return {
    version: 1,
    people: parsePeople(raw.people),
    acknowledgements,
    journal,
    settings: { offlineWindowMinutes, pollIntervalSeconds },
  };
}

/** Keeps the first of any repeated person or contact id and the first person to claim each device. */
function parsePeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return [];
  const personIds = new Set<string>();
  const deviceIds = new Set<string>();
  const people: Person[] = [];
  for (const value of raw) {
    const person = parsePerson(value);
    if (!person || personIds.has(person.id)) continue;
    personIds.add(person.id);
    const contactIds = new Set<string>();
    person.contacts = person.contacts.filter((contact) => !contactIds.has(contact.id) && !!contactIds.add(contact.id));
    if (person.deviceId) {
      if (deviceIds.has(person.deviceId)) person.deviceId = null;
      else deviceIds.add(person.deviceId);
    }
    people.push(person);
  }
  return people;
}

function requireText(value: string | undefined, field: string, message: string): string {
  const text = (value ?? '').trim();
  if (!text) throw new StoreValidationError(field, message);
  return text;
}

function trimJournal(journal: Record<string, AlertJournalEntry>): Record<string, AlertJournalEntry> {
  const entries = Object.values(journal);
  if (entries.length <= JOURNAL_LIMIT) return journal;
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return Object.fromEntries(entries.slice(0, JOURNAL_LIMIT).map((entry) => [entry.id, entry]));
}

/** localStorage implementation. `key` separates real data from demo data. */
export function createLocalCareRepository(key: string, seed?: () => CareData): CareRepository {
  const listeners = new Set<() => void>();
  let data = load();

  function load(): CareData {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return seed?.() ?? emptyCareData();
    }
    if (raw === null) return seed?.() ?? emptyCareData();
    try {
      const parsed = parseCareData(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // Falls through to the backup below.
    }
    // Keep the unreadable value instead of overwriting it, so it can be recovered by hand.
    try {
      window.localStorage.setItem(`${key}.corrupt-${Date.now()}`, raw);
    } catch {
      // Storage full or blocked: nothing more can be done here.
    }
    return emptyCareData();
  }

  function commit(next: CareData) {
    data = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the session keeps working in memory.
    }
    listeners.forEach((listener) => listener());
  }

  function personIndex(id: string): number {
    const index = data.people.findIndex((person) => person.id === id);
    if (index < 0) throw new StoreValidationError('id', 'Esta persona ya no existe.');
    return index;
  }

  function checkDeviceFree(deviceId: string | null, exceptPersonId?: string) {
    if (!deviceId) return;
    const owner = data.people.find((person) => person.deviceId === deviceId && person.id !== exceptPersonId);
    if (owner) throw new StoreValidationError('deviceId', `Este dispositivo ya está asignado a ${owner.name}.`);
  }

  function setAck(alertId: string, patch: AlertAck) {
    commit({ ...data, acknowledgements: { ...data.acknowledgements, [alertId]: { ...data.acknowledgements[alertId], ...patch } } });
  }

  const cleanNote = (note?: string) => (note && note.trim() ? note.trim() : undefined);

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      data = load();
      listeners.forEach((listener) => listener());
    });
  }

  return {
    getSnapshot: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async addPerson(input) {
      const name = requireText(input.name, 'name', 'Escriba el nombre de la persona.');
      const deviceId = input.deviceId?.trim() || null;
      checkDeviceFree(deviceId);
      const person: Person = { id: newId(), name, relation: input.relation.trim(), deviceId, contacts: [], createdAt: new Date().toISOString() };
      commit({ ...data, people: [...data.people, person] });
      return person;
    },

    async updatePerson(id, input) {
      const index = personIndex(id);
      const current = data.people[index];
      const deviceId = input.deviceId === undefined ? current.deviceId : input.deviceId?.trim() || null;
      checkDeviceFree(deviceId, id);
      const next: Person = {
        ...current,
        name: input.name === undefined ? current.name : requireText(input.name, 'name', 'Escriba el nombre de la persona.'),
        relation: input.relation === undefined ? current.relation : input.relation.trim(),
        deviceId,
      };
      const people = data.people.slice();
      people[index] = next;
      commit({ ...data, people });
      return next;
    },

    async assignDevice(deviceId, personId) {
      const id = deviceId.trim();
      if (!id) throw new StoreValidationError('deviceId', 'Falta el dispositivo.');
      const owner = data.people.find((person) => person.deviceId === id);
      if (owner?.id === personId) return;
      let target: Person | undefined;
      if (personId !== null) {
        target = data.people.find((person) => person.id === personId);
        if (!target) throw new StoreValidationError('personId', 'Esta persona ya no existe.');
        if (target.deviceId) throw new StoreValidationError('personId', `${target.name} ya tiene el dispositivo ${target.deviceId}. Quítelo primero desde su detalle.`);
      }
      commit({
        ...data,
        people: data.people.map((person) => (person.id === owner?.id ? { ...person, deviceId: null } : person.id === personId ? { ...person, deviceId: id } : person)),
      });
    },

    async removePerson(id) {
      personIndex(id);
      commit({ ...data, people: data.people.filter((person) => person.id !== id) });
    },

    async addContact(personId, input) {
      const index = personIndex(personId);
      const contact: EmergencyContact = {
        id: newId(),
        name: requireText(input.name, 'name', 'Escriba el nombre del contacto.'),
        relation: input.relation.trim(),
        phone: requireText(input.phone, 'phone', 'Escriba un número de teléfono.'),
      };
      const people = data.people.slice();
      people[index] = { ...people[index], contacts: [...people[index].contacts, contact] };
      commit({ ...data, people });
      return contact;
    },

    async updateContact(personId, contactId, input) {
      const index = personIndex(personId);
      const person = data.people[index];
      const current = person.contacts.find((contact) => contact.id === contactId);
      if (!current) throw new StoreValidationError('id', 'Este contacto ya no existe.');
      const next: EmergencyContact = {
        ...current,
        name: input.name === undefined ? current.name : requireText(input.name, 'name', 'Escriba el nombre del contacto.'),
        relation: input.relation === undefined ? current.relation : input.relation.trim(),
        phone: input.phone === undefined ? current.phone : requireText(input.phone, 'phone', 'Escriba un número de teléfono.'),
      };
      const people = data.people.slice();
      people[index] = { ...person, contacts: person.contacts.map((contact) => (contact.id === contactId ? next : contact)) };
      commit({ ...data, people });
      return next;
    },

    async removeContact(personId, contactId) {
      const index = personIndex(personId);
      const people = data.people.slice();
      people[index] = { ...people[index], contacts: people[index].contacts.filter((contact) => contact.id !== contactId) };
      commit({ ...data, people });
    },

    async acknowledgeAlert(alertId, note) {
      setAck(alertId, { acknowledgedAt: new Date().toISOString(), acknowledgeNote: cleanNote(note) });
    },

    async resolveAlert(alertId, note) {
      setAck(alertId, { resolvedAt: new Date().toISOString(), resolveNote: cleanNote(note) });
    },

    async restoreAlertAck(alertId, previous) {
      const acknowledgements = { ...data.acknowledgements };
      if (previous) acknowledgements[alertId] = previous;
      else delete acknowledgements[alertId];
      commit({ ...data, acknowledgements });
    },

    async recordAlertEvents(entries) {
      const fresh = entries.filter((entry) => !data.journal[entry.id]);
      if (fresh.length === 0) return;
      const journal = { ...data.journal };
      for (const entry of fresh) journal[entry.id] = entry;
      const kept = trimJournal(journal);
      // At the cap, a condition older than everything kept would be trimmed right away. Committing that
      // changes nothing but would be derived as new again, so do not commit it.
      if (!fresh.some((entry) => kept[entry.id])) return;
      commit({ ...data, journal: kept });
    },

    async updateSettings(patch) {
      const next = { ...data.settings, ...patch };
      for (const field of Object.keys(SETTINGS_LIMITS) as (keyof Settings)[]) {
        const { min, max } = SETTINGS_LIMITS[field];
        const value = next[field];
        if (!Number.isInteger(value) || value < min || value > max) {
          throw new StoreValidationError(field, `Use un número entero entre ${min} y ${max}.`);
        }
      }
      if (next.pollIntervalSeconds > maxPollSeconds(next.offlineWindowMinutes)) {
        const max = maxPollSeconds(next.offlineWindowMinutes);
        const field = patch.pollIntervalSeconds !== undefined ? 'pollIntervalSeconds' : 'offlineWindowMinutes';
        throw new StoreValidationError(
          field,
          field === 'pollIntervalSeconds'
            ? `Con ${next.offlineWindowMinutes} minutos sin reporte, use como máximo ${max} segundos entre actualizaciones.`
            : `Con ${next.pollIntervalSeconds} segundos entre actualizaciones, use al menos ${Math.ceil(next.pollIntervalSeconds / 30)} minutos sin reporte.`,
        );
      }
      commit({ ...data, settings: next });
      return next;
    },

    async reset() {
      commit(seed?.() ?? emptyCareData());
    },
  };
}
