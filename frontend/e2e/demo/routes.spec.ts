import type { Page } from '@playwright/test';
import { expect, test, VIEWPORTS } from '../fixtures';

const ROUTES = [
  { path: '/', h1: 'Resumen' },
  { path: '/personas', h1: 'Personas' },
  { path: '/personas/demo-p1', h1: 'Rosa Elena Pérez' },
  { path: '/dispositivos', h1: 'Dispositivos' },
  { path: '/dispositivos/demo-02', h1: 'Dispositivo demo-02' },
  { path: '/alertas', h1: 'Alertas' },
  { path: '/configuracion', h1: 'Configuración' },
  { path: '/esta-ruta-no-existe', h1: 'Página no encontrada' },
] as const;

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`routes at ${viewport.width}px (${name})`, () => {
    test.use({ viewport });

    for (const route of ROUTES) {
      test(`${route.path} shows one h1 and fits the width`, async ({ page }) => {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(route.h1);
        // Let the simulated API answer so lazy content has rendered before measuring.
        await expect(page.getByText('Conectando con el servidor')).toHaveCount(0);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page);
      });
    }
  });
}
