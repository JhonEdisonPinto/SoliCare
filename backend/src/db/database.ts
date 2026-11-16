import pg from 'pg';
import { env } from '../config/env.js';
import type { TelemetryPayload } from '../types/telemetry.js';

const { Pool } = pg;
const pool = env.databaseUrl ? new Pool({ connectionString: env.databaseUrl, ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined }) : null;

export async function initializeDatabase(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      last_seen_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS telemetry (
      id BIGSERIAL PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(device_id),
      type TEXT NOT NULL CHECK (type IN ('lectura', 'caida')),
      spo2 SMALLINT NOT NULL CHECK (spo2 BETWEEN 0 AND 100),
      pulse SMALLINT NOT NULL CHECK (pulse >= 0),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS telemetry_device_received_idx
      ON telemetry (device_id, received_at DESC);
  `);
}

export async function saveTelemetry(payload: TelemetryPayload, receivedAt: Date): Promise<void> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO devices (device_id, last_seen_at)
       VALUES ($1, $2)
       ON CONFLICT (device_id)
       DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [payload.device_id, receivedAt],
    );
    await client.query(
      `INSERT INTO telemetry (device_id, type, spo2, pulse, received_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [payload.device_id, payload.tipo, payload.spo2, payload.pulso, receivedAt],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<boolean> {
  if (!pool) {
    return false;
  }

  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export type DeviceSummary = {
  device_id: string;
  last_seen_at: string;
  last_type: string | null;
  spo2: number | null;
  pulso: number | null;
};

export type TelemetryReading = {
  type: string;
  spo2: number;
  pulso: number;
  received_at: string;
};

export async function listDevices(): Promise<DeviceSummary[]> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  const result = await pool.query(
    `SELECT d.device_id, d.last_seen_at, t.type AS last_type, t.spo2, t.pulse AS pulso
     FROM devices d
     LEFT JOIN LATERAL (
       SELECT type, spo2, pulse FROM telemetry
       WHERE device_id = d.device_id
       ORDER BY received_at DESC LIMIT 1
     ) t ON TRUE
     ORDER BY d.device_id`,
  );
  return result.rows;
}

export async function listTelemetry(deviceId: string, limit: number): Promise<TelemetryReading[]> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  const result = await pool.query(
    `SELECT type, spo2, pulse AS pulso, received_at
     FROM telemetry
     WHERE device_id = $1
     ORDER BY received_at DESC
     LIMIT $2`,
    [deviceId, limit],
  );
  return result.rows.reverse();
}
