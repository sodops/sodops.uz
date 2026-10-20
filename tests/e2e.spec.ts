import { test, expect } from '@playwright/test';

test.describe('Real Browser & Security Verification', () => {
  test.beforeAll(async ({}, testInfo) => {
    const baseURL = testInfo.project.use.baseURL || 'https://sodops.uz';
    console.log(`[E2E] Running Playwright test suite against baseURL: ${baseURL}`);
  });

  test.beforeEach(async ({ page }) => {
    // Record all console errors and unhandled page exceptions
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Chromium emits standard HTTP 404 network error when intentionally loading non-existent routes
        if (msg.text().includes('responded with a status of 404')) {
          return;
        }
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // Record failed network requests
    const failedRequests: Array<{ url: string; failure: string | null }> = [];
    page.on('requestfailed', (req) => {
      failedRequests.push({
        url: req.url(),
        failure: req.failure()?.errorText || 'unknown error',
      });
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
    (page as any).__failedRequests = failedRequests;
  });

  test.afterEach(async ({ page }) => {
    // 1. Assert zero unhandled console errors
    const consoleErrors: string[] = (page as any).__consoleErrors || [];
    expect(
      consoleErrors,
      `Expected 0 console errors, but got: ${consoleErrors.join(', ')}`
    ).toEqual([]);

    // 2. Assert zero Content Security Policy violations
    const cspViolations = await page.evaluate(() => (window as any).__cspViolations || []);
    expect(
      cspViolations,
      `Expected 0 CSP violations, but got: ${JSON.stringify(cspViolations)}`
    ).toEqual([]);

    // 3. Assert zero failed network requests (excluding intentional test aborts)
    const failedRequests: Array<{ url: string; failure: string | null }> =
      (page as any).__failedRequests || [];
    expect(
      failedRequests,
      `Expected 0 failed network requests, but got: ${JSON.stringify(failedRequests)}`
    ).toEqual([]);
  });

  test('loads home page (/) with clean console, no CSP violations, and no failed requests', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/sodiq/i);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('loads /blog with clean console, no CSP violations, and no failed requests', async ({ page }) => {
    await page.goto('/blog');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('loads /projects with clean console, no CSP violations, and lists font URLs', async ({ page }) => {
    const fontUrls: string[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('.woff2') || url.includes('.woff') || url.includes('.ttf')) {
        fontUrls.push(url);
      }
    });

    await page.goto('/projects');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('sodops.uz').first()).toBeVisible();

    console.log(`[E2E] Font URLs requested on /projects (${fontUrls.length} total):`);
    for (const f of fontUrls) {
      console.log(`  - ${f}`);
    }
    expect(fontUrls.length).toBeGreaterThan(0);
  });

  test('loads /uses with clean console, no CSP violations, and no failed requests', async ({ page }) => {
    await page.goto('/uses');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('loads /now with clean console, no CSP violations, and no failed requests', async ({ page }) => {
    await page.goto('/now');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('loads 404 page with clean console, no CSP violations, and expected 404 status', async ({ page }) => {
    const response = await page.goto('/non-existent-page-404');
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/404/i).first()).toBeVisible();
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
