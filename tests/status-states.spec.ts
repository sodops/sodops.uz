import { test, expect } from '@playwright/test';
import { setupPageGuards } from './test-helper';

test.describe('Status States & Uptime Visualization QA', () => {
  test('renders status page, verifies paused exclusion and bar tooltips', async ({ page }) => {
    const verifyGuards = setupPageGuards(page);
    await page.goto('/projects');

    // 1. Check page title & header
    await expect(page.locator('h1')).toContainText('Projects');

    // 2. Banner assertion
    const banner = page.locator('section').first();
    await expect(banner).toBeVisible();

    // 3. Verify paused project is rendered as "Coming soon" and not with error/down
    const pausedCard = page.locator('article:has-text("mc.sodops.uz")');
    if ((await pausedCard.count()) > 0) {
      await expect(pausedCard).toContainText(/coming soon/i);
      // Paused must NOT show 0% or error
      const cardText = await pausedCard.innerText();
      expect(cardText.includes('0%')).toBe(false);
      expect(cardText.includes('down')).toBe(false);
    }

    // 4. Verify 30-day bar keyboard focus & tooltips
    const uptimeBars = page.locator('div[role="img"][aria-label*="checks recorded"], div[role="img"][aria-label*="UP"]');
    if ((await uptimeBars.count()) > 0) {
      const firstBar = uptimeBars.first();
      await firstBar.focus();
      await expect(firstBar).toBeFocused();
      const label = await firstBar.getAttribute('aria-label');
      expect(label).toBeTruthy();
    }

    // 5. Take screenshot of status states for QA report
    await page.screenshot({ path: 'qa-report/screenshots/status-projects.png', fullPage: true });

    await verifyGuards();
  });
});
