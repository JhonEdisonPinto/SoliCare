import { API_URL, DEMO_MODE } from './api';
import { getPanelKey } from './panelKey';
import type { PersonSummary } from './summary';
import type { Alert } from './types';

/** Duration when the server does not give one (demo mode, no answer). Matches SIMULATION_DURATION_MS in the backend. */
export const LOCAL_SIMULATION_MS = 25_000;

/**
 * What happened with Telegram. From the server: sent, not configured, or refused. Local: demo mode,
 * no usable answer from the server, or another panel's simulation is still running.
 */
export type TelegramOutcome = 'enviado' | 'sin-configurar' | 'error' | 'demo' | 'sin-servidor' | 'ocupado';

export type SimulationStart = { durationMs: number; telegram: TelegramOutcome };

/** People who are green right now: a device that reports on time and no open alert. */
export function simulationCandidates(rows: readonly PersonSummary[]): PersonSummary[] {
  return rows.filter((row) => row.person.deviceId && row.status === 'en-linea' && row.openAlerts.length === 0);
}

/** The open fall shown while a simulation runs. It lives only in memory: no journal entry, no acknowledgement. */
export function simulatedFall(personId: string, deviceId: string, at: number): Alert {
  const iso = new Date(at).toISOString();
  return { id: `simulacion:${deviceId}:${iso}`, kind: 'caida', deviceId, personId, at: iso, state: 'pendiente', simulated: true };
}

const OUTCOMES: readonly TelegramOutcome[] = ['enviado', 'sin-configurar', 'error'];

/**
 * Asks the server to send the Telegram messages of a simulated fall. Never rejects: whatever the server
 * says, the simulation still runs on screen, and the outcome tells the person what happened with Telegram.
 */
export async function requestSimulation(personId: string): Promise<SimulationStart> {
  const local = (telegram: TelegramOutcome): SimulationStart => ({ durationMs: LOCAL_SIMULATION_MS, telegram });
  if (DEMO_MODE) return local('demo');
  const key = getPanelKey();
  try {
    const response = await fetch(`${API_URL}/api/v1/simulation/fall`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ personId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 409) {
      const body = (await response.json().catch(() => null)) as { remainingMs?: unknown } | null;
      const remaining = typeof body?.remainingMs === 'number' && body.remainingMs > 0 ? Math.min(body.remainingMs, LOCAL_SIMULATION_MS) : LOCAL_SIMULATION_MS;
      return { durationMs: remaining, telegram: 'ocupado' };
    }
    if (!response.ok) return local('sin-servidor');
    const body = (await response.json()) as { durationMs?: unknown; telegram?: unknown };
    const durationMs = typeof body.durationMs === 'number' && body.durationMs > 0 && body.durationMs <= 120_000 ? body.durationMs : LOCAL_SIMULATION_MS;
    const telegram = OUTCOMES.includes(body.telegram as TelegramOutcome) ? (body.telegram as TelegramOutcome) : 'sin-servidor';
    return { durationMs, telegram };
  } catch {
    return local('sin-servidor');
  }
}
