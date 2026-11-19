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
  /** Key of the panel (the care data routes). Falls back to the device token while unset. */
  panelToken: process.env.PANEL_TOKEN,
  /** Telegram bot of the fall simulation. Both unset: the simulation runs only on screen. */
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
  telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || undefined,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
};
