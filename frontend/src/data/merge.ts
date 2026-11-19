import type { AlertAck, AlertJournalEntry, CareData, Person } from './types';
import { CARE_LIMITS, parseCareData, trimJournal } from './store';

export type SkippedDevice = { deviceId: string; person: string; owner: string };

/** What merging a browser's local data into the server document did (or would do). */
export type MergeReport = {
  peopleAdded: number;
  contactsAdded: number;
  acknowledgementsAdded: number;
  journalAdded: number;
  /** Devices the local data gave to a person but the server already assigned to someone else; the server keeps them. */
  skippedDevices: SkippedDevice[];
  /** The server document had never been written (version 0), so the local settings were adopted. */
  settingsFromLocal: boolean;
  /** True when the merge changes the server document at all. */
  changed: boolean;
};

/**
 * Merges the data stored in this browser (`local`) into the server document (`server`). Pure: the server
 * document is not modified, and when nothing changes the same object comes back.
 *
 * - People by id. A person already on the server stays as it is there, except that contacts it lacks are
 *   added. A new person comes with its contacts; if its device is assigned to someone else on the server,
 *   the person is added without the device and the device is reported in `skippedDevices`.
 * - Acknowledgements and journal entries by id: on equal ids the server wins.
 * - Settings: the server's, unless the server document was never written (`serverVersion` 0).
 * The result respects `CARE_LIMITS`: what does not fit is left out (the oldest journal entries first).
 */
export function mergeCareData(server: CareData, serverVersion: number, local: CareData): { data: CareData; report: MergeReport } {
  const people: Person[] = server.people.map((person) => ({ ...person, contacts: [...person.contacts] }));
  const personById = new Map(people.map((person) => [person.id, person]));
  const deviceOwner = new Map<string, Person>();
  for (const person of people) if (person.deviceId) deviceOwner.set(person.deviceId, person);

  let peopleAdded = 0;
  let contactsAdded = 0;
  const skippedDevices: SkippedDevice[] = [];

  for (const incoming of local.people) {
    const existing = personById.get(incoming.id);
    if (existing) {
      const known = new Set(existing.contacts.map((contact) => contact.id));
      for (const contact of incoming.contacts) {
        if (known.has(contact.id) || existing.contacts.length >= CARE_LIMITS.contactsPerPerson) continue;
        existing.contacts.push(contact);
        contactsAdded += 1;
      }
      continue;
    }
    if (people.length >= CARE_LIMITS.people) continue;
    const person: Person = { ...incoming, contacts: incoming.contacts.slice(0, CARE_LIMITS.contactsPerPerson) };
    if (person.deviceId) {
      const owner = deviceOwner.get(person.deviceId);
      if (owner) {
        skippedDevices.push({ deviceId: person.deviceId, person: person.name, owner: owner.name });
        person.deviceId = null;
      } else {
        deviceOwner.set(person.deviceId, person);
      }
    }
    people.push(person);
    personById.set(person.id, person);
    peopleAdded += 1;
    contactsAdded += person.contacts.length;
  }

  const acknowledgements: Record<string, AlertAck> = { ...server.acknowledgements };
  let acknowledgementsAdded = 0;
  for (const [id, ack] of Object.entries(local.acknowledgements)) {
    if (id in acknowledgements || Object.keys(acknowledgements).length >= CARE_LIMITS.acknowledgements) continue;
    acknowledgements[id] = ack;
    acknowledgementsAdded += 1;
  }

  const journal: Record<string, AlertJournalEntry> = { ...server.journal };
  for (const [id, entry] of Object.entries(local.journal)) if (!(id in journal)) journal[id] = entry;
  const keptJournal = trimJournal(journal);
  const journalAdded = Object.keys(keptJournal).filter((id) => !(id in server.journal)).length;

  const settingsFromLocal =
    serverVersion === 0 &&
    (local.settings.offlineWindowMinutes !== server.settings.offlineWindowMinutes || local.settings.pollIntervalSeconds !== server.settings.pollIntervalSeconds);

  const changed = peopleAdded + contactsAdded + acknowledgementsAdded + journalAdded > 0 || settingsFromLocal;
  const report: MergeReport = { peopleAdded, contactsAdded, acknowledgementsAdded, journalAdded, skippedDevices, settingsFromLocal, changed };
  if (!changed) return { data: server, report };

  const merged = parseCareData({
    version: 1,
    people,
    acknowledgements,
    journal: keptJournal,
    settings: settingsFromLocal ? local.settings : server.settings,
  });
  return { data: merged ?? server, report };
}
