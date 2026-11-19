import type { Alert, Device, Person } from './types';
import { toMs } from '../lib/time';

const DAY_MS = 24 * 60 * 60_000;

export const RESPONSE_WINDOW_DAYS = 30;

/** The moment a response is measured from: the fall itself, or the moment a silence crossed the offline window. */
export function responseStart(alert: Alert): number | null {
  return toMs(alert.kind === 'conexion' ? (alert.overdueSince ?? alert.at) : alert.at);
}

export type ResponseStats = {
  /** Alerts someone acknowledged within the window. */
  attended: number;
  /** Mean time from the alert to its acknowledgement; null when nothing was acknowledged. */
  meanResponseMs: number | null;
};

/** Alerts acknowledged in the last 30 days and how long it took to respond to them (same alerts for both numbers). */
export function responseStats(alerts: readonly Alert[], now: number): ResponseStats {
  const since = now - RESPONSE_WINDOW_DAYS * DAY_MS;
  const times: number[] = [];
  for (const alert of alerts) {
    const acknowledged = toMs(alert.acknowledgedAt);
    if (acknowledged === null || acknowledged < since) continue;
    const start = responseStart(alert);
    times.push(start === null ? 0 : Math.max(0, acknowledged - start));
  }
  return {
    attended: times.length,
    meanResponseMs: times.length === 0 ? null : times.reduce((sum, value) => sum + value, 0) / times.length,
  };
}

export type ActivityKind = 'lectura' | 'caida' | 'sin-reporte' | 'atendida' | 'resuelta';

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
  at: string;
};

/**
 * The newest events the panel knows: the latest report of each device, falls, silences, and what people
 * did with alerts. Every item comes from telemetry or the local care store; nothing is invented.
 */
export function recentActivity(input: {
  devices: readonly Device[];
  alerts: readonly Alert[];
  people: readonly Person[];
  limit?: number;
}): ActivityItem[] {
  const { devices, alerts, people, limit = 8 } = input;
  const personByDevice = new Map<string, Person>();
  for (const person of people) if (person.deviceId) personByDevice.set(person.deviceId, person);
  const personById = new Map(people.map((person) => [person.id, person]));
  const who = (deviceId: string, personId?: string | null) => {
    const person = (personId ? personById.get(personId) : undefined) ?? personByDevice.get(deviceId);
    return person ? `${person.name} · ${deviceId}` : `Dispositivo ${deviceId}`;
  };

  const items: ActivityItem[] = [];
  for (const device of devices) {
    const person = personByDevice.get(device.device_id);
    items.push({
      id: `lectura:${device.device_id}`,
      kind: 'lectura',
      title: 'Lectura recibida',
      description: person ? `Pulso y SpO2 de ${person.name}` : `Pulso y SpO2 del dispositivo ${device.device_id}`,
      at: device.last_seen_at,
    });
  }
  for (const alert of alerts) {
    if (alert.kind === 'caida') {
      items.push({ id: `caida:${alert.id}`, kind: 'caida', title: 'Caída detectada', description: who(alert.deviceId, alert.personId), at: alert.at });
    } else {
      items.push({
        id: `sin-reporte:${alert.id}`,
        kind: 'sin-reporte',
        title: 'Dejó de reportar',
        description: who(alert.deviceId, alert.personId),
        at: alert.overdueSince ?? alert.at,
      });
    }
    if (alert.acknowledgedAt) {
      items.push({ id: `atendida:${alert.id}`, kind: 'atendida', title: 'Alerta atendida', description: who(alert.deviceId, alert.personId), at: alert.acknowledgedAt });
    }
    if (alert.resolvedAt) {
      items.push({
        id: `resuelta:${alert.id}`,
        kind: 'resuelta',
        title: 'Alerta resuelta',
        description: `${who(alert.deviceId, alert.personId)}${alert.resolvedBy === 'datos' ? ' · volvió a reportar' : ''}`,
        at: alert.resolvedAt,
      });
    }
  }
  return items
    .filter((item) => toMs(item.at) !== null)
    .sort((a, b) => (toMs(b.at) ?? 0) - (toMs(a.at) ?? 0))
    .slice(0, limit);
}
