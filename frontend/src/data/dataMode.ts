/**
 * Which data the panel shows: the simulation ("demo") or what the devices send to the server ("live").
 * The choice made with the "Datos reales" switch is kept in this browser; without one, VITE_DEMO_MODE decides.
 * It is read once at startup: changing it reloads the page, so no view mixes both sources.
 */
export type DataMode = 'demo' | 'live';

export const DATA_MODE_STORAGE = 'solicare.dataMode';

const ENV_DEFAULT: DataMode = import.meta.env.VITE_DEMO_MODE === 'true' ? 'demo' : 'live';

function storedDataMode(): DataMode | null {
  try {
    const value = window.localStorage.getItem(DATA_MODE_STORAGE);
    return value === 'demo' || value === 'live' ? value : null;
  } catch {
    return null;
  }
}

export const DATA_MODE: DataMode = storedDataMode() ?? ENV_DEFAULT;

/** Keeps the choice and reloads, so the whole panel starts again with the other source. */
export function switchDataMode(mode: DataMode): void {
  try {
    window.localStorage.setItem(DATA_MODE_STORAGE, mode);
  } catch {
    // Storage unavailable: the reload falls back to VITE_DEMO_MODE.
  }
  window.location.reload();
}
