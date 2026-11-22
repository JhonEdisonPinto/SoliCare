import type { FastifyInstance } from 'fastify';
import type { CareStore } from '../care/store.js';
import { caseMessages, pickSimulationCase } from '../services/simulation.js';
import type { SimulationCategory } from '../services/simulationCases.js';
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
  /** Injected in tests; Math.random otherwise. */
  random?: () => number;
};

/** What happened with Telegram: sent, not configured on the server, or the first message failed. */
export type TelegramOutcome = 'enviado' | 'sin-configurar' | 'error';

const ROUTES: Record<string, SimulationCategory> = {
  '/api/v1/simulation/fall': 'caida',
  '/api/v1/simulation/away': 'ausencia',
};

/**
 * POST /api/v1/simulation/fall and /away `{ personId }` play one scripted Soliker Bot case for a person who
 * has a device: a weighted random fall case (C01-C09) or away case (C10-C12), message by message in the
 * Telegram group. Nothing is stored. One simulation runs at a time (409 while one is running). Needs the panel key.
 */
export async function registerSimulationRoutes(app: FastifyInstance, options: SimulationRouteOptions): Promise<void> {
  const { store, isAuthorized, notify } = options;
  const schedule = options.schedule ?? ((task, delayMs) => void setTimeout(task, delayMs));
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  let running: { endsAt: number } | null = null;

  for (const [url, category] of Object.entries(ROUTES)) {
    app.post<{ Body: unknown }>(
      url,
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

        const person = (await store.get())?.data.people.find((item) => item.id === personId);
        if (!person || !person.deviceId) return reply.code(404).send({ error: 'Person not found or without a device' });

        // Checked and taken with no await in between, so two requests cannot both start.
        const startedAt = now().getTime();
        if (running) {
          return reply.code(409).send({ error: 'Simulation running', remainingMs: Math.max(running.endsAt - startedAt, 1_000) });
        }

        const simulationCase = pickSimulationCase(category, random);
        const messages = caseMessages(simulationCase, person, new Date(startedAt));
        const durationMs = messages[messages.length - 1].delayMs;
        const run = { endsAt: startedAt + durationMs };
        running = run;
        const release = () => {
          if (running === run) running = null;
        };

        // Each message waits for the previous one, so they cannot arrive out of order.
        const sendFrom = (index: number) => {
          if (index >= messages.length) return release();
          const delay = Math.max(startedAt + messages[index].delayMs - now().getTime(), 0);
          schedule(() => {
            void notify!(messages[index].text)
              .catch((error: Error) => app.log.warn({ err: error.message }, 'simulation message not sent'))
              .finally(() => sendFrom(index + 1));
          }, delay);
        };

        let telegram: TelegramOutcome = 'sin-configurar';
        if (notify) {
          try {
            await notify(messages[0].text);
            telegram = 'enviado';
          } catch (error) {
            telegram = 'error';
            app.log.warn({ err: (error as Error).message }, 'simulation: Telegram rejected the first message');
          }
        }
        if (telegram === 'enviado') sendFrom(1);
        else schedule(release, durationMs);

        return { durationMs, telegram, caseId: simulationCase.id };
      },
    );
  }
}
