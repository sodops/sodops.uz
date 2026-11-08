import { test, expect } from '@playwright/test';
import { assertNoHorizontalOverflow } from './test-helper';

test.describe('UI/UX refresh regressions', () => {
  test('homepage offers primary portfolio and contact actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /View projects/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get in touch' })).toHaveAttribute('href', 'mailto:me@sodops.uz');
  });

  test('published pages are free from placeholder copy', async ({ page }) => {
    for (const route of ['/uses', '/now']) {
      await page.goto(route);
      await expect(page.locator('body')).not.toContainText('TODO(sodiq)');
      await assertNoHorizontalOverflow(page);
    }
  });

  test('mobile navigation and theme controls remain usable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    await assertNoHorizontalOverflow(page);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    const theme = page.getByRole('button', { name: 'Toggle theme' });
    await expect(theme).toBeVisible();
    const bounds = await theme.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  });

  test('command palette Tab reaches controls without escaping dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Open command palette/i }).click();
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    await expect(dialog).toBeVisible();
    const search = dialog.getByRole('combobox');
    await search.fill('project');
    await search.press('Tab');
    const activeWithinModal = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(activeWithinModal).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('unknown blog tags explain filtered empty state', async ({ page }) => {
    await page.goto('/blog?tag=non-existent-tag-ui-qa');
    await expect(page.getByText(/No posts found for #non-existent-tag-ui-qa/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Clear filter/i })).toBeVisible();
  });
});
