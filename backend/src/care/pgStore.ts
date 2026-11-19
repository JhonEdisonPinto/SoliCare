import type pg from 'pg';
import { emptyCareData } from './document.js';
import type { CareStore, StoredCare } from './store.js';

export const CARE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS care_data (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/** PostgreSQL implementation: one row (id = 1); each write is a single atomic statement. */
export function createPgCareStore(pool: pg.Pool): CareStore {
  async function get(): Promise<StoredCare | null> {
    const result = await pool.query('SELECT version, data FROM care_data WHERE id = 1');
    const row = result.rows[0];
    return row ? { version: row.version, data: row.data } : null;
  }

  return {
    get,
    async replace(baseVersion, data) {
      const json = JSON.stringify(data);
      // INSERT when nothing is stored yet (base 0), UPDATE ... WHERE version = base otherwise. Either
      // returns no row when another writer got there first, and the caller gets the current document.
      const result =
        baseVersion === 0
          ? await pool.query(`INSERT INTO care_data (id, version, data) VALUES (1, 1, $1::jsonb) ON CONFLICT (id) DO NOTHING RETURNING version`, [json])
          : await pool.query(
              `UPDATE care_data SET version = version + 1, data = $2::jsonb, updated_at = NOW() WHERE id = 1 AND version = $1 RETURNING version`,
              [baseVersion, json],
            );
      if (result.rows[0]) return { ok: true, version: result.rows[0].version };
      const current = await get();
      return { ok: false, current: current ?? { version: 0, data: emptyCareData() } };
    },
  };
}
