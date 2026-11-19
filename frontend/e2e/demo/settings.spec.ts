import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Principal' });

test('change a setting, see a validation error, and keep the value after a reload', async ({ page }) => {
  await page.goto('/configuracion');
  const offline = page.getByLabel('Minutos sin reporte antes de avisar');
  await expect(offline).toHaveValue('30');

  // Out of range: rejected inline.
  await offline.fill('0');
  await page.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(offline).toBeFocused();
  await expect(offline).toHaveAccessibleDescription(/Use un número entero entre 5 y 1440\./);

  // Valid: saved, toast shown, and it persists.
  await offline.fill('45');
  await page.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ajustes guardados' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Minutos sin reporte antes de avisar')).toHaveValue('45');

  await page.getByRole('button', { name: 'Restablecer valores' }).click();
  await expect(page.getByLabel('Minutos sin reporte antes de avisar')).toHaveValue('30');
});

test('the offline window changes which devices need attention', async ({ page }) => {
  // demo-03 stopped reporting 47 minutes ago: it is a connection alert at 30 min, not at 60 min.
  await page.goto('/alertas?tipo=conexion');
  await expect(page.getByRole('link', { name: 'demo-03' }).first()).toBeVisible();
  await page.goto('/configuracion');
  await page.getByLabel('Minutos sin reporte antes de avisar').fill('60');
  await page.getByRole('button', { name: 'Guardar ajustes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ajustes guardados' })).toBeVisible();
  await sidebar(page).getByRole('link', { name: /^Alertas/ }).click();
  await page.getByLabel('Tipo').selectOption('conexion');
  await expect(page.getByRole('link', { name: 'demo-03' })).toHaveCount(0);
});

test('clearing local data restores the demo seed', async ({ page }) => {
  await page.goto('/personas');
  await page.getByRole('button', { name: 'Añadir persona' }).click();
  await page.getByLabel('Nombre').fill('Temporal');
  await page.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('link', { name: 'Temporal' })).toBeVisible();

  await sidebar(page).getByRole('link', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Borrar datos locales' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar datos locales' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Datos locales borrados' })).toBeVisible();
  await sidebar(page).getByRole('link', { name: 'Personas' }).click();
  await expect(page.getByRole('link', { name: 'Temporal' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Rosa Elena Pérez' })).toBeVisible();
});

test('shows the demo mode label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Modo demostración').first()).toBeVisible();
});
