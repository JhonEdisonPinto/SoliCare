/** Sends one plain-text message to the configured chat. Rejects when it was not delivered. */
export type Notify = (text: string) => Promise<void>;

export type TelegramConfig = { botToken?: string; chatId?: string };

const TIMEOUT_MS = 10_000;

/**
 * A sender for the Telegram Bot API (`sendMessage`), or null when the token or the chat id is missing.
 * Errors never include the token: it is part of the request URL, which is never put in a message.
 */
export function createTelegramNotify(config: TelegramConfig, fetchImpl: typeof fetch = fetch): Notify | null {
  const { botToken, chatId } = config;
  if (!botToken || !chatId) return null;
  return async (text) => {
    let response: Response;
    try {
      response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`Telegram did not answer (${(error as Error).name})`);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Telegram answered ${response.status}: ${detail.slice(0, 200)}`);
    }
  };
}
