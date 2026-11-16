import 'dotenv/config';

const port = Number(process.env.PORT ?? 8080);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  databaseUrl: process.env.DATABASE_URL,
  deviceIngestToken: process.env.DEVICE_INGEST_TOKEN,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};
