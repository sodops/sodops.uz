import { type Page, expect } from '@playwright/test';

export function setupPageGuards(page: Page) {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const failedRequests: Array<{ url: string; failure: string | null }> = [];

  page.on('console', (msg) => {
    const text = msg.text();
    // Exclude benign Chromium 404 network log when visiting 404 test pages
    if (text.includes('responded with a status of 404')) return;

    if (msg.type() === 'error') {
      consoleErrors.push(text);
    } else if (msg.type() === 'warning') {
      // Filter known harmless browser deprecation notices if any
      if (!text.includes('prefers-color-scheme')) {
        consoleWarnings.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  page.on('requestfailed', (req) => {
    const errorText = req.failure()?.errorText || 'unknown error';
    // Ignore intentional browser navigation aborts (e.g. rapid back/forward)
    if (errorText.includes('ERR_ABORTED') || errorText.includes('NS_BINDING_ABORTED')) {
      return;
    }
    failedRequests.push({
      url: req.url(),
      failure: errorText,
    });
  });

  return async () => {
    // Assert 0 console errors
    expect(
      consoleErrors,
      `Console errors detected: ${consoleErrors.join('; ')}`
    ).toEqual([]);

    // Assert 0 failed network requests
    expect(
      failedRequests,
      `Failed network requests: ${JSON.stringify(failedRequests)}`
    ).toEqual([]);
  };
}

export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      isOverflowing: doc.scrollWidth > window.innerWidth + 1,
    };
  });
  expect(
    overflow.isOverflowing,
    `Horizontal overflow detected: scrollWidth (${overflow.scrollWidth}) > window.innerWidth (${overflow.clientWidth})`
  ).toBe(false);
}
