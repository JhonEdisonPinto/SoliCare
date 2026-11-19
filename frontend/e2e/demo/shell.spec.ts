import { expect, test, VIEWPORTS } from '../fixtures';

test('the disclaimer appears once, in the footer', async ({ page }) => {
  await page.goto('/personas');
  const disclaimer = page.getByText('Las señales de seguimiento no son un diagnóstico');
  await expect(disclaimer).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toContainText('no son un diagnóstico');
});

test('on a short page the footer sits at the bottom of the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/esta-ruta-no-existe');
  const box = await page.getByRole('contentinfo').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.y + box!.height)).toBe(1000);
});

test('the sidebar has the account label and profile, and none of the removed controls', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByText('Familia Cuidado')).toBeVisible();
  await expect(sidebar.getByText('Cuenta familiar')).toBeVisible();
  await expect(sidebar.getByText('Jhon Edison')).toBeVisible();
  await expect(sidebar.getByText('Administrador')).toBeVisible();
  // Nothing that does nothing: no account switcher, logout, help center or promotional card.
  await expect(page.getByRole('button', { name: /Familia Cuidado|Cerrar sesión|Salir/ })).toHaveCount(0);
  await expect(page.getByText(/Centro de ayuda|Necesitas ayuda|Cuidar también es estar cerca/)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: VIEWPORTS.small, hasTouch: true });

  test('the menu opens as a drawer, Escape closes it and focus returns to the menu button', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Abrir menú' });
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toBeHidden();
    await menu.tap();
    await expect(nav).toBeVisible();
    // The drawer slides in: wait for it to settle, then it must sit inside the window.
    await expect.poll(async () => (await nav.boundingBox())!.x).toBeGreaterThanOrEqual(0);
    const box = await nav.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORTS.small.width);
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.tap();
    await nav.getByRole('link', { name: 'Personas' }).tap();
    await expect(page).toHaveURL(/\/personas$/);
    await expect(nav).toBeHidden();
  });

  test('the demo indicator stays visible in the top bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Demostración', { exact: true })).toBeVisible();
  });
});
