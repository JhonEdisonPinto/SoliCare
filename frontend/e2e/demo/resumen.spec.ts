import { expect, test } from '../fixtures';

test('the greeting, date and statistics come from real data', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Buen(os días|as tardes|as noches), Jhon/);
  await expect(page.getByText('Este es el estado de tu red de cuidado.')).toBeVisible();
  const stats = page.getByRole('region', { name: 'Indicadores' });
  await expect(stats.locator('.stat-card', { hasText: 'Personas monitoreadas' }).locator('.stat-value')).toHaveText('5');
  // Demo devices: demo-01, 02, 04, 06 report; demo-03 is silent; demo-05 is assigned but never reported.
  await expect(stats.locator('.stat-card', { hasText: 'Dispositivos conectados' }).locator('.stat-value')).toHaveText('4 / 6');
  // Nobody has acknowledged an alert yet: 0 and "Sin datos", never an invented figure.
  await expect(stats.locator('.stat-card', { hasText: 'Alertas atendidas' }).locator('.stat-value')).toHaveText('0');
  await expect(stats.locator('.stat-card', { hasText: 'Tiempo de respuesta' }).locator('.stat-value')).toHaveText('Sin datos');
});

test('the banner shows the most urgent alert without call links, and can be closed for the visit', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Caída sin atender' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Rosa Elena Pérez');
  await expect(banner.getByRole('link', { name: /Andrés Pérez/ })).toHaveCount(0);
  await expect(banner.getByRole('link', { name: '1 alerta abierta más' })).toBeVisible();
  await banner.getByRole('button', { name: 'Cerrar aviso' }).click();
  // The next open alert (a silent device) takes its place.
  await expect(page.getByRole('region', { name: 'Revisa una conexión' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver dispositivo/ })).toBeVisible();
});

test('acknowledging from the banner records the response time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Marcar como atendida/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alerta atendida' })).toBeVisible();
  const stats = page.getByRole('region', { name: 'Indicadores' });
  await expect(stats.locator('.stat-card', { hasText: 'Alertas atendidas' }).locator('.stat-value')).toHaveText('1');
  await expect(stats.locator('.stat-card', { hasText: 'Tiempo de respuesta' }).locator('.stat-value')).not.toHaveText('Sin datos');
});

test('vitals show the real latest reading and its age, with a text alternative for the chart', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Signos vitales' });
  await expect(card.getByRole('combobox', { name: 'Persona' })).toHaveValue('demo-p1');
  await expect(card.locator('.vital-card', { hasText: 'Pulso' }).locator('strong')).not.toHaveText('--');
  await expect(card.locator('.vital-age').first()).toContainText('hace');
  await expect(card.locator('.chart-summary')).toContainText('lecturas válidas');
  await card.getByRole('button', { name: 'SpO2' }).click();
  await expect(card.getByRole('button', { name: 'SpO2' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('combobox', { name: 'Persona' }).selectOption({ label: 'Carmen Sofía Ruiz' });
  await expect(card.getByRole('combobox', { name: 'Persona' })).toHaveValue('demo-p3');
});

test('fall detection uses the stats endpoint and says "Sin datos" for motion', async ({ page }) => {
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Detección de caídas' });
  await expect(card.getByText('Caída sin atender').first()).toBeVisible();
  await expect(card.locator('.fall-metric', { hasText: 'Eventos este mes' }).locator('strong')).toHaveText('1');
  await expect(card.locator('.fall-metric', { hasText: 'Último movimiento' }).locator('strong')).toHaveText('Sin datos');
  await expect(card.locator('.fall-activity', { hasText: 'Actividad del sensor' }).locator('strong')).toHaveText('Sin datos');
});

test('the care network and recent activity list real people and events', async ({ page }) => {
  await page.goto('/');
  const network = page.getByRole('region', { name: 'Personas' });
  await expect(network.getByRole('link', { name: /Rosa Elena Pérez/ })).toContainText('Caída sin atender');
  await expect(network.getByRole('link', { name: /Luis Alberto Gómez/ })).toContainText('Sin conexión');
  await expect(network.getByRole('link', { name: /Carmen Sofía Ruiz/ })).toContainText('Conectado');
  await expect(network.getByRole('link', { name: 'Añadir una persona' })).toHaveAttribute('href', '/personas?agregar=1');
  const activity = page.getByRole('region', { name: 'Actividad reciente' });
  await expect(activity.getByText('Lectura recibida').first()).toBeVisible();
  await expect(activity.getByText('Caída detectada')).toBeVisible();
});

test('"Añadir persona" on the Resumen opens the add form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Añadir persona' }).click();
  await expect(page).toHaveURL(/\/personas$/);
  await expect(page.getByRole('region', { name: 'Añadir persona' })).toBeVisible();
});
