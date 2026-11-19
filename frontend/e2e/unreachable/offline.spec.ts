import { expect, test } from '../fixtures';

/**
 * Vite without demo mode and with no backend: every API request fails. The app must say so explicitly,
 * never show invented data, and log nothing beyond the failed fetches themselves.
 */
test.use({ allowedConsoleErrors: /Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch/i });

test('Resumen says the server is unreachable and shows no demo data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();
  await expect(page.getByRole('alert').getByRole('heading', { name: 'No se pudo conectar con el servidor' })).toBeVisible();
  await expect(page.getByText('Sin conexión').first()).toBeVisible();
  await expect(page.getByText('Modo demostración')).toHaveCount(0);
  await expect(page.getByText('Rosa Elena Pérez')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Actualizar/ })).toBeVisible();
});

test('Dispositivos says the server is unreachable', async ({ page }) => {
  await page.goto('/dispositivos');
  await expect(page.getByRole('heading', { level: 1, name: 'Dispositivos' })).toBeVisible();
  await expect(page.getByRole('alert').getByRole('heading', { name: 'No se pudo conectar con el servidor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar ahora' })).toBeVisible();
  await expect(page.getByText('demo-01')).toHaveCount(0);
});
