/**
 * Demo mode (VITE_DEMO_MODE=true only). A deterministic simulation with the same shapes as the API,
 * plus seed people for the separate demo store. Loaded through a dynamic import in main.tsx.
 */
import type { TelemetrySource } from './api';
import { API_MAX_LIMIT } from './api';
import type { CareData, Device, DeviceStats, Reading } from './types';
import { DEFAULT_SETTINGS } from './types';

const SLOT_MS = 30_000;
const MIN = 60_000;

type Interval = { from: number; to: number };
type DemoDevice = {
  id: string;
  /** Offset inside each 30 s slot, so devices do not report at the same instant. */
  phaseMs: number;
  pulseBase: number;
  spo2Base: number;
  /** Periods with reports, relative to the session start (ms). `to: Infinity` keeps reporting. */
  reporting: Interval[];
  /** Falls relative to the session start (ms). */
  falls: number[];
};

const START_KEY = 'solicare.demo.start';
const START_MAX_AGE_MS = 2 * 60 * MIN;

/**
 * Anchor of the simulated timeline. It is kept in localStorage so a page reload does not move the demo
 * fall to a new instant (which would add a new fall alert to the journal on every reload); it is renewed
 * after two hours so the demo keeps a recent fall and a recent silent device.
 */
function loadSessionStart(): number {
  const fresh = Math.floor(Date.now() / SLOT_MS) * SLOT_MS;
  try {
    const stored = Number(window.localStorage.getItem(START_KEY));
    if (Number.isFinite(stored) && stored > 0 && stored <= fresh && fresh - stored < START_MAX_AGE_MS) return stored;
    window.localStorage.setItem(START_KEY, String(fresh));
  } catch {
    // Storage blocked: the timeline starts now, as before.
  }
  return fresh;
}

const sessionStart = loadSessionStart();

const DEVICES: DemoDevice[] = [
  { id: 'demo-01', phaseMs: 4_000, pulseBase: 72, spo2Base: 97, reporting: [{ from: -8 * 60 * MIN, to: Infinity }], falls: [] },
  { id: 'demo-02', phaseMs: 11_000, pulseBase: 81, spo2Base: 95, reporting: [{ from: -8 * 60 * MIN, to: Infinity }], falls: [-6 * MIN] },
  { id: 'demo-03', phaseMs: 17_000, pulseBase: 66, spo2Base: 96, reporting: [{ from: -8 * 60 * MIN, to: -47 * MIN }], falls: [] },
  {
    id: 'demo-04',
    phaseMs: 23_000,
    pulseBase: 76,
    spo2Base: 98,
    reporting: [
      { from: -8 * 60 * MIN, to: -80 * MIN },
      { from: -66 * MIN, to: Infinity },
    ],
    falls: [],
  },
  { id: 'demo-06', phaseMs: 8_000, pulseBase: 70, spo2Base: 97, reporting: [{ from: -3 * 60 * MIN, to: Infinity }], falls: [] },
];

/** Small deterministic hash in [0, 1). */
function noise(seed: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function isReporting(device: DemoDevice, t: number): boolean {
  const rel = t - sessionStart;
  return device.reporting.some((interval) => rel >= interval.from && rel <= interval.to);
}

function readingAt(device: DemoDevice, slot: number, type: 'lectura' | 'caida'): Reading {
  const t = slot * SLOT_MS + device.phaseMs;
  const wave = Math.sin(slot / 40) * 4;
  // About 1 in 20 readings has no valid value (sensor off the wrist): sent as 0, like the firmware does.
  const invalid = noise(device.id, slot) < 0.05;
  const pulso = invalid ? 0 : Math.round(device.pulseBase + wave + (noise(`${device.id}p`, slot) - 0.5) * 8);
  const spo2 = invalid ? 0 : Math.min(100, Math.round(device.spo2Base + (noise(`${device.id}s`, slot) - 0.6) * 3));
  return { type, pulso, spo2, received_at: new Date(t).toISOString() };
}

function history(device: DemoDevice, now: number, limit: number): Reading[] {
  const out: Reading[] = [];
  const falls = device.falls.map((offset) => sessionStart + offset).filter((t) => t <= now);
  let slot = Math.floor((now - device.phaseMs) / SLOT_MS);
  const oldest = Math.floor((now - 12 * 60 * MIN) / SLOT_MS);
  while (out.length < limit && slot >= oldest) {
    const t = slot * SLOT_MS + device.phaseMs;
    if (t <= now && isReporting(device, t)) out.push(readingAt(device, slot, 'lectura'));
    for (const fall of falls) {
      if (fall > t && fall <= t + SLOT_MS && out.length < limit) {
        const reading = readingAt(device, slot, 'caida');
        out.push({ ...reading, received_at: new Date(fall).toISOString() });
      }
    }
    slot -= 1;
  }
  return out.sort((a, b) => a.received_at.localeCompare(b.received_at)).slice(-limit);
}

/** Counters computed from the simulated timeline, with the same month rule as the API (UTC calendar month). */
function statsOf(device: DemoDevice, now: number): DeviceStats {
  const date = new Date(now);
  const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const falls = device.falls.map((offset) => sessionStart + offset).filter((t) => t <= now);
  let readings = falls.filter((t) => t >= now - 24 * 60 * MIN).length;
  for (let slot = Math.floor((now - 24 * 60 * MIN) / SLOT_MS); slot * SLOT_MS + device.phaseMs <= now; slot += 1) {
    const t = slot * SLOT_MS + device.phaseMs;
    if (t >= now - 24 * 60 * MIN && isReporting(device, t)) readings += 1;
  }
  const lastFall = falls.length > 0 ? Math.max(...falls) : null;
  return {
    device_id: device.id,
    falls_this_month: falls.filter((t) => t >= monthStart).length,
    readings_24h: readings,
    last_fall_at: lastFall === null ? null : new Date(lastFall).toISOString(),
    last_movement_at: null,
    activity: null,
  };
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

export const demoSource: TelemetrySource = {
  kind: 'demo',
  origin: 'Simulación local (modo demostración)',
  async listDevices(signal) {
    await wait(250, signal);
    const now = Date.now();
    return DEVICES.map((device): Device | null => {
      const last = history(device, now, 1)[0];
      if (!last) return null;
      return { device_id: device.id, last_seen_at: last.received_at, last_type: last.type, spo2: last.spo2, pulso: last.pulso };
    }).filter((device): device is Device => device !== null);
  },
  async listTelemetry(deviceId, limit, signal) {
    await wait(150, signal);
    const device = DEVICES.find((item) => item.id === deviceId);
    return device ? history(device, Date.now(), Math.min(Math.max(limit, 1), API_MAX_LIMIT)) : [];
  },
  async getDeviceStats(deviceId, signal) {
    await wait(100, signal);
    const device = DEVICES.find((item) => item.id === deviceId);
    return device
      ? statsOf(device, Date.now())
      : { device_id: deviceId, falls_this_month: 0, readings_24h: 0, last_fall_at: null, last_movement_at: null, activity: null };
  },
};

/** Seed for the demo store. All names and phone numbers are fictional. */
export function demoSeed(): CareData {
  const createdAt = new Date(sessionStart - 30 * 24 * 60 * MIN).toISOString();
  const person = (id: string, name: string, relation: string, deviceId: string | null, contacts: [string, string, string][]) => ({
    id,
    name,
    relation,
    deviceId,
    createdAt,
    contacts: contacts.map(([contactName, contactRelation, phone], index) => ({
      id: `${id}-c${index + 1}`,
      name: contactName,
      relation: contactRelation,
      phone,
    })),
  });
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    acknowledgements: {},
    journal: {},
    people: [
      person('demo-p1', 'Rosa Elena Pérez', 'Mamá', 'demo-02', [
        ['Andrés Pérez', 'Hijo', '+57 300 555 0142'],
        ['Lucía Pérez', 'Hija', '+57 310 555 0187'],
      ]),
      person('demo-p2', 'Luis Alberto Gómez', 'Papá', 'demo-03', [['Andrés Pérez', 'Hijo', '+57 300 555 0142']]),
      person('demo-p3', 'Carmen Sofía Ruiz', 'Abuela', 'demo-01', [['Marta Ruiz', 'Hija', '+57 315 555 0119']]),
      person('demo-p4', 'Jorge Iván Ramírez', 'Tío', 'demo-04', []),
      person('demo-p5', 'Beatriz Henao', 'Tía', 'demo-05', [['Camilo Henao', 'Sobrino', '+57 301 555 0163']]),
    ],
  };
}
