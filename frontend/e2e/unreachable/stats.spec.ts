import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

/**
 * The page talks HTTP to a port nobody listens on; here the requests are answered by mocks so the stats
 * request can succeed or fail on its own. A failed request is logged by the browser, hence the pattern.
 */
test.use({ allowedConsoleErrors: /Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch|404/i });

const API = 'http://127.0.0.1:5197';
const CORS = { 'access-control-allow-origin': '*' };

async function mockApi(page: Page, stats: { status: number; body?: unknown }) {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('e2e-seeded')) {
      window.sessionStorage.setItem('e2e-seeded', '1');
      window.localStorage.setItem(
        'solicare.care.v1',
        JSON.stringify({
          version: 1,
          people: [{ id: 'p1', name: 'Ana Prueba', relation: 'Vecina', deviceId: 'dev-1', contacts: [], createdAt: new Date().toISOString() }],
          acknowledgements: {},
          journal: {},
          settings: { offlineWindowMinutes: 30, pollIntervalSeconds: 15 },
        }),
      );
    }
  });
  const now = new Date().toISOString();
  await page.route(`${API}/api/v1/devices`, (route) =>
    route.fulfill({ headers: CORS, json: { devices: [{ device_id: 'dev-1', last_seen_at: now, last_type: 'lectura', spo2: 97, pulso: 70 }] } }),
  );
  await page.route(`${API}/api/v1/devices/dev-1/telemetry?*`, (route) =>
    route.fulfill({ headers: CORS, json: { device_id: 'dev-1', readings: [{ type: 'lectura', spo2: 97, pulso: 70, received_at: now }] } }),
  );
  await page.route(`${API}/api/v1/devices/dev-1/stats`, (route) =>
    route.fulfill({ headers: CORS, status: stats.status, json: stats.body ?? { error: 'Not found' } }),
  );
}

test('when the stats request fails the card says "Sin datos" and the page keeps working', async ({ page }) => {
  await mockApi(page, { status: 404 });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Detección de caídas' });
  await expect(card.locator('.fall-metric', { hasText: 'Eventos este mes' }).locator('strong')).toHaveText('Sin datos');
  await expect(card.getByText('No se pudo leer el contador del servidor.')).toBeVisible();
  await expect(card.locator('.fall-metric', { hasText: 'Último movimiento' }).locator('strong')).toHaveText('Sin datos');
  // The rest of the Resumen is unaffected.
  await expect(page.getByRole('region', { name: 'Signos vitales' }).locator('.vital-card', { hasText: 'Pulso' }).locator('strong')).toHaveText('70');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('when the stats request works, the counters and the last fall appear and motion stays "Sin datos"', async ({ page }) => {
  const lastFall = new Date(Date.now() - 3 * 3_600_000).toISOString();
  await mockApi(page, {
    status: 200,
    body: { device_id: 'dev-1', falls_this_month: 3, readings_24h: 480, last_fall_at: lastFall, last_movement_at: null, activity: null },
  });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Detección de caídas' });
  await expect(card.locator('.fall-metric', { hasText: 'Eventos este mes' }).locator('strong')).toHaveText('3');
  await expect(card.getByText('Última caída:')).toBeVisible();
  await expect(card.getByText('480 reportes del dispositivo en las últimas 24 h.')).toBeVisible();
  await expect(card.locator('.fall-metric', { hasText: 'Último movimiento' }).locator('strong')).toHaveText('Sin datos');
});
