import { test, expect } from '@playwright/test';

test.describe('Real Browser & Security Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Record all console errors and unhandled page exceptions
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Exclude 404/530 network response logs if any
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // Capture CSP violations via securitypolicyviolation DOM event
    await page.addInitScript(() => {
      (window as any).__cspViolations = [];
      window.addEventListener('securitypolicyviolation', (e) => {
        (window as any).__cspViolations.push({
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          originalPolicy: e.originalPolicy,
        });
      });
    });

    (page as any).__consoleErrors = consoleErrors;
  });

  test.afterEach(async ({ page }) => {
    // 1. Assert zero unhandled console errors
    const consoleErrors: string[] = (page as any).__consoleErrors || [];
    expect(consoleErrors, `Expected 0 console errors, but got: ${consoleErrors.join(', ')}`).toEqual([]);

    // 2. Assert zero Content Security Policy violations
    const cspViolations = await page.evaluate(() => (window as any).__cspViolations || []);
    expect(cspViolations, `Expected 0 CSP violations, but got: ${JSON.stringify(cspViolations)}`).toEqual([]);
  });

  test('loads home page (/) with clean console and no CSP violations', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/sodiq/i);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('loads /blog with clean console and no CSP violations', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('loads /projects with clean console and no CSP violations', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('sodops.uz').first()).toBeVisible();
  });

  test('opens command palette with keyboard, filters, navigates, and closes with Esc', async ({ page }) => {
    await page.goto('/');

    // Wait for client:idle island hydration to attach keyboard listeners
    await page.waitForSelector('astro-island:not([ssr])', { state: 'attached', timeout: 10000 });

    // 1. Open palette via keyboard shortcut
    await page.keyboard.press('Control+k');

    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const searchInput = dialog.locator('input[type="text"]');
    await expect(searchInput).toBeFocused();

    // 2. Type query to filter
    await searchInput.fill('projects');
    await expect(dialog.getByText('Projects & Status')).toBeVisible();

    // 3. Navigate with keyboard
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');

    // 4. Close with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 3000 });
  });
});
