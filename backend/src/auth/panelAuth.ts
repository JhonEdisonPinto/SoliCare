import { createHash, timingSafeEqual } from 'node:crypto';

export type PanelAuthConfig = {
  panelToken?: string;
  deviceIngestToken?: string;
  nodeEnv: string;
};

/** Hashing first gives buffers of equal length, which timingSafeEqual needs, and hides the token length. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Checks the `Authorization: Bearer <key>` header of the panel routes. The key is PANEL_TOKEN, or
 * DEVICE_INGEST_TOKEN while PANEL_TOKEN is not set. With neither set, requests pass outside production
 * (same rule as the telemetry ingest route) and are refused in production.
 */
export function createPanelAuth(config: PanelAuthConfig): (authorization: string | undefined) => boolean {
  const expected = config.panelToken || config.deviceIngestToken;
  return (authorization) => {
    if (!expected) return config.nodeEnv !== 'production';
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
    return sameSecret(authorization.slice('Bearer '.length), expected);
  };
}
