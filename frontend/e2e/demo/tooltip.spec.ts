import AxeBuilder from '@axe-core/playwright';
import { expect, test, VIEWPORTS } from '../fixtures';

const NOTE = /Ordenadas por urgencia/;

test('block explanations sit behind an "i" tooltip that keyboard users can open and close', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Más información: Personas' });
  const bubble = page.getByRole('tooltip').filter({ hasText: NOTE });

  await expect(bubble).toBeHidden();
  await expect(button).toHaveAccessibleDescription(NOTE);

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(bubble).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
  await expect(button).toBeFocused();
});

test.describe('on a phone', () => {
  test.use({ viewport: VIEWPORTS.small, hasTouch: true });

  test('a tap opens the tooltip inside the page width and a tap elsewhere closes it', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Más información: Dispositivos sin persona asignada' });
    const bubble = page.getByRole('tooltip').filter({ hasText: /ninguna persona del panel/ });

    await button.tap();
    await expect(bubble).toBeVisible();
    const box = await bubble.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORTS.small.width);

    await page.getByRole('heading', { level: 1 }).tap();
    await expect(bubble).toBeHidden();
  });
});

test('the disclaimer appears once, in the footer', async ({ page }) => {
  await page.goto('/personas');
  const disclaimer = page.getByText('Las señales de seguimiento no son un diagnóstico');
  await expect(disclaimer).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toContainText('no son un diagnóstico');
});

test('a mouse click after hovering keeps the tooltip open', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Más información: Personas' });
  const bubble = page.getByRole('tooltip').filter({ hasText: NOTE });

  await button.hover();
  await expect(bubble).toBeVisible();
  await button.click();
  await expect(bubble).toBeVisible();

  await page.mouse.move(0, 0);
  await expect(bubble).toBeHidden();
});
