import type { FastifyInstance } from 'fastify';
import type { CareStore } from '../care/store.js';
import { SIMULATION_DURATION_MS, simulationMessages } from '../services/simulation.js';
import type { Notify } from '../services/telegram.js';

export type SimulationRouteOptions = {
  store: CareStore;
  /** True when the Authorization header carries the panel key (see createPanelAuth). */
  isAuthorized: (authorization: string | undefined) => boolean;
  /** Telegram sender, or null when Telegram is not configured. */
  notify: Notify | null;
  /** Injected in tests; setTimeout otherwise. */
  schedule?: (task: () => void, delayMs: number) => void;
  now?: () => Date;
};

/** What happened with Telegram: sent, not configured on the server, or the first message failed. */
export type TelegramOutcome = 'enviado' | 'sin-configurar' | 'error';

/**
 * POST /api/v1/simulation/fall `{ personId }` starts a simulated fall for a person who has a device: the
 * Telegram group gets the fall notice, simulated incoming calls to the emergency contacts and a closing
 * message. Nothing is stored. One simulation runs at a time (409 while one is running). Needs the panel key.
 */
export async function registerSimulationRoutes(app: FastifyInstance, options: SimulationRouteOptions): Promise<void> {
  const { store, isAuthorized, notify } = options;
  const schedule = options.schedule ?? ((task, delayMs) => void setTimeout(task, delayMs));
  const now = options.now ?? (() => new Date());
  let endsAt: number | null = null;

  app.post<{ Body: unknown }>(
    '/api/v1/simulation/fall',
    {
      onRequest: async (request, reply) => {
        if (!isAuthorized(request.headers.authorization)) return reply.code(401).send({ error: 'Unauthorized' });
      },
    },
    async (request, reply) => {
      const personId = (request.body as { personId?: unknown } | null)?.personId;
      if (typeof personId !== 'string' || personId.length === 0 || personId.length > 200) {
        return reply.code(400).send({ error: 'Invalid payload', expected: { personId: 'string' } });
      }
      const startedAt = now();
      if (endsAt !== null && endsAt > startedAt.getTime()) {
        return reply.code(409).send({ error: 'Simulation running', remainingMs: endsAt - startedAt.getTime() });
      }

      const person = (await store.get())?.data.people.find((item) => item.id === personId);
      if (!person || !person.deviceId) return reply.code(404).send({ error: 'Person not found or without a device' });

      const finish = startedAt.getTime() + SIMULATION_DURATION_MS;
      endsAt = finish;
      schedule(() => {
        if (endsAt === finish) endsAt = null;
      }, SIMULATION_DURATION_MS);

      let telegram: TelegramOutcome = 'sin-configurar';
      if (notify) {
        const [first, ...rest] = simulationMessages(person, startedAt);
        try {
          await notify(first.text);
          telegram = 'enviado';
          for (const step of rest) {
            schedule(() => notify(step.text).catch((error: Error) => app.log.warn({ err: error.message }, 'simulation message not sent')), step.delayMs);
          }
        } catch (error) {
          telegram = 'error';
          app.log.warn({ err: (error as Error).message }, 'simulation: Telegram rejected the first message');
        }
      }

      return { durationMs: SIMULATION_DURATION_MS, telegram };
    },
  );
}
