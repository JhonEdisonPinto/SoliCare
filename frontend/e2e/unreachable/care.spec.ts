import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, VIEWPORTS } from '../fixtures';

/**
 * Care data on the backend, with the whole API mocked in the browser. The mock behaves like the real
 * route: Bearer key required, PUT only when baseVersion is the stored version (409 with the document
 * otherwise). Failed requests (401, 404) are logged by the browser, hence the pattern.
 */
test.use({ allowedConsoleErrors: /Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch|40[14]/i });

const API = 'http://127.0.0.1:5197';
const KEY = 'clave-de-prueba';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

type Person = { id: string; name: string; relation: string; deviceId: string | null; contacts: unknown[]; createdAt: string };
const person = (id: string, name: string, deviceId: string | null = null): Person => ({ id, name, relation: 'Vecina', deviceId, contacts: [], createdAt: '2026-01-01T00:00:00.000Z' });
const careDoc = (people: Person[] = []) => ({ version: 1, people, acknowledgements: {}, journal: {}, settings: { offlineWindowMinutes: 30, pollIntervalSeconds: 15 } });

type Mock = { version: number; doc: ReturnType<typeof careDoc>; puts: { baseVersion: number; data: ReturnType<typeof careDoc> }[]; conflictOnce: (() => void) | null };

async function mockApi(page: Page, options: { care: 'keyed' | 'absent'; people?: Person[] }): Promise<Mock> {
  const mock: Mock = { version: options.people?.length ? 1 : 0, doc: careDoc(options.people), puts: [], conflictOnce: null };
  await page.route(`${API}/api/v1/devices`, (route) => route.fulfill({ headers: CORS, json: { devices: [] } }));
  await page.route(`${API}/api/v1/care`, (route) => {
    const request = route.request();
    if (options.care === 'absent') return route.fulfill({ headers: CORS, status: 404, json: { message: 'Route GET:/api/v1/care not found' } });
    if (request.method() === 'OPTIONS') return route.fulfill({ headers: CORS, status: 204 });
    if (request.headers().authorization !== `Bearer ${KEY}`) return route.fulfill({ headers: CORS, status: 401, json: { error: 'Unauthorized' } });
    if (request.method() === 'GET') return route.fulfill({ headers: CORS, json: { version: mock.version, data: mock.doc } });
    const body = request.postDataJSON() as Mock['puts'][number];
    mock.puts.push(body);
    if (mock.conflictOnce) {
      // Another panel saved first.
      mock.conflictOnce();
      mock.conflictOnce = null;
    }
    if (body.baseVersion !== mock.version) return route.fulfill({ headers: CORS, status: 409, json: { error: 'Conflict', version: mock.version, data: mock.doc } });
    mock.version += 1;
    mock.doc = body.data as Mock['doc'];
    return route.fulfill({ headers: CORS, json: { version: mock.version, data: mock.doc } });
  });
  return mock;
}

/** Puts values in this tab's localStorage once, after the fixture cleared it. */
async function seedStorage(page: Page, values: Record<string, unknown>) {
  await page.addInitScript((entries) => {
    if (window.sessionStorage.getItem('e2e-seeded')) return;
    window.sessionStorage.setItem('e2e-seeded', '1');
    for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }, values);
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test('401 shows the panel key screen; the right key loads the people and is remembered', async ({ page }) => {
  await mockApi(page, { care: 'keyed', people: [person('p1', 'Ana Prueba')] });
  await page.goto('/personas');
  await expect(page.getByRole('heading', { level: 1, name: 'Clave del panel' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ana Prueba' })).toHaveCount(0);

  await page.getByLabel('Clave del panel').fill(KEY);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Ana Prueba' })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('solicare.panel-key.v1'))).toBe(KEY);

  // A reload goes straight in with the remembered key.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ana Prueba' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clave del panel' })).toHaveCount(0);
});

test('a wrong key says so, keeps the screen and stores nothing', async ({ page }) => {
  await mockApi(page, { care: 'keyed' });
  await page.goto('/');
  await page.getByLabel('Clave del panel').fill('otra-clave');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const field = page.getByLabel('Clave del panel');
  await expect(field).toHaveAccessibleDescription(/La clave no es correcta/);
  await expect(page.getByRole('heading', { level: 1, name: 'Clave del panel' })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('solicare.panel-key.v1'))).toBeNull();

  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([]);
});

for (const [name, viewport] of Object.entries({ desktop: VIEWPORTS.desktop, mobile: VIEWPORTS.mobile })) {
  test(`the key screen has no accessibility violations and fits the width at ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockApi(page, { care: 'keyed' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Clave del panel' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('404 (an older backend) keeps the data in this browser, with no prompt and no write to the server', async ({ page }) => {
  const mock = await mockApi(page, { care: 'absent' });
  await page.goto('/personas');
  await expect(page.getByRole('heading', { level: 1, name: 'Personas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clave del panel' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Añadir persona' }).click();
  await page.getByLabel('Nombre').fill('Local Uno');
  await page.getByRole('button', { name: 'Guardar persona' }).click();
  await expect(page.getByRole('link', { name: 'Local Uno' })).toBeVisible();
  const stored = await page.evaluate(() => window.localStorage.getItem('solicare.care.v1'));
  expect(JSON.parse(stored!).people.map((p: Person) => p.name)).toEqual(['Local Uno']);
  expect(mock.puts).toEqual([]);

  await page.goto('/configuracion');
  await expect(page.getByText('Se guardan solo en este navegador')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clave del panel' })).toHaveCount(0);
});

test('409: the edit is retried on the fresh document and succeeds without losing the other panel\'s change', async ({ page }) => {
  await seedStorage(page, { 'solicare.panel-key.v1': KEY });
  const mock = await mockApi(page, { care: 'keyed', people: [person('p1', 'Ana Prueba')] });
  await page.goto('/personas');
  await expect(page.getByRole('link', { name: 'Ana Prueba' })).toBeVisible();

  mock.conflictOnce = () => {
    mock.version += 1;
    mock.doc = { ...mock.doc, people: [...mock.doc.people, person('p2', 'Otra Persona')] };
  };
  await page.getByRole('button', { name: 'Añadir persona' }).click();
  await page.getByLabel('Nombre').fill('Nueva Persona');
  await page.getByRole('button', { name: 'Guardar persona' }).click();

  await expect(page.getByRole('link', { name: 'Nueva Persona' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Otra Persona' })).toBeVisible();
  expect(mock.puts.map((put) => put.baseVersion)).toEqual([1, 2]);
  expect(mock.doc.people.map((p) => p.name)).toEqual(['Ana Prueba', 'Otra Persona', 'Nueva Persona']);
});

test('migration: the local people are uploaded after a summary, the local copy stays and a toast says so', async ({ page }) => {
  const local = careDoc([person('l1', 'Local Uno', 'dev-1'), person('l2', 'Local Dos', 'dev-7')]);
  await seedStorage(page, { 'solicare.panel-key.v1': KEY, 'solicare.care.v1': local });
  const mock = await mockApi(page, { care: 'keyed', people: [person('s1', 'Servidor Uno', 'dev-1')] });
  await page.goto('/configuracion');

  await expect(page.getByRole('heading', { name: 'Clave del panel' })).toBeVisible();
  await expect(page.getByText('Se guardan en el servidor de SoliCare')).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) }))).toEqual([]);
  await page.getByRole('button', { name: 'Subir los datos de este navegador al servidor' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Se subirán al servidor: 2 personas')).toBeVisible();
  await expect(dialog.getByText('dev-1 sigue con Servidor Uno; Local Uno se sube sin dispositivo.')).toBeVisible();
  await expect(dialog.getByText('La copia de este navegador no se borra.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Subir datos' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Datos de este navegador subidos al servidor' })).toBeVisible();
  expect(mock.doc.people.map((p) => [p.name, p.deviceId])).toEqual([['Servidor Uno', 'dev-1'], ['Local Uno', null], ['Local Dos', 'dev-7']]);
  const kept = await page.evaluate(() => window.localStorage.getItem('solicare.care.v1'));
  expect(JSON.parse(kept!).people).toHaveLength(2);
  // Nothing left to upload.
  await expect(page.getByRole('button', { name: 'Subir los datos de este navegador al servidor' })).toHaveCount(0);
  await expect(page.getByText('ya están en el servidor')).toBeVisible();
});

test('Configuración can forget the key (back to the key screen) and change it', async ({ page }) => {
  await seedStorage(page, { 'solicare.panel-key.v1': KEY });
  await mockApi(page, { care: 'keyed', people: [person('p1', 'Ana Prueba')] });
  await page.goto('/configuracion');

  await page.getByRole('button', { name: 'Cambiar clave del panel' }).click();
  await page.getByLabel('Nueva clave del panel').fill('mala');
  await page.getByRole('button', { name: 'Guardar clave' }).click();
  await expect(page.getByLabel('Nueva clave del panel')).toHaveAccessibleDescription(/La clave no es correcta/);
  await page.getByLabel('Nueva clave del panel').fill(KEY);
  await page.getByRole('button', { name: 'Guardar clave' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Clave del panel actualizada' })).toBeVisible();

  await page.getByRole('button', { name: 'Olvidar clave' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Olvidar clave' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clave del panel' })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('solicare.panel-key.v1'))).toBeNull();
});
