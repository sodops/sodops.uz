import { test, expect } from '@playwright/test';

test.describe('Visual content editor security and rendering', () => {
  test('unauthenticated visitors never receive active pencil controls', async ({ page }) => {
    await page.goto('/?edit=1');
    await expect(page.getByRole('heading', { level: 1 })).toContainText("Hi, I'm Sodiq");
    await expect(page.locator('[data-edit-key="home.greeting"]')).toBeVisible();
    await expect(page.locator('.visual-editor-pencil')).toHaveCount(0);
    const api = await page.request.get('/api/admin/content');
    expect([401,403]).toContain(api.status());
  });

  test('site pages contain editable slots without exposing editing buttons publicly', async ({ page }) => {
    const pages: Array<[string,string]> = [
      ['/', 'home.greeting'],
      ['/uses', 'uses.cloud.0.name'],
      ['/now', 'now.engineering.body'],
      ['/projects', 'projects.description'],
      ['/blog', 'blog.description'],
    ];
    for (const [path,key] of pages) {
      await page.goto(path);
      await expect(page.locator('[data-edit-key="' + key + '"]')).toBeVisible();
      await expect(page.locator('.visual-editor-pencil')).toHaveCount(0);
    }
  });

  test('admin endpoints reject unauthorized PUT and invalid origin', async ({ page }) => {
    const response = await page.request.put('/api/admin/content', {
      headers: {'Origin':'https://evil.example','Content-Type':'application/json'},
      data: {key:'home.greeting',value:'attacker'},
    });
    expect([401,403]).toContain(response.status());
  });
});
