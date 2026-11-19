import type { FastifyInstance } from 'fastify';
import { getDeviceStats } from '../db/database.js';

/**
 * Read-only counters for the dashboard. Motion data is not collected yet, so `last_movement_at` and
 * `activity` are always null; clients show them as "no data".
 */
export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { deviceId: string } }>('/api/v1/devices/:deviceId/stats', async (request) => {
    const stats = await getDeviceStats(request.params.deviceId);
    return { ...stats, last_movement_at: null, activity: null };
  });
}
