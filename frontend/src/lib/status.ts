import type { Device } from '../data/types';
import { toMs } from './time';

/**
 * Device connection state.
 * - en-linea: reported within the offline window.
 * - sin-reporte: known to the server but silent for longer than the window.
 * - nunca: assigned locally but the server has never received a report from it.
 */
export type DeviceStatus = 'en-linea' | 'sin-reporte' | 'nunca';

export function deviceStatus(device: Device | undefined, now: number, offlineWindowMinutes: number): DeviceStatus {
  const seen = toMs(device?.last_seen_at);
  if (!device || seen === null) return 'nunca';
  return now - seen > offlineWindowMinutes * 60_000 ? 'sin-reporte' : 'en-linea';
}

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  'en-linea': 'En línea',
  'sin-reporte': 'Sin reporte reciente',
  nunca: 'Sin datos todavía',
};
