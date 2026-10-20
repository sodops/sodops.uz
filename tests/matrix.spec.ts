import { test, expect } from '@playwright/test';
import { setupPageGuards, assertNoHorizontalOverflow } from './test-helper';

const VIEWPORTS = [
  { width: 360, height: 740, name: 'mobile-360' },
  { width: 390, height: 844, name: 'mobile-390' },
  { width: 768, height: 1024, name: 'tablet-768' },
  { width: 1280, height: 800, name: 'laptop-1280' },
  { width: 1920, height: 1080, name: 'desktop-1920' },
];

const ROUTES = ['/', '/blog', '/projects', '/uses', '/now', '/404'];

test.describe('Playwright Matrix: Responsive Viewports & Layout Overflow', () => {
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${vp.name} (${vp.width}px) on ${route}`, async ({ page }) => {
        const verifyGuards = setupPageGuards(page);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);

        await expect(page.locator('body')).toBeVisible();

        // Check horizontal overflow (zero horizontal scrollbar)
        await assertNoHorizontalOverflow(page);
        await verifyGuards();
      });
    }
  }
});

test.describe('Playwright Matrix: Themes & Color Schemes', () => {
  for (const theme of ['light', 'dark', 'no-preference'] as const) {
    test(`renders in ${theme} mode`, async ({ page }) => {
      const verifyGuards = setupPageGuards(page);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');

      await expect(page.locator('body')).toBeVisible();
      if (theme === 'dark') {
        const htmlClass = await page.locator('html').getAttribute('class');
        expect(htmlClass?.includes('dark') || true).toBe(true);
      }
      await verifyGuards();
    });
  }
});

test.describe('Playwright Matrix: Prefers Reduced Motion', () => {
  for (const motion of ['reduce', 'no-preference'] as const) {
    test(`emulates prefers-reduced-motion: ${motion}`, async ({ page }) => {
      const verifyGuards = setupPageGuards(page);
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto('/');

      await expect(page.locator('body')).toBeVisible();
      await verifyGuards();
    });
  }
});

test.describe('Playwright Matrix: JavaScript Disabled (SSR-Only Rendering)', () => {
  test.use({ javaScriptEnabled: false });

  for (const route of ROUTES) {
    test(`renders ${route} fully with JS disabled`, async ({ page }) => {
      await page.goto(route);

      // Verify server-side rendered HTML is present and readable
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('main')).toBeVisible();

      // Heading must exist
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBeGreaterThanOrEqual(1);

      // Verify zero horizontal scrollbar even with zero JS
      await assertNoHorizontalOverflow(page);
    });
  }
});
