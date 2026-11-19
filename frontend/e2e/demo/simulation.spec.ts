import { expect, test } from '../fixtures';

test('"Simular caída" turns a green person red for a while, labelled as a simulation, then green again', async ({ page }) => {
  // The first candidate (sorted by name) is picked: Carmen Sofía Ruiz, whose demo device reports on time.
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto('/');

  const network = page.getByRole('region', { name: 'Personas' });
  const carmen = network.getByRole('link', { name: /Carmen Sofía Ruiz/ });
  await expect(carmen).toContainText('Conectado');

  await page.getByRole('button', { name: 'Simular caída' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'modo demostración' })).toBeVisible();
  await expect(carmen).toContainText('Caída sin atender');
  const running = page.getByRole('button', { name: 'Simulación en curso…' });
  await expect(running).toHaveAttribute('aria-disabled', 'true');
  await expect(running).toBeFocused();

  // Alertas shows it as a simulation, with nothing to acknowledge.
  await page.getByRole('navigation').getByRole('link', { name: /Alertas/ }).first().click();
  const item = page.locator('.event', { hasText: 'Carmen Sofía Ruiz' }).filter({ hasText: 'Simulación' });
  await expect(item).toBeVisible();
  await expect(item.getByRole('button')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: /Resumen/ }).first().click();

  await page.clock.runFor(26_000);
  await expect(carmen).toContainText('Conectado');
  await expect(page.getByRole('button', { name: 'Simular caída' })).toHaveAttribute('aria-disabled', 'false');

  // Nothing about the simulation was stored.
  const stored = await page.evaluate(() => Object.values(window.localStorage).join(''));
  expect(stored).not.toContain('simulacion');
});

test('the alert rows and the contact list have no call links', async ({ page }) => {
  await page.goto('/alertas');
  await expect(page.locator('.event').first()).toBeVisible();
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await page.goto('/personas/demo-p1');
  await expect(page.getByText('+57 300 555 0142')).toBeVisible();
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
});
