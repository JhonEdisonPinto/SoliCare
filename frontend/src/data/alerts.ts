import type { Alert, AlertAck, AlertJournalEntry, AlertState, Device, Person, Reading, Settings } from './types';
import { toMs } from '../lib/time';

export type AlertInputs = {
  devices: readonly Device[];
  /** Readings per device id, oldest first. */
  readingsByDevice: Readonly<Record<string, readonly Reading[]>>;
  people: readonly Person[];
  settings: Settings;
  acknowledgements: Readonly<Record<string, AlertAck>>;
  journal: Readonly<Record<string, AlertJournalEntry>>;
  /** Reference time. Use the time of the last successful fetch when the server is unreachable. */
  now: number;
};

export type AlertDerivation = {
  /** Open alerts first (by priority), then resolved ones (most recent first). */
  alerts: Alert[];
  /** Conditions observed now that the journal does not have yet. The caller persists them. */
  newJournalEntries: AlertJournalEntry[];
};

export const fallAlertId = (deviceId: string, at: string) => `caida:${deviceId}:${at}`;
export const connectionAlertId = (deviceId: string, lastSeenAt: string) => `conexion:${deviceId}:${lastSeenAt}`;

function stateOf(ack: AlertAck | undefined, resolvedByData: boolean): AlertState {
  if (ack?.resolvedAt || resolvedByData) return 'resuelta';
  if (ack?.acknowledgedAt) return 'atendida';
  return 'pendiente';
}

/** Lower is more urgent. Falls outrank connection problems; within a kind, pending outranks acknowledged. */
export function alertPriority(alert: Alert): number {
  if (alert.state === 'resuelta') return 9;
  const kind = alert.kind === 'caida' ? 0 : 2;
  return kind + (alert.state === 'pendiente' ? 0 : 1);
}

/** Compares two alerts for display: priority, then oldest first while open, newest first once resolved. */
export function compareAlerts(a: Alert, b: Alert): number {
  const byPriority = alertPriority(a) - alertPriority(b);
  if (byPriority !== 0) return byPriority;
  const aMs = toMs(a.state === 'resuelta' ? a.resolvedAt ?? a.at : a.at) ?? 0;
  const bMs = toMs(b.state === 'resuelta' ? b.resolvedAt ?? b.at : b.at) ?? 0;
  return a.state === 'resuelta' ? bMs - aMs : aMs - bMs;
}

/**
 * Derives fall and connection alerts from telemetry, settings, the user's acknowledgements and the
 * journal of previously observed conditions. Pure: same inputs, same output.
 */
export function deriveAlerts(input: AlertInputs): AlertDerivation {
  const { devices, readingsByDevice, people, settings, acknowledgements, journal, now } = input;
  const windowMs = settings.offlineWindowMinutes * 60_000;
  const personByDevice = new Map<string, string>();
  for (const person of people) if (person.deviceId) personByDevice.set(person.deviceId, person.id);
  const deviceById = new Map(devices.map((device) => [device.device_id, device]));

  const observed = new Map<string, AlertJournalEntry>();
  const detectedAt = new Date(now).toISOString();

  for (const [deviceId, readings] of Object.entries(readingsByDevice)) {
    for (const reading of readings) {
      if (reading.type !== 'caida') continue;
      const id = fallAlertId(deviceId, reading.received_at);
      observed.set(id, { id, kind: 'caida', deviceId, at: reading.received_at, detectedAt });
    }
  }
  for (const device of devices) {
    const seen = toMs(device.last_seen_at);
    if (seen === null || now - seen <= windowMs) continue;
    const id = connectionAlertId(device.device_id, device.last_seen_at);
    observed.set(id, { id, kind: 'conexion', deviceId: device.device_id, at: device.last_seen_at, detectedAt });
  }

  const newJournalEntries = [...observed.values()].filter((entry) => !journal[entry.id]);
  const entries = new Map<string, AlertJournalEntry>(Object.entries(journal));
  for (const entry of newJournalEntries) entries.set(entry.id, entry);

  const alerts: Alert[] = [];
  for (const entry of entries.values()) {
    const ack = acknowledgements[entry.id];
    let resolvedByData = false;
    let resolvedAt = ack?.resolvedAt;
    let overdueSince: string | undefined;

    if (entry.kind === 'conexion') {
      const device = deviceById.get(entry.deviceId);
      const entryMs = toMs(entry.at) ?? 0;
      const currentMs = toMs(device?.last_seen_at);
      if (currentMs !== null && currentMs > entryMs) {
        resolvedByData = true;
        const firstBack = readingsByDevice[entry.deviceId]?.find((reading) => (toMs(reading.received_at) ?? 0) > entryMs);
        resolvedAt = ack?.resolvedAt ?? firstBack?.received_at ?? device?.last_seen_at;
      } else if (!observed.has(entry.id) && !ack) {
        // Same last report but no longer past the window (the window setting grew): not an alert.
        continue;
      }
      overdueSince = new Date(entryMs + windowMs).toISOString();
    }

    const state = stateOf(ack, resolvedByData);
    alerts.push({
      id: entry.id,
      kind: entry.kind,
      deviceId: entry.deviceId,
      personId: personByDevice.get(entry.deviceId) ?? null,
      at: entry.at,
      overdueSince,
      state,
      acknowledgedAt: ack?.acknowledgedAt,
      acknowledgeNote: ack?.acknowledgeNote,
      resolvedAt: state === 'resuelta' ? resolvedAt : undefined,
      resolveNote: ack?.resolveNote,
      resolvedBy: state === 'resuelta' ? (ack?.resolvedAt ? 'usuario' : 'datos') : undefined,
    });
  }

  alerts.sort(compareAlerts);
  return { alerts, newJournalEntries };
}

export const isOpen = (alert: Alert) => alert.state !== 'resuelta';
