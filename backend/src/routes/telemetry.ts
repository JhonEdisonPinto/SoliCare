import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { listDevices, listTelemetry, saveTelemetry } from '../db/database.js';
import type { TelemetryPayload, TelemetryType } from '../types/telemetry.js';

const validTypes: TelemetryType[] = ['lectura', 'caida'];

function isTelemetryPayload(value: unknown): value is TelemetryPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.device_id === 'string' &&
    payload.device_id.length > 0 &&
    validTypes.includes(payload.tipo as TelemetryType) &&
    Number.isInteger(payload.spo2) &&
    typeof payload.pulso === 'number' &&
    Number.isInteger(payload.pulso) &&
    (payload.spo2 as number) >= 0 &&
    (payload.spo2 as number) <= 100 &&
    (payload.pulso as number) >= 0
  );
}

function hasValidToken(request: FastifyRequest): boolean {
  if (!env.deviceIngestToken) {
    return env.nodeEnv !== 'production';
  }

  return request.headers.authorization === `Bearer ${env.deviceIngestToken}`;
}

export async function registerTelemetryRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: unknown }>('/api/v1/telemetry', async (request, reply) => {
    if (!hasValidToken(request)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (!isTelemetryPayload(request.body)) {
      return reply.code(400).send({
        error: 'Invalid payload',
        expected: {
          device_id: 'string',
          tipo: ['lectura', 'caida'],
          spo2: 'integer 0-100',
          pulso: 'integer >= 0',
        },
      });
    }

    const receivedAt = new Date();
    await saveTelemetry(request.body, receivedAt);

    return reply.code(200).send({
      received: true,
      device_id: request.body.device_id,
      received_at: receivedAt.toISOString(),
    });
  });

  app.get('/api/v1/devices', async () => ({ devices: await listDevices() }));

  app.get<{ Params: { deviceId: string }; Querystring: { limit?: string } }>(
    '/api/v1/devices/:deviceId/telemetry',
    async (request) => {
      const requested = Number(request.query.limit ?? 50);
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 500) : 50;
      return { device_id: request.params.deviceId, readings: await listTelemetry(request.params.deviceId, limit) };
    },
  );
}
