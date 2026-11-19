import type { Alert, Device, Person, Reading } from './types';
import { deviceStatus, type DeviceStatus } from '../lib/status';
import { latestValid, validVital, type LatestVital, type VitalKey } from '../lib/vitals';
import { isOpen } from './alerts';

export type PersonStatus = DeviceStatus | 'sin-dispositivo';

export type PersonSummary = {
  person: Person;
  device: Device | undefined;
  status: PersonStatus;
  readings: readonly Reading[];
  pulso: LatestVital;
  spo2: LatestVital;
  openAlerts: Alert[];
  /** Lower needs attention sooner. */
  rank: number;
};

const EMPTY: readonly Reading[] = [];

/** Latest valid value from the history, or from the device summary when no history is loaded. */
function latestOf(readings: readonly Reading[], device: Device | undefined, key: VitalKey): LatestVital {
  if (readings.length > 0) return latestValid(readings, key);
  const value = validVital(device?.[key]);
  return value !== null && device ? { value, at: device.last_seen_at } : null;
}

function rankOf(status: PersonStatus, openAlerts: Alert[]): number {
  const fall = openAlerts.find((alert) => alert.kind === 'caida');
  if (fall) return fall.state === 'pendiente' ? 0 : 1;
  const connection = openAlerts.find((alert) => alert.kind === 'conexion');
  if (connection) return connection.state === 'pendiente' ? 2 : 3;
  if (status === 'sin-reporte') return 3;
  if (status === 'nunca') return 4;
  if (status === 'sin-dispositivo') return 5;
  return 6;
}

/** People sorted by how soon they need attention, then by name. */
export function summarizePeople(
  people: readonly Person[],
  devices: readonly Device[],
  readingsByDevice: Readonly<Record<string, readonly Reading[]>>,
  alerts: readonly Alert[],
  now: number,
  offlineWindowMinutes: number,
): PersonSummary[] {
  const deviceById = new Map(devices.map((device) => [device.device_id, device]));
  return people
    .map((person): PersonSummary => {
      const device = person.deviceId ? deviceById.get(person.deviceId) : undefined;
      const status: PersonStatus = person.deviceId ? deviceStatus(device, now, offlineWindowMinutes) : 'sin-dispositivo';
      const readings = (person.deviceId && readingsByDevice[person.deviceId]) || EMPTY;
      const openAlerts = alerts.filter((alert) => isOpen(alert) && alert.deviceId === person.deviceId);
      return {
        person,
        device,
        status,
        readings,
        pulso: latestOf(readings, device, 'pulso'),
        spo2: latestOf(readings, device, 'spo2'),
        openAlerts,
        rank: rankOf(status, openAlerts),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name, 'es'));
}

/** Devices the server knows that no person is assigned to. */
export function unassignedDevices(people: readonly Person[], devices: readonly Device[]): Device[] {
  const assigned = new Set(people.map((person) => person.deviceId).filter(Boolean));
  return devices.filter((device) => !assigned.has(device.device_id));
}
