import { createHash, timingSafeEqual } from 'node:crypto';

export type PanelAuthConfig = {
  panelToken?: string;
};

/** Hashing first gives buffers of equal length, which timingSafeEqual needs, and hides the token length. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Checks the `Authorization: Bearer <key>` header of the panel routes.
 * While PANEL_TOKEN is unset or empty the panel is open: anyone with the link reads and edits the care data,
 * in every environment. Setting PANEL_TOKEN turns the key back on. The device ingest token never opens the panel.
 */
export function createPanelAuth(config: PanelAuthConfig): (authorization: string | undefined) => boolean {
  const expected = config.panelToken;
  return (authorization) => {
    if (!expected) return true;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
    return sameSecret(authorization.slice('Bearer '.length), expected);
  };
}
