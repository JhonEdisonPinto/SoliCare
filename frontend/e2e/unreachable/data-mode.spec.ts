import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

/** The "Datos reales" switch on a build without demo mode (VITE_DEMO_MODE=false) and no backend. */
test.use({ allowedConsoleErrors: /Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch|401/i });

const API = 'http://127.0.0.1:5197';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

const storedMode = (page: Page) => page.evaluate(() => window.localStorage.getItem('solicare.dataMode'));

test('without a stored choice the switch is on and the panel shows the real server', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('switch', { name: 'Datos reales' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Sin conexión').first()).toBeVisible();
  await expect(page.getByText('Modo demostración')).toHaveCount(0);
  expect(await storedMode(page)).toBeNull();
});

test('turning it off shows the simulation even though the build is not a demo build', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('switch', { name: 'Datos reales' }).click();
  await expect(page.getByRole('switch', { name: 'Datos reales' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Modo demostración · datos simulados')).toBeVisible();
  await expect(page.getByText('Rosa Elena Pérez').first()).toBeVisible();
  expect(await storedMode(page)).toBe('demo');
});

test('the panel key screen can go back to the simulated data', async ({ page }) => {
  await page.route(`${API}/api/v1/care`, (route) =>
    route.request().method() === 'OPTIONS' ? route.fulfill({ headers: CORS, status: 204 }) : route.fulfill({ headers: CORS, status: 401, json: { error: 'Unauthorized' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Clave del panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a los datos simulados' }).click();
  await expect(page.getByText('Modo demostración · datos simulados')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clave del panel' })).toHaveCount(0);
  expect(await storedMode(page)).toBe('demo');
});
