import { expect, test } from '../fixtures';

test('"Simular ausencia" shows a green person without signals, labelled as a simulation, then green again', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await page.clock.install();
  await page.goto('/');

  const network = page.getByRole('region', { name: 'Personas' });
  const carmen = network.getByRole('link', { name: /Carmen Sofía Ruiz/ });
  await expect(carmen).toContainText('Conectado');

  await page.getByRole('button', { name: 'Simular ausencia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'modo demostración' })).toBeVisible();
  await expect(carmen).toContainText('Sin conexión');

  // Only the button that started it says so; the other one is unavailable until the case ends.
  const running = page.getByRole('button', { name: 'Simulación en curso…' });
  await expect(running).toHaveCount(1);
  await expect(running).toBeFocused();
  await expect(page.getByRole('button', { name: 'Simular caída' })).toHaveAttribute('aria-disabled', 'true');

  // The banner shows the most urgent alert first, so the demo's real alerts are closed to reach this one.
  const awayBanner = page.getByRole('heading', { name: 'Persona sin señales' });
  await expect(async () => {
    if (!(await awayBanner.isVisible())) await page.getByRole('button', { name: 'Cerrar aviso' }).click({ timeout: 1_000 });
    await expect(awayBanner).toBeVisible({ timeout: 100 });
  }).toPass({ timeout: 10_000 });

  await page.getByRole('navigation').getByRole('link', { name: /Alertas/ }).first().click();
  const item = page.locator('.event', { hasText: 'Carmen Sofía Ruiz' }).filter({ hasText: 'Ausencia' });
  await expect(item).toContainText('Simulación');
  await expect(item.getByRole('button')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: /Resumen/ }).first().click();

  await page.clock.runFor(26_000);
  await expect(carmen).toContainText('Conectado');
  await expect(page.getByRole('button', { name: 'Simular ausencia' })).toHaveAttribute('aria-disabled', 'false');

  const stored = await page.evaluate(() => Object.values(window.localStorage).join(''));
  expect(stored).not.toContain('simulacion');
});

test('with nobody green, a simulation uses a person whose device is offline and leaves them as they were', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const network = page.getByRole('region', { name: 'Personas' });
  const luis = network.getByRole('link', { name: /Luis Alberto Gómez/ });
  await expect(luis).toContainText('Sin conexión');

  // Keep only Luis, whose demo device stopped reporting 47 min ago.
  const key = 'solicare.demo.care.v1';
  await expect.poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey) !== null, key)).toBe(true);
  await page.evaluate((storageKey) => {
    const data = JSON.parse(window.localStorage.getItem(storageKey) as string) as { people: { id: string }[] };
    data.people = data.people.filter((person) => person.id === 'demo-p2');
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, key);
  await page.reload();
  await expect(luis).toContainText('Sin conexión');
  await expect(network.getByRole('link', { name: /Carmen Sofía Ruiz/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Simular caída' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'modo demostración' })).toBeVisible();
  await expect(luis).toContainText('Caída sin atender');

  await page.clock.runFor(26_000);
  await expect(luis).not.toContainText('Caída sin atender');
  await expect(luis).toContainText('Sin conexión');
});
