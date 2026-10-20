import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/', '/blog', '/projects', '/uses', '/now', '/404'];

test.describe('A11y: Axe-Core WCAG AA Compliance', () => {
  for (const route of ROUTES) {
    test(`axe audit on ${route} (Desktop)`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const seriousViolations = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      expect(
        seriousViolations,
        `Axe violations on ${route}: ${JSON.stringify(seriousViolations, null, 2)}`
      ).toEqual([]);
    });

    test(`axe audit on ${route} (Mobile 360px Dark Mode)`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const seriousViolations = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      expect(
        seriousViolations,
        `Axe violations on ${route} (dark 360px): ${JSON.stringify(seriousViolations, null, 2)}`
      ).toEqual([]);
    });
  }

  test('Skip Link is present, functional, and navigates to #main-content', async ({ page }) => {
    await page.goto('/');
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Tab to skip link
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();

    // Trigger skip link
    await page.keyboard.press('Enter');
    const mainEl = page.locator('#main-content');
    await expect(mainEl).toBeVisible();
  });
});
