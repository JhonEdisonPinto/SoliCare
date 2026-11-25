import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

/**
 * The "Datos reales" switch on a demo build (VITE_DEMO_MODE=true). Live mode talks to VITE_API_URL
 * (http://localhost:8080 here), which is mocked so the test does not depend on a local backend.
 */
test.use({ allowedConsoleErrors: /Failed to load resource|404/i });

const API = 'http://localhost:8080';
const CORS = { 'access-control-allow-origin': '*' };

async function mockEmptyServer(page: Page) {
  await page.route(`${API}/api/v1/devices`, (route) => route.fulfill({ headers: CORS, json: { devices: [] } }));
  await page.route(`${API}/api/v1/care`, (route) => route.fulfill({ headers: CORS, status: 404, json: { message: 'not found' } }));
}

const storedMode = (page: Page) => page.evaluate(() => window.localStorage.getItem('solicare.dataMode'));

test('the switch starts off on a demo build and turning it on reloads with the real server', async ({ page }) => {
  await mockEmptyServer(page);
  await page.goto('/personas');
  const toggle = page.getByRole('switch', { name: 'Datos reales' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Modo demostración · datos simulados')).toBeVisible();
  await expect(page.getByText('Rosa Elena Pérez').first()).toBeVisible();

  await toggle.click();
  await expect(page.getByRole('switch', { name: 'Datos reales' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Servidor conectado')).toBeVisible();
  await expect(page.getByText('Modo demostración')).toHaveCount(0);
  await expect(page.getByText('Rosa Elena Pérez')).toHaveCount(0);
  await expect(page).toHaveURL(/\/personas$/);
  expect(await storedMode(page)).toBe('live');
});

test('turning it off again goes back to the simulation and the choice survives a reload', async ({ page }) => {
  await mockEmptyServer(page);
  await page.goto('/');
  await page.getByRole('switch', { name: 'Datos reales' }).click();
  await expect(page.getByText('Servidor conectado')).toBeVisible();

  await page.getByRole('switch', { name: 'Datos reales' }).click();
  await expect(page.getByRole('switch', { name: 'Datos reales' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Modo demostración · datos simulados')).toBeVisible();
  expect(await storedMode(page)).toBe('demo');

  await page.reload();
  await expect(page.getByText('Modo demostración · datos simulados')).toBeVisible();
});

test('Configuración says where the data comes from and how to change it', async ({ page }) => {
  await page.goto('/configuracion');
  await expect(page.getByText(/datos simulados que no vienen del servidor\. Se cambia con el interruptor "Datos reales"/)).toBeVisible();
});
