import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createPanelAuth } from './auth/panelAuth.js';
import { corsOptions } from './config/cors.js';
import { env } from './config/env.js';
import { careStore, checkDatabase, initializeDatabase } from './db/database.js';
import { registerCareRoutes } from './routes/care.js';
import { registerSimulationRoutes } from './routes/simulation.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import { createTelegramNotify } from './services/telegram.js';

const app = Fastify({ logger: true });

await app.register(cors, corsOptions(env.corsOrigin));

app.get('/health', async (_request, reply) => {
  const database = await checkDatabase();
  return reply.code(database || !env.databaseUrl ? 200 : 503).send({
    status: database || !env.databaseUrl ? 'ok' : 'degraded',
    service: 'solicare-backend',
    database: env.databaseUrl ? (database ? 'connected' : 'unavailable') : 'not_configured',
  });
});

await registerTelemetryRoutes(app);
await registerStatsRoutes(app);
if (careStore) {
  const isAuthorized = createPanelAuth({ panelToken: env.panelToken });
  await registerCareRoutes(app, { store: careStore, isAuthorized });
  await registerSimulationRoutes(app, {
    store: careStore,
    isAuthorized,
    notify: createTelegramNotify({ botToken: env.telegramBotToken, chatId: env.telegramChatId }),
  });
}
await initializeDatabase();

try {
  await app.listen({ host: '0.0.0.0', port: env.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
