import { API_URL } from './api';
import { clearPanelKey, getPanelKey, setPanelKey } from './panelKey';
import { createServerCareRepository, probeCare, type ServerCareRepository, type StoredCare } from './serverStore';
import { createLocalCareRepository, LOCAL_CARE_KEY, type CareRepository } from './store';

export type CareConnection =
  | { kind: 'ready'; repository: CareRepository }
  /** The server wants a panel key. `hadKey`: one was stored and was refused. */
  | { kind: 'locked'; hadKey: boolean };

/** The key was refused while the panel was running: forget it and start over, which asks for it again. */
function onUnauthorized() {
  clearPanelKey();
  window.location.reload();
}

export function createServerRepository(initial?: StoredCare): ServerCareRepository {
  return createServerCareRepository({ apiUrl: API_URL, getKey: getPanelKey, initial, onUnauthorized });
}

/**
 * Decides where the care data lives, once, at startup (not in demo mode):
 * - 200: the server stores it.
 * - 401: the panel key is needed first.
 * - 404 (an older backend without the route), or no answer and no panel key ever entered: this browser's
 *   localStorage, exactly as before, with no prompt.
 * - no answer but a key is stored (the server was used before and is down right now): the server
 *   repository starts unloaded, so the panel never shows or edits stale local data in its place.
 */
export async function connectCare(): Promise<CareConnection> {
  const key = getPanelKey();
  const result = await probeCare(API_URL, key);
  switch (result.kind) {
    case 'ok':
      return { kind: 'ready', repository: createServerRepository(result.stored) };
    case 'unauthorized':
      return { kind: 'locked', hadKey: key !== null };
    case 'unreachable':
      if (key) return { kind: 'ready', repository: createServerRepository() };
      return { kind: 'ready', repository: createLocalCareRepository(LOCAL_CARE_KEY) };
    case 'absent':
      return { kind: 'ready', repository: createLocalCareRepository(LOCAL_CARE_KEY) };
  }
}

/** Tries a panel key typed by the person; when it works, stores it and returns the server repository. */
export async function unlockWithKey(key: string): Promise<{ ok: true; repository: ServerCareRepository } | { ok: false; error: string }> {
  const result = await probeCare(API_URL, key);
  if (result.kind === 'ok') {
    setPanelKey(key);
    return { ok: true, repository: createServerRepository(result.stored) };
  }
  if (result.kind === 'unauthorized') return { ok: false, error: 'La clave no es correcta. Revísela e intente de nuevo.' };
  return { ok: false, error: 'No se pudo comprobar la clave: el servidor no respondió. Intente de nuevo en un momento.' };
}

/** Checks a new key against the server while the panel is running and, if it is accepted, keeps it. */
export async function changePanelKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await probeCare(API_URL, key);
  if (result.kind === 'ok') {
    setPanelKey(key);
    return { ok: true };
  }
  if (result.kind === 'unauthorized') return { ok: false, error: 'La clave no es correcta. Revísela e intente de nuevo.' };
  return { ok: false, error: 'No se pudo comprobar la clave: el servidor no respondió. Intente de nuevo en un momento.' };
}
