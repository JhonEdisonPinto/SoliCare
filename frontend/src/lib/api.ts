import { useEffect, useState } from 'react';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8080';

export type Device = {
  device_id: string;
  last_seen_at: string;
  last_type: string | null;
  spo2: number | null;
  pulso: number | null;
};

export type Reading = { type: string; spo2: number; pulso: number; received_at: string };

export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function useTelemetry(deviceId: string | undefined, intervalMs = 15000) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const list = await getJson<{ devices: Device[] }>('/api/v1/devices');
        const history = deviceId
          ? await getJson<{ readings: Reading[] }>(`/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry?limit=60`)
          : { readings: [] };
        if (active) {
          setDevices(list.devices);
          setReadings(history.readings);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    }

    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deviceId, intervalMs]);

  return { devices, readings, error };
}

export function isOnline(device: Device | undefined, now = Date.now()): boolean {
  return !!device && now - new Date(device.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'sin lecturas';
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace menos de 1 min';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} d`;
}
