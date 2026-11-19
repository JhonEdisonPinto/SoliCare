import { expect, test } from '../fixtures';

test('add, edit and delete a person, with an inline validation error', async ({ page }) => {
  await page.goto('/personas');
  await expect(page.getByRole('link', { name: 'Rosa Elena Pérez' })).toBeVisible();

  // Add: an empty name is rejected inline and focus lands on the field.
  await page.getByRole('button', { name: 'Agregar persona' }).click();
  const form = page.getByRole('region', { name: 'Agregar persona' });
  await form.getByRole('button', { name: 'Guardar persona' }).click();
  const name = form.getByLabel('Nombre');
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription(/Escriba el nombre de la persona\./);
  await expect(name).toHaveAttribute('aria-invalid', 'true');

  // Typing clears the error; the valid form saves and the person appears in the list.
  await name.fill('Ana Prueba');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  await form.getByLabel('Relación (opcional)').fill('Vecina');
  await form.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Persona guardada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar persona' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Ana Prueba' })).toBeVisible();

  // It survives a reload (local store).
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ana Prueba' })).toBeVisible();

  // Edit from the detail page.
  await page.getByRole('link', { name: 'Ana Prueba' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ana Prueba' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const edit = page.getByRole('region', { name: 'Editar datos' });
  await edit.getByLabel('Nombre').fill('Ana María Prueba');
  await edit.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ana María Prueba' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar datos' })).toBeFocused();

  // Delete: the dialog defaults to the safe action, then confirm.
  await page.getByRole('button', { name: 'Eliminar persona' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar a Ana María Prueba?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Eliminar persona' }).click();
  await expect(page).toHaveURL(/\/personas$/);
  await expect(page.getByRole('link', { name: 'Ana María Prueba' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Rosa Elena Pérez' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ana María Prueba' })).toHaveCount(0);
});

test('cancelling the delete dialog keeps the person and returns focus to the opener', async ({ page }) => {
  await page.goto('/personas/demo-p2');
  const opener = page.getByRole('button', { name: 'Eliminar persona' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: 'Luis Alberto Gómez' })).toBeVisible();
});

test('a deep link to a person survives a reload', async ({ page }) => {
  await page.goto('/personas/demo-p1');
  await expect(page.getByRole('heading', { level: 1, name: 'Rosa Elena Pérez' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Rosa Elena Pérez' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Contactos que serán notificados' })).toBeVisible();
});

test('contacts: add with an inline error, edit, and delete keeps focus in the block', async ({ page }) => {
  await page.goto('/personas/demo-p2');
  const block = page.getByRole('region', { name: /Contactos que serán notificados/ });
  await block.getByRole('button', { name: 'Agregar contacto' }).click();
  await block.getByLabel('Nombre del contacto').fill('Sara');
  await block.getByRole('button', { name: 'Guardar contacto' }).click();
  const phone = block.getByLabel('Teléfono');
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAccessibleDescription(/Escriba un número de teléfono\./);
  await phone.fill('+57 300 555 0100');
  await block.getByRole('button', { name: 'Guardar contacto' }).click();
  await expect(block.locator('.contact-name', { hasText: 'Sara' })).toBeVisible();
  await expect(block.getByRole('button', { name: 'Agregar contacto' })).toBeFocused();

  await block.getByRole('button', { name: /Eliminar\s*a Sara/ }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar a Sara?' });
  await dialog.getByRole('button', { name: 'Eliminar contacto' }).click();
  await expect(block.locator('.contact-name', { hasText: 'Sara' })).toHaveCount(0);
  await expect(block.getByRole('button', { name: 'Agregar contacto' })).toBeFocused();
});

test('saving "Editar datos" does not undo a device change made in the Dispositivo block (D3)', async ({ page }) => {
  await page.goto('/personas/demo-p4');
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const edit = page.getByRole('region', { name: 'Editar datos' });
  await expect(edit.getByLabel('Dispositivo (opcional)')).toHaveValue('demo-04');

  // Remove the device in the other block while the edit form is still open.
  const block = page.getByRole('region', { name: 'Dispositivo', exact: true });
  await block.getByLabel('Dispositivo asignado').selectOption('');
  await block.getByRole('button', { name: 'Guardar dispositivo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dispositivo guardado' })).toBeVisible();
  await expect(edit.getByLabel('Dispositivo (opcional)')).toHaveValue('');

  await edit.getByLabel('Nombre').fill('Jorge Iván R.');
  await edit.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jorge Iván R.' })).toBeVisible();
  await expect(page.getByText('no tiene un dispositivo asignado')).toBeVisible();
  await page.reload();
  await expect(page.getByText('no tiene un dispositivo asignado')).toBeVisible();
});

test('reassigning a device from its page moves it in one step and keeps past alerts with the person who had it (D2, D4)', async ({ page }) => {
  // Let the panel see Rosa's fall once, so it is journaled with her as the person.
  await page.goto('/personas');
  await expect
    .poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('solicare.demo.care.v1') ?? '{"journal":{}}').journal).length))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Agregar persona' }).click();
  await page.getByRole('region', { name: 'Agregar persona' }).getByLabel('Nombre').fill('Nueva Persona');
  await page.getByRole('region', { name: 'Agregar persona' }).getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('link', { name: 'Nueva Persona' })).toBeVisible();

  // demo-02 belongs to Rosa and has a pending fall.
  await page.goto('/dispositivos/demo-02');
  await expect(page.getByLabel('Persona asignada').locator('option', { hasText: 'Nueva Persona' })).toHaveCount(1);
  await page.getByLabel('Persona asignada').selectOption({ label: 'Nueva Persona' });
  await page.getByRole('button', { name: 'Guardar asignación' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Asignación guardada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nueva Persona' }).first()).toBeVisible();

  await page.goto('/personas/demo-p1');
  await expect(page.getByText('no tiene un dispositivo asignado')).toBeVisible();
  // The fall happened while Rosa had the device: it stays in her history.
  await expect(page.getByRole('region', { name: 'Historial de alertas' }).getByText('Caída').first()).toBeVisible();
});
