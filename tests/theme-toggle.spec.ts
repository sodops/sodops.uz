import { test, expect } from '@playwright/test';

async function backgroundColor(page: import('@playwright/test').Page) {
  return page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe('Theme toggle: real CSS and persistence', () => {
  test('switches computed colors in light-system mode, persists after refresh and navigation', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const root = page.locator('html');
    const toggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(root).not.toHaveClass(/dark/);
    const lightBackground = await backgroundColor(page);

    await toggle.click();
    await expect(root).toHaveClass(/dark/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => backgroundColor(page)).not.toBe(lightBackground);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

    await page.reload();
    await expect(root).toHaveClass(/dark/);
    await expect.poll(() => backgroundColor(page)).not.toBe(lightBackground);

    await page.locator('nav[aria-label="Main navigation"] a[href="/blog"]').click();
    await expect(page).toHaveURL(/\/blog/);
    await expect(root).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Toggle theme' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('manual light override wins over dark OS preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const root = page.locator('html');
    const toggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(root).toHaveClass(/dark/);
    const darkBackground = await backgroundColor(page);

    await toggle.click();
    await expect(root).not.toHaveClass(/dark/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => backgroundColor(page)).not.toBe(darkBackground);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    await page.reload();
    await expect(root).not.toHaveClass(/dark/);
    await expect.poll(() => backgroundColor(page)).not.toBe(darkBackground);
  });
  test('command palette theme action updates computed styles and the button state', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const before = await backgroundColor(page);
    await page.getByRole('button', { name: /Open command palette/i }).click();
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('combobox');
    await input.fill('theme');
    await input.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Toggle theme' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => backgroundColor(page)).not.toBe(before);
  });
});
