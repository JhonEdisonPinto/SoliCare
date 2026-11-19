/**
 * The care document: people, device assignment, emergency contacts, alert acknowledgements, the alert
 * journal and settings, stored as one JSON value. The validation below is a port of `parseCareData` in
 * frontend/src/data/store.ts and must keep the same rules; the limits here also cap what one client can store.
 */
export type EmergencyContact = { id: string; name: string; relation: string; phone: string };

export type Person = {
  id: string;
  name: string;
  relation: string;
  deviceId: string | null;
  contacts: EmergencyContact[];
  createdAt: string;
};

export type AlertAck = { acknowledgedAt?: string; acknowledgeNote?: string; resolvedAt?: string; resolveNote?: string };

export type AlertJournalEntry = {
  id: string;
  kind: 'caida' | 'conexion';
  deviceId: string;
  at: string;
  detectedAt: string;
  personId?: string | null;
};

export type Settings = { offlineWindowMinutes: number; pollIntervalSeconds: number };

export type CareData = {
  version: 1;
  people: Person[];
  acknowledgements: Record<string, AlertAck>;
  journal: Record<string, AlertJournalEntry>;
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = { offlineWindowMinutes: 30, pollIntervalSeconds: 15 };

export const SETTINGS_LIMITS = {
  offlineWindowMinutes: { min: 5, max: 1440 },
  pollIntervalSeconds: { min: 5, max: 300 },
} as const;

/** Largest accepted document (people, contacts per person, journal entries, acknowledgements). */
export const CARE_LIMITS = {
  people: 100,
  contactsPerPerson: 10,
  journalEntries: 1000,
  acknowledgements: 2000,
} as const;

/** Request body cap for PUT /api/v1/care, in bytes. */
export const CARE_BODY_LIMIT_BYTES = 1024 * 1024;

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

/** Turns an untrusted value into valid data. Returns null when it is not recognisable at all. */
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

export type CareValidation = { ok: true; data: CareData } | { ok: false; reason: string };

/** The size limits of CARE_LIMITS, checked on the raw value before anything is copied. */
function limitProblem(raw: Record<string, unknown>): string | null {
  if (Array.isArray(raw.people)) {
    if (raw.people.length > CARE_LIMITS.people) return `At most ${CARE_LIMITS.people} people are allowed.`;
    for (const person of raw.people) {
      if (isRecord(person) && Array.isArray(person.contacts) && person.contacts.length > CARE_LIMITS.contactsPerPerson) {
        return `At most ${CARE_LIMITS.contactsPerPerson} contacts per person are allowed.`;
      }
    }
  }
  if (isRecord(raw.journal) && Object.keys(raw.journal).length > CARE_LIMITS.journalEntries) {
    return `At most ${CARE_LIMITS.journalEntries} journal entries are allowed.`;
  }
  if (isRecord(raw.acknowledgements) && Object.keys(raw.acknowledgements).length > CARE_LIMITS.acknowledgements) {
    return `At most ${CARE_LIMITS.acknowledgements} acknowledgements are allowed.`;
  }
  return null;
}

/** Validates and normalizes a document received from a client. */
export function validateCareDocument(raw: unknown): CareValidation {
  if (!isRecord(raw)) return { ok: false, reason: 'The document must be an object.' };
  const problem = limitProblem(raw);
  if (problem) return { ok: false, reason: problem };
  const data = parseCareData(raw);
  if (!data) return { ok: false, reason: 'Unrecognized document (expected version 1).' };
  return { ok: true, data };
}
