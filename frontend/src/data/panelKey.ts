/** The panel key is the shared secret the backend asks for before it shares the care data. */
export const PANEL_KEY_STORAGE = 'solicare.panel-key.v1';

/** Kept as well as localStorage so a browser that blocks storage still works until the page closes. */
let memoryKey: string | null = null;

export function getPanelKey(): string | null {
  try {
    return window.localStorage.getItem(PANEL_KEY_STORAGE) || memoryKey;
  } catch {
    return memoryKey;
  }
}

export function setPanelKey(key: string): void {
  memoryKey = key;
  try {
    window.localStorage.setItem(PANEL_KEY_STORAGE, key);
  } catch {
    // Storage blocked: the in-memory copy above is all there is.
  }
}

export function clearPanelKey(): void {
  memoryKey = null;
  try {
    window.localStorage.removeItem(PANEL_KEY_STORAGE);
  } catch {
    // Nothing to clear.
  }
}
