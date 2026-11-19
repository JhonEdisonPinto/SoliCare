import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, VIEWPORTS } from '../fixtures';

const ROUTES = ['/', '/personas', '/personas/demo-p1', '/dispositivos', '/dispositivos/demo-02', '/alertas', '/configuracion', '/esta-ruta-no-existe'];

const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

async function settle(page: Page) {
  await expect(page.getByText('Conectando con el servidor')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${name} (${viewport.width}px)`, () => {
    test.use({ viewport });

    for (const path of ROUTES) {
      test(`axe finds no WCAG 2.2 AA violations on ${path}`, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        expect(
          results.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) })),
        ).toEqual([]);
      });

      test(`landmarks and keyboard order on ${path}`, async ({ page }) => {
        await page.goto(path);
        await settle(page);

        // Landmarks: one banner, one main, one primary navigation, one h1.
        await expect(page.getByRole('banner')).toHaveCount(1);
        await expect(page.getByRole('main')).toHaveCount(1);
        await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

        // Tab from the top of the page: every visible control is reached, each shows a focus indicator,
        // and the cycle ends (no trap).
        const expected = await page.evaluate((selector) => {
          const visible = (element: Element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && !(element as HTMLInputElement).disabled;
          };
          const all = [...document.querySelectorAll(selector)].filter(visible);
          all.forEach((element, index) => element.setAttribute('data-e2e-i', String(index)));
          return all.length;
        }, INTERACTIVE);
        expect(expected).toBeGreaterThan(5);

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const reached = new Set<string>();
        const hidden: string[] = [];
        for (let step = 0; step < expected + 5; step += 1) {
          await page.keyboard.press('Tab');
          const info = await page.evaluate(() => {
            const element = document.activeElement as HTMLElement | null;
            if (!element || element === document.body) return null;
            const style = getComputedStyle(element);
            const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
            const shadow = style.boxShadow !== 'none';
            const box = element.getBoundingClientRect();
            return {
              index: element.getAttribute('data-e2e-i'),
              label: `${element.tagName.toLowerCase()} ${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40)}`,
              indicator: outline || shadow,
              inView: box.right > 0 && box.left < innerWidth,
            };
          });
          if (info === null) break; // Focus left the document: the cycle is complete.
          if (info.index !== null) reached.add(info.index);
          if (!info.indicator) hidden.push(info.label);
          expect(info.inView, `${info.label} is scrolled into view`).toBe(true);
        }
        expect(hidden, 'focused controls without a visible focus indicator').toEqual([]);
        expect(reached.size, 'controls reached with Tab').toBe(expected);
      });
    }
  });
}

test('modal dialogs trap focus and return it to the opener', async ({ page }) => {
  await page.goto('/personas/demo-p1');
  const opener = page.getByRole('button', { name: 'Eliminar persona' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // A native modal makes the rest of the page inert: Tab cycles through the dialog's controls and, like
  // any browser dialog, may pass through the browser chrome (activeElement is then <body>). What it must
  // never do is land on the page behind.
  const inside = () =>
    page.evaluate(() => {
      const active = document.activeElement;
      return active === document.body || Boolean(active?.closest('dialog[open]'));
    });
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    expect(await inside(), `Tab ${i + 1} stays inside the dialog`).toBe(true);
  }
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await inside(), `Shift+Tab ${i + 1} stays inside the dialog`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test.describe('reduced motion', () => {
  const fallRow = (page: Page) => page.locator('.event--caida.event--pendiente').first();
  const animationName = (page: Page) => fallRow(page).evaluate((element) => getComputedStyle(element).animationName);

  test('the pending-fall fade does not run when the user prefers reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/alertas');
    await expect(fallRow(page)).toBeVisible();
    expect(await animationName(page)).toBe('none');
    // A toast does not animate either.
    await page.getByRole('button', { name: /Marcar como atendida/ }).first().click();
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  });

  test('control: the fade does run when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/alertas');
    await expect(fallRow(page)).toBeVisible();
    expect(await animationName(page)).toBe('fall-in');
  });
});

test.describe('axe in interactive states', () => {
  const scan = async (page: Page) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    return results.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) }));
  };

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`form errors, note field, toast and dialog at ${viewport.width}px (${name})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // The toast fades in; axe would measure contrast mid-fade. Reduced motion shows the final colours.
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await page.goto('/personas');
      await settle(page);
      await page.getByRole('button', { name: 'Agregar persona' }).click();
      await page.getByRole('button', { name: 'Guardar persona' }).click();
      await expect(page.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');
      expect(await scan(page), 'person form with an error').toEqual([]);

      await page.goto('/alertas');
      await settle(page);
      await page.getByRole('button', { name: /Agregar nota/ }).first().click();
      expect(await scan(page), 'note field open').toEqual([]);
      await page.getByRole('button', { name: /Atender con nota/ }).click();
      await expect(page.locator('.toast')).toBeVisible();
      expect(await scan(page), 'toast visible').toEqual([]);

      await page.goto('/personas/demo-p1');
      await settle(page);
      await page.getByRole('button', { name: 'Agregar contacto' }).click();
      await page.getByRole('button', { name: 'Guardar contacto' }).click();
      expect(await scan(page), 'contact form with an error').toEqual([]);
      await page.getByRole('button', { name: 'Eliminar persona' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await scan(page), 'confirm dialog open').toEqual([]);
    });
  }
});
