import type { AlertAck, AlertJournalEntry, CareData, EmergencyContact, Person, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { newId } from '../lib/id';

export type PersonInput = { name: string; relation: string; deviceId: string | null };
export type ContactInput = Omit<EmergencyContact, 'id'>;

/**
 * People, their device, emergency contacts, alert acknowledgements, the alert journal and settings.
 * Views reach them only through hooks. Two implementations: localStorage (demo mode, or a backend
 * without the care route) and the SoliCare server (`serverStore.ts`). Reads are synchronous snapshots;
 * writes are async because a remote write can fail or be retried.
 */
export interface CareRepository {
  /** Where the data lives: this browser's localStorage, or the SoliCare server behind the panel key. */
  readonly storage: 'local' | 'server';
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
  /** Deletes every entity and returns to defaults. */
  reset(): Promise<void>;
  /** Server storage only: fetches the stored document so other panels' changes show up. Never rejects. */
  refresh?(signal?: AbortSignal): Promise<void>;
  /** Server storage only: calls the listener with a Spanish message whenever a change could not be saved. */
  subscribeErrors?(listener: (message: string) => void): () => void;
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

/** Size limits of the care document. The backend (backend/src/care/document.ts) enforces the same numbers. */
export const CARE_LIMITS = { people: 100, contactsPerPerson: 10, journalEntries: 1000, acknowledgements: 2000 } as const;

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

export function trimJournal(journal: Record<string, AlertJournalEntry>): Record<string, AlertJournalEntry> {
  const entries = Object.values(journal);
  if (entries.length <= CARE_LIMITS.journalEntries) return journal;
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return Object.fromEntries(entries.slice(0, CARE_LIMITS.journalEntries).map((entry) => [entry.id, entry]));
}

/** Keeps the most recently acted-on acknowledgements when there are more than the document allows. */
export function trimAcknowledgements(acknowledgements: Record<string, AlertAck>): Record<string, AlertAck> {
  const entries = Object.entries(acknowledgements);
  if (entries.length <= CARE_LIMITS.acknowledgements) return acknowledgements;
  const latest = ([, ack]: [string, AlertAck]) => ack.resolvedAt ?? ack.acknowledgedAt ?? '';
  entries.sort((a, b) => latest(b).localeCompare(latest(a)));
  return Object.fromEntries(entries.slice(0, CARE_LIMITS.acknowledgements));
}

/**
 * A change to the document as a pure function: it gets the current document (and the stored version, 0
 * when nothing was ever stored) and returns the next one plus a result for the caller. It throws
 * `StoreValidationError` for a refused change and returns the same `data` object for "nothing to do".
 * Backends differ only in how they apply an operation: the local one commits it, the server one re-applies
 * it to a fresher document when another panel got there first. Anything random or time-based is fixed when
 * the operation is built, so applying it twice gives the same entity.
 */
export type CareOp<R = void> = (data: CareData, version: number) => { data: CareData; result: R };

const done = <R>(data: CareData, result: R) => ({ data, result });

function personIndex(data: CareData, id: string): number {
  const index = data.people.findIndex((person) => person.id === id);
  if (index < 0) throw new StoreValidationError('id', 'Esta persona ya no existe.');
  return index;
}

function checkDeviceFree(data: CareData, deviceId: string | null, exceptPersonId?: string) {
  if (!deviceId) return;
  const owner = data.people.find((person) => person.deviceId === deviceId && person.id !== exceptPersonId);
  if (owner) throw new StoreValidationError('deviceId', `Este dispositivo ya está asignado a ${owner.name}.`);
}

function withAck(data: CareData, alertId: string, patch: AlertAck): CareData {
  return {
    ...data,
    acknowledgements: trimAcknowledgements({ ...data.acknowledgements, [alertId]: { ...data.acknowledgements[alertId], ...patch } }),
  };
}

const cleanNote = (note?: string) => (note && note.trim() ? note.trim() : undefined);

export const careOps = {
  addPerson(input: PersonInput): CareOp<Person> {
    const id = newId();
    const createdAt = new Date().toISOString();
    return (data) => {
      const name = requireText(input.name, 'name', 'Escriba el nombre de la persona.');
      const deviceId = input.deviceId?.trim() || null;
      checkDeviceFree(data, deviceId);
      if (data.people.length >= CARE_LIMITS.people) {
        throw new StoreValidationError('name', `Se alcanzó el máximo de ${CARE_LIMITS.people} personas.`);
      }
      const person: Person = { id, name, relation: input.relation.trim(), deviceId, contacts: [], createdAt };
      return done({ ...data, people: [...data.people, person] }, person);
    };
  },

  updatePerson(id: string, input: Partial<PersonInput>): CareOp<Person> {
    return (data) => {
      const index = personIndex(data, id);
      const current = data.people[index];
      const deviceId = input.deviceId === undefined ? current.deviceId : input.deviceId?.trim() || null;
      checkDeviceFree(data, deviceId, id);
      const next: Person = {
        ...current,
        name: input.name === undefined ? current.name : requireText(input.name, 'name', 'Escriba el nombre de la persona.'),
        relation: input.relation === undefined ? current.relation : input.relation.trim(),
        deviceId,
      };
      const people = data.people.slice();
      people[index] = next;
      return done({ ...data, people }, next);
    };
  },

  assignDevice(deviceId: string, personId: string | null): CareOp {
    return (data) => {
      const id = deviceId.trim();
      if (!id) throw new StoreValidationError('deviceId', 'Falta el dispositivo.');
      const owner = data.people.find((person) => person.deviceId === id);
      if ((owner?.id ?? null) === personId) return done(data, undefined);
      if (personId !== null) {
        const target = data.people.find((person) => person.id === personId);
        if (!target) throw new StoreValidationError('personId', 'Esta persona ya no existe.');
        if (target.deviceId) throw new StoreValidationError('personId', `${target.name} ya tiene el dispositivo ${target.deviceId}. Quítelo primero desde su detalle.`);
      }
      return done(
        {
          ...data,
          people: data.people.map((person) => (person.id === owner?.id ? { ...person, deviceId: null } : person.id === personId ? { ...person, deviceId: id } : person)),
        },
        undefined,
      );
    };
  },

  removePerson(id: string): CareOp {
    return (data) => {
      personIndex(data, id);
      return done({ ...data, people: data.people.filter((person) => person.id !== id) }, undefined);
    };
  },

  addContact(personId: string, input: ContactInput): CareOp<EmergencyContact> {
    const id = newId();
    return (data) => {
      const index = personIndex(data, personId);
      const contact: EmergencyContact = {
        id,
        name: requireText(input.name, 'name', 'Escriba el nombre del contacto.'),
        relation: input.relation.trim(),
        phone: requireText(input.phone, 'phone', 'Escriba un número de teléfono.'),
      };
      if (data.people[index].contacts.length >= CARE_LIMITS.contactsPerPerson) {
        throw new StoreValidationError('name', `Se alcanzó el máximo de ${CARE_LIMITS.contactsPerPerson} contactos por persona.`);
      }
      const people = data.people.slice();
      people[index] = { ...people[index], contacts: [...people[index].contacts, contact] };
      return done({ ...data, people }, contact);
    };
  },

  updateContact(personId: string, contactId: string, input: Partial<ContactInput>): CareOp<EmergencyContact> {
    return (data) => {
      const index = personIndex(data, personId);
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
      return done({ ...data, people }, next);
    };
  },

  removeContact(personId: string, contactId: string): CareOp {
    return (data) => {
      const index = personIndex(data, personId);
      const people = data.people.slice();
      people[index] = { ...people[index], contacts: people[index].contacts.filter((contact) => contact.id !== contactId) };
      return done({ ...data, people }, undefined);
    };
  },

  acknowledgeAlert(alertId: string, note?: string): CareOp {
    const at = new Date().toISOString();
    return (data) => done(withAck(data, alertId, { acknowledgedAt: at, acknowledgeNote: cleanNote(note) }), undefined);
  },

  resolveAlert(alertId: string, note?: string): CareOp {
    const at = new Date().toISOString();
    return (data) => done(withAck(data, alertId, { resolvedAt: at, resolveNote: cleanNote(note) }), undefined);
  },

  restoreAlertAck(alertId: string, previous: AlertAck | undefined): CareOp {
    return (data) => {
      const acknowledgements = { ...data.acknowledgements };
      if (previous) acknowledgements[alertId] = previous;
      else delete acknowledgements[alertId];
      return done({ ...data, acknowledgements }, undefined);
    };
  },

  recordAlertEvents(entries: readonly AlertJournalEntry[]): CareOp {
    return (data) => {
      const fresh = entries.filter((entry) => !data.journal[entry.id]);
      if (fresh.length === 0) return done(data, undefined);
      const journal = { ...data.journal };
      for (const entry of fresh) journal[entry.id] = entry;
      const kept = trimJournal(journal);
      // At the cap, a condition older than everything kept would be trimmed right away. Committing that
      // changes nothing but would be derived as new again, so do not commit it.
      if (!fresh.some((entry) => kept[entry.id])) return done(data, undefined);
      return done({ ...data, journal: kept }, undefined);
    };
  },

  updateSettings(patch: Partial<Settings>): CareOp<Settings> {
    return (data) => {
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
      return done({ ...data, settings: next }, next);
    };
  },

  replaceAll(next: CareData): CareOp {
    return () => done(next, undefined);
  },
};

/** What a backend must provide to get the whole mutation surface of `CareRepository`. */
export type ApplyOp = <R>(op: CareOp<R>, options?: { silent?: boolean }) => Promise<R>;

type MutationMethods = Omit<CareRepository, 'storage' | 'getSnapshot' | 'subscribe' | 'refresh' | 'subscribeErrors'>;

/** The mutation methods of `CareRepository`, shared by every backend: each one applies a pure `careOps` operation. */
export function createMutations(apply: ApplyOp, seed?: () => CareData): MutationMethods {
  return {
    addPerson: (input) => apply(careOps.addPerson(input)),
    updatePerson: (id, input) => apply(careOps.updatePerson(id, input)),
    assignDevice: (deviceId, personId) => apply(careOps.assignDevice(deviceId, personId)),
    removePerson: (id) => apply(careOps.removePerson(id)),
    addContact: (personId, input) => apply(careOps.addContact(personId, input)),
    updateContact: (personId, contactId, input) => apply(careOps.updateContact(personId, contactId, input)),
    removeContact: (personId, contactId) => apply(careOps.removeContact(personId, contactId)),
    acknowledgeAlert: (alertId, note) => apply(careOps.acknowledgeAlert(alertId, note)),
    resolveAlert: (alertId, note) => apply(careOps.resolveAlert(alertId, note)),
    restoreAlertAck: (alertId, previous) => apply(careOps.restoreAlertAck(alertId, previous)),
    // A failed journal write is retried by the next derivation, so it must not raise a toast.
    recordAlertEvents: (entries) => apply(careOps.recordAlertEvents(entries), { silent: true }),
    updateSettings: (patch) => apply(careOps.updateSettings(patch)),
    reset: () => apply(careOps.replaceAll(seed?.() ?? emptyCareData())),
  };
}

/** Key of this browser's own care data, the one used before the server stored it. */
export const LOCAL_CARE_KEY = 'solicare.care.v1';

/** The care data kept in this browser under `key`, or null when there is none or it is unreadable. */
export function readLocalCareData(key: string = LOCAL_CARE_KEY): CareData | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : parseCareData(JSON.parse(raw));
  } catch {
    return null;
  }
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

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      data = load();
      listeners.forEach((listener) => listener());
    });
  }

  const apply: ApplyOp = async (op) => {
    const step = op(data, 1);
    if (step.data !== data) commit(step.data);
    return step.result;
  };

  return {
    storage: 'local',
    getSnapshot: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...createMutations(apply, seed),
  };
}
