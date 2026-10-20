import { test, expect } from '@playwright/test';
import { setupPageGuards } from './test-helper';

test.describe('Playwright User Flows & Micro-Interactions', () => {
  test('Flow 1: Home -> Blog -> Post (TOC, Code Copy, Share, Navigation)', async ({ page }) => {
    const verifyGuards = setupPageGuards(page);

    // 1. Home
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Sodiq');

    // 2. Navigate to Blog
    await page.click('nav a[href="/blog"]');
    await expect(page).toHaveURL(/\/blog/);
    await expect(page.locator('h1')).toBeVisible();

    // 3. Click first post (or local audit post)
    const postLink = page.locator('article a[href^="/blog/"]').first();
    const hasPost = await postLink.count();

    if (hasPost > 0) {
      await postLink.click();
      await expect(page).toHaveURL(/\/blog\/[\w-]+/);

      // Verify TOC jump links if TOC exists
      const tocLink = page.locator('aside a[href^="#"]').first();
      if ((await tocLink.count()) > 0) {
        await tocLink.click();
        const hash = await page.evaluate(() => window.location.hash);
        expect(hash).toBeTruthy();
      }

      // Verify code copy button
      const copyBtn = page.locator('.copy-code-btn').first();
      if ((await copyBtn.count()) > 0) {
        await copyBtn.click();
        // Feedback class or text changes
        await expect(copyBtn).toHaveText(/copied/i);
      }
    }

    // 4. Navigate to Projects
    await page.click('nav a[href="/projects"]');
    await expect(page).toHaveURL(/\/projects/);

    // 5. Navigate to Uses
    await page.click('nav a[href="/uses"]');
    await expect(page).toHaveURL(/\/uses/);

    // 6. Navigate to Now
    await page.click('nav a[href="/now"]');
    await expect(page).toHaveURL(/\/now/);

    // 7. 404 Page
    const res = await page.goto('/non-existent-qa-path-404');
    expect(res?.status()).toBe(404);

    await verifyGuards();
  });

  test('Flow 2: Command Palette (Keyboard, Focus Trap, Focus Return, Actions)', async ({ page }) => {
    const verifyGuards = setupPageGuards(page);
    await page.goto('/');

    // Wait for island hydration
    await page.waitForSelector('astro-island:not([ssr])', { state: 'attached', timeout: 10000 });

    // Focus an element before opening palette
    const brandLink = page.locator('header a[href="/"]');
    await brandLink.focus();

    // 1. Open via Ctrl+K / Cmd+K
    await page.keyboard.press('Control+k');
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Search input should be focused
    const input = page.locator('input[role="combobox"]');
    await expect(input).toBeFocused();

    // 2. Type query and filter
    await input.fill('projects');
    await expect(page.locator('#command-palette-results')).toContainText(/projects/i);

    // 3. Arrow Down and Up navigation
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    // 4. Focus Trap: Pressing Tab keeps focus inside dialog
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();

    // 5. Close via Escape and verify Focus Return
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Focus returns to previous element
    await expect(brandLink).toBeFocused();

    // 6. Re-open and execute Theme Toggle action
    await page.keyboard.press('Control+k');
    await expect(dialog).toBeVisible();
    await input.fill('theme');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();

    await verifyGuards();
  });

  test('Flow 3: View Transitions Theme Persistence & Back/Forward History', async ({ page }) => {
    const verifyGuards = setupPageGuards(page);
    await page.goto('/');

    // Set dark theme via storage
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
    });

    // Navigate to /uses
    await page.click('nav a[href="/uses"]');
    await expect(page).toHaveURL(/\/uses/);

    // Assert dark theme persisted across view transition
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);

    // Browser back button
    await page.goBack();
    await expect(page).toHaveURL('/');

    // Browser forward button
    await page.goForward();
    await expect(page).toHaveURL(/\/uses/);

    await verifyGuards();
  });
});
