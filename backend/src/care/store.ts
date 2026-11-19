import type { CareData } from './document.js';

export type StoredCare = { version: number; data: CareData };

export type ReplaceResult = { ok: true; version: number } | { ok: false; current: StoredCare };

/** Where the care document lives. The routes only know this interface, so tests use an in-memory one. */
export interface CareStore {
  /** The stored document, or null when none was ever written (version 0). */
  get(): Promise<StoredCare | null>;
  /**
   * Stores `data` as version `baseVersion + 1` only when the stored version is still `baseVersion`
   * (0 when nothing is stored). Otherwise nothing changes and the current document comes back.
   */
  replace(baseVersion: number, data: CareData): Promise<ReplaceResult>;
}
