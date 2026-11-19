import { expect, test } from '../fixtures';

const FALL = 'caída de Rosa Elena Pérez';
// The visually hidden suffix is its own block, so the accessible name reads "Marcar como atendida : caída ...".
const action = (label: string) => new RegExp(`${label}\\s*: ${FALL}`);

test('acknowledge a fall with a note and keep it after a reload', async ({ page }) => {
  await page.goto('/alertas');
  const pending = page.getByRole('button', { name: action('Marcar como atendida') });
  await expect(pending).toBeVisible();

  await page.getByRole('button', { name: action('Agregar nota') }).click();
  const note = page.getByLabel('Nota (opcional)');
  await expect(note).toBeFocused();
  await note.fill('Llamé a su hijo Andrés');
  await page.getByRole('button', { name: action('Atender con nota') }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Alerta atendida' })).toBeVisible();
  await expect(page.getByText('Nota: Llamé a su hijo Andrés')).toBeVisible();
  await expect(pending).toHaveCount(0);
  // The next action replaces the pressed key and keyboard focus stays inside the row.
  await expect(page.getByRole('button', { name: action('Marcar como resuelta') })).toBeFocused();

  await page.reload();
  await expect(page.getByText('Nota: Llamé a su hijo Andrés')).toBeVisible();
  await expect(page.getByRole('button', { name: action('Marcar como resuelta') })).toBeVisible();
  await expect(page.getByRole('button', { name: action('Marcar como atendida') })).toHaveCount(0);
});

test('undo restores a pending alert, and resolving persists', async ({ page }) => {
  await page.goto('/alertas');
  await page.getByRole('button', { name: action('Marcar como atendida') }).click();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByRole('button', { name: action('Marcar como atendida') })).toBeVisible();

  await page.getByRole('button', { name: action('Marcar como atendida') }).click();
  await page.getByRole('button', { name: action('Marcar como resuelta') }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: new RegExp(FALL) })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Conteo de alertas' }).getByRole('listitem').filter({ hasText: /1 resuelta/ })).toBeVisible();
});

test('filters by state through the URL, and the tab badge counts pending alerts', async ({ page }) => {
  await page.goto('/alertas?estado=pendiente');
  await expect(page.getByLabel('Estado')).toHaveValue('pendiente');
  await expect(page.getByRole('link', { name: /^Alertas \d+ pendientes?$/ })).toBeVisible();
  await page.getByLabel('Tipo').selectOption('conexion');
  await expect(page).toHaveURL(/tipo=conexion/);
  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  await expect(page).not.toHaveURL(/estado=/);
});

test('keyboard focus is not lost when an acted alert leaves a filtered list', async ({ page }) => {
  await page.goto('/alertas?estado=pendiente');
  const key = page.getByRole('button', { name: action('Marcar como atendida') });
  await key.focus();
  await page.keyboard.press('Enter');
  await expect(key).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await expect(page.locator('.results')).toBeFocused();
});
