import type { Device, DeviceStats, Reading } from './types';

/** The remote telemetry contract. The HTTP client and the demo simulation both implement it. */
export interface TelemetrySource {
  readonly kind: 'http' | 'demo';
  /** Human-readable origin, shown in Configuración. */
  readonly origin: string;
  listDevices(signal?: AbortSignal): Promise<Device[]>;
  /** Readings oldest first, at most `limit` (the API caps it at 500). */
  listTelemetry(deviceId: string, limit: number, signal?: AbortSignal): Promise<Reading[]>;
  /** Counters for one device. Rejects when the server cannot answer (an older deployment has no such route). */
  getDeviceStats(deviceId: string, signal?: AbortSignal): Promise<DeviceStats>;
}

export const API_MAX_LIMIT = 500;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080').replace(/\/$/, '');

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

function isDevice(value: unknown): value is Device {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.device_id === 'string' && typeof item.last_seen_at === 'string';
}

function isReading(value: unknown): value is Reading {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.type === 'string' &&
    typeof item.received_at === 'string' &&
    typeof item.spo2 === 'number' &&
    typeof item.pulso === 'number'
  );
}

function isDeviceStats(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.falls_this_month === 'number' &&
    typeof item.readings_24h === 'number' &&
    (item.last_fall_at === null || typeof item.last_fall_at === 'string')
  );
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('El navegador no obtuvo respuesta.', null);
  }
  if (!response.ok) throw new ApiError(`El servidor respondió con el código ${response.status}.`, response.status);
  return response.json();
}

export const httpSource: TelemetrySource = {
  kind: 'http',
  origin: API_URL,
  async listDevices(signal) {
    const body = (await getJson('/api/v1/devices', signal)) as { devices?: unknown };
    if (!Array.isArray(body?.devices)) throw new ApiError('La respuesta de dispositivos no tiene el formato esperado.', null);
    return body.devices.filter(isDevice);
  },
  async listTelemetry(deviceId, limit, signal) {
    const safeLimit = Math.min(Math.max(Math.round(limit), 1), API_MAX_LIMIT);
    const body = (await getJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry?limit=${safeLimit}`, signal)) as {
      readings?: unknown;
    };
    if (!Array.isArray(body?.readings)) throw new ApiError('La respuesta de lecturas no tiene el formato esperado.', null);
    return body.readings.filter(isReading);
  },
  async getDeviceStats(deviceId, signal) {
    const body = await getJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/stats`, signal);
    if (!isDeviceStats(body)) throw new ApiError('La respuesta de estadísticas no tiene el formato esperado.', null);
    const motion = body.last_movement_at;
    return {
      device_id: deviceId,
      falls_this_month: body.falls_this_month as number,
      readings_24h: body.readings_24h as number,
      last_fall_at: (body.last_fall_at as string | null) ?? null,
      last_movement_at: typeof motion === 'string' ? motion : null,
      activity: null,
    };
  },
};

let activeSource: TelemetrySource = httpSource;

/** Called once at startup when demo mode is on. */
export function setTelemetrySource(source: TelemetrySource) {
  activeSource = source;
}

export function getTelemetrySource(): TelemetrySource {
  return activeSource;
}
