import { expect, test as base } from '@playwright/test';

/**
 * Every test starts with empty localStorage (once per tab, so reloads inside a test keep their data) and
 * fails if the page logs a console error or throws.
 * Tests that expect failed requests (the "unreachable" project) set `allowedConsoleErrors` (one pattern).
 */
export const test = base.extend<{ allowedConsoleErrors: RegExp | null; problems: string[] }>({
  allowedConsoleErrors: [null, { option: true }],
  problems: [
    async ({ page, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (allowedConsoleErrors?.test(text)) return;
        problems.push(`console.error: ${text}`);
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      await page.addInitScript(() => {
        try {
          if (!window.sessionStorage.getItem('e2e-cleared')) {
            window.localStorage.clear();
            window.sessionStorage.setItem('e2e-cleared', '1');
          }
        } catch {
          // Storage unavailable: nothing to clear.
        }
      });
      await use(problems);
      expect(problems, 'console errors and page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const VIEWPORTS = {
  wide: { width: 2560, height: 1080 },
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
  small: { width: 360, height: 740 },
} as const;
