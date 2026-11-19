import { expect, test } from '../fixtures';

/**
 * The only project whose data goes over HTTP (to a port nobody listens on), so requests can be counted.
 * Every request fails, which is fine: polling continues after a failure, and it must stop while hidden.
 */
test.use({ allowedConsoleErrors: /Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch/i });

const setHidden = (page: import('@playwright/test').Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

test('polling pauses while the tab is hidden and resumes when it is visible again', async ({ page }) => {
  // Fastest allowed poll interval, so the test does not wait long.
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem('e2e-seeded')) {
      window.sessionStorage.setItem('e2e-seeded', '1');
      window.localStorage.setItem(
        'solicare.care.v1',
        JSON.stringify({ version: 1, people: [], acknowledgements: {}, journal: {}, settings: { offlineWindowMinutes: 30, pollIntervalSeconds: 5 } }),
      );
    }
  });
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/devices')) requests += 1;
  });

  await page.goto('/');
  await expect.poll(() => requests, { timeout: 10_000 }).toBeGreaterThanOrEqual(2); // mount + at least one more interval

  await setHidden(page, true);
  await page.waitForTimeout(300); // let an in-flight request settle
  const whileHidden = requests;
  await page.waitForTimeout(11_000); // more than two intervals
  expect(requests, 'no requests while hidden').toBe(whileHidden);

  await setHidden(page, false);
  await expect.poll(() => requests, { timeout: 3_000 }).toBeGreaterThan(whileHidden);
});
